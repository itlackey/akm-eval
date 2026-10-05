"""Linux subreaper-based containment for commands and all their descendants."""

from __future__ import annotations

import ctypes
import os
from pathlib import Path
import signal
import sys
import time


PR_SET_CHILD_SUBREAPER = 36


class ContainmentUnavailable(RuntimeError):
    """Raised when descendant containment cannot be established."""


def enable_subreaper() -> None:
    if sys.platform != "linux" or not Path("/proc").is_dir():
        raise ContainmentUnavailable("safe descendant containment requires Linux /proc")
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) != 0:
        error = ctypes.get_errno()
        raise ContainmentUnavailable(f"prctl(PR_SET_CHILD_SUBREAPER) failed with errno {error}")


def process_table() -> dict[int, tuple[int, str]]:
    table: dict[int, tuple[int, str]] = {}
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            raw = (entry / "stat").read_text(encoding="utf-8")
            fields = raw[raw.rfind(")") + 2 :].split()
            table[int(entry.name)] = (int(fields[1]), fields[0])
        except (OSError, ValueError, IndexError):
            continue
    return table


def descendant_pids(root_pid: int, table: dict[int, tuple[int, str]]) -> set[int]:
    descendants: set[int] = set()
    frontier = {root_pid}
    while frontier:
        children = {
            pid
            for pid, (parent, state) in table.items()
            if parent in frontier and pid not in descendants and state != "Z"
        }
        descendants.update(children)
        frontier = children
    return descendants


def signal_processes(pids: set[int], sent_signal: signal.Signals) -> None:
    for pid in sorted(pids, reverse=True):
        try:
            os.kill(pid, sent_signal)
        except ProcessLookupError:
            continue


def reap_adopted_children(owner_pid: int) -> None:
    table = process_table()
    for pid, (parent, state) in table.items():
        if parent != owner_pid or state != "Z":
            continue
        try:
            os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            continue


class ProcessGuard:
    """Track every descendant created after construction, including setsid escapes."""

    def __init__(self) -> None:
        enable_subreaper()
        self.owner_pid = os.getpid()
        self.existing = descendant_pids(self.owner_pid, process_table())

    def new_descendants(self) -> set[int]:
        return descendant_pids(self.owner_pid, process_table()) - self.existing

    def terminate(self, timeout: float = 4.0) -> bool:
        targets = self.new_descendants()
        signal_processes(targets, signal.SIGTERM)
        term_deadline = time.monotonic() + timeout / 2
        while self.new_descendants() and time.monotonic() < term_deadline:
            reap_adopted_children(self.owner_pid)
            time.sleep(0.05)

        targets = self.new_descendants()
        signal_processes(targets, signal.SIGKILL)
        kill_deadline = time.monotonic() + timeout / 2
        while self.new_descendants() and time.monotonic() < kill_deadline:
            reap_adopted_children(self.owner_pid)
            time.sleep(0.05)
        reap_adopted_children(self.owner_pid)
        return not self.new_descendants()
