#!/usr/bin/env python3
"""Validate the refactoring pack without third-party dependencies."""

from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tomllib
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[5]
WORKFLOW_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = ROOT / "skills" / "coding"
KNOWLEDGE_ROOT = ROOT / "knowledge" / "coding" / "technical-debt"
CLIENT_ENTRYPOINT_ROOT = SKILLS_ROOT / "technical-debt-workflow" / "assets" / "client-entrypoints"
CONFIG_PATH = ROOT / "config" / "technical-debt-workflow" / "refactoring.toml"
SKILLS = (
    "technical-debt-workflow",
    "repository-assessment",
    "architecture-review",
    "debt-inventory",
    "refactoring-plan",
    "refactoring-executor",
    "dead-code-removal",
    "dependency-simplification",
    "test-gap-analysis",
    "regression-verification",
    "documentation-sync",
    "refactoring-review",
)
REQUIRED_SECTIONS = (
    "When To Use It",
    "When Not To Use It",
    "Required Inputs",
    "Procedure",
    "Constraints",
    "Expected Output",
    "Verification",
    "Stop Or Escalation Conditions",
)
ALLOWED_SKILL_FIELDS = {
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
    "updated",
}
TEXT_SUFFIXES = {".json", ".md", ".mdc", ".py", ".sh", ".toml", ".yaml", ".yml"}
RESOURCE_PATTERN = re.compile(
    r"`(skills/coding/[A-Za-z0-9._/-]+/(?:assets|references)/[A-Za-z0-9._/-]+\.md)`"
)
RUNNER_REFERENCE_PATTERN = re.compile(
    r"`[^`\n]*scripts/skills/coding/technical-debt-workflow/refactoring/(?:baseline|verify|report)[^`\n]*`"
)
EXTENSIONLESS_TEXT = {
    Path("scripts/skills/coding/technical-debt-workflow/refactoring/baseline"),
    Path("scripts/skills/coding/technical-debt-workflow/refactoring/report"),
    Path("scripts/skills/coding/technical-debt-workflow/refactoring/verify"),
}


def text_files() -> list[Path]:
    roots = [
        *(SKILLS_ROOT / skill for skill in SKILLS),
        ROOT / "agents" / "coding" / "technical-debt",
        ROOT / "commands" / "coding" / "technical-debt",
        ROOT / "workflows" / "coding" / "technical-debt-lifecycle.md",
        KNOWLEDGE_ROOT,
        ROOT / "knowledge" / "coding" / "INDEX.md",
        ROOT / "config" / "technical-debt-workflow",
        WORKFLOW_ROOT,
    ]
    paths: set[Path] = set()
    for scoped_root in roots:
        candidates = [scoped_root] if scoped_root.is_file() else scoped_root.rglob("*") if scoped_root.is_dir() else []
        for path in candidates:
            if (
                path.is_file()
                and (path.suffix in TEXT_SUFFIXES or path.relative_to(ROOT) in EXTENSIONLESS_TEXT)
                and ".refactoring" not in path.parts
                and "__pycache__" not in path.parts
            ):
                paths.add(path)
    return sorted(paths)


def unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def is_unquoted_non_string(value: str) -> bool:
    stripped = value.strip()
    if not stripped or stripped[0:1] in {'"', "'"}:
        return False
    return bool(re.fullmatch(r"(?i:true|false|null|~|[-+]?\d+(?:\.\d+)?)", stripped))


def invalid_quoted_scalar(value: str) -> bool:
    stripped = value.strip()
    if not stripped:
        return False
    if stripped[0] == '"':
        if len(stripped) < 2 or stripped[-1] != '"':
            return True
        try:
            return not isinstance(json.loads(stripped), str)
        except json.JSONDecodeError:
            return True
    if stripped[0] == "'":
        if len(stripped) < 2 or stripped[-1] != "'":
            return True
        return "'" in stripped[1:-1].replace("''", "")
    return stripped[-1] in {'"', "'"}


def parse_frontmatter(path: Path, strict_skill: bool = False) -> tuple[dict[str, Any], str, list[str]]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    errors: list[str] = []
    if not lines or lines[0] != "---":
        return {}, text, [f"{path.relative_to(ROOT)}: missing opening YAML frontmatter marker"]
    try:
        end = lines.index("---", 1)
    except ValueError:
        return {}, text, [f"{path.relative_to(ROOT)}: missing closing YAML frontmatter marker"]

    data: dict[str, Any] = {}
    parent: str | None = None
    for number, line in enumerate(lines[1:end], start=2):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith("  "):
            if parent != "metadata":
                if strict_skill:
                    errors.append(f"{path.relative_to(ROOT)}:{number}: nested YAML is allowed only under metadata")
                continue
            if strict_skill and (line.startswith("   ") or line.startswith("\t")):
                errors.append(f"{path.relative_to(ROOT)}:{number}: metadata entries require exactly two-space indentation")
            child = line.strip()
            if ":" not in child:
                errors.append(f"{path.relative_to(ROOT)}:{number}: malformed metadata entry")
                continue
            key, value = child.split(":", 1)
            metadata = data.setdefault("metadata", {})
            if key.strip() in metadata:
                errors.append(f"{path.relative_to(ROOT)}:{number}: duplicate metadata key {key.strip()!r}")
            if strict_skill and is_unquoted_non_string(value):
                errors.append(f"{path.relative_to(ROOT)}:{number}: metadata values must be YAML strings")
            if strict_skill and invalid_quoted_scalar(value):
                errors.append(f"{path.relative_to(ROOT)}:{number}: invalid quoted YAML string")
            metadata[key.strip()] = unquote(value)
            continue
        if line[0].isspace():
            if strict_skill:
                errors.append(f"{path.relative_to(ROOT)}:{number}: unsupported YAML indentation")
            continue
        if ":" not in line:
            errors.append(f"{path.relative_to(ROOT)}:{number}: malformed frontmatter entry")
            parent = None
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        parent = key
        if key in data:
            errors.append(f"{path.relative_to(ROOT)}:{number}: duplicate frontmatter key {key!r}")
        if strict_skill and value.strip().startswith(("[", "{", "|", ">")):
            errors.append(f"{path.relative_to(ROOT)}:{number}: complex YAML values are not supported in portable skill frontmatter")
        if strict_skill and key != "metadata" and is_unquoted_non_string(value):
            errors.append(f"{path.relative_to(ROOT)}:{number}: portable skill fields must be YAML strings")
        if strict_skill and key != "metadata" and invalid_quoted_scalar(value):
            errors.append(f"{path.relative_to(ROOT)}:{number}: invalid quoted YAML string")
        data[key] = {} if key == "metadata" and not value.strip() else unquote(value)
    return data, "\n".join(lines[end + 1 :]).lstrip("\n"), errors


def load_refactoring_config() -> tuple[dict[str, Any] | None, list[str]]:
    path = CONFIG_PATH
    try:
        config = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as error:
        return None, [f"config/technical-debt-workflow/refactoring.toml: {error}"]
    return config, []


def check_structure() -> list[str]:
    errors: list[str] = []
    required_paths = (
        "knowledge/coding/INDEX.md",
        "knowledge/coding/technical-debt/INDEX.md",
        "knowledge/coding/technical-debt/refactoring-policy.md",
        "knowledge/coding/technical-debt/inventory.md",
        "knowledge/coding/technical-debt/roadmap.md",
        "knowledge/coding/technical-debt/pilot-report.md",
        "knowledge/coding/technical-debt/pack-baseline.md",
        "config/technical-debt-workflow/refactoring.toml",
        "scripts/skills/coding/technical-debt-workflow/refactoring/baseline",
        "scripts/skills/coding/technical-debt-workflow/refactoring/verify",
        "scripts/skills/coding/technical-debt-workflow/refactoring/report",
        "scripts/skills/coding/technical-debt-workflow/refactoring/runner.py",
        "scripts/skills/coding/technical-debt-workflow/run_tests.py",
        "scripts/skills/coding/technical-debt-workflow/evaluate_skills.py",
        "scripts/skills/coding/technical-debt-workflow/evaluations/rubric.md",
        "scripts/skills/coding/technical-debt-workflow/evaluations/README.md",
        "agents/coding/technical-debt/refactoring-orchestrator.md",
        "commands/coding/technical-debt/assess-technical-debt.md",
        "commands/coding/technical-debt/execute-refactoring-slice.md",
        "workflows/coding/technical-debt-lifecycle.md",
        "skills/coding/technical-debt-workflow/references/adoption.md",
        "skills/coding/technical-debt-workflow/assets/client-entrypoints/AGENTS.md",
        "skills/coding/technical-debt-workflow/assets/client-entrypoints/CLAUDE.md",
        "skills/coding/technical-debt-workflow/assets/client-entrypoints/copilot-instructions.md",
        "skills/coding/technical-debt-workflow/assets/client-entrypoints/refactoring-policy.mdc",
        "skills/coding/technical-debt-workflow/assets/client-entrypoints/refactoring.yml",
    )
    for relative in required_paths:
        if not (ROOT / relative).is_file():
            errors.append(f"missing required file: {relative}")

    actual_skills = {path.parent.name for path in SKILLS_ROOT.glob("*/SKILL.md")}
    missing_skills = sorted(set(SKILLS) - actual_skills)
    if missing_skills:
        errors.append(f"missing technical-debt skills: {missing_skills}")

    for skill in SKILLS:
        skill_path = SKILLS_ROOT / skill / "SKILL.md"
        if not skill_path.is_file():
            continue
        text = skill_path.read_text(encoding="utf-8")
        for relative in RESOURCE_PATTERN.findall(text):
            if not (ROOT / relative).is_file():
                errors.append(f"{skill_path.relative_to(ROOT)}: missing referenced resource {relative}")

    case_dir = WORKFLOW_ROOT / "evaluations" / "cases"
    if case_dir.is_dir():
        case_names = tuple(sorted(path.stem for path in case_dir.glob("*.json")))
        if case_names != tuple(sorted(SKILLS)):
            errors.append(f"evaluation case set mismatch: expected {sorted(SKILLS)}, found {list(case_names)}")
    else:
        errors.append("missing evaluation cases directory")
    if not list((WORKFLOW_ROOT / "tests").glob("test_*.py")):
        errors.append("unit-test discovery would execute zero tests")

    config, config_errors = load_refactoring_config()
    errors.extend(config_errors)
    if config is not None:
        names = [check.get("name") for check in config.get("checks", []) if isinstance(check, dict)]
        if len(names) != len(set(names)):
            errors.append("config/technical-debt-workflow/refactoring.toml: check names must be unique")
    return errors


def check_format() -> list[str]:
    errors: list[str] = []
    for path in text_files():
        relative = path.relative_to(ROOT)
        raw = path.read_bytes()
        try:
            text = raw.decode("ascii")
        except UnicodeDecodeError as error:
            errors.append(f"{relative}: non-ASCII byte at offset {error.start}")
            continue
        if "\r" in text:
            errors.append(f"{relative}: CRLF or bare carriage return found")
        if not text.endswith("\n"):
            errors.append(f"{relative}: missing final newline")
        if text.endswith("\n\n"):
            errors.append(f"{relative}: more than one final newline")
        for number, line in enumerate(text.splitlines(), start=1):
            if line.endswith((" ", "\t")):
                errors.append(f"{relative}:{number}: trailing whitespace")
            if "\t" in line:
                errors.append(f"{relative}:{number}: tab character")
        if path.suffix == ".json":
            try:
                payload = json.loads(text)
            except json.JSONDecodeError as error:
                errors.append(f"{relative}: invalid JSON: {error}")
            else:
                canonical = json.dumps(payload, indent=2, sort_keys=True) + "\n"
                if text != canonical:
                    errors.append(f"{relative}: JSON is not canonical (sorted keys, two-space indent)")
    return errors


def validate_skill(path: Path) -> list[str]:
    errors: list[str] = []
    data, body, parse_errors = parse_frontmatter(path, strict_skill=True)
    errors.extend(parse_errors)
    relative = path.relative_to(ROOT)
    unknown = sorted(set(data) - ALLOWED_SKILL_FIELDS)
    if unknown:
        errors.append(f"{relative}: non-portable top-level fields: {', '.join(unknown)}")
    name = data.get("name")
    description = data.get("description")
    compatibility = data.get("compatibility")
    metadata = data.get("metadata")
    if name != path.parent.name:
        errors.append(f"{relative}: name must match parent directory")
    if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name) or len(name) > 64:
        errors.append(f"{relative}: invalid skill name")
    if not isinstance(description, str) or not 1 <= len(description) <= 1024:
        errors.append(f"{relative}: description must contain 1-1024 characters")
    elif "Use " not in description or "do not use" not in description.lower():
        errors.append(f"{relative}: description must state positive and negative activation guidance")
    if compatibility is not None and (not isinstance(compatibility, str) or len(compatibility) > 500):
        errors.append(f"{relative}: compatibility must be a string of at most 500 characters")
    license_value = data.get("license")
    if license_value is not None and (not isinstance(license_value, str) or not license_value):
        errors.append(f"{relative}: license must be a non-empty scalar string")
    allowed_tools = data.get("allowed-tools")
    if allowed_tools is not None and (not isinstance(allowed_tools, str) or not allowed_tools):
        errors.append(f"{relative}: allowed-tools must be a non-empty scalar string")
    if not isinstance(metadata, dict) or any(not isinstance(value, str) for value in metadata.values()):
        errors.append(f"{relative}: metadata must be a flat string-to-string map")
    elif metadata.get("akm-type") != "skill":
        errors.append(f"{relative}: metadata.akm-type must be skill")

    heading_positions: list[int] = []
    for heading in REQUIRED_SECTIONS:
        marker = f"## {heading}"
        position = body.find(marker)
        if position < 0:
            errors.append(f"{relative}: missing section {marker}")
        heading_positions.append(position)
    if all(position >= 0 for position in heading_positions) and heading_positions != sorted(heading_positions):
        errors.append(f"{relative}: required sections are out of order")
    if len(body.splitlines()) >= 500:
        errors.append(f"{relative}: body exceeds the 500-line progressive-disclosure guideline")
    return errors


def check_lint() -> list[str]:
    errors: list[str] = []
    for skill in SKILLS:
        path = SKILLS_ROOT / skill / "SKILL.md"
        if path.is_file():
            errors.extend(validate_skill(path))

    for path in sorted(WORKFLOW_ROOT.rglob("*.py")):
        if ".refactoring" in path.parts:
            continue
        try:
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path), feature_version=(3, 11))
        except (OSError, SyntaxError) as error:
            errors.append(f"{path.relative_to(ROOT)}: Python syntax error: {error}")

    for name in ("baseline", "verify", "report"):
        path = WORKFLOW_ROOT / "refactoring" / name
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        if not text.startswith("#!/usr/bin/env bash\n"):
            errors.append(f"{path.relative_to(ROOT)}: missing portable bash shebang")
        if "set -euo pipefail" not in text:
            errors.append(f"{path.relative_to(ROOT)}: missing strict shell options")

    policy = KNOWLEDGE_ROOT / "refactoring-policy.md"
    if policy.is_file():
        text = policy.read_text(encoding="utf-8")
        required_policy_phrases = (
            "Never disable, delete, or weaken a test",
            "Never suppress a warning",
            "Do not change public APIs without explicit approval",
            "Do not add dependencies unless they produce a clear net reduction",
            "Prefer deletion and simplification over another abstraction",
            "Do not create abstractions for hypothetical future reuse",
            "Do not delete apparently unused code without checking indirect",
            "Do not rewrite a subsystem when a bounded refactor can solve the problem",
            "Stop when expected behavior is ambiguous",
            "Treat existing failing checks as baseline problems",
            "Never modify secrets, production data, generated artifacts, lockfiles, or migrations",
        )
        for phrase in required_policy_phrases:
            if phrase not in text:
                errors.append(f"{policy.relative_to(ROOT)}: missing mandatory rule: {phrase}")
    return errors


def check_dependencies() -> list[str]:
    errors: list[str] = []
    stdlib = getattr(sys, "stdlib_module_names", set())
    for path in sorted(WORKFLOW_ROOT.rglob("*.py")):
        if ".refactoring" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        imports: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.add(node.module.split(".")[0])
        unsupported = sorted(
            name
            for name in imports
            if name not in stdlib
            and not (path.parent / f"{name}.py").is_file()
            and not (path.parent / name / "__init__.py").is_file()
            and not (WORKFLOW_ROOT / name / "__init__.py").is_file()
        )
        if unsupported:
            errors.append(f"{path.relative_to(ROOT)}: third-party imports: {', '.join(unsupported)}")

    config, config_errors = load_refactoring_config()
    errors.extend(config_errors)
    if config is not None:
        forbidden = re.compile(r"(?:pip|pipx|npm|pnpm|yarn|bun|gem|cargo|go)\s+(?:add|install|get)\b")
        for check in config.get("checks", []):
            command = check.get("command", "") if isinstance(check, dict) else ""
            if isinstance(command, str) and forbidden.search(command):
                errors.append(
                    f"config/technical-debt-workflow/refactoring.toml: check {check.get('name')} installs dependencies"
                )
    return errors


def is_destructive_shell_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return False
    try:
        tokens = shlex.split(stripped, comments=True, posix=True)
    except ValueError:
        return True
    for index, token in enumerate(tokens):
        executable = Path(token).name
        if executable == "rm":
            flags = "".join(item[1:] for item in tokens[index + 1 :] if item.startswith("-") and item != "--")
            if "r" in flags and "f" in flags:
                return True
        if executable != "git":
            continue
        command_index = index + 1
        while command_index < len(tokens) and tokens[command_index].startswith("-"):
            option = tokens[command_index]
            command_index += 2 if option in {"-C", "-c", "--git-dir", "--work-tree", "--namespace"} else 1
        command = tokens[command_index] if command_index < len(tokens) else None
        arguments = tokens[command_index + 1 :]
        if command == "reset" and "--hard" in arguments:
            return True
        if command == "clean":
            flags = "".join(item[1:] for item in arguments if item.startswith("-") and item != "--")
            if "f" in flags:
                return True
    return bool(re.search(r"\bcurl\b[^|]*\|\s*(?:ba)?sh\b", stripped))


def dotted_call_name(node: ast.AST) -> str | None:
    parts: list[str] = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return ".".join(reversed(parts))
    return None


def literal_command(node: ast.AST) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, (ast.List, ast.Tuple)):
        values: list[str] = []
        for element in node.elts:
            if not isinstance(element, ast.Constant) or not isinstance(element.value, str):
                return None
            values.append(shlex.quote(element.value))
        return " ".join(values)
    return None


def check_security() -> list[str]:
    errors: list[str] = []
    private_key = re.compile(r"BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY")
    assignment = re.compile(r"(?i)(?:api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^$<{][^'\"]{7,}['\"]")
    for path in text_files():
        text = path.read_text(encoding="ascii")
        relative = path.relative_to(ROOT)
        if private_key.search(text):
            errors.append(f"{relative}: private key material detected")
        if path.suffix in {".py", ".sh", ".toml", ".yaml", ".yml"} and assignment.search(text):
            errors.append(f"{relative}: possible hard-coded credential detected")

    for path in WORKFLOW_ROOT.rglob("*"):
        if path.is_file() and path.suffix in {"", ".sh"}:
            text = path.read_text(encoding="utf-8")
            if any(is_destructive_shell_line(line) for line in text.splitlines()):
                errors.append(f"{path.relative_to(ROOT)}: destructive command pattern detected")
    for path in sorted(WORKFLOW_ROOT.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name = dotted_call_name(node.func)
            if name in {"os.system", "os.popen", "shutil.rmtree"}:
                errors.append(f"{path.relative_to(ROOT)}: destructive Python call detected: {name}")
                continue
            if name in {"subprocess.run", "subprocess.Popen", "subprocess.call", "subprocess.check_call"} and node.args:
                command = literal_command(node.args[0])
                if command and is_destructive_shell_line(command):
                    errors.append(f"{path.relative_to(ROOT)}: destructive subprocess command detected")

    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8") if (ROOT / ".gitignore").is_file() else ""
    if ".refactoring/" not in gitignore:
        errors.append(".gitignore: .refactoring/ evidence directory must be ignored")
    for workflow in (CLIENT_ENTRYPOINT_ROOT / "refactoring.yml",):
        if not workflow.is_file():
            continue
        lines = [line.split("#", 1)[0].rstrip() for line in workflow.read_text(encoding="utf-8").splitlines()]
        for line in lines:
            inline = re.fullmatch(r"\s*permissions:\s*(\S.*)\s*", line)
            if inline and inline.group(1) != "read-all":
                errors.append(f"{workflow.relative_to(ROOT)}: inline permissions must be read-all or an explicit read-only block")
        permission_values: list[str] = []
        for index, line in enumerate(lines):
            match = re.fullmatch(r"(\s*)permissions:\s*", line)
            if not match:
                continue
            indentation = len(match.group(1))
            for child in lines[index + 1 :]:
                if not child.strip():
                    continue
                child_indent = len(child) - len(child.lstrip())
                if child_indent <= indentation:
                    break
                value_match = re.fullmatch(r"\s*[a-z-]+:\s*([a-z-]+)\s*", child)
                if value_match:
                    permission_values.append(value_match.group(1))
                else:
                    errors.append(f"{workflow.relative_to(ROOT)}: unrecognized permission syntax")
        if "read" not in permission_values or any(value not in {"read", "none"} for value in permission_values):
            errors.append(f"{workflow.relative_to(ROOT)}: permissions must be explicitly read-only")
    return errors


def check_compatibility() -> list[str]:
    errors: list[str] = []
    policy_path = "knowledge/coding/technical-debt/refactoring-policy.md"
    wrappers = (
        "skills/coding/technical-debt-workflow/assets/client-entrypoints/AGENTS.md",
        "skills/coding/technical-debt-workflow/assets/client-entrypoints/CLAUDE.md",
        "skills/coding/technical-debt-workflow/assets/client-entrypoints/copilot-instructions.md",
        "skills/coding/technical-debt-workflow/assets/client-entrypoints/refactoring-policy.mdc",
    )
    for relative in wrappers:
        path = ROOT / relative
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        if policy_path not in text:
            errors.append(f"{relative}: does not reference the canonical policy")
        if len(text.splitlines()) > 30:
            errors.append(f"{relative}: tool entry point is not thin")

    for relative, expected_type in (
        ("agents/coding/technical-debt/refactoring-orchestrator.md", "agent"),
        ("commands/coding/technical-debt/assess-technical-debt.md", "command"),
        ("commands/coding/technical-debt/execute-refactoring-slice.md", "command"),
        ("workflows/coding/technical-debt-lifecycle.md", "workflow"),
    ):
        path = ROOT / relative
        if not path.is_file():
            continue
        data, _, parse_errors = parse_frontmatter(path)
        errors.extend(parse_errors)
        # AKM 0.9 workflows derive their name from the file path and reject a name key.
        required_fields = ("type", "description", "when_to_use", "updated")
        if expected_type != "workflow":
            required_fields = ("name", *required_fields)
        for field in required_fields:
            if not data.get(field):
                errors.append(f"{relative}: missing AKM field {field}")
        if expected_type == "workflow" and data.get("name"):
            errors.append(f"{relative}: workflow frontmatter must not declare name")
        if data.get("type") != expected_type:
            errors.append(f"{relative}: expected type {expected_type}")

    for skill in SKILLS:
        path = SKILLS_ROOT / skill / "SKILL.md"
        if not path.is_file():
            continue
        for reference in RUNNER_REFERENCE_PATTERN.findall(path.read_text(encoding="utf-8")):
            if "--root <repository-root>" not in reference:
                errors.append(
                    f"{path.relative_to(ROOT)}: runner references require explicit --root <repository-root>"
                )

    runner = WORKFLOW_ROOT / "refactoring" / "runner.py"
    if runner.is_file():
        completed = subprocess.run(
            [sys.executable, str(runner), "--help"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
        )
        if completed.returncode != 0 or not all(word in completed.stdout for word in ("baseline", "verify", "report")):
            errors.append(
                "scripts/skills/coding/technical-debt-workflow/refactoring/runner.py: public CLI help is incomplete"
            )
        verify_help = subprocess.run(
            [sys.executable, str(runner), "verify", "--help"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
        )
        if verify_help.returncode != 0 or "--current-only" not in verify_help.stdout:
            errors.append(
                "scripts/skills/coding/technical-debt-workflow/refactoring/runner.py: current-only CI mode is missing from public help"
            )
    workflow = CLIENT_ENTRYPOINT_ROOT / "refactoring.yml"
    expected_ci = "scripts/skills/coding/technical-debt-workflow/refactoring/verify --current-only"
    if workflow.is_file() and expected_ci not in workflow.read_text(encoding="utf-8"):
        errors.append(
            "skills/coding/technical-debt-workflow/assets/client-entrypoints/refactoring.yml: CI must use explicit current-only verification"
        )
    return errors


CHECKS: dict[str, Callable[[], list[str]]] = {
    "structure": check_structure,
    "format": check_format,
    "lint": check_lint,
    "dependencies": check_dependencies,
    "security": check_security,
    "compatibility": check_compatibility,
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("check", choices=(*CHECKS, "all"))
    args = parser.parse_args(argv)

    selected = CHECKS.items() if args.check == "all" else ((args.check, CHECKS[args.check]),)
    failures: list[str] = []
    for name, check in selected:
        errors = check()
        if errors:
            failures.extend(f"[{name}] {error}" for error in errors)
        else:
            print(f"{name}: passed")

    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
