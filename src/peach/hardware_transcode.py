"""用合成画面探测 FFmpeg 硬件编码，共享整片与分片的尝试链。"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)
CUDA_DECODE_CODECS = frozenset({"h264", "hevc", "vp9", "av1"})
VIDEOTOOLBOX_DECODE_CODECS = frozenset({"h264", "hevc", "av1", "prores"})
#: D3D11VA shares one list with CUDA: for codecs outside the list (such as vc1), when hardware decoding errors, FFmpeg reports nothing and green frames go straight into the cache.
D3D11_DECODE_CODECS = CUDA_DECODE_CODECS
#: AMF only recognizes D3D11 devices on AMD graphics cards; on hybrid-GPU machines the default index is often another vendor's, so indexes are tried one by one.
D3D11_ADAPTER_PROBES = 4
BACKENDS = ("auto", "software", "nvenc", "amf", "qsv", "vaapi", "videotoolbox")
PROBE_TIMEOUT_SECONDS = 10
_SYNTHETIC_FRAME = ("-f", "lavfi", "-i", "color=size=640x360:rate=1", "-frames:v", "1")
_WINDOWS_ENCODER_OUTPUT = {
    "amf": ("-c:v", "h264_amf", "-quality", "speed", "-rc", "cqp", "-qp_i", "21", "-qp_p", "21",
            "-pix_fmt", "nv12"),
    "qsv": ("-c:v", "h264_qsv", "-preset", "veryfast", "-global_quality", "23", "-pix_fmt", "nv12"),
}


def videotoolbox_decode_options(codec: str) -> tuple[str, ...]:
    decoder = ("-c:v", "av1") if codec == "av1" else ()
    return ("-hwaccel", "videotoolbox", *decoder)


def d3d11va_decode_options(codec: str, device: str = "") -> tuple[str, ...]:
    """Windows GPU decoding. Without specifying `-hwaccel_output_format`, the decoded frames return to memory and are handed to any encoder."""
    if codec not in D3D11_DECODE_CODECS:
        return ()
    return ("-hwaccel", "d3d11va", *(("-hwaccel_device", device) if device else ()))


def _run_probe(ffmpeg: Path, label: str, arguments: tuple[str, ...]) -> bool:
    """Run a probe command that consumes only synthetic frames and discards its output; a failure logs a warning."""
    command = (str(ffmpeg), "-hide_banner", "-loglevel", "error", "-nostdin", *arguments,
               "-f", "null", "-")
    try:
        result = subprocess.run(
            command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE, timeout=PROBE_TIMEOUT_SECONDS,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.warning("Transcode hardware probe failed %s: %s", label, exc)
        return False
    if result.returncode:
        logger.warning("Transcode hardware probe failed %s: %s", label,
                       result.stderr.decode("utf-8", "replace")[-1000:])
    return result.returncode == 0


@lru_cache(maxsize=8)
def _d3d11va_ready(ffmpeg: str) -> bool:
    """This FFmpeg can create a D3D11 device on this machine. A VM or remote desktop without a GPU will fail."""
    return _run_probe(Path(ffmpeg), "d3d11va", ("-init_hw_device", "d3d11va", *_SYNTHETIC_FRAME))


@lru_cache(maxsize=128)
def _frame_codec(ffprobe: str, source: str, size: int, modified: int) -> str:
    from .media_probe import probe_file
    try:
        return probe_file(ffprobe, source, timeout=5)[3] or ""
    except (OSError, ValueError, subprocess.SubprocessError):
        return ""


def frame_decode_options(ffmpeg: str, source: str) -> tuple[str, ...]:
    """Local frame extraction reuses the encode probe per file generation; decode initialization failures fall back at the caller.

    Windows enables the following only for codecs on the list: D3D11VA, software decoding is used when the encode probe finds nothing.
    """
    if sys.platform not in ("darwin", "win32") or not Path(ffmpeg).is_file():
        return ()
    from .media_processing_policy import acceleration
    if acceleration(purpose="preview") == "software" or os.environ.get("PEACH_TRANSCODE_BACKEND") == "software":
        return ()
    if sys.platform == "win32" and not _d3d11va_ready(ffmpeg):
        return ()
    codec = ""
    ffprobe = Path(ffmpeg).with_name("ffprobe" + Path(ffmpeg).suffix)
    try:
        from .media_io import file_stat
        stat = file_stat(source, timeout=5)
        if ffprobe.is_file():
            codec = _frame_codec(str(ffprobe), source, stat.st_size, stat.st_mtime_ns)
    except OSError:
        pass
    if sys.platform == "win32":
        return d3d11va_decode_options(codec)
    return videotoolbox_decode_options(codec)


@dataclass(frozen=True)
class HardwareAttempt:
    name: str
    before_input: tuple[str, ...]
    output: tuple[str, ...]


@dataclass(frozen=True)
class HardwareEncoder:
    backend: str
    device: str = ""

    def attempts(self, codec: str) -> tuple[HardwareAttempt, ...]:
        """Command fragments tried in turn; the last is always software decoding, and the probe relies on it to feed synthetic frames.

        `d3d11va` only decodes and does not encode; here only the device-creation command used for probing is given, and for decode parameters see
        `HardwareTranscoder.decode_options`.
        """
        if self.backend == "d3d11va":
            return (HardwareAttempt("d3d11va", ("-init_hw_device", "d3d11va"), ()),)
        if self.backend in _WINDOWS_ENCODER_OUTPUT:
            output = _WINDOWS_ENCODER_OUTPUT[self.backend]
            software_decode = HardwareAttempt(self.backend, (), output)
            decode = d3d11va_decode_options(codec, self.device) if self.device else ()
            if not decode:
                return (software_decode,)
            return (HardwareAttempt(f"d3d11va-{self.backend}", decode, output), software_decode)
        if self.backend == "videotoolbox":
            output = ("-c:v", "h264_videotoolbox", "-allow_sw", "0", "-b:v", "6M", "-pix_fmt", "yuv420p")
            software_decode = HardwareAttempt("videotoolbox-encode", (), output)
            if codec not in VIDEOTOOLBOX_DECODE_CODECS:
                return (software_decode,)
            return (HardwareAttempt("videotoolbox", videotoolbox_decode_options(codec), output), software_decode)
        if self.backend == "nvenc":
            output = ("-c:v", "h264_nvenc", "-preset", "p1", "-tune", "hq",
                      "-rc", "vbr", "-cq", "21", "-b:v", "0")
            software_decode = HardwareAttempt("nvenc", (), output + ("-pix_fmt", "yuv420p"))
            if codec not in CUDA_DECODE_CODECS:
                return (software_decode,)
            return (HardwareAttempt(
                "cuda-nvenc", ("-hwaccel", "cuda", "-hwaccel_output_format", "cuda"),
                ("-vf", "scale_cuda=format=nv12") + output,
            ), software_decode)
        device = ("-vaapi_device", self.device)
        output = ("-c:v", "h264_vaapi", "-qp", "21")
        return (
            HardwareAttempt(
                "vaapi", device + ("-hwaccel", "vaapi", "-hwaccel_device", self.device,
                                    "-hwaccel_output_format", "vaapi"),
                ("-vf", "scale_vaapi=format=nv12") + output,
            ),
            HardwareAttempt("vaapi-encode", device,
                            ("-vf", "format=nv12,hwupload") + output),
        )


class HardwareTranscoder:
    """Probed at the first re-encode, and the result is cached by FFmpeg path; it reads no media and writes no cache files.

    When the settings page "Playback codec method" is set to software nothing is probed; when set to automatic, Windows tries in turn NVENC, AMF,
    QSV encoding; if none of the three is available, D3D11VA decoding is still used and the frames are handed to libx264, see `decode_options`.
    """

    def __init__(self, *, enabled: bool = True, state_root: Path | None = None):
        self.enabled = enabled
        self.state_root = state_root
        self.backend = os.environ.get("PEACH_TRANSCODE_BACKEND", "auto").strip().lower()
        if self.backend not in BACKENDS:
            raise ValueError("PEACH_TRANSCODE_BACKEND must be one of " + ", ".join(BACKENDS))
        self.device = os.environ.get("PEACH_VAAPI_DEVICE", "").strip()
        self._encoders: dict[Path, tuple[HardwareEncoder, ...]] = {}
        self._lock = threading.Lock()

    def _candidates(self) -> tuple[HardwareEncoder, ...]:
        candidates = []
        windows = self.backend == "auto" and sys.platform == "win32"
        if self.backend == "videotoolbox" or (self.backend == "auto" and sys.platform == "darwin"):
            candidates.append(HardwareEncoder("videotoolbox"))
        if self.backend == "nvenc" or (self.backend == "auto" and (
            sys.platform == "win32" or Path("/dev/nvidia0").exists()
            or Path("/proc/driver/nvidia/version").exists()
        )):
            candidates.append(HardwareEncoder("nvenc"))
        candidates.extend(HardwareEncoder(backend) for backend in _WINDOWS_ENCODER_OUTPUT
                          if self.backend == backend or windows)
        if windows:
            candidates.append(HardwareEncoder("d3d11va"))
        if self.backend == "vaapi" or (self.backend == "auto" and sys.platform.startswith("linux")):
            devices = [self.device] if self.device else sorted(p.as_posix() for p in Path("/dev/dri").glob("renderD*"))
            candidates.extend(HardwareEncoder("vaapi", device) for device in devices)
        return tuple(candidates)

    def active(self) -> bool:
        """Neither the settings page nor the environment variable restricts playback transcoding to software. It is read fresh each time, so changing settings needs no restart."""
        from .media_processing_policy import acceleration
        if self.state_root is not None and acceleration(self.state_root) == "software":
            return False
        return self.enabled and self.backend != "software"

    def diagnostic_snapshot(self) -> dict:
        """Read the current hardware policy and existing probe results without starting a new hardware probe."""
        with self._lock:
            results = [sorted({encoder.backend for encoder in encoders}) for encoders in self._encoders.values()]
        return {'backend': self.backend, 'enabled': self.active(),
                'probe_status': 'cached' if results else 'not-probed', 'available_backends': results}

    def _available(self, ffmpeg: Path) -> tuple[HardwareEncoder, ...]:
        if not self.active():
            return ()
        with self._lock:
            if ffmpeg not in self._encoders:
                available = []
                for encoder in self._candidates():
                    if self._probe(ffmpeg, encoder):
                        if encoder.backend == "amf":
                            encoder = self._amf_adapter(ffmpeg, encoder)
                        available.append(encoder)
                        # 一个可用 VAAPI 节点足以服务这条链，避免重复尝试同类设备。
                        if encoder.backend == "vaapi":
                            break
                self._encoders[ffmpeg] = tuple(available)
                logger.info("Transcode hardware backend: %s", ", ".join(
                    item.backend + (f" ({item.device})" if item.device else "")
                    for item in available) or "software")
            return self._encoders[ffmpeg]

    def encoders(self, ffmpeg: Path) -> tuple[HardwareEncoder, ...]:
        return tuple(item for item in self._available(ffmpeg) if item.backend != "d3d11va")

    def decode_options(self, ffmpeg: Path, codec: str) -> tuple[str, ...]:
        """libx264 front-end GPU decode parameters; there is only one kind, Windows D3D11VA, independent of the GPU vendor.

        When no hardware encoder is available, HEVC software decoding takes about a third of the libx264 transcode's CPU.
        """
        if not any(item.backend == "d3d11va" for item in self._available(ffmpeg)):
            return ()
        return d3d11va_decode_options(codec)

    @staticmethod
    def _amf_adapter(ffmpeg: Path, encoder: HardwareEncoder) -> HardwareEncoder:
        """Find the D3D11 GPU index that AMF can attach to; if none works, use only software decoding plus AMF encoding."""
        output = _WINDOWS_ENCODER_OUTPUT["amf"][:-2]
        for index in range(D3D11_ADAPTER_PROBES):
            if _run_probe(ffmpeg, f"amf d3d11va:{index}", (
                    "-init_hw_device", f"d3d11va=peach:{index}", "-filter_hw_device", "peach",
                    *_SYNTHETIC_FRAME, "-vf", "format=nv12,hwupload", *output)):
                return HardwareEncoder("amf", str(index))
        return encoder

    @staticmethod
    def _probe(ffmpeg: Path, encoder: HardwareEncoder) -> bool:
        # 用软件生成一帧，再验证设备初始化、上传与 H.264 硬件编码。
        attempt = encoder.attempts("")[-1]
        return _run_probe(ffmpeg, f"{encoder.backend} {encoder.device}".strip(), (
            *attempt.before_input, *_SYNTHETIC_FRAME, *attempt.output))
