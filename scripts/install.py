#!/usr/bin/env python3
"""
Install Cartographer instructions for multiple coding assistants.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, List, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = REPO_ROOT / "scripts" / "templates" / "cartographer_instructions.md"
DEFAULT_COMMAND = "cartographer"

TARGETS = {
    "copilot": [
        REPO_ROOT / ".github" / "copilot-instructions.md",
    ],
    "cursor": [
        REPO_ROOT / ".cursorrules",
        REPO_ROOT / ".cursor" / "rules" / "cartographer.mdc",
    ],
    "codex": [
        REPO_ROOT / ".codex" / "prompts" / "cartographer.md",
    ],
    "opencode": [
        REPO_ROOT / ".opencode" / "prompts" / "cartographer.md",
    ],
    "antigravity": [
        REPO_ROOT / ".antigravity" / "prompts" / "cartographer.md",
    ],
}


def _load_template() -> str:
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Missing template: {TEMPLATE_PATH}")
    return TEMPLATE_PATH.read_text(encoding="utf-8")


def _normalize_targets(raw_targets: Sequence[str]) -> List[str]:
    if not raw_targets:
        return list(TARGETS.keys())

    normalized: List[str] = []
    for item in raw_targets:
        for target in item.split(","):
            target = target.strip().lower()
            if not target:
                continue
            if target == "all":
                return list(TARGETS.keys())
            normalized.append(target)
    return normalized


def _prompt_targets() -> List[str]:
    print("Select targets to install:")
    for name in sorted(TARGETS.keys()):
        print(f"- {name}")
    choice = input("Targets (comma-separated or 'all') [all]: ").strip()
    if not choice or choice.lower() == "all":
        return list(TARGETS.keys())
    return _normalize_targets([choice])


def _normalize_command(raw: str) -> str:
    command = raw.strip()
    if command.startswith("/"):
        command = command[1:]
    return command or DEFAULT_COMMAND


def _prompt_command() -> str:
    raw = input(f"Command name (without slash) [{DEFAULT_COMMAND}]: ").strip()
    return _normalize_command(raw) if raw else DEFAULT_COMMAND


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _install_targets(
    targets: Iterable[str],
    template: str,
    force: bool,
    dry_run: bool,
) -> List[str]:
    messages: List[str] = []
    for target in targets:
        dests = TARGETS.get(target)
        if not dests:
            messages.append(f"Unknown target: {target}")
            continue
        for dest in dests:
            if dest.exists() and not force:
                messages.append(f"Skipped (exists): {dest}")
                continue
            if dry_run:
                messages.append(f"Would write: {dest}")
                continue
            _ensure_parent(dest)
            dest.write_text(template, encoding="utf-8")
            messages.append(f"Wrote: {dest}")
    return messages


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Install Cartographer instructions for multiple assistants."
    )
    parser.add_argument(
        "--target",
        action="append",
        help="Target to install (copilot,cursor,codex,opencode,antigravity,all).",
    )
    parser.add_argument(
        "--list-targets",
        action="store_true",
        help="List supported targets.",
    )
    parser.add_argument(
        "--command",
        help="Command name to wire up (default: cartographer).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing files.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be written without writing.",
    )
    args = parser.parse_args()

    if args.list_targets:
        print("Supported targets:")
        for name in sorted(TARGETS.keys()):
            print(f"- {name}")
        return 0

    targets = _normalize_targets(args.target or [])
    interactive = not args.target
    if interactive:
        targets = _prompt_targets()

    command_name = DEFAULT_COMMAND
    if args.command:
        command_name = _normalize_command(args.command)
    elif interactive:
        command_name = _prompt_command()

    template = _load_template().replace("{COMMAND}", command_name)
    results = _install_targets(targets, template, args.force, args.dry_run)
    for line in results:
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
