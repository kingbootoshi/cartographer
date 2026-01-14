# Cartographer

<img width="640" height="360" alt="claudecartographer" src="https://github.com/user-attachments/assets/542818c6-fc2b-41a6-915d-cf196447f346" />


A Claude Code plugin that maps and documents codebases of any size using parallel AI subagents.

## Installation

**Step 1:** Add the marketplace to Claude Code:

```
/plugin marketplace add kingbootoshi/cartographer
```

**Step 2:** Install the plugin:

```
/plugin install cartographer
```

**Step 3:** Restart Claude Code (may be required for the skill to load)

**Step 4:** Use it:

```
/cartographer
```

Or just say "map this codebase" and it will trigger automatically.

## Multi-Assistant Setup

To install Cartographer instructions for other assistants (Copilot, Cursor,
Codex, OpenCode, Antigravity), run the interactive installer:

```bash
python3 scripts/install.py
```

List targets or install a subset:

```bash
python3 scripts/install.py --list-targets
python3 scripts/install.py --target copilot,cursor
```

The installer uses best-effort default paths for each assistant; adjust as
needed for your environment.

## What it Does

Cartographer orchestrates multiple Sonnet subagents (with 1M token context windows) to analyze your entire codebase in parallel, then synthesizes their findings into:

- `docs/CODEBASE_MAP.md` - Detailed architecture map with file purposes, dependencies, data flows, and navigation guides
- Updates `CLAUDE.md` with a summary pointing to the map

## How it Works

1. Runs a scanner script to get file tree with token counts (respects .gitignore)
2. Plans how to split work across subagents based on token budgets
3. Spawns Sonnet subagents in parallel - each analyzes a portion of the codebase
4. Synthesizes all subagent reports into comprehensive documentation

## Update Mode

If `docs/CODEBASE_MAP.md` already exists, Cartographer will:

1. Check git history for changes since last mapping
2. Only re-analyze changed modules
3. Merge updates with existing documentation

Just run `/cartographer` again to update.

## Requirements

- tiktoken (for token counting): `pip install tiktoken` or `uv pip install tiktoken`

## Full Documentation

See [plugins/cartographer/README.md](plugins/cartographer/README.md) for detailed documentation.

## License

MIT
