from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock


VALIDATOR_PATH = Path(__file__).resolve().parents[1] / "refactoring" / "validate_pack.py"
SPEC = importlib.util.spec_from_file_location("validate_pack", VALIDATOR_PATH)
assert SPEC and SPEC.loader
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


class PackValidatorTests(unittest.TestCase):
    def test_strict_skill_parser_rejects_nested_unknown_yaml(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "skills" / "coding" / "sample" / "SKILL.md"
            path.parent.mkdir(parents=True)
            path.write_text(
                """---
name: sample
description: Does a task. Use for samples; do not use for production.
license:
  - MIT
---

# Sample
""",
                encoding="utf-8",
            )
            with mock.patch.object(validator, "ROOT", root):
                _, _, errors = validator.parse_frontmatter(path, strict_skill=True)
            self.assertTrue(any("nested YAML" in error for error in errors))

    def test_strict_skill_parser_rejects_unterminated_quoted_scalar(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "skills" / "coding" / "sample" / "SKILL.md"
            path.parent.mkdir(parents=True)
            path.write_text(
                """---
name: sample
description: "unterminated
---

# Sample
""",
                encoding="utf-8",
            )
            with mock.patch.object(validator, "ROOT", root):
                _, _, errors = validator.parse_frontmatter(path, strict_skill=True)
            self.assertTrue(any("invalid quoted YAML string" in error for error in errors))

    def test_dependency_check_does_not_treat_nested_filename_as_importable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "nested").mkdir()
            (root / "main.py").write_text("import ghost_dependency\n", encoding="utf-8")
            (root / "nested" / "ghost_dependency.py").write_text("VALUE = 1\n", encoding="utf-8")
            config = root / "config" / "technical-debt-workflow" / "refactoring.toml"
            config.parent.mkdir(parents=True)
            config.write_text(
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
            with (
                mock.patch.object(validator, "ROOT", root),
                mock.patch.object(validator, "WORKFLOW_ROOT", root),
                mock.patch.object(validator, "CONFIG_PATH", config),
            ):
                errors = validator.check_dependencies()
            self.assertTrue(any("ghost_dependency" in error for error in errors))

    def test_security_check_rejects_flag_order_and_write_permissions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workflow_root = root / "workflow"
            workflow_root.mkdir()
            bad_script = workflow_root / "bad.sh"
            bad_script.write_text("#!/bin/sh\nrm -r -f build\n", encoding="utf-8")
            client_root = root / "client-entrypoints"
            workflow = client_root / "refactoring.yml"
            workflow.parent.mkdir(parents=True)
            workflow.write_text(
                """name: bad
# contents: read
permissions: { contents: write }
""",
                encoding="utf-8",
            )
            (root / ".gitignore").write_text(".refactoring/\n", encoding="utf-8")
            with (
                mock.patch.object(validator, "ROOT", root),
                mock.patch.object(validator, "WORKFLOW_ROOT", workflow_root),
                mock.patch.object(validator, "CLIENT_ENTRYPOINT_ROOT", client_root),
                mock.patch.object(validator, "text_files", return_value=[bad_script, workflow]),
            ):
                errors = validator.check_security()
            self.assertTrue(any("destructive command" in error for error in errors))
            self.assertTrue(any("inline permissions" in error for error in errors))

    def test_external_skill_runner_reference_requires_target_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            skills_root = root / "skills" / "coding"
            skill = skills_root / "sample" / "SKILL.md"
            skill.parent.mkdir(parents=True)
            skill.write_text(
                "Run `scripts/skills/coding/technical-debt-workflow/refactoring/baseline` before editing.\n",
                encoding="utf-8",
            )
            with (
                mock.patch.object(validator, "ROOT", root),
                mock.patch.object(validator, "SKILLS", ("sample",)),
                mock.patch.object(validator, "SKILLS_ROOT", skills_root),
                mock.patch.object(validator, "WORKFLOW_ROOT", root / "workflow"),
                mock.patch.object(validator, "CLIENT_ENTRYPOINT_ROOT", root / "client-entrypoints"),
            ):
                errors = validator.check_compatibility()
            self.assertTrue(any("require explicit --root" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
