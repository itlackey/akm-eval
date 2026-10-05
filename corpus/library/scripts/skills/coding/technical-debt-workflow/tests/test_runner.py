from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import time
import unittest


RUNNER_PATH = Path(__file__).resolve().parents[1] / "refactoring" / "runner.py"
SPEC = importlib.util.spec_from_file_location("refactoring_runner", RUNNER_PATH)
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    def git(self, root: Path, *arguments: str) -> None:
        completed = subprocess.run(
            ["git", "-C", str(root), *arguments],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)

    def config_path(self, root: Path) -> Path:
        path = root / "config" / "technical-debt-workflow" / "refactoring.toml"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def make_repository(self, directory: Path) -> None:
        (directory / "check.py").write_text(
            """import json
import sys
from pathlib import Path

state = json.loads(Path('state.json').read_text(encoding='utf-8'))
print(f"{sys.argv[1]}={state[sys.argv[1]]}")
raise SystemExit(0 if state[sys.argv[1]] else 3)
""",
            encoding="utf-8",
        )
        (directory / "state.json").write_text(
            json.dumps({"a": False, "b": True}, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        self.config_path(directory).write_text(
            """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "a"
category = "unit"
command = "python3 check.py a"
required = true
enabled = true

[[checks]]
name = "b"
category = "unit"
command = "python3 check.py b"
required = true
enabled = true

[[checks]]
name = "optional"
category = "coverage"
required = false
enabled = false
reason = "Not applicable to this fixture."
""",
            encoding="utf-8",
        )

    def test_baseline_and_verification_distinguish_failure_lineage(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.make_repository(root)

            baseline_exit = runner.main(["baseline", "--root", str(root)])
            self.assertEqual(baseline_exit, 1)
            baseline = json.loads((root / ".refactoring" / "baseline.json").read_text(encoding="utf-8"))
            baseline_by_name = {check["name"]: check for check in baseline["checks"]}
            self.assertEqual(baseline_by_name["a"]["status"], "failed")
            self.assertEqual(baseline_by_name["b"]["status"], "passed")
            self.assertEqual(baseline_by_name["optional"]["status"], "skipped")

            (root / "state.json").write_text(
                json.dumps({"a": True, "b": False}, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            verify_exit = runner.main(["verify", "--root", str(root)])
            self.assertEqual(verify_exit, 1)
            verification = json.loads((root / ".refactoring" / "verify.json").read_text(encoding="utf-8"))
            verify_by_name = {check["name"]: check for check in verification["checks"]}
            self.assertEqual(verify_by_name["a"]["comparison"], "fixed_failure")
            self.assertEqual(verify_by_name["b"]["comparison"], "new_failure")
            self.assertEqual(verify_by_name["optional"]["comparison"], "skipped")
            self.assertEqual(verification["summary"]["new_failures"], ["b"])
            self.assertEqual(verification["summary"]["fixed_failures"], ["a"])

            report_exit = runner.main(["report", "--root", str(root)])
            self.assertEqual(report_exit, 1)
            report = (root / ".refactoring" / "report.md").read_text(encoding="utf-8")
            self.assertIn("Final status: `failed`", report)
            self.assertIn("New failures: `b`", report)
            self.assertIn("Required verification is incomplete or failing", report)

    def test_required_skipped_check_is_blocked(self) -> None:
        report, status = runner.build_report(
            {
                "root": "/fixture",
                "started_at": "2026-07-26T00:00:00+00:00",
                "summary": {"baseline_comparable": True},
                "checks": [
                    {
                        "name": "security",
                        "required": True,
                        "status": "skipped",
                        "reason": "scanner unavailable",
                        "baseline_status": "passed",
                        "comparison": "skipped",
                        "exit_code": None,
                        "duration_seconds": 0,
                    }
                ],
            },
            {"schema_version": 1},
        )
        self.assertEqual(status, "blocked")
        self.assertIn("`security`: `skipped` - scanner unavailable", report)
        self.assertNotIn("Required checks all passed.", report)

    def test_configuration_rejects_artifact_escape(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = self.config_path(root)
            config.write_text(
                """schema_version = 1
artifact_dir = "../outside"
timeout_seconds = 10

[[checks]]
name = "ok"
category = "unit"
command = "true"
required = true
enabled = true
""",
                encoding="utf-8",
            )
            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 2)
            self.assertFalse((root.parent / "outside" / "baseline.json").exists())

    def test_artifact_directory_cannot_alias_source(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "src"
            source.mkdir()
            (root / ".refactoring").symlink_to(source, target_is_directory=True)
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "ok"
category = "unit"
command = "true"
required = true
enabled = true
""",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 2)
            self.assertFalse((source / "baseline.json").exists())

    def test_verify_requires_baseline_unless_current_only_is_explicit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.make_repository(root)
            (root / "state.json").write_text(
                json.dumps({"a": True, "b": True}, sort_keys=True) + "\n",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["verify", "--root", str(root)]), 2)
            self.assertFalse((root / ".refactoring" / "verify.json").exists())
            self.assertEqual(runner.main(["verify", "--current-only", "--root", str(root)]), 0)
            self.assertEqual(runner.main(["report", "--root", str(root)]), 2)

    def test_output_cannot_escape_artifact_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.make_repository(root)
            protected = root / "README.md"
            protected.write_text("protected\n", encoding="utf-8")

            exit_code = runner.main(
                ["baseline", "--root", str(root), "--output", str(protected)]
            )
            self.assertEqual(exit_code, 2)
            self.assertEqual(protected.read_text(encoding="utf-8"), "protected\n")

    def test_baseline_fails_when_check_mutates_visible_worktree_state(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / ".gitignore").write_text(".refactoring/\n", encoding="utf-8")
            (root / "source.txt").write_text("before\n", encoding="utf-8")
            (root / "mutate.py").write_text(
                "from pathlib import Path\nPath('source.txt').write_text('after\\n', encoding='utf-8')\n",
                encoding="utf-8",
            )
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "mutate"
category = "unit"
command = "python3 mutate.py"
required = true
enabled = true
""",
                encoding="utf-8",
            )
            self.git(root, "init", "--quiet")
            self.git(root, "add", ".")
            self.git(
                root,
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--quiet",
                "-m",
                "baseline",
            )

            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 1)
            evidence = json.loads((root / ".refactoring" / "baseline.json").read_text(encoding="utf-8"))
            self.assertEqual(evidence["summary"]["worktree_check"]["status"], "failed")
            self.assertIn("worktree-unchanged-by-checks", evidence["summary"]["required_failures"])
            self.assertEqual(runner.main(["verify", "--root", str(root)]), 2)
            self.assertFalse((root / ".refactoring" / "verify.json").exists())

    def test_report_rejects_tampered_verification(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.make_repository(root)
            (root / "state.json").write_text(
                json.dumps({"a": True, "b": True}, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 0)
            self.assertEqual(runner.main(["verify", "--root", str(root)]), 0)
            verification_path = root / ".refactoring" / "verify.json"
            verification = json.loads(verification_path.read_text(encoding="utf-8"))
            verification["checks"] = []
            verification_path.write_text(json.dumps(verification) + "\n", encoding="utf-8")

            self.assertEqual(runner.main(["report", "--root", str(root)]), 2)
            self.assertFalse((root / ".refactoring" / "report.md").exists())

    def test_timeout_terminates_descendant_processes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            marker = root / "descendant-finished"
            child_code = (
                "import signal, time; from pathlib import Path; "
                "signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(5); "
                f"Path({str(marker)!r}).write_text('bad', encoding='utf-8')"
            )
            (root / "timeout.py").write_text(
                "import subprocess, sys, time\n"
                f"subprocess.Popen([sys.executable, '-c', {child_code!r}], start_new_session=True)\n"
                "time.sleep(10)\n",
                encoding="utf-8",
            )
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 1

[[checks]]
name = "timeout"
category = "unit"
command = "python3 timeout.py"
required = true
enabled = true
""",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 1)
            time.sleep(2.2)
            self.assertFalse(marker.exists())

    def test_invalid_utf8_output_is_replaced_not_crashed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "bytes.py").write_text("import os\nos.write(1, b'\\xff')\n", encoding="utf-8")
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "bytes"
category = "unit"
command = "python3 bytes.py"
required = true
enabled = true
""",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 0)
            evidence = json.loads((root / ".refactoring" / "baseline.json").read_text(encoding="utf-8"))
            self.assertEqual(evidence["checks"][0]["stdout"], "\ufffd")

    def test_verification_rejects_baseline_from_descendant_commit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / ".gitignore").write_text(".refactoring/\n", encoding="utf-8")
            (root / "source.txt").write_text("one\n", encoding="utf-8")
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10
mutation_exclude = []

[[checks]]
name = "ok"
category = "unit"
command = "true"
required = true
enabled = true
""",
                encoding="utf-8",
            )
            self.git(root, "init", "--quiet")
            self.git(root, "add", ".")
            self.git(
                root,
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--quiet",
                "-m",
                "first",
            )
            first = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"],
                text=True,
                capture_output=True,
                check=True,
            ).stdout.strip()
            (root / "source.txt").write_text("two\n", encoding="utf-8")
            self.git(root, "add", "source.txt")
            self.git(
                root,
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--quiet",
                "-m",
                "second",
            )
            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 0)
            self.git(root, "checkout", "--quiet", first)

            self.assertEqual(runner.main(["verify", "--root", str(root)]), 2)

    def test_check_cannot_reuse_stale_configured_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            artifact_dir = root / ".refactoring"
            artifact_dir.mkdir()
            stale = artifact_dir / "check.json"
            stale.write_text('{"stale": true}\n', encoding="utf-8")
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "evidence"
category = "unit"
command = "true"
required = true
enabled = true
artifacts = [".refactoring/check.json"]
""",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 1)
            self.assertFalse(stale.exists())
            evidence = json.loads((artifact_dir / "baseline.json").read_text(encoding="utf-8"))
            self.assertEqual(evidence["checks"][0]["status"], "failed")

    def test_non_git_mutation_fails_repository_tree_check(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "ignored-source.txt").write_text("before\n", encoding="utf-8")
            (root / "mutate.py").write_text(
                "from pathlib import Path\nPath('ignored-source.txt').write_text('after\\n', encoding='utf-8')\n",
                encoding="utf-8",
            )
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10
mutation_exclude = []

[[checks]]
name = "mutate"
category = "unit"
command = "python3 mutate.py"
required = true
enabled = true
""",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 1)
            evidence = json.loads((root / ".refactoring" / "baseline.json").read_text(encoding="utf-8"))
            self.assertEqual(evidence["summary"]["worktree_check"]["status"], "failed")

    def test_large_output_is_streamed_and_bounded(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "large.py").write_text("import os\nos.write(1, b'x' * 1_000_000)\n", encoding="utf-8")
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "large"
category = "unit"
command = "python3 large.py"
required = true
enabled = true
""",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 0)
            evidence = json.loads((root / ".refactoring" / "baseline.json").read_text(encoding="utf-8"))
            check = evidence["checks"][0]
            self.assertTrue(check["output_truncated"])
            self.assertLess(len(check["stdout"]), 66_000)

    def test_broad_mutation_exclusion_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10
mutation_exclude = ["**"]

[[checks]]
name = "ok"
category = "unit"
command = "true"
required = true
enabled = true
""",
                encoding="utf-8",
            )
            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 2)

    def test_empty_directory_and_directory_symlink_mutations_are_detected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root.parent / f"{root.name}-target"
            target.mkdir()
            self.addCleanup(target.rmdir)
            (root / "mutate.py").write_text(
                "from pathlib import Path\n"
                "Path('empty-directory').mkdir()\n"
                f"Path('directory-link').symlink_to({str(target)!r}, target_is_directory=True)\n",
                encoding="utf-8",
            )
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "mutate"
category = "unit"
command = "python3 mutate.py"
required = true
enabled = true
""",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 1)
            evidence = json.loads((root / ".refactoring" / "baseline.json").read_text(encoding="utf-8"))
            self.assertEqual(evidence["summary"]["worktree_check"]["status"], "failed")

    def test_git_control_file_mutation_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / ".gitignore").write_text(".refactoring/\n", encoding="utf-8")
            (root / "mutate.py").write_text(
                "from pathlib import Path\n"
                "path = Path('.git/config')\n"
                "path.write_text(path.read_text(encoding='utf-8') + '\\n# changed\\n', encoding='utf-8')\n",
                encoding="utf-8",
            )
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "mutate-git"
category = "unit"
command = "python3 mutate.py"
required = true
enabled = true
""",
                encoding="utf-8",
            )
            self.git(root, "init", "--quiet")
            self.git(root, "add", ".")
            self.git(
                root,
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--quiet",
                "-m",
                "baseline",
            )

            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 1)
            evidence = json.loads((root / ".refactoring" / "baseline.json").read_text(encoding="utf-8"))
            self.assertEqual(evidence["summary"]["worktree_check"]["status"], "failed")

    def test_tree_hash_frames_records_and_tracks_special_mode_bits(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            artifact_dir = root / ".refactoring"
            artifact_dir.mkdir()
            first = root / "a"
            first.write_bytes(b"b\0file\0" + (0o644).to_bytes(2, "big"))
            first.chmod(0o644)
            before_split = runner.repository_tree_snapshot(root, artifact_dir, [])

            first.write_bytes(b"")
            second = root / "b"
            second.write_bytes(b"")
            first.chmod(0o644)
            second.chmod(0o644)
            after_split = runner.repository_tree_snapshot(root, artifact_dir, [])
            self.assertNotEqual(before_split["sha256"], after_split["sha256"])
            self.assertNotEqual(before_split["file_count"], after_split["file_count"])

            first.chmod(0o755)
            ordinary_mode = runner.repository_tree_snapshot(root, artifact_dir, [])
            first.chmod(0o4755)
            special_mode = runner.repository_tree_snapshot(root, artifact_dir, [])
            self.assertNotEqual(ordinary_mode["sha256"], special_mode["sha256"])

    def test_worktree_check_rejects_equal_digest_with_different_entry_count(self) -> None:
        before = {
            "status": "captured",
            "hash_format": runner.TREE_HASH_FORMAT,
            "sha256": "same",
            "file_count": 2,
        }
        after = {**before, "file_count": 3}
        result = runner.worktree_check(
            {"available": False},
            {"available": False},
            before,
            after,
        )
        self.assertEqual(result["status"], "failed")

    def test_duplicate_artifact_ownership_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "first"
category = "unit"
command = "true"
required = true
enabled = true
artifacts = [".refactoring/shared.json"]

[[checks]]
name = "second"
category = "unit"
command = "true"
required = true
enabled = true
artifacts = [".refactoring/./shared.json"]
""",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["verify", "--current-only", "--root", str(root)]), 2)
            self.assertFalse((root / ".refactoring" / "verify.json").exists())

    def test_later_check_cannot_stale_an_earlier_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "first.py").write_text(
                "from pathlib import Path\nPath('.refactoring/first.json').write_text('first', encoding='utf-8')\n",
                encoding="utf-8",
            )
            (root / "second.py").write_text(
                "from pathlib import Path\n"
                "Path('.refactoring/first.json').write_text('changed', encoding='utf-8')\n"
                "Path('.refactoring/second.json').write_text('second', encoding='utf-8')\n",
                encoding="utf-8",
            )
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "first"
category = "unit"
command = "python3 first.py"
required = true
enabled = true
artifacts = [".refactoring/first.json"]

[[checks]]
name = "second"
category = "unit"
command = "python3 second.py"
required = true
enabled = true
artifacts = [".refactoring/second.json"]
""",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["verify", "--current-only", "--root", str(root)]), 2)
            self.assertFalse((root / ".refactoring" / "verify.json").exists())

    def test_git_command_terminates_detached_helper_descendants(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            marker = root / "git-descendant-finished"
            child_code = (
                "import signal,time; from pathlib import Path; "
                "signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(3); "
                f"Path({str(marker)!r}).write_text('bad', encoding='utf-8')"
            )
            (root / "spawn.py").write_text(
                "import subprocess, sys\n"
                f"subprocess.Popen([sys.executable, '-c', {child_code!r}], "
                "start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)\n",
                encoding="utf-8",
            )
            self.git(root, "init", "--quiet")
            self.git(root, "config", "alias.spawn-child", "!python3 spawn.py")

            code, _, error = runner.git_command(root, ["spawn-child"])
            self.assertEqual(code, 127, error)
            self.assertIn("descendants completed", error)
            time.sleep(2.2)
            self.assertFalse(marker.exists())

    def test_backgrounded_check_cannot_pass_before_descendant_completion(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "background"
category = "unit"
command = "(sleep 5; false) &"
required = true
enabled = true
""",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 1)
            evidence = json.loads((root / ".refactoring" / "baseline.json").read_text(encoding="utf-8"))
            check = evidence["checks"][0]
            self.assertEqual(check["status"], "failed")
            self.assertIn("descendant processes completed", check["reason"])

    def test_git_snapshot_neutralizes_repository_clean_filters(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            container = Path(temporary)
            root = container / "repository"
            root.mkdir()
            marker = container / "external-side-effect"
            (root / ".gitignore").write_text(".refactoring/\n", encoding="utf-8")
            (root / ".gitattributes").write_text("*.txt filter=probe/v1\n", encoding="utf-8")
            (root / "source.txt").write_text("before\n", encoding="utf-8")
            (root / "probe.py").write_text(
                "import sys\n"
                "from pathlib import Path\n"
                f"Path({str(marker)!r}).write_text('unsafe', encoding='utf-8')\n"
                "sys.stdout.buffer.write(sys.stdin.buffer.read())\n",
                encoding="utf-8",
            )
            self.config_path(root).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "ok"
category = "unit"
command = "true"
required = true
enabled = true
""",
                encoding="utf-8",
            )
            self.git(root, "init", "--quiet")
            self.git(root, "add", ".")
            self.git(
                root,
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--quiet",
                "-m",
                "baseline",
            )
            self.git(
                root,
                "config",
                "filter.probe/v1.clean",
                "python3 probe.py\nFILTER_SECRET_123",
            )
            (root / "source.txt").write_text("after\n", encoding="utf-8")

            self.assertEqual(runner.main(["baseline", "--root", str(root)]), 0)
            self.assertFalse(marker.exists())
            evidence = json.loads((root / ".refactoring" / "baseline.json").read_text(encoding="utf-8"))
            self.assertIsNone(evidence["git_before"]["status"])
            self.assertIn("may execute external commands", evidence["git_before"]["status_error"])
            self.assertEqual(evidence["git_before"]["filter_configuration_keys"], ["filter.probe/v1.clean"])
            self.assertNotIn("FILTER_SECRET_123", json.dumps(evidence))

    def test_linked_worktree_common_git_mutation_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            container = Path(temporary)
            main = container / "main"
            linked = container / "linked"
            main.mkdir()
            (main / "source.txt").write_text("source\n", encoding="utf-8")
            self.git(main, "init", "--quiet")
            self.git(main, "add", ".")
            self.git(
                main,
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--quiet",
                "-m",
                "baseline",
            )
            self.git(main, "worktree", "add", "--quiet", "--detach", str(linked))
            common_config = main / ".git" / "config"
            (linked / "mutate.py").write_text(
                "from pathlib import Path\n"
                f"path = Path({str(common_config)!r})\n"
                "path.write_text(path.read_text(encoding='utf-8') + '\\n# changed\\n', encoding='utf-8')\n",
                encoding="utf-8",
            )
            self.config_path(linked).write_text(
                """schema_version = 1
artifact_dir = ".refactoring"
timeout_seconds = 10

[[checks]]
name = "mutate-common-git"
category = "unit"
command = "python3 mutate.py"
required = true
enabled = true
""",
                encoding="utf-8",
            )

            self.assertEqual(runner.main(["baseline", "--root", str(linked)]), 1)
            evidence = json.loads((linked / ".refactoring" / "baseline.json").read_text(encoding="utf-8"))
            self.assertEqual(evidence["summary"]["worktree_check"]["status"], "failed")


if __name__ == "__main__":
    unittest.main()
