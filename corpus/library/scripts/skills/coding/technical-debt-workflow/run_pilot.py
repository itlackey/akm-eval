#!/usr/bin/env python3
"""Replay the low-risk pilot refactor in an isolated temporary Git branch."""

from __future__ import annotations

import argparse
import ast
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
WORKFLOW_ROOT = Path(__file__).resolve().parent
if str(WORKFLOW_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKFLOW_ROOT))

from refactoring.process_guard import ContainmentUnavailable, ProcessGuard


FIXTURE = WORKFLOW_ROOT / "evaluations" / "fixtures" / "pilot-repository"
CHILD_EVALUATOR = r"""
import json
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text(encoding="utf-8")
cases = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
namespace = {}
exec(compile(source, sys.argv[1], "exec"), namespace)
outputs = [namespace["normalize_label"](case["value"], case["trim"]) for case in cases]
sys.stdout.write(json.dumps(outputs))
"""


def git(root: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    environment = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    environment.update(
        {
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_TERMINAL_PROMPT": "0",
            "HOME": str(root),
        }
    )
    return subprocess.run(
        ["git", "-C", str(root), *arguments],
        env=environment,
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )


def source_metrics(source: str) -> dict[str, int]:
    tree = ast.parse(source)
    return {
        "decision_nodes": sum(isinstance(node, (ast.If, ast.IfExp)) for node in ast.walk(tree)),
        "lower_calls": sum(
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "lower"
            for node in ast.walk(tree)
        ),
        "nonblank_lines": sum(bool(line.strip()) for line in source.splitlines()),
    }


def public_signature(source: str) -> str:
    tree = ast.parse(source)
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef))
    return ast.dump(ast.Module(body=[function.args, function.returns], type_ignores=[]), include_attributes=False)


def evaluate_source(repository: Path) -> list[str]:
    try:
        guard = ProcessGuard()
    except ContainmentUnavailable as error:
        raise RuntimeError(str(error)) from error
    process = subprocess.Popen(
        [sys.executable, "-I", "-B", "-c", CHILD_EVALUATOR, "normalizer.py", "contract-cases.json"],
        cwd=repository,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    stdout_capture: dict[str, Any] = {}
    stderr_capture: dict[str, Any] = {}
    stdout_thread = threading.Thread(target=drain_stream, args=(process.stdout, stdout_capture), daemon=True)
    stderr_thread = threading.Thread(target=drain_stream, args=(process.stderr, stderr_capture), daemon=True)
    stdout_thread.start()
    stderr_thread.start()
    try:
        exit_code = process.wait(timeout=10)
    except subprocess.TimeoutExpired as error:
        guard.terminate()
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        raise RuntimeError("pilot fixture evaluation timed out") from error
    descendants_detected = bool(guard.new_descendants())
    if not guard.terminate():
        raise RuntimeError("pilot fixture left descendant processes running")
    stdout_thread.join(timeout=2)
    stderr_thread.join(timeout=2)
    if stdout_thread.is_alive() or stderr_thread.is_alive():
        raise RuntimeError("pilot fixture output streams did not close")
    if stdout_capture["total"] > 65_536 or stderr_capture["total"] > 65_536:
        raise RuntimeError("pilot fixture output exceeded 65536 bytes")
    if descendants_detected:
        raise RuntimeError("pilot fixture exited before its descendant processes completed")
    stdout = stdout_capture["data"].decode("utf-8", errors="replace")
    stderr = stderr_capture["data"].decode("utf-8", errors="replace")
    if exit_code != 0:
        raise RuntimeError(f"pilot fixture evaluation failed with exit {exit_code}: {stderr.strip()}")
    try:
        outputs = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("pilot fixture did not return the required structured output") from error
    if not isinstance(outputs, list) or any(not isinstance(item, str) for item in outputs):
        raise RuntimeError("pilot fixture returned an invalid output array")
    return outputs


def drain_stream(stream: Any, capture: dict[str, Any]) -> None:
    retained = bytearray()
    total = 0
    while chunk := stream.read(8_192):
        total += len(chunk)
        remaining = 65_536 - len(retained)
        if remaining > 0:
            retained.extend(chunk[:remaining])
    capture["data"] = bytes(retained)
    capture["total"] = total


def record_git(commands: list[dict[str, Any]], root: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    completed = git(root, *arguments)
    commands.append(
        {
            "command": "git " + " ".join(arguments),
            "exit_code": completed.returncode,
            "stderr": completed.stderr.strip(),
            "stdout": completed.stdout.strip(),
        }
    )
    if completed.returncode != 0:
        raise RuntimeError(f"pilot Git command failed: git {' '.join(arguments)}: {completed.stderr.strip()}")
    return completed


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def run_pilot(output: Path) -> dict[str, Any]:
    before = (FIXTURE / "before" / "normalizer.py").read_text(encoding="utf-8")
    after = (FIXTURE / "after" / "normalizer.py").read_text(encoding="utf-8")
    cases = json.loads((FIXTURE / "contract-cases.json").read_text(encoding="utf-8"))
    expected = [case["expected"] for case in cases]
    commands: list[dict[str, Any]] = []

    with tempfile.TemporaryDirectory(prefix="tech-debt-pilot-") as temporary:
        repository = Path(temporary)
        source_path = repository / "normalizer.py"
        shutil.copyfile(FIXTURE / "before" / "normalizer.py", source_path)
        shutil.copyfile(FIXTURE / "contract-cases.json", repository / "contract-cases.json")

        for arguments in (
            ("init", "--quiet"),
            ("add", "normalizer.py", "contract-cases.json"),
            (
                "-c",
                "user.name=Refactoring Pilot",
                "-c",
                "user.email=pilot@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "-c",
                f"core.hooksPath={os.devnull}",
                "commit",
                "--quiet",
                "-m",
                "pilot baseline",
            ),
            ("checkout", "--quiet", "-b", "pilot/consolidate-normalizer"),
        ):
            record_git(commands, repository, *arguments)

        before_outputs = evaluate_source(repository)
        commands.append(
            {
                "command": "python -I -B <contract-evaluator> normalizer.py contract-cases.json (baseline)",
                "exit_code": 0,
                "stderr": "",
                "stdout": json.dumps(before_outputs),
            }
        )
        baseline_status = record_git(commands, repository, "status", "--porcelain=v1", "--untracked-files=all")
        source_path.write_text(after, encoding="utf-8", newline="\n")
        after_outputs = evaluate_source(repository)
        commands.append(
            {
                "command": "python -I -B <contract-evaluator> normalizer.py contract-cases.json (after)",
                "exit_code": 0,
                "stderr": "",
                "stdout": json.dumps(after_outputs),
            }
        )

        branch_result = record_git(commands, repository, "rev-parse", "--abbrev-ref", "HEAD")
        changed_result = record_git(commands, repository, "diff", "--name-only")
        status_result = record_git(commands, repository, "status", "--porcelain=v1", "--untracked-files=all")
        diff_check = record_git(commands, repository, "diff", "--check")
        diff_stat = record_git(commands, repository, "diff", "--stat")

        checks = {
            "after_matches_contract": after_outputs == expected,
            "baseline_matches_contract": before_outputs == expected,
            "baseline_worktree_clean": baseline_status.stdout == "",
            "behavior_equivalent": before_outputs == after_outputs,
            "changed_files_bounded": changed_result.stdout.splitlines() == ["normalizer.py"],
            "diff_clean": diff_check.returncode == 0 and not diff_check.stdout and not diff_check.stderr,
            "isolated_branch": branch_result.stdout.strip() == "pilot/consolidate-normalizer",
            "no_untracked_or_extra_changes": status_result.stdout.splitlines() == [" M normalizer.py"],
            "public_signature_unchanged": public_signature(before) == public_signature(after),
            "recorded_git_commands_passed": all(command["exit_code"] == 0 for command in commands),
        }
        before_metrics = source_metrics(before)
        after_metrics = source_metrics(after)
        checks["decision_nodes_reduced"] = after_metrics["decision_nodes"] < before_metrics["decision_nodes"]
        checks["duplicated_lower_calls_reduced"] = after_metrics["lower_calls"] < before_metrics["lower_calls"]
        checks["nonblank_lines_reduced"] = after_metrics["nonblank_lines"] < before_metrics["nonblank_lines"]

    payload = {
        "checks": checks,
        "commands": commands,
        "fixture": str(FIXTURE.relative_to(ROOT)),
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "metrics": {
            "after": after_metrics,
            "before": before_metrics,
        },
        "schema_version": 1,
        "status": "passed" if all(checks.values()) else "failed",
        "test_cases": len(cases),
    }
    write_json(output, payload)
    return payload


def pilot_output_path(value: str) -> Path:
    artifact_path = ROOT / ".refactoring"
    if artifact_path.is_symlink():
        raise ValueError("pilot evidence directory must not be a symlink")
    if artifact_path.exists() and not artifact_path.is_dir():
        raise ValueError("pilot evidence path must be a directory")
    artifact_path.mkdir(exist_ok=True, mode=0o700)
    artifact_dir = artifact_path.resolve()
    if artifact_dir != ROOT.resolve() / ".refactoring":
        raise ValueError("pilot evidence directory must remain inside the stash root")
    output = Path(value).expanduser()
    if not output.is_absolute():
        output = artifact_dir / output
    output = output.resolve()
    try:
        output.relative_to(artifact_dir)
    except ValueError as error:
        raise ValueError(f"pilot output must remain inside {artifact_dir}") from error
    return output


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="pilot.json")
    args = parser.parse_args(argv)
    try:
        output = pilot_output_path(args.output)
        output.unlink(missing_ok=True)
        payload = run_pilot(output)
    except (OSError, RuntimeError, SyntaxError, StopIteration, subprocess.SubprocessError, ValueError) as error:
        print(f"pilot error: {error}", file=sys.stderr)
        return 2
    print(f"Pilot refactor: {payload['status']} ({payload['test_cases']} contract cases)")
    print(
        "Metrics: "
        f"lines {payload['metrics']['before']['nonblank_lines']}->{payload['metrics']['after']['nonblank_lines']}, "
        f"decisions {payload['metrics']['before']['decision_nodes']}->{payload['metrics']['after']['decision_nodes']}, "
        f"lower calls {payload['metrics']['before']['lower_calls']}->{payload['metrics']['after']['lower_calls']}"
    )
    print(f"Pilot artifact: {output}")
    return 0 if payload["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
