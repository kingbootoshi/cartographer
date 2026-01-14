# Cartographer

A Claude Code plugin that maps and documents codebases of any size using parallel AI subagents.

## What it does

Cartographer orchestrates multiple Sonnet subagents (with 1M token context windows) to analyze your entire codebase in parallel, then synthesizes their findings into comprehensive documentation:

- `docs/CODEBASE_MAP.md` - Detailed architecture map with file purposes, dependencies, data flows, and navigation guides
- Updates `CLAUDE.md` with a summary pointing to the map

## Installation

### Via Claude Code Plugins Registry

```bash
claude plugins install cartographer
```

### Manual Installation

Clone to your Claude skills directory:

```bash
git clone https://github.com/bootoshi/cartographer.git ~/.claude/skills/cartographer
```

Or for project-specific use:

```bash
git clone https://github.com/bootoshi/cartographer.git .claude/skills/cartographer
```

### Dependencies

The scanner script requires tiktoken:

```bash
uv pip install tiktoken
# or
pip install tiktoken
```

## Usage

Simply invoke the skill:

```
/cartographer
```

Or say:
- "map this codebase"
- "create codebase map"
- "document the architecture"
- "understand this codebase"

### Update Mode

If `docs/CODEBASE_MAP.md` already exists, Cartographer will:

1. Check git history for changes since last mapping
2. Only re-analyze changed modules
3. Merge updates with existing documentation

Just run `/cartographer` again to update.

## Multi-Assistant Setup

To install Cartographer instructions for other assistants (Copilot, Cursor,
Codex, OpenCode, Antigravity), run the interactive installer from the repo root:

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

## How it Works

```
/cartographer invoked
        |
        v
+---------------------------------------+
|  1. Run scripts/scan-codebase.py      |
|     - Recursive file tree             |
|     - Token count per file            |
|     - Respects .gitignore             |
+---------------------------------------+
        |
        v
+---------------------------------------+
|  2. Plan subagent assignments         |
|     - Group files by module           |
|     - Balance token budgets           |
|     - Target ~500k tokens per agent   |
+---------------------------------------+
        |
        v
+---------------------------------------+
|  3. Spawn Sonnet subagents PARALLEL   |
|     - Each reads assigned files       |
|     - Analyzes purpose, dependencies  |
|     - Returns structured summary      |
+---------------------------------------+
        |
        v
+---------------------------------------+
|  4. Synthesize all reports            |
|     - Merge subagent outputs          |
|     - Build architecture diagram      |
|     - Create navigation guides        |
+---------------------------------------+
        |
        v
+---------------------------------------+
|  5. Write docs/CODEBASE_MAP.md        |
|     Update CLAUDE.md with summary     |
+---------------------------------------+
```

## Output Structure

The generated `docs/CODEBASE_MAP.md` includes:

- **System Overview** - ASCII architecture diagram
- **Directory Structure** - Annotated file tree
- **Module Guide** - Per-module documentation with:
  - Purpose and entry points
  - Key files with token counts
  - Exports and dependencies
- **Data Flow** - Request flows, auth flows, etc.
- **Conventions** - Naming, patterns, style
- **Gotchas** - Non-obvious behaviors and warnings
- **Navigation Guide** - How to add features, modify systems

## Token Budgets

| Model | Context Window | Budget per Subagent |
|-------|---------------|---------------------|
| Sonnet | 1,000,000 | 500,000 |
| Opus | 200,000 | 100,000 |
| Haiku | 200,000 | 100,000 |

Cartographer uses Sonnet subagents by default for maximum coverage.

## Configuration

The scanner respects `.gitignore` and has sensible defaults for:
- Ignoring `node_modules`, `dist`, `build`, etc.
- Skipping binary files
- Skipping files over 1MB or 50k tokens

## License

MIT
