# Cartographer Instructions

When a user runs `/cartographer` or asks to map the codebase, follow this
workflow.

Map and document this codebase. Produce `docs/CODEBASE_MAP.md` with architecture,
module purposes, key dependencies, data flow, and a navigation guide.

## Workflow

1. Run the scanner to get a file tree with token counts (respects `.gitignore`):

```bash
python3 plugins/cartographer/skills/cartographer/scripts/scan-codebase.py . --format json
```

If the scanner fails due to missing `tiktoken`, install it:

```bash
pip install tiktoken
```

2. Use the scan output to group files by module and analyze them. If your
environment supports parallel subagents, split the work and run in parallel.
If not, process one module at a time.

3. For each file/module, capture:
   - Purpose and entry points
   - Key exports/public APIs
   - Dependencies and notable imports
   - Patterns and conventions
   - Gotchas or non-obvious behavior

4. Synthesize the results into `docs/CODEBASE_MAP.md` with:
   - System overview
   - Directory structure
   - Module guide
   - Data flows (sequence diagrams if possible)
   - Conventions and gotchas
   - Navigation guide for common tasks

5. If `docs/CODEBASE_MAP.md` already exists, update only changed sections and
refresh any timestamps. If `CLAUDE.md` exists, add a short summary pointing to
the map.
