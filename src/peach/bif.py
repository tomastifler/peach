"""只读 Roku BIF v0 索引，按需读取其中一张 JPEG 预览。"""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import os
from pathlib import Path
import struct
from typing import BinaryIO

from PIL import Image


_MAGIC = b"\x89BIF\r\n\x1a\n"
_HEADER_SIZE = 64
_ENTRY = struct.Struct("<II")
_END_TIMESTAMP = 0xFFFFFFFF
_MAX_FRAMES = 1_000_000
_MAX_FRAME_BYTES = 16 * 1024 * 1024
_MAX_FRAME_PIXELS = 16_000_000


@dataclass(frozen=True)
class BifFrame:
    """一张预览的秒数时间戳、文件绝对偏移和字节长度。"""

    timestamp: float
    offset: int
    length: int


@dataclass(frozen=True)
class BifIndex:
    """BIF 路径及按时间排列的不可变帧索引。"""

    path: Path
    frames: tuple[BifFrame, ...]


def _header(stream: BinaryIO, size: int) -> tuple[int, int] | None:
    header = stream.read(_HEADER_SIZE)
    if len(header) != _HEADER_SIZE or header[:8] != _MAGIC:
        return None
    version, count, multiplier = struct.unpack_from("<III", header, 8)
    if version != 0 or any(header[20:]) or count > _MAX_FRAMES:
        return None
    if _HEADER_SIZE + (count + 1) * _ENTRY.size > size or size > _END_TIMESTAMP:
        return None
    return count, multiplier or 1000


def read_index(path: Path) -> BifIndex | None:
    """读取有界索引；损坏、截断或不支持的文件返回 None。"""
    try:
        with path.open("rb") as stream:
            before = os.fstat(stream.fileno())
            header = _header(stream, before.st_size)
            if header is None:
                return None
            count, multiplier = header
            entries = stream.read((count + 1) * _ENTRY.size)
            if len(entries) != (count + 1) * _ENTRY.size:
                return None
            terminal_timestamp, terminal_offset = _ENTRY.unpack_from(entries, count * _ENTRY.size)
            if terminal_timestamp != _END_TIMESTAMP or terminal_offset != before.st_size:
                return None
            frames = []
            previous_timestamp = -1
            index_end = _HEADER_SIZE + len(entries)
            for number in range(count):
                timestamp, offset = _ENTRY.unpack_from(entries, number * _ENTRY.size)
                _, next_offset = _ENTRY.unpack_from(entries, (number + 1) * _ENTRY.size)
                length = next_offset - offset
                if timestamp == _END_TIMESTAMP or timestamp <= previous_timestamp \
                        or offset < index_end or not 0 < length <= _MAX_FRAME_BYTES \
                        or next_offset > before.st_size:
                    return None
                frames.append(BifFrame(timestamp * multiplier / 1000.0, offset, length))
                previous_timestamp = timestamp
            after = os.fstat(stream.fileno())
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                return None
            return BifIndex(path, tuple(frames))
    except (OSError, ValueError, OverflowError):
        return None


def read_frame(index: BifIndex, number: int) -> bytes | None:
    """定位并完整验证一张 JPEG；索引失效或图片损坏时返回 None。"""
    if not isinstance(number, int) or not 0 <= number < len(index.frames):
        return None
    frame = index.frames[number]
    if frame.offset < _HEADER_SIZE or not 0 < frame.length <= _MAX_FRAME_BYTES:
        return None
    try:
        with index.path.open("rb") as stream:
            before = os.fstat(stream.fileno())
            header = _header(stream, before.st_size)
            if header is None:
                return None
            count, multiplier = header
            if count != len(index.frames) or frame.offset < _HEADER_SIZE + (count + 1) * _ENTRY.size \
                    or frame.offset + frame.length > before.st_size:
                return None
            stream.seek(_HEADER_SIZE + number * _ENTRY.size)
            entries = stream.read(2 * _ENTRY.size)
            if len(entries) != 2 * _ENTRY.size:
                return None
            timestamp, offset, _, next_offset = struct.unpack("<IIII", entries)
            if offset != frame.offset or next_offset - offset != frame.length \
                    or timestamp * multiplier / 1000.0 != frame.timestamp:
                return None
            stream.seek(_HEADER_SIZE + count * _ENTRY.size)
            if stream.read(_ENTRY.size) != _ENTRY.pack(_END_TIMESTAMP, before.st_size):
                return None
            stream.seek(frame.offset)
            data = stream.read(frame.length)
            after = os.fstat(stream.fileno())
            if len(data) != frame.length \
                    or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                return None
        if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
            return None
        with Image.open(BytesIO(data)) as image:
            if image.format != "JPEG" or image.width * image.height > _MAX_FRAME_PIXELS:
                return None
            image.load()
        return data
    except (OSError, ValueError, OverflowError, Image.DecompressionBombError):
        return None
