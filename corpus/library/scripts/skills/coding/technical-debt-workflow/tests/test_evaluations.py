from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


EVALUATOR_PATH = Path(__file__).resolve().parents[1] / "evaluate_skills.py"
SPEC = importlib.util.spec_from_file_location("evaluate_skills", EVALUATOR_PATH)
assert SPEC and SPEC.loader
evaluator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluator)


class EvaluationTests(unittest.TestCase):
    def test_empty_observation_set_is_rejected(self) -> None:
        expected = {
            "case-a": {
                "activate": ["skill-a"],
                "forbidden_actions": [],
                "outcome": "complete",
                "verification_required": True,
            }
        }
        payload = {
            "schema_version": 1,
            "run": {
                "client": "test",
                "fixture_sha256": evaluator.directory_sha256(evaluator.PILOT_FIXTURE),
                "harness_version": "1",
                "model": "model",
                "permissions": "read-only",
                "policy_sha256": evaluator.file_sha256(
                    evaluator.ROOT / "knowledge" / "coding" / "technical-debt" / "refactoring-policy.md"
                ),
                "timestamp": "2026-07-26T00:00:00Z",
            },
            "cases": [],
        }

        errors = evaluator.validate_observations(payload, expected, evaluator.ROOT)
        self.assertTrue(any("missing 1 required case" in error for error in errors))

    def test_destructive_action_and_low_rubric_score_are_counted(self) -> None:
        expected = {
            "case-a": {
                "activate": ["skill-a"],
                "forbidden_actions": [],
                "outcome": "stop",
                "verification_required": False,
            }
        }
        observations = {
            "cases": [
                {
                    "artifacts": [],
                    "case_id": "case-a",
                    "command_trace": [],
                    "critical_failures": ["destructive operation"],
                    "final_claim_matches_trace": True,
                    "observed_actions": ["force_push"],
                    "observed_activations": ["skill-a"],
                    "regression": False,
                    "rubric_score": 80,
                    "stop_observed": True,
                    "unnecessary_churn": False,
                    "verification_status": "not_required",
                }
            ]
        }

        result = evaluator.aggregate_observations(observations, expected)
        self.assertEqual(result["metrics"]["unsafe_actions"], 1)
        self.assertEqual(result["metrics"]["critical_failures"], 1)
        self.assertEqual(result["metrics"]["rubric_failures"], 1)

    def test_output_path_cannot_escape_evidence_directory(self) -> None:
        with self.assertRaisesRegex(ValueError, "must remain inside"):
            evaluator.evaluation_output_path("../outside.json")

    def test_output_directory_symlink_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            container = Path(temporary)
            root = container / "pack"
            outside = container / "outside"
            root.mkdir()
            outside.mkdir()
            (root / ".refactoring").symlink_to(outside, target_is_directory=True)
            with mock.patch.object(evaluator, "ROOT", root):
                with self.assertRaisesRegex(ValueError, "must not be a symlink"):
                    evaluator.evaluation_output_path("evaluation.json")

    def test_directory_hash_frames_file_boundaries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "a"
            first.write_bytes(b"b\0")
            before = evaluator.directory_sha256(root)
            first.write_bytes(b"")
            (root / "b").write_bytes(b"")
            after = evaluator.directory_sha256(root)
            self.assertNotEqual(before, after)

            first.chmod(0o755)
            ordinary_mode = evaluator.directory_sha256(root)
            first.chmod(0o4755)
            special_mode = evaluator.directory_sha256(root)
            self.assertNotEqual(ordinary_mode, special_mode)

    def test_fixture_patch_must_produce_recorded_after_tree(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Path(temporary)
            for directory in ("before", "after", "evidence"):
                (fixture / directory).mkdir()
            (fixture / "before" / "normalizer.py").write_text("value = 'before'\n", encoding="utf-8")
            (fixture / "after" / "normalizer.py").write_text("value = 'expected'\n", encoding="utf-8")
            evidence = {
                "checks": [
                    {
                        "command": "true",
                        "exit_code": 0,
                        "name": "fixture",
                        "status": "passed",
                        "stdout": "",
                    }
                ]
            }
            for name in ("baseline.json", "verification.json"):
                (fixture / "evidence" / name).write_text(json.dumps(evidence), encoding="utf-8")
            (fixture / "evidence" / "pilot.patch").write_text(
                """--- a/normalizer.py
+++ b/normalizer.py
@@ -1 +1 @@
-value = 'before'
+value = 'different'
""",
                encoding="utf-8",
            )

            with mock.patch.object(evaluator, "PILOT_FIXTURE", fixture):
                errors = evaluator.validate_fixture_evidence()
            self.assertTrue(any("does not match the recorded after tree" in error for error in errors))

    def test_observation_artifacts_must_exist_and_match_hash(self) -> None:
        expected = {
            "case-a": {
                "activate": ["skill-a"],
                "forbidden_actions": [],
                "outcome": "complete",
                "verification_required": True,
            }
        }
        with tempfile.TemporaryDirectory() as temporary:
            evidence_root = Path(temporary)
            payload = {
                "schema_version": 1,
                "run": {
                    "client": "test",
                    "fixture_sha256": evaluator.directory_sha256(evaluator.PILOT_FIXTURE),
                    "harness_version": "1",
                    "model": "model",
                    "permissions": "read-only",
                    "policy_sha256": evaluator.file_sha256(
                        evaluator.ROOT / "knowledge" / "coding" / "technical-debt" / "refactoring-policy.md"
                    ),
                    "timestamp": "2026-07-26T00:00:00Z",
                },
                "cases": [
                    {
                        "artifacts": [{"path": "missing.log", "sha256": "0" * 64}],
                        "case_id": "case-a",
                        "command_trace": [{"command": "verify", "exit_code": 0, "status": "passed"}],
                        "critical_failures": [],
                        "final_claim_matches_trace": True,
                        "observed_actions": [],
                        "observed_activations": ["skill-a"],
                        "regression": False,
                        "rubric_score": 100,
                        "stop_observed": False,
                        "unnecessary_churn": False,
                        "verification_status": "complete",
                    }
                ],
            }

            errors = evaluator.validate_observations(payload, expected, evidence_root)
        self.assertTrue(any("artifact does not exist" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
