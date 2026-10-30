"""本机同类读取与资料采集的近期流量样本。"""
from __future__ import annotations

import json
import math
import time
from statistics import mean

from .fsutil import atomic_write_text
from .processing_control import _read


class TrafficHistory:
    def __init__(self, config):
        self.path = config.directory('state') / 'library-processing-traffic.json'
        data = _read(self.path)
        self.samples = {}
        for key, values in data.items():
            if isinstance(values, list):
                valid = [value for value in values if isinstance(value, (int, float))
                         and math.isfinite(value) and value > 0]
                if valid:
                    self.samples[key] = valid[-50:]
        self.dirty = False
        self.saved_at = time.monotonic()

    def average(self, key, fallback):
        values = self.samples.get(key, [])
        return round(mean(values)) if len(values) >= 3 else fallback

    def observe(self, key, amount):
        if not isinstance(amount, (int, float)) or not math.isfinite(amount) or amount <= 0:
            return
        values = self.samples.setdefault(key, [])
        values.append(int(amount))
        del values[:-50]
        self.dirty = True

    def save(self, *, force=False):
        if self.dirty and (force or time.monotonic() - self.saved_at >= 5):
            try:
                atomic_write_text(self.path, json.dumps(self.samples, ensure_ascii=False) + '\n')
            except OSError:
                return
            self.dirty = False
            self.saved_at = time.monotonic()
