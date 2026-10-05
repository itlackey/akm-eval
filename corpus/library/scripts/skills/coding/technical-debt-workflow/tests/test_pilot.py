from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock


PILOT_PATH = Path(__file__).resolve().parents[1] / "run_pilot.py"
SPEC = importlib.util.spec_from_file_location("run_pilot", PILOT_PATH)
assert SPEC and SPEC.loader
pilot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pilot)


class PilotTests(unittest.TestCase):
    def test_pilot_preserves_contract_and_reduces_duplication(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "pilot.json"
            result = pilot.run_pilot(output)

            self.assertEqual(result["status"], "passed")
            self.assertTrue(all(result["checks"].values()))
            self.assertEqual(result["test_cases"], 6)
            self.assertLess(
                result["metrics"]["after"]["nonblank_lines"],
                result["metrics"]["before"]["nonblank_lines"],
            )
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["status"], "passed")

    def test_fixture_execution_is_confined_to_child_working_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repository = Path(temporary)
            (repository / "contract-cases.json").write_text(
                '[{"expected": "ok", "trim": true, "value": "OK"}]\n',
                encoding="utf-8",
            )
            (repository / "normalizer.py").write_text(
                "from pathlib import Path\n"
                "Path('child-side-effect').write_text('contained', encoding='utf-8')\n"
                "def normalize_label(value: str, trim: bool = True) -> str:\n"
                "    return value.lower()\n",
                encoding="utf-8",
            )

            self.assertEqual(pilot.evaluate_source(repository), ["ok"])
            self.assertTrue((repository / "child-side-effect").is_file())
            self.assertFalse((Path.cwd() / "child-side-effect").exists())

    def test_fixture_cannot_exit_zero_without_structured_results(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repository = Path(temporary)
            (repository / "contract-cases.json").write_text("[]\n", encoding="utf-8")
            (repository / "normalizer.py").write_text(
                "raise SystemExit(0)\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(RuntimeError, "structured output"):
                pilot.evaluate_source(repository)

    def test_pilot_ignores_inherited_git_redirection(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            outside_git_dir = root / "outside.git"
            output = root / "pilot.json"
            with mock.patch.dict("os.environ", {"GIT_DIR": str(outside_git_dir)}, clear=False):
                result = pilot.run_pilot(output)
            self.assertEqual(result["status"], "passed")
            self.assertFalse(outside_git_dir.exists())

    def test_fixture_descendants_are_terminated(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repository = Path(temporary)
            marker = repository / "descendant-finished"
            child = (
                "import signal,time; from pathlib import Path; "
                "signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(5); "
                f"Path({str(marker)!r}).write_text('bad', encoding='utf-8')"
            )
            (repository / "contract-cases.json").write_text(
                '[{"expected": "ok", "trim": true, "value": "OK"}]\n',
                encoding="utf-8",
            )
            (repository / "normalizer.py").write_text(
                "import subprocess, sys\n"
                f"subprocess.Popen([sys.executable, '-c', {child!r}], start_new_session=True)\n"
                "def normalize_label(value: str, trim: bool = True) -> str:\n"
                "    return value.lower()\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(RuntimeError, "descendant processes completed"):
                pilot.evaluate_source(repository)
            time.sleep(3.2)
            self.assertFalse(marker.exists())

    def test_output_directory_symlink_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            container = Path(temporary)
            root = container / "pack"
            outside = container / "outside"
            root.mkdir()
            outside.mkdir()
            (root / ".refactoring").symlink_to(outside, target_is_directory=True)
            with mock.patch.object(pilot, "ROOT", root):
                with self.assertRaisesRegex(ValueError, "must not be a symlink"):
                    pilot.pilot_output_path("pilot.json")

    def test_failed_standalone_run_removes_stale_passing_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            artifact_dir = root / ".refactoring"
            artifact_dir.mkdir()
            output = artifact_dir / "pilot.json"
            output.write_text('{"status": "passed"}\n', encoding="utf-8")
            with (
                mock.patch.object(pilot, "ROOT", root),
                mock.patch.object(pilot, "run_pilot", side_effect=RuntimeError("Git unavailable")),
            ):
                self.assertEqual(pilot.main([]), 2)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
