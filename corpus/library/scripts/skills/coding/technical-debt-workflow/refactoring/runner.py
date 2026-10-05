#!/usr/bin/env python3
"""Run configured refactoring checks and produce truthful evidence artifacts."""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import threading
import time
import tomllib
from collections import Counter
from datetime import datetime, timezone
from typing import Any


STASH_ROOT = Path(__file__).resolve().parents[5]
WORKFLOW_ROOT = Path(__file__).resolve().parents[1]
STASH_CONFIG = Path("config/technical-debt-workflow/refactoring.toml")
if str(WORKFLOW_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKFLOW_ROOT))

from refactoring.process_guard import ContainmentUnavailable, ProcessGuard


SCHEMA_VERSION = 1
TREE_HASH_FORMAT = "framed-v2"
MAX_CAPTURE_BYTES = 65_536
VALID_STATUSES = {"passed", "failed", "timed_out", "unavailable", "skipped"}
ALLOWED_MUTATION_EXCLUDES = {
    "__pycache__",
    "__pycache__/**",
    "**/__pycache__",
    "**/__pycache__/**",
    "*.pyc",
    "**/*.pyc",
}


class ConfigurationError(ValueError):
    """Raised when the refactoring configuration cannot be executed safely."""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def default_root() -> Path:
    return STASH_ROOT


def resolve_root(value: str | None) -> Path:
    root = Path(value).expanduser().resolve() if value else default_root()
    if not root.is_dir():
        raise ConfigurationError(f"repository root does not exist: {root}")
    return root


def contained_path(parent: Path, candidate: Path, label: str) -> Path:
    resolved = candidate.expanduser().resolve()
    try:
        resolved.relative_to(parent)
    except ValueError as error:
        raise ConfigurationError(f"{label} must remain inside {parent}") from error
    return resolved


def resolve_config_path(root: Path, value: str | None) -> Path:
    candidate = Path(value) if value else STASH_CONFIG
    if not candidate.is_absolute():
        candidate = root / candidate
    return contained_path(root, candidate, "configuration path")


def resolve_artifact_path(artifact_dir: Path, value: str | None, fallback_name: str) -> Path:
    candidate = Path(value) if value else Path(fallback_name)
    if not candidate.is_absolute():
        candidate = artifact_dir / candidate
    return contained_path(artifact_dir, candidate, "evidence path")


def load_config(path: Path) -> tuple[dict[str, Any], str]:
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise ConfigurationError(f"cannot read configuration {path}: {error}") from error

    try:
        config = tomllib.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise ConfigurationError(f"invalid configuration {path}: {error}") from error

    if config.get("schema_version") != SCHEMA_VERSION:
        raise ConfigurationError(f"{path}: schema_version must be {SCHEMA_VERSION}")
    if not isinstance(config.get("artifact_dir"), str) or not config["artifact_dir"].strip():
        raise ConfigurationError(f"{path}: artifact_dir must be a non-empty string")
    if Path(config["artifact_dir"]) != Path(".refactoring"):
        raise ConfigurationError(f"{path}: artifact_dir must be the dedicated .refactoring directory")
    timeout = config.get("timeout_seconds")
    if not isinstance(timeout, int) or isinstance(timeout, bool) or timeout <= 0:
        raise ConfigurationError(f"{path}: timeout_seconds must be a positive integer")
    mutation_exclude = config.get("mutation_exclude", [])
    if not isinstance(mutation_exclude, list) or any(
        not isinstance(pattern, str) or not pattern.strip() for pattern in mutation_exclude
    ):
        raise ConfigurationError(f"{path}: mutation_exclude must be a string array")
    unsupported_excludes = sorted(set(mutation_exclude) - ALLOWED_MUTATION_EXCLUDES)
    if unsupported_excludes:
        raise ConfigurationError(
            f"{path}: mutation_exclude may contain only fixed Python-cache patterns; rejected {unsupported_excludes}"
        )

    checks = config.get("checks")
    if not isinstance(checks, list) or not checks:
        raise ConfigurationError(f"{path}: at least one [[checks]] entry is required")

    names: set[str] = set()
    for index, check in enumerate(checks, start=1):
        if not isinstance(check, dict):
            raise ConfigurationError(f"{path}: check {index} must be a table")
        name = check.get("name")
        category = check.get("category")
        enabled = check.get("enabled")
        required = check.get("required")
        if not isinstance(name, str) or not name.strip():
            raise ConfigurationError(f"{path}: check {index} needs a non-empty name")
        if name in names:
            raise ConfigurationError(f"{path}: duplicate check name {name!r}")
        names.add(name)
        if not isinstance(category, str) or not category.strip():
            raise ConfigurationError(f"{path}: check {name!r} needs a category")
        if not isinstance(enabled, bool) or not isinstance(required, bool):
            raise ConfigurationError(f"{path}: check {name!r} needs boolean enabled and required")
        command = check.get("command")
        reason = check.get("reason")
        artifacts = check.get("artifacts", [])
        unknown = sorted(set(check) - {"name", "category", "command", "required", "enabled", "reason", "artifacts"})
        if unknown:
            raise ConfigurationError(f"{path}: check {name!r} has unknown fields: {', '.join(unknown)}")
        if enabled and (not isinstance(command, str) or not command.strip()):
            raise ConfigurationError(f"{path}: enabled check {name!r} needs a command")
        if not enabled and (not isinstance(reason, str) or not reason.strip()):
            raise ConfigurationError(f"{path}: disabled check {name!r} needs a reason")
        if not isinstance(artifacts, list) or any(not isinstance(item, str) or not item.strip() for item in artifacts):
            raise ConfigurationError(f"{path}: check {name!r} artifacts must be a string array")

    return config, hashlib.sha256(raw).hexdigest()


def drain_stream(stream: Any, capture: dict[str, Any]) -> None:
    retained = bytearray()
    total = 0
    while chunk := stream.read(8_192):
        total += len(chunk)
        remaining = MAX_CAPTURE_BYTES - len(retained)
        if remaining > 0:
            retained.extend(chunk[:remaining])
    capture["data"] = bytes(retained)
    capture["total"] = total


def captured_output(capture: dict[str, Any]) -> tuple[str, bool]:
    data = capture.get("data", b"")
    total = capture.get("total", 0)
    text = data.decode("utf-8", errors="replace")
    if total <= MAX_CAPTURE_BYTES:
        return text, False
    return f"{text}\n[truncated {total - MAX_CAPTURE_BYTES} bytes]", True


def run_contained_process(
    command: str | list[str],
    cwd: Path,
    environment: dict[str, str],
    timeout: int,
    *,
    shell: bool = False,
) -> dict[str, Any]:
    cleanup_succeeded = True
    try:
        guard = ProcessGuard()
        process = subprocess.Popen(
            command,
            cwd=cwd,
            env=environment,
            shell=shell,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
    except (ContainmentUnavailable, OSError) as error:
        return {
            "exit_code": None,
            "reason": str(error),
            "stdout": "",
            "stderr": str(error),
            "output_truncated": False,
            "cleanup_succeeded": True,
            "descendants_detected": False,
        }

    stdout_capture: dict[str, Any] = {}
    stderr_capture: dict[str, Any] = {}
    stdout_thread = threading.Thread(target=drain_stream, args=(process.stdout, stdout_capture), daemon=True)
    stderr_thread = threading.Thread(target=drain_stream, args=(process.stderr, stderr_capture), daemon=True)
    stdout_thread.start()
    stderr_thread.start()
    try:
        exit_code = process.wait(timeout=timeout)
        reason = None
    except subprocess.TimeoutExpired:
        exit_code = None
        reason = f"exceeded {timeout} seconds"

    descendants_detected = bool(guard.new_descendants())
    cleanup_succeeded = guard.terminate()
    if process.poll() is None:
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    stdout_thread.join(timeout=2)
    stderr_thread.join(timeout=2)
    if stdout_thread.is_alive() or stderr_thread.is_alive():
        cleanup_succeeded = False
    stdout, stdout_truncated = captured_output(stdout_capture)
    stderr, stderr_truncated = captured_output(stderr_capture)
    return {
        "exit_code": exit_code,
        "reason": reason,
        "stdout": stdout,
        "stderr": stderr,
        "output_truncated": stdout_truncated or stderr_truncated,
        "cleanup_succeeded": cleanup_succeeded,
        "descendants_detected": descendants_detected,
    }


def safe_git_environment(home: Path) -> dict[str, str]:
    environment = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    environment.update(
        {
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_ATTR_NOSYSTEM": "1",
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_PAGER": "cat",
            "GIT_TERMINAL_PROMPT": "0",
            "HOME": str(home),
        }
    )
    return environment


def git_filter_configuration(root: Path) -> tuple[list[str], str | None]:
    code, output, error = git_command(
        root,
        ["config", "--name-only", "--get-regexp", r"^filter\..*\.(clean|process)$"],
    )
    if code == 1 and not output:
        return [], None
    if code != 0:
        return [], error or "could not inspect repository-local Git filters"
    keys = sorted({line for line in output.splitlines() if line})
    return keys, None


def git_command(
    root: Path,
    arguments: list[str],
) -> tuple[int, str, str]:
    result = run_contained_process(
        [
            "git",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.untrackedCache=false",
            "-c",
            "core.attributesFile=/dev/null",
            "-C",
            str(root),
            *arguments,
        ],
        root,
        safe_git_environment(root),
        15,
    )
    if not result["cleanup_succeeded"]:
        return 127, result["stdout"].strip(), "could not terminate all Git descendant processes"
    if result["descendants_detected"] and result["exit_code"] is not None:
        return 127, result["stdout"].strip(), "Git command exited before its descendants completed"
    if result["reason"]:
        exit_code = 124 if result["reason"].startswith("exceeded ") else 127
        return exit_code, result["stdout"].strip(), result["reason"]
    if result["output_truncated"]:
        return 125, result["stdout"].strip(), "Git command output exceeded the capture limit"
    return int(result["exit_code"]), result["stdout"].strip(), result["stderr"].strip()


def git_snapshot(root: Path) -> dict[str, Any]:
    code, top_level, error = git_command(root, ["rev-parse", "--show-toplevel"])
    if code != 0:
        return {"available": False, "reason": error or "not a Git worktree"}

    branch_code, branch, _ = git_command(root, ["symbolic-ref", "--short", "-q", "HEAD"])
    commit_code, commit, commit_error = git_command(root, ["rev-parse", "HEAD"])
    filter_keys, filter_error = git_filter_configuration(root)
    if filter_error:
        status_code = 126
        status = ""
        status_error = filter_error
        diff_code = 126
        diff = ""
        diff_error = filter_error
    elif filter_keys:
        reason = "not run because repository clean/process filters may execute external commands"
        status_code = 126
        status = ""
        status_error = reason
        diff_code = 126
        diff = ""
        diff_error = reason
    else:
        status_code, status, status_error = git_command(
            root,
            ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=all"],
        )
        diff_code, diff, diff_error = git_command(
            root,
            [
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--ignore-submodules=all",
                "--binary",
                "HEAD",
                "--",
            ],
        )
    untracked_code, untracked, untracked_error = git_command(
        root,
        ["ls-files", "--others", "--exclude-standard", "-z"],
    )
    untracked_hasher = hashlib.sha256()
    if untracked_code == 0:
        try:
            for relative in sorted(path for path in untracked.split("\0") if path):
                path = contained_path(root, root / relative, "untracked Git path")
                hash_tree_entry(untracked_hasher, path, relative)
        except (ConfigurationError, OSError) as error:
            untracked_code = 126
            untracked_error = str(error)
    control_snapshot = git_control_snapshot(root)
    return {
        "available": True,
        "top_level": top_level,
        "branch": branch if branch_code == 0 else "DETACHED",
        "commit": commit if commit_code == 0 else None,
        "commit_error": commit_error or None,
        "status": status.splitlines() if status_code == 0 else None,
        "status_error": status_error or None,
        "status_exit_code": status_code,
        "filter_configuration_keys": filter_keys,
        "tracked_diff_error": diff_error or None,
        "tracked_diff_exit_code": diff_code,
        "tracked_diff_sha256": hashlib.sha256(diff.encode("utf-8", errors="surrogateescape")).hexdigest()
        if diff_code == 0
        else None,
        "untracked_error": untracked_error or None,
        "untracked_exit_code": untracked_code,
        "untracked_sha256": untracked_hasher.hexdigest() if untracked_code == 0 else None,
        "control_snapshot": control_snapshot,
    }


def configured_artifact_path(check: dict[str, Any], configured: str, root: Path, artifact_dir: Path) -> Path:
    candidate = Path(configured)
    if not candidate.is_absolute():
        candidate = root / candidate
    path = contained_path(artifact_dir, candidate, f"artifact for check {check['name']!r}")
    if path.parent == artifact_dir and path.name in {"baseline.json", "verify.json", "report.md"}:
        raise ConfigurationError(f"check {check['name']!r} cannot own reserved evidence artifact {path.name}")
    return path


def configured_artifact_owners(
    config: dict[str, Any],
    root: Path,
    artifact_dir: Path,
) -> dict[Path, str]:
    owners: dict[Path, str] = {}
    for check in config["checks"]:
        for configured in check.get("artifacts", []):
            path = configured_artifact_path(check, configured, root, artifact_dir)
            previous = owners.get(path)
            if previous is not None:
                raise ConfigurationError(
                    f"checks {previous!r} and {check['name']!r} cannot own the same evidence artifact {path}"
                )
            owners[path] = check["name"]
    return owners


def prepare_evidence_artifacts(check: dict[str, Any], root: Path, artifact_dir: Path) -> None:
    for configured in check.get("artifacts", []):
        path = configured_artifact_path(check, configured, root, artifact_dir)
        if path.is_dir():
            raise ConfigurationError(f"configured check artifact must be a file: {path}")
        path.unlink(missing_ok=True)


def evidence_artifacts(check: dict[str, Any], root: Path, artifact_dir: Path) -> tuple[list[dict[str, Any]], list[str]]:
    evidence: list[dict[str, Any]] = []
    missing: list[str] = []
    for configured in check.get("artifacts", []):
        path = configured_artifact_path(check, configured, root, artifact_dir)
        if not path.is_file():
            evidence.append({"configured": configured, "exists": False, "path": str(path)})
            missing.append(str(path))
            continue
        raw = path.read_bytes()
        evidence.append(
            {
                "exists": True,
                "configured": configured,
                "path": str(path),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "size_bytes": len(raw),
            }
        )
    return evidence, missing


def run_check(
    check: dict[str, Any],
    root: Path,
    artifact_dir: Path,
    timeout: int,
    phase: str,
) -> dict[str, Any]:
    base = {
        "name": check["name"],
        "category": check["category"],
        "required": check["required"],
        "enabled": check["enabled"],
    }
    if not check["enabled"]:
        return {
            **base,
            "command": None,
            "status": "skipped",
            "reason": check["reason"],
            "exit_code": None,
            "duration_seconds": 0.0,
            "stdout": "",
            "stderr": "",
            "output_truncated": False,
            "evidence_artifacts": [],
        }

    command = check["command"]
    prepare_evidence_artifacts(check, root, artifact_dir)
    started = time.monotonic()
    environment = os.environ.copy()
    environment.update({"REFACTORING_PHASE": phase, "REFACTORING_ROOT": str(root)})
    result = run_contained_process(command, root, environment, timeout, shell=True)
    exit_code = result["exit_code"]
    reason = result["reason"]
    stdout = result["stdout"]
    stderr = result["stderr"]

    if reason and exit_code is None:
        status = "timed_out" if reason.startswith("exceeded ") else "unavailable"
    elif exit_code == 0:
        status = "passed"
    else:
        status = "failed"
    if not result["cleanup_succeeded"]:
        status = "failed"
        reason = "could not terminate all check descendant processes"
    elif result["descendants_detected"] and exit_code is not None:
        status = "failed"
        reason = "check exited before its descendant processes completed"

    artifacts, missing_artifacts = evidence_artifacts(check, root, artifact_dir)
    if status == "passed" and missing_artifacts:
        status = "failed"
        reason = "configured evidence artifact missing: " + ", ".join(missing_artifacts)

    return {
        **base,
        "command": command,
        "status": status,
        "reason": reason,
        "exit_code": exit_code,
        "duration_seconds": round(time.monotonic() - started, 3),
        "stdout": stdout,
        "stderr": stderr,
        "output_truncated": result["output_truncated"],
        "evidence_artifacts": artifacts,
    }


def framed_update(digest: Any, *fields: bytes) -> None:
    for field in fields:
        digest.update(len(field).to_bytes(8, "big"))
        digest.update(field)


def hash_tree_entry(digest: Any, path: Path, relative: str) -> None:
    metadata = path.lstat()
    mode = stat.S_IMODE(metadata.st_mode).to_bytes(2, "big")
    if stat.S_ISLNK(metadata.st_mode):
        kind = b"symlink"
        payload = os.readlink(path).encode("utf-8", errors="surrogateescape")
    elif stat.S_ISDIR(metadata.st_mode):
        kind = b"directory"
        payload = b""
    elif stat.S_ISREG(metadata.st_mode):
        kind = b"file"
        content_digest = hashlib.sha256()
        size = 0
        with path.open("rb") as handle:
            while chunk := handle.read(65_536):
                size += len(chunk)
                content_digest.update(chunk)
        payload = size.to_bytes(8, "big") + content_digest.digest()
    elif stat.S_ISFIFO(metadata.st_mode):
        kind = b"fifo"
        payload = b""
    elif stat.S_ISSOCK(metadata.st_mode):
        kind = b"socket"
        payload = b""
    elif stat.S_ISCHR(metadata.st_mode):
        kind = b"character-device"
        payload = metadata.st_rdev.to_bytes(8, "big")
    elif stat.S_ISBLK(metadata.st_mode):
        kind = b"block-device"
        payload = metadata.st_rdev.to_bytes(8, "big")
    else:
        kind = b"unknown"
        payload = stat.S_IFMT(metadata.st_mode).to_bytes(8, "big")
    framed_update(
        digest,
        relative.encode("utf-8", errors="surrogateescape"),
        kind,
        mode,
        payload,
    )


def filesystem_tree_snapshot(
    root: Path,
    excluded: Path | None,
    exclude_patterns: list[str],
) -> dict[str, Any]:
    digest = hashlib.sha256()
    count = 0
    excluded_relative = excluded.relative_to(root) if excluded else None
    try:
        paths: list[Path] = [root]
        traversal_errors: list[OSError] = []
        for current, directories, files in os.walk(
            root,
            topdown=True,
            followlinks=False,
            onerror=traversal_errors.append,
        ):
            current_path = Path(current)
            kept_directories: list[str] = []
            for directory in sorted(directories):
                path = current_path / directory
                relative_path = path.relative_to(root)
                relative = relative_path.as_posix()
                if excluded_relative and (
                    relative_path == excluded_relative or excluded_relative in relative_path.parents
                ):
                    continue
                if any(fnmatch.fnmatch(relative, pattern) for pattern in exclude_patterns):
                    continue
                paths.append(path)
                if path.is_symlink():
                    continue
                else:
                    kept_directories.append(directory)
            directories[:] = kept_directories
            paths.extend(current_path / name for name in sorted(files))
        if traversal_errors:
            return {"status": "unavailable", "reason": "; ".join(str(error) for error in traversal_errors)}
        for path in paths:
            relative_path = path.relative_to(root)
            relative = relative_path.as_posix() if relative_path.parts else "."
            if excluded_relative and (
                relative_path == excluded_relative or excluded_relative in relative_path.parents
            ):
                continue
            if any(fnmatch.fnmatch(relative, pattern) for pattern in exclude_patterns):
                continue
            hash_tree_entry(digest, path, relative)
            count += 1
    except OSError as error:
        return {"status": "unavailable", "reason": str(error)}
    return {
        "status": "captured",
        "hash_format": TREE_HASH_FORMAT,
        "sha256": digest.hexdigest(),
        "file_count": count,
    }


def repository_tree_snapshot(root: Path, artifact_dir: Path, exclude_patterns: list[str]) -> dict[str, Any]:
    return filesystem_tree_snapshot(root, artifact_dir, exclude_patterns)


def git_control_snapshot(root: Path) -> dict[str, Any]:
    git_dir_code, git_dir_value, git_dir_error = git_command(root, ["rev-parse", "--absolute-git-dir"])
    common_code, common_value, common_error = git_command(root, ["rev-parse", "--git-common-dir"])
    if git_dir_code != 0 or common_code != 0:
        return {
            "status": "unavailable",
            "reason": git_dir_error or common_error or "Git control directory is unavailable",
        }

    paths: list[Path] = []
    for value in (git_dir_value, common_value):
        candidate = Path(value)
        path = (candidate if candidate.is_absolute() else root / candidate).resolve()
        if path not in paths:
            paths.append(path)
    snapshots: list[dict[str, Any]] = []
    aggregate = hashlib.sha256()
    file_count = 0
    for path in paths:
        if not path.is_dir():
            return {"status": "unavailable", "reason": f"Git control directory is not readable: {path}"}
        snapshot = filesystem_tree_snapshot(path, None, [])
        if snapshot.get("status") != "captured":
            return snapshot
        snapshots.append({"path": str(path), **snapshot})
        framed_update(
            aggregate,
            str(path).encode("utf-8", errors="surrogateescape"),
            snapshot["sha256"].encode("ascii"),
            snapshot["file_count"].to_bytes(8, "big"),
        )
        file_count += snapshot["file_count"]
    return {
        "status": "captured",
        "hash_format": TREE_HASH_FORMAT,
        "sha256": aggregate.hexdigest(),
        "file_count": file_count,
        "directories": snapshots,
    }


def worktree_check(
    git_before: dict[str, Any],
    git_after: dict[str, Any],
    tree_before: dict[str, Any],
    tree_after: dict[str, Any],
) -> dict[str, Any]:
    if tree_before.get("status") != "captured" or tree_after.get("status") != "captured":
        return {
            "status": "unavailable",
            "reason": "repository tree state is unavailable; read-only behavior cannot be independently proven",
        }
    if any(
        snapshot.get("hash_format") != TREE_HASH_FORMAT
        or not isinstance(snapshot.get("file_count"), int)
        for snapshot in (tree_before, tree_after)
    ):
        return {
            "status": "unavailable",
            "reason": "repository tree evidence uses an unsupported hash format",
        }
    if any(
        tree_before.get(field) != tree_after.get(field)
        for field in ("hash_format", "sha256", "file_count")
    ):
        return {
            "status": "failed",
            "reason": "verification commands changed repository files outside the evidence directory",
            "before": tree_before,
            "after": tree_after,
        }
    if not git_before.get("available") or not git_after.get("available"):
        return {
            "status": "passed",
            "reason": "repository tree hash is unchanged; Git metadata was unavailable",
            "git_status": "unavailable",
        }
    controls = (git_before.get("control_snapshot", {}), git_after.get("control_snapshot", {}))
    if any(
        control.get("status") != "captured"
        or control.get("hash_format") != TREE_HASH_FORMAT
        or not isinstance(control.get("file_count"), int)
        for control in controls
    ):
        return {
            "status": "unavailable",
            "reason": "Git control-directory state is unavailable",
        }
    before_state = {
        "branch": git_before.get("branch"),
        "commit": git_before.get("commit"),
        "status": git_before.get("status"),
        "status_error": git_before.get("status_error"),
        "status_exit_code": git_before.get("status_exit_code"),
        "filter_configuration_keys": git_before.get("filter_configuration_keys"),
        "tracked_diff_error": git_before.get("tracked_diff_error"),
        "tracked_diff_exit_code": git_before.get("tracked_diff_exit_code"),
        "tracked_diff_sha256": git_before.get("tracked_diff_sha256"),
        "untracked_error": git_before.get("untracked_error"),
        "untracked_exit_code": git_before.get("untracked_exit_code"),
        "untracked_sha256": git_before.get("untracked_sha256"),
        "control_snapshot": git_before.get("control_snapshot"),
    }
    after_state = {
        "branch": git_after.get("branch"),
        "commit": git_after.get("commit"),
        "status": git_after.get("status"),
        "status_error": git_after.get("status_error"),
        "status_exit_code": git_after.get("status_exit_code"),
        "filter_configuration_keys": git_after.get("filter_configuration_keys"),
        "tracked_diff_error": git_after.get("tracked_diff_error"),
        "tracked_diff_exit_code": git_after.get("tracked_diff_exit_code"),
        "tracked_diff_sha256": git_after.get("tracked_diff_sha256"),
        "untracked_error": git_after.get("untracked_error"),
        "untracked_exit_code": git_after.get("untracked_exit_code"),
        "untracked_sha256": git_after.get("untracked_sha256"),
        "control_snapshot": git_after.get("control_snapshot"),
    }
    if before_state != after_state:
        return {
            "status": "failed",
            "reason": "verification commands changed branch, commit, or visible worktree state",
            "before": before_state,
            "after": after_state,
        }
    diagnostics_complete = all(
        snapshot.get(field) == 0
        for snapshot in (git_before, git_after)
        for field in ("status_exit_code", "tracked_diff_exit_code", "untracked_exit_code")
    )
    return {
        "status": "passed",
        "reason": None
        if diagnostics_complete
        else "repository tree and Git control state are unchanged; unsafe or unavailable Git diagnostics were not used",
    }


def summarize(checks: list[dict[str, Any]], worktree: dict[str, Any]) -> dict[str, Any]:
    counts = Counter(check["status"] for check in checks)
    required_failures = [
        check["name"] for check in checks if check["required"] and check["status"] != "passed"
    ]
    if worktree.get("status") != "passed":
        required_failures.append("worktree-unchanged-by-checks")
    return {
        "counts": dict(sorted(counts.items())),
        "required_total": sum(bool(check["required"]) for check in checks),
        "required_failures": required_failures,
        "required_success": not required_failures,
        "worktree_check": worktree,
    }


def ensure_artifact_dir(root: Path, configured: str) -> Path:
    artifact_dir = root / configured
    if artifact_dir.is_symlink():
        raise ConfigurationError("artifact_dir must be a real directory, not a symlink")
    if artifact_dir.exists() and not artifact_dir.is_dir():
        raise ConfigurationError("artifact_dir must be a directory")
    artifact_dir.mkdir(exist_ok=True, mode=0o700)
    if artifact_dir.resolve() != root / ".refactoring":
        raise ConfigurationError("artifact_dir must resolve to the dedicated repository .refactoring directory")
    try:
        artifact_dir.chmod(0o700)
    except OSError:
        pass
    return artifact_dir


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def write_json(path: Path, payload: dict[str, Any]) -> None:
    atomic_write(path, json.dumps(payload, indent=2, sort_keys=True) + "\n")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError(f"cannot read evidence artifact {path}: {error}") from error
    if not isinstance(payload, dict) or payload.get("schema_version") != SCHEMA_VERSION:
        raise ConfigurationError(f"unsupported evidence schema in {path}")
    return payload


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def expected_check_map(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {check["name"]: check for check in config["checks"]}


def validate_evidence_artifact(
    payload: dict[str, Any],
    expected_kind: str,
    root: Path,
    config: dict[str, Any],
    config_hash: str,
) -> None:
    artifact_dir = (root / config["artifact_dir"]).resolve()
    if payload.get("kind") != expected_kind:
        raise ConfigurationError(f"expected {expected_kind} evidence, got {payload.get('kind')!r}")
    if payload.get("root") != str(root):
        raise ConfigurationError("evidence repository root does not match the current root")
    if payload.get("config_sha256") != config_hash:
        raise ConfigurationError("evidence command configuration does not match the active configuration")
    checks = payload.get("checks")
    if not isinstance(checks, list):
        raise ConfigurationError("evidence checks must be an array")
    expected = expected_check_map(config)
    names = [check.get("name") for check in checks if isinstance(check, dict)]
    if names != list(expected):
        raise ConfigurationError("evidence check set or order does not match the active configuration")
    for check in checks:
        if not isinstance(check, dict):
            raise ConfigurationError("every evidence check must be an object")
        configured = expected[check["name"]]
        for field in ("category", "required", "enabled"):
            if check.get(field) != configured.get(field):
                raise ConfigurationError(f"evidence contract mismatch for {check['name']}.{field}")
        expected_command = configured.get("command") if configured["enabled"] else None
        if check.get("command") != expected_command:
            raise ConfigurationError(f"evidence command mismatch for {check['name']}")
        status = check.get("status")
        if status not in VALID_STATUSES:
            raise ConfigurationError(f"invalid evidence status for {check['name']}: {status!r}")
        if status == "passed" and check.get("exit_code") != 0:
            raise ConfigurationError(f"passing check {check['name']} must have exit code 0")
        if status == "skipped" and configured["enabled"]:
            raise ConfigurationError(f"enabled check {check['name']} cannot be marked skipped")
        artifact_records = check.get("evidence_artifacts")
        if not isinstance(artifact_records, list) or len(artifact_records) != len(configured.get("artifacts", [])):
            raise ConfigurationError(f"evidence artifact contract mismatch for {check['name']}")
        for configured_path, record in zip(configured.get("artifacts", []), artifact_records, strict=True):
            if not isinstance(record, dict) or record.get("configured") != configured_path:
                raise ConfigurationError(f"evidence artifact configuration mismatch for {check['name']}")
            expected_path = configured_artifact_path(configured, configured_path, root, artifact_dir)
            if record.get("path") != str(expected_path) or not isinstance(record.get("exists"), bool):
                raise ConfigurationError(f"evidence artifact path mismatch for {check['name']}")
            if record["exists"]:
                if not isinstance(record.get("sha256"), str) or not isinstance(record.get("size_bytes"), int):
                    raise ConfigurationError(f"evidence artifact digest is invalid for {check['name']}")
            if status == "passed" and not record["exists"]:
                raise ConfigurationError(f"passing check {check['name']} is missing configured evidence")

    summary = payload.get("summary")
    if not isinstance(summary, dict):
        raise ConfigurationError("evidence summary must be an object")
    recorded_worktree = summary.get("worktree_check")
    if not isinstance(recorded_worktree, dict) or recorded_worktree.get("status") not in {
        "passed",
        "failed",
        "unavailable",
    }:
        raise ConfigurationError("evidence summary has no valid worktree check")
    recalculated_worktree = worktree_check(
        payload.get("git_before", {}),
        payload.get("git_after", {}),
        payload.get("tree_before", {}),
        payload.get("tree_after", {}),
    )
    if recorded_worktree != recalculated_worktree:
        raise ConfigurationError("evidence worktree check is inconsistent with repository snapshots")
    recalculated = summarize(checks, recorded_worktree)
    for field in ("counts", "required_total", "required_failures", "required_success"):
        if summary.get(field) != recalculated[field]:
            raise ConfigurationError(f"evidence summary field {field!r} is inconsistent")
    if expected_kind == "verification":
        expected_scope = payload.get("verification_scope")
        if expected_scope not in {"baseline_comparison", "current_state_only"}:
            raise ConfigurationError("verification scope is invalid")
        if summary.get("verification_scope") != expected_scope:
            raise ConfigurationError("verification scope disagrees with its summary")
        if expected_scope == "baseline_comparison":
            if not summary.get("baseline_available") or not summary.get("baseline_comparable"):
                raise ConfigurationError("baseline-comparison evidence must have a comparable baseline")
            if not payload.get("baseline") or not payload.get("baseline_sha256"):
                raise ConfigurationError("baseline-comparison evidence is not bound to a baseline artifact")
            lineage = summary.get("baseline_lineage")
            if not isinstance(lineage, dict) or lineage.get("status") not in {"passed", "unavailable"}:
                raise ConfigurationError("baseline-comparison evidence has invalid lineage status")
        elif summary.get("baseline_available") or summary.get("baseline_comparable") or summary.get("baseline_lineage") is not None:
            raise ConfigurationError("current-only evidence cannot claim a baseline")
        for field, classification in (
            ("new_failures", "new_failure"),
            ("existing_failures", "existing_failure"),
            ("fixed_failures", "fixed_failure"),
        ):
            expected_names = [check["name"] for check in checks if check.get("comparison") == classification]
            if summary.get(field) != expected_names:
                raise ConfigurationError(f"verification summary field {field!r} is inconsistent")
        expected_indeterminate = [
            check["name"]
            for check in checks
            if check.get("comparison") in {"newly_observed_failure", "timed_out", "unavailable", "not_comparable"}
        ]
        if summary.get("indeterminate_results") != expected_indeterminate:
            raise ConfigurationError("verification summary field 'indeterminate_results' is inconsistent")


def validate_current_artifact_hashes(verification: dict[str, Any], artifact_dir: Path) -> None:
    for check in verification["checks"]:
        artifacts = check.get("evidence_artifacts", [])
        if not isinstance(artifacts, list):
            raise ConfigurationError(f"evidence artifacts for {check['name']} must be an array")
        for artifact in artifacts:
            if not isinstance(artifact, dict) or not isinstance(artifact.get("exists"), bool):
                raise ConfigurationError(f"invalid evidence artifact record for {check['name']}")
            path = contained_path(artifact_dir, Path(artifact.get("path", "")), "recorded evidence artifact")
            if artifact["exists"] is False:
                if path.exists():
                    raise ConfigurationError(f"missing evidence artifact appeared after verification: {path}")
                continue
            if not path.is_file() or file_sha256(path) != artifact.get("sha256"):
                raise ConfigurationError(f"recorded evidence artifact changed after verification: {path}")


def require_comparable_baseline(baseline: dict[str, Any]) -> None:
    worktree = baseline.get("summary", {}).get("worktree_check", {})
    if worktree.get("status") != "passed":
        raise ConfigurationError(
            "baseline did not preserve repository state and cannot be used for comparison; rerun baseline"
        )


def comparison_for(current: str, baseline: str | None, comparable: bool) -> str:
    if not comparable:
        return "not_comparable"
    if baseline is None:
        return "no_baseline"
    if current == "skipped" and baseline == "skipped":
        return "skipped"
    if current == "passed":
        if baseline == "passed":
            return "passed"
        if baseline in {"failed", "timed_out"}:
            return "fixed_failure"
        return "not_comparable"
    if current == "failed":
        if baseline == "passed":
            return "new_failure"
        if baseline == "failed":
            return "existing_failure"
        return "newly_observed_failure"
    return current


def validate_baseline_lineage(root: Path, baseline: dict[str, Any], current_git: dict[str, Any]) -> dict[str, Any]:
    baseline_git = baseline.get("git_after", {})
    baseline_available = bool(baseline_git.get("available"))
    current_available = bool(current_git.get("available"))
    if baseline_available != current_available:
        raise ConfigurationError("baseline and verification disagree about Git repository availability")
    if not baseline_available:
        return {"status": "unavailable", "reason": "repository is not a Git worktree"}
    baseline_commit = baseline_git.get("commit")
    current_commit = current_git.get("commit")
    if not isinstance(baseline_commit, str) or not isinstance(current_commit, str):
        raise ConfigurationError("baseline or verification Git commit is unavailable")
    code, _, error = git_command(root, ["merge-base", "--is-ancestor", baseline_commit, current_commit])
    if code != 0:
        raise ConfigurationError(
            "baseline commit is not an ancestor of the verification commit"
            + (f": {error}" if error else "")
        )
    return {"status": "passed", "baseline_commit": baseline_commit, "current_commit": current_commit}


def run_phase(args: argparse.Namespace, kind: str) -> int:
    root = resolve_root(args.root)
    config_path = resolve_config_path(root, args.config)
    config, config_hash = load_config(config_path)
    artifact_dir = ensure_artifact_dir(root, config["artifact_dir"])
    artifact_owners = configured_artifact_owners(config, root, artifact_dir)
    default_name = "baseline.json" if kind == "baseline" else "verify.json"
    output_path = resolve_artifact_path(artifact_dir, args.output, default_name)
    baseline_path = resolve_artifact_path(artifact_dir, getattr(args, "baseline", None), "baseline.json")
    if kind == "verification" and output_path == baseline_path:
        raise ConfigurationError("verification output cannot overwrite its baseline")
    for label, path in (("phase output", output_path), ("baseline input", baseline_path)):
        if path in artifact_owners:
            raise ConfigurationError(f"{label} cannot share configured check artifact owned by {artifact_owners[path]!r}")
    output_path.unlink(missing_ok=True)

    baseline = None
    current_only = bool(kind == "verification" and getattr(args, "current_only", False))
    if kind == "verification" and not current_only:
        if not baseline_path.is_file():
            raise ConfigurationError("verification requires a baseline; run baseline first or use --current-only for CI")
        baseline = load_json(baseline_path)
        validate_evidence_artifact(baseline, "baseline", root, config, config_hash)
        require_comparable_baseline(baseline)

    started_at = utc_now()
    git_before = git_snapshot(root)
    lineage = validate_baseline_lineage(root, baseline, git_before) if baseline else None
    tree_before = repository_tree_snapshot(root, artifact_dir, config.get("mutation_exclude", []))
    checks = [
        run_check(check, root, artifact_dir, config["timeout_seconds"], kind)
        for check in config["checks"]
    ]
    git_after = git_snapshot(root)
    tree_after = repository_tree_snapshot(root, artifact_dir, config.get("mutation_exclude", []))
    repository_integrity = worktree_check(git_before, git_after, tree_before, tree_after)

    comparable = baseline is not None
    baseline_checks = {
        check["name"]: check for check in (baseline.get("checks", []) if baseline else [])
    }
    for check in checks:
        old_status = baseline_checks.get(check["name"], {}).get("status")
        check["baseline_status"] = old_status
        check["comparison"] = comparison_for(check["status"], old_status, comparable) if baseline else "no_baseline"

    summary = summarize(checks, repository_integrity)
    if kind == "verification":
        summary["baseline_available"] = baseline is not None
        summary["baseline_comparable"] = comparable
        summary["baseline_lineage"] = lineage
        summary["verification_scope"] = "current_state_only" if current_only else "baseline_comparison"
        summary["new_failures"] = [
            check["name"] for check in checks if check["comparison"] == "new_failure"
        ]
        summary["existing_failures"] = [
            check["name"] for check in checks if check["comparison"] == "existing_failure"
        ]
        summary["fixed_failures"] = [
            check["name"] for check in checks if check["comparison"] == "fixed_failure"
        ]
        summary["indeterminate_results"] = [
            check["name"]
            for check in checks
            if check["comparison"] in {"newly_observed_failure", "timed_out", "unavailable", "not_comparable"}
        ]

    payload = {
        "schema_version": SCHEMA_VERSION,
        "kind": kind,
        "started_at": started_at,
        "finished_at": utc_now(),
        "root": str(root),
        "config": str(config_path),
        "config_sha256": config_hash,
        "baseline": str(baseline_path) if kind == "verification" and baseline else None,
        "baseline_sha256": file_sha256(baseline_path) if baseline else None,
        "verification_scope": "current_state_only" if current_only else "baseline_comparison" if kind == "verification" else None,
        "git_before": git_before,
        "git_after": git_after,
        "tree_before": tree_before,
        "tree_after": tree_after,
        "checks": checks,
        "summary": summary,
    }
    validate_evidence_artifact(payload, kind, root, config, config_hash)
    validate_current_artifact_hashes(payload, artifact_dir)
    write_json(output_path, payload)

    label = "Baseline" if kind == "baseline" else "Current-state verification" if current_only else "Verification"
    print(f"{label} artifact: {output_path}")
    for check in checks:
        required = "required" if check["required"] else "optional"
        print(f"- {check['name']}: {check['status']} ({required})")
    print("Required checks: " + ("passed" if summary["required_success"] else "failed"))
    if repository_integrity["status"] == "unavailable":
        print("Worktree mutation check: unavailable")
    elif repository_integrity["status"] == "failed":
        print("Worktree mutation check: failed")
    if current_only:
        print("Regression comparison: not performed (--current-only)")
    return 0 if summary["required_success"] else 1


def markdown_cell(value: Any) -> str:
    if value is None:
        return "-"
    return str(value).replace("|", "\\|").replace("\n", " ")


def report_status(checks: list[dict[str, Any]]) -> str:
    blocking = [check for check in checks if check.get("required") and check.get("status") != "passed"]
    if not blocking:
        return "passed"
    if any(check.get("status") in {"failed", "timed_out"} for check in blocking):
        return "failed"
    return "blocked"


def build_report(verification: dict[str, Any], baseline: dict[str, Any] | None) -> tuple[str, str]:
    checks = verification.get("checks", [])
    status = report_status(checks)
    summary = verification.get("summary", {})
    if summary.get("worktree_check", {}).get("status") == "failed":
        status = "failed"
    elif summary.get("worktree_check", {}).get("status") != "passed" and status == "passed":
        status = "blocked"
    lines = [
        "# Refactoring Verification Report",
        "",
        f"- Final status: `{status}`",
        f"- Repository: `{verification.get('root', '-')}`",
        f"- Verification started: `{verification.get('started_at', '-')}`",
        f"- Baseline available: `{'yes' if baseline else 'no'}`",
        f"- Baseline comparable: `{'yes' if summary.get('baseline_comparable') else 'no'}`",
        f"- Worktree mutation check: `{summary.get('worktree_check', {}).get('status', 'unavailable')}`",
        f"- Baseline lineage: `{summary.get('baseline_lineage', {}).get('status', 'unavailable')}`",
        "",
        "## Check Results",
        "",
        "| Check | Required | Baseline | Current | Comparison | Exit | Seconds |",
        "| --- | --- | --- | --- | --- | ---: | ---: |",
    ]
    for check in checks:
        lines.append(
            "| "
            + " | ".join(
                markdown_cell(value)
                for value in (
                    check.get("name"),
                    "yes" if check.get("required") else "no",
                    check.get("baseline_status"),
                    check.get("status"),
                    check.get("comparison"),
                    check.get("exit_code"),
                    check.get("duration_seconds"),
                )
            )
            + " |"
        )

    lines.extend(["", "## Baseline Comparison", ""])
    lines.append(f"- New failures: `{', '.join(summary.get('new_failures', [])) or 'none'}`")
    lines.append(f"- Existing failures: `{', '.join(summary.get('existing_failures', [])) or 'none'}`")
    lines.append(f"- Fixed failures: `{', '.join(summary.get('fixed_failures', [])) or 'none'}`")
    lines.append(f"- Indeterminate results: `{', '.join(summary.get('indeterminate_results', [])) or 'none'}`")

    nonpassing = [check for check in checks if check.get("status") != "passed"]
    lines.extend(["", "## Non-Passing And Skipped Checks", ""])
    if not nonpassing:
        lines.append("None.")
    for check in nonpassing:
        lines.append(
            f"- `{check.get('name')}`: `{check.get('status')}`"
            + (f" - {check.get('reason')}" if check.get("reason") else "")
        )

    lines.extend(["", "## Evidence Integrity", ""])
    lines.append("- Required checks all passed." if status == "passed" else "- Required verification is incomplete or failing; do not report this slice as successful.")
    lines.append("- Full stdout and stderr are retained in the verification JSON, subject to the documented capture limit.")
    worktree_status = summary.get("worktree_check", {}).get("status")
    if worktree_status == "unavailable":
        lines.append("- Repository tree evidence was unavailable; source mutation by checks was not independently proven absent.")
    if any(check.get("output_truncated") for check in checks):
        lines.append("- At least one command output was truncated; consult the source command when more detail is required.")
    return "\n".join(lines) + "\n", status


def run_report(args: argparse.Namespace) -> int:
    root = resolve_root(args.root)
    config_path = resolve_config_path(root, args.config)
    config, config_hash = load_config(config_path)
    artifact_dir = ensure_artifact_dir(root, config["artifact_dir"])
    artifact_owners = configured_artifact_owners(config, root, artifact_dir)
    baseline_path = resolve_artifact_path(artifact_dir, args.baseline, "baseline.json")
    verification_path = resolve_artifact_path(artifact_dir, args.verification, "verify.json")
    output_path = resolve_artifact_path(artifact_dir, args.output, "report.md")
    if output_path in {baseline_path, verification_path}:
        raise ConfigurationError("report output cannot overwrite evidence JSON")
    for label, path in (
        ("baseline input", baseline_path),
        ("verification input", verification_path),
        ("report output", output_path),
    ):
        if path in artifact_owners:
            raise ConfigurationError(f"{label} cannot share configured check artifact owned by {artifact_owners[path]!r}")
    output_path.unlink(missing_ok=True)

    verification = load_json(verification_path)
    if verification.get("verification_scope") != "baseline_comparison":
        raise ConfigurationError("regression report requires baseline-comparison verification, not --current-only evidence")
    if not baseline_path.is_file():
        raise ConfigurationError("regression report requires a baseline artifact")
    baseline = load_json(baseline_path)
    validate_evidence_artifact(baseline, "baseline", root, config, config_hash)
    require_comparable_baseline(baseline)
    validate_evidence_artifact(verification, "verification", root, config, config_hash)
    if verification.get("baseline_sha256") != file_sha256(baseline_path):
        raise ConfigurationError("verification is bound to a different baseline artifact")
    expected_lineage = validate_baseline_lineage(root, baseline, verification.get("git_before", {}))
    if verification.get("summary", {}).get("baseline_lineage") != expected_lineage:
        raise ConfigurationError("verification baseline lineage evidence is inconsistent")
    baseline_checks = {check["name"]: check for check in baseline["checks"]}
    for check in verification["checks"]:
        baseline_status = baseline_checks[check["name"]]["status"]
        expected_comparison = comparison_for(check["status"], baseline_status, True)
        if check.get("baseline_status") != baseline_status or check.get("comparison") != expected_comparison:
            raise ConfigurationError(f"baseline comparison is inconsistent for {check['name']}")
    validate_current_artifact_hashes(verification, artifact_dir)
    recorded_git = verification.get("git_after", {})
    current_git = git_snapshot(root)
    if bool(recorded_git.get("available")) != bool(current_git.get("available")):
        raise ConfigurationError("repository Git availability changed after verification")
    if recorded_git.get("available") and current_git.get("available"):
        fields = (
            "branch",
            "commit",
            "status",
            "tracked_diff_sha256",
            "untracked_sha256",
            "control_snapshot",
        )
        if any(recorded_git.get(field) != current_git.get(field) for field in fields):
            raise ConfigurationError("repository state changed after verification; rerun verify before reporting")
    current_tree = repository_tree_snapshot(root, artifact_dir, config.get("mutation_exclude", []))
    recorded_tree = verification.get("tree_after", {})
    if current_tree.get("status") != "captured" or recorded_tree.get("status") != "captured":
        raise ConfigurationError("repository tree state is unavailable; rerun verification in a readable workspace")
    if any(
        current_tree.get(field) != recorded_tree.get(field)
        for field in ("hash_format", "sha256", "file_count")
    ):
        raise ConfigurationError("repository files changed after verification; rerun verify before reporting")
    report, status = build_report(verification, baseline)
    atomic_write(output_path, report)
    print(f"Report artifact: {output_path}")
    print(f"Final status: {status}")
    return 0 if status == "passed" else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="action", required=True)

    for action in ("baseline", "verify"):
        subparser = subparsers.add_parser(action, help=f"run configured checks and write {action} evidence")
        subparser.add_argument("--root", help="repository root; defaults to the AKM stash root")
        subparser.add_argument(
            "--config",
            help="TOML configuration path relative to the root; defaults to config/technical-debt-workflow/refactoring.toml",
        )
        subparser.add_argument("--output", help="artifact name or path within the configured artifact directory")
        if action == "verify":
            subparser.add_argument("--baseline", help="baseline JSON name or path within the artifact directory")
            subparser.add_argument(
                "--current-only",
                action="store_true",
                help="run current-state CI checks without making a regression-comparison claim",
            )

    report = subparsers.add_parser("report", help="render baseline and verification JSON as Markdown")
    report.add_argument("--root", help="repository root; defaults to the AKM stash root")
    report.add_argument(
        "--config",
        help="TOML configuration path relative to the root; defaults to config/technical-debt-workflow/refactoring.toml",
    )
    report.add_argument("--baseline", help="baseline JSON name or path within the artifact directory")
    report.add_argument("--verification", help="verification JSON name or path within the artifact directory")
    report.add_argument("--output", help="Markdown name or path within the artifact directory")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.action == "baseline":
            return run_phase(args, "baseline")
        if args.action == "verify":
            return run_phase(args, "verification")
        return run_report(args)
    except ConfigurationError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
