from __future__ import annotations

from datetime import UTC, datetime, timedelta
import importlib.util
from pathlib import Path
import re
import sys
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("render_star_history", ROOT / "scripts" / "render_star_history.py")
star = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = star
spec.loader.exec_module(star)

SUNDAY = datetime(2026, 10, 11, tzinfo=UTC)


def week(start: datetime, days: list[int]) -> dict:
    return {"week": int(start.timestamp()), "total": sum(days), "days": days}


class DailyPointsTests(unittest.TestCase):
    def test_the_line_starts_at_zero_on_the_first_starred_day_and_ends_at_generation_time(self):
        as_of = SUNDAY + timedelta(days=9, hours=6)
        weeks = [week(SUNDAY - timedelta(days=7), [0] * 7),
                 week(SUNDAY + timedelta(days=7), [3, 4, 0, 0, 0, 0, 0]),
                 week(SUNDAY, [0, 0, 5, 0, 1, 0, 0])]

        points = star.daily_points(weeks, as_of)

        self.assertEqual(points[0], (SUNDAY + timedelta(days=2), 0))
        self.assertEqual(points[1], (SUNDAY + timedelta(days=3), 5))
        self.assertEqual(points[-1], (as_of, 13))
        self.assertEqual(len(points), 1 + 8)

    def test_days_after_generation_time_in_the_current_week_are_not_drawn(self):
        as_of = SUNDAY + timedelta(days=1, hours=1)

        points = star.daily_points([week(SUNDAY, [2, 1, 0, 0, 0, 0, 0])], as_of)

        self.assertEqual([value for _, value in points], [0, 2, 3])
        self.assertLessEqual(max(moment for moment, _ in points), as_of)

    def test_a_history_without_any_star_is_refused_instead_of_publishing_an_empty_chart(self):
        with self.assertRaises(ValueError):
            star.daily_points([week(SUNDAY, [0] * 7)], SUNDAY + timedelta(days=8))


class CurveTests(unittest.TestCase):
    def test_every_curve_segment_stays_between_its_two_daily_values(self):
        values = [0, 0, 2, 2, 180, 3700, 8500, 10400, 11000, 11700, 12300]
        points = [(56 + 40 * index, 456 - value / 40) for index, value in enumerate(values)]

        path = star.monotone_path(points)

        segments = re.findall(r"C([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)", path)
        self.assertEqual(len(segments), len(points) - 1)
        for (_, y0), segment in zip(points, segments):
            y1 = float(segment[5])
            low, high = sorted((y0, y1))
            for control in (float(segment[1]), float(segment[3])):
                self.assertGreaterEqual(control, low - 0.01)
                self.assertLessEqual(control, high + 0.01)


class RenderTests(unittest.TestCase):
    def test_both_themes_are_valid_svg_and_differ_only_in_colours(self):
        points = star.daily_points([week(SUNDAY, [1, 40, 900, 300, 50, 0, 0])], SUNDAY + timedelta(days=6))

        light = star.render(points, "owner/repo", "light")
        dark = star.render(points, "owner/repo", "dark")

        for svg in (light, dark):
            root = ET.fromstring(svg)
            self.assertEqual(root.get("width"), "900")
            self.assertIn("1,291", "".join(root.itertext()))
        strip = re.compile(r"#[0-9a-f]{6}")
        self.assertNotEqual(light, dark)
        self.assertEqual(strip.sub("", light), strip.sub("", dark))

    def test_value_ticks_cover_the_total_with_a_round_step(self):
        self.assertEqual(star.value_ticks(13071), [0, 5000, 10000])
        self.assertEqual(star.value_ticks(7), [0, 2, 4, 6])


if __name__ == "__main__":
    unittest.main()
