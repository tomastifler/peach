"""Roku BIF v0 的有界索引与 JPEG 随机读取。"""
from io import BytesIO
from pathlib import Path
import struct
import tempfile
import unittest
from unittest import mock

from PIL import Image

from peach import bif


class BifTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.path = Path(temporary.name).resolve() / "预览.bif"
        self.images = []
        for color in ("red", "blue", "green"):
            with BytesIO() as output:
                Image.new("RGB", (8, 8), color).save(output, "JPEG")
                self.images.append(output.getvalue())

    def write_bif(self, *, timestamps=(0, 3, 11), multiplier=1000, padding=b"", images=None):
        images = self.images if images is None else images
        header = b"\x89BIF\r\n\x1a\n" + struct.pack("<III", 0, len(timestamps), multiplier) + bytes(44)
        offset = 64 + 8 * (len(timestamps) + 1) + len(padding)
        entries = []
        for timestamp, image in zip(timestamps, images, strict=True):
            entries.append(struct.pack("<II", timestamp, offset))
            offset += len(image)
        entries.append(struct.pack("<II", 0xFFFFFFFF, offset))
        self.path.write_bytes(header + b"".join(entries) + padding + b"".join(images))

    def change_u32(self, offset, value):
        with self.path.open("r+b") as stream:
            stream.seek(offset)
            stream.write(struct.pack("<I", value))

    def test_nonuniform_timestamps_and_multiplier_units(self):
        for multiplier, expected in ((0, (0., 3., 11.)), (1000, (0., 3., 11.)),
                                     (10000, (0., 30., 110.)), (250, (0., .75, 2.75))):
            with self.subTest(multiplier=multiplier):
                self.write_bif(multiplier=multiplier)
                index = bif.read_index(self.path)
                self.assertIsNotNone(index)
                self.assertEqual(index.path, self.path)
                self.assertEqual(tuple(frame.timestamp for frame in index.frames), expected)
                self.assertEqual(tuple(frame.length for frame in index.frames), tuple(map(len, self.images)))
                self.assertEqual(bif.read_frame(index, 2), self.images[2])
                self.assertEqual(bif.read_frame(index, 0), self.images[0])

    def test_padding_between_index_and_images_is_supported(self):
        self.write_bif(padding=b"reserved gap")
        index = bif.read_index(self.path)
        self.assertIsNotNone(index)
        self.assertEqual(bif.read_frame(index, 1), self.images[1])

    def test_empty_index_has_only_its_terminal(self):
        self.write_bif(timestamps=(), images=[])
        index = bif.read_index(self.path)
        self.assertEqual(index, bif.BifIndex(self.path, ()))
        self.assertIsNone(bif.read_frame(index, 0))

    def test_index_and_requested_frame_use_bounded_reads(self):
        self.write_bif()
        original_open = Path.open
        reads = []

        def tracking_open(path, *args, **kwargs):
            stream = original_open(path, *args, **kwargs)
            original_read = stream.read

            def read(size=-1):
                self.assertGreaterEqual(size, 0)
                reads.append((stream.tell(), size))
                return original_read(size)

            stream.read = read
            return stream

        with mock.patch.object(Path, "open", tracking_open):
            index = bif.read_index(self.path)
            self.assertIsNotNone(index)
        self.assertEqual(reads, [(0, 64), (64, 32)])
        reads.clear()
        with mock.patch.object(Path, "open", tracking_open):
            self.assertEqual(bif.read_frame(index, 1), self.images[1])
        self.assertEqual(reads, [(0, 64), (72, 16), (88, 8),
                                 (index.frames[1].offset, len(self.images[1]))])

    def test_missing_file_and_directory_return_none(self):
        self.assertIsNone(bif.read_index(self.path))
        self.assertIsNone(bif.read_index(self.path.parent))

    def test_invalid_magic_version_reserved_and_excessive_count(self):
        for offset, value in ((0, 0), (8, 1), (20, 1), (12, 0xFFFFFFFF)):
            with self.subTest(offset=offset):
                self.write_bif()
                self.change_u32(offset, value)
                self.assertIsNone(bif.read_index(self.path))

    def test_truncated_header_and_table(self):
        for length in (0, 7, 63, 64, 71, 95):
            with self.subTest(length=length):
                self.write_bif()
                data = self.path.read_bytes()
                self.path.write_bytes(data[:length])
                self.assertIsNone(bif.read_index(self.path))

    def test_terminal_timestamp_and_offset_must_match_eof(self):
        for field, value in ((88, 0), (92, 95), (92, 0xFFFFFFFF)):
            with self.subTest(field=field, value=value):
                self.write_bif()
                self.change_u32(field, value)
                self.assertIsNone(bif.read_index(self.path))

    def test_frames_require_increasing_timestamps(self):
        for timestamps in ((0, 0, 1), (3, 2, 4), (0, 1, 0xFFFFFFFF)):
            with self.subTest(timestamps=timestamps):
                self.write_bif(timestamps=timestamps)
                self.assertIsNone(bif.read_index(self.path))

    def test_offsets_must_be_ordered_outside_table_and_inside_file(self):
        for field, value in ((68, 64), (76, 96), (76, 95), (84, 0xFFFFFFFF)):
            with self.subTest(field=field, value=value):
                self.write_bif()
                self.change_u32(field, value)
                self.assertIsNone(bif.read_index(self.path))

    def test_oversized_frame_is_rejected_without_loading_payload(self):
        self.write_bif(timestamps=(0,), images=[self.images[0]])
        eof = 80 + bif._MAX_FRAME_BYTES + 1
        self.change_u32(76, eof)
        with self.path.open("r+b") as stream:
            stream.truncate(eof)
        self.assertIsNone(bif.read_index(self.path))

    def test_frame_number_must_be_in_range(self):
        self.write_bif()
        index = bif.read_index(self.path)
        for number in (-1, 3, 99999, 1.0, "0"):
            with self.subTest(number=number):
                self.assertIsNone(bif.read_frame(index, number))

    def test_corrupt_nonjpeg_and_truncated_jpeg_frames_return_none(self):
        png = BytesIO()
        Image.new("RGB", (8, 8)).save(png, "PNG")
        for payload in (b"invalid", b"\xff\xd8garbage\xff\xd9", self.images[0][:-2],
                        self.images[0][:100] + b"\xff\xd9", png.getvalue()):
            with self.subTest(prefix=payload[:12]):
                self.write_bif(timestamps=(0,), images=[payload])
                index = bif.read_index(self.path)
                self.assertIsNotNone(index)
                self.assertIsNone(bif.read_frame(index, 0))

    def test_frame_pixel_budget_is_checked_before_decoding(self):
        self.write_bif()
        index = bif.read_index(self.path)
        with mock.patch.object(bif, "_MAX_FRAME_PIXELS", 32):
            self.assertIsNone(bif.read_frame(index, 0))

    def test_missing_and_truncated_files_invalidate_frame_reads(self):
        self.write_bif()
        index = bif.read_index(self.path)
        with self.path.open("r+b") as stream:
            stream.truncate(index.frames[1].offset)
        self.assertIsNone(bif.read_frame(index, 1))
        self.assertIsNone(bif.read_frame(index, 0))
        self.path.unlink()
        self.assertIsNone(bif.read_frame(index, 0))

    def test_rewritten_index_invalidates_frame_reads(self):
        for field, value in ((8, 1), (12, 2), (16, 10000), (68, 97), (92, 0)):
            with self.subTest(field=field):
                self.write_bif()
                index = bif.read_index(self.path)
                self.change_u32(field, value)
                self.assertIsNone(bif.read_frame(index, 1 if field == 16 else 0))

    def test_forged_frame_bounds_are_rejected(self):
        self.write_bif()
        for offset, length in ((-1, 5), (0, 0), (96, bif._MAX_FRAME_BYTES + 1), (96, 999999)):
            with self.subTest(offset=offset, length=length):
                index = bif.BifIndex(self.path, (bif.BifFrame(0., offset, length),))
                self.assertIsNone(bif.read_frame(index, 0))

    def test_file_changes_during_reads_invalidate_the_result(self):
        self.write_bif()
        index = bif.read_index(self.path)
        original = self.path.stat()
        changed = mock.Mock(st_size=original.st_size, st_mtime_ns=original.st_mtime_ns + 1)
        with mock.patch.object(bif.os, "fstat", side_effect=[original, changed]):
            self.assertIsNone(bif.read_index(self.path))
        with mock.patch.object(bif.os, "fstat", side_effect=[original, changed]):
            self.assertIsNone(bif.read_frame(index, 1))


if __name__ == "__main__":
    unittest.main()
