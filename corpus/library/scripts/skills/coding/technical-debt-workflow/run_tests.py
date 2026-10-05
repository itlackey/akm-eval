#!/usr/bin/env python3
"""Run the unit suite and fail when discovery finds no tests."""

from __future__ import annotations

import sys
from pathlib import Path
import unittest


def main() -> int:
    tests = Path(__file__).resolve().parent / "tests"
    suite = unittest.defaultTestLoader.discover(str(tests), pattern="test_*.py")
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    if result.testsRun == 0:
        print("error: unit-test discovery found zero tests", file=sys.stderr)
        return 1
    print(f"Unit tests executed: {result.testsRun}")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
