# Repository Guidelines

## Project Structure & Module Organization

- `README.md` and `plugins/cartographer/README.md` describe usage and plugin behavior.
- `plugins/cartographer/skills/cartographer/` contains the skill definition in `SKILL.md`.
- `plugins/cartographer/skills/cartographer/scripts/scan-codebase.py` is the Python scanner used by the skill.
- `.claude-plugin/marketplace.json` defines the local marketplace metadata and plugin source path.

## Build, Test, and Development Commands

- Run the skill in Claude Code: `/cartographer` (generates `docs/CODEBASE_MAP.md` in the target repo).
- Run the scanner directly from this repo:
  - `python3 plugins/cartographer/skills/cartographer/scripts/scan-codebase.py . --format json`
  - If you use `uv`: `uv run plugins/cartographer/skills/cartographer/scripts/scan-codebase.py . --format json`
- Dependencies: `pip install tiktoken` (required for token counting).

## Coding Style & Naming Conventions

- Python: 4-space indentation, snake_case for functions/variables, lowercase module names.
- Keep scripts runnable from repo root with relative paths (avoid hardcoded absolute paths).
- Markdown: use clear headings, short paragraphs, and bullet lists for procedures.

## Testing Guidelines

- No automated test suite is currently defined.
- If you add tests, document the framework and commands in both `README.md` files.
- Name tests descriptively (e.g., `test_scan_codebase_*.py`) and keep fixtures small.

## Commit & Pull Request Guidelines

- Commit history favors short, imperative summaries like `Fix ...`, `Update ...`, `Add ...`.
- Version-tagged commits appear as `vX.Y.Z: <summary>` for releases.
- PRs should include: a concise description, reasoning for behavior changes, and any user-visible updates to `README.md` or `SKILL.md`.
- If you change scanner behavior, note dependency impacts (e.g., `tiktoken`) and expected output changes.

## Configuration & Release Notes

- `.claude-plugin/marketplace.json` is the release-facing metadata; keep version fields in sync with plugin changes.
- Update `plugins/cartographer/README.md` when installation or usage steps change.
