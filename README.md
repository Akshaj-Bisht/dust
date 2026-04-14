# Dust

Dust is a fast, minimal CLI tool to scan and clean disk space on Linux.

## Features

- Scan directories and list largest folders.
- Clean common junk locations (`~/.cache`, `/tmp`, logs).
- Preview cleanup before deleting with `--dry-run`.
- Require confirmation by default for safe cleanup.

## Stack

- Runtime: Bun
- Language: TypeScript
- CLI: Commander.js
- Prompts: Clack

## Install

```bash
bun install
```

## Usage

```bash
# Launch interactive TUI home
bun run src/index.ts
# (when linked globally: dust)

# Show command help
bun run src/index.ts --help
bun run src/index.ts scan --help
bun run src/index.ts clean --help

# Open local man page
bun run man
# or
man --local-file man/dust.1

# Scan home and show top 10 directories
bun run src/index.ts scan

# Fast scan using du engine (default auto mode already prefers du)
bun run src/index.ts scan ~ --engine du --depth 6 --top 20

# Show nested raw entries (no dedup)
bun run src/index.ts scan ~ --raw --top 20

# Interactive picker after scan
bun run src/index.ts scan ~ --interactive

# Scan a specific path and return JSON
bun run src/index.ts scan /var --top 15 --json

# Preview cleanup only
bun run src/index.ts clean all --dry-run

# Clean cache without prompt
bun run src/index.ts clean cache --yes
```

## Manual Page

- Local man page source: `man/dust.1`
- Open it with: `bun run man` or `man --local-file man/dust.1`
- Optional system install:

```bash
sudo install -Dm644 man/dust.1 /usr/local/share/man/man1/dust.1
sudo mandb
man dust
```

## Command Reference

- `dust`
  - Opens the Ink-based TUI home menu (TTY only).
  - Opens in the current terminal by default (btop-style).
  - Set `DUST_OPEN_NEW_WINDOW=1` to try launching in a new terminal window.
  - Home screen uses a clean Mole-style list layout with short action descriptions.
  - Clean action opens a dedicated clean frame with line-by-line progress and spinner.
  - Keyboard controls: `j/k` (or `↑/↓`) move, `Enter` run, `q` back/quit.
  - In Clean View: `a` apply cleanup, `l` open cleanup log, `g/G` jump top/bottom.
- `dust scan [path] --top <n> --depth <levels> --engine <auto|du|walk> --interactive --raw --json --verbose`
  - Reports largest folders in the target path.
  - `auto` mode prefers `du` for speed and falls back to filesystem walk when needed.
  - default output is deduplicated to avoid parent/child noise; use `--raw` for full nested view.
  - `--interactive` opens a folder picker so you can drill down quickly.
  - `walk` mode ignores noisy system paths by default (`/proc`, `/sys`, `/dev`, etc.).
- `dust clean [target] --dry-run --yes --stale-days <days> --verbose`
  - `target`: `cache`, `tmp`, `logs`, `dev`, or `all`.
  - Uses safety checks to avoid deleting critical paths.
  - `dev` target removes developer junk (for example: `node_modules`, `dist`, `.venv`, `target`) from current workspace tree.
  - `tmp` and `logs` cleanup apply stale-age filtering (`--stale-days`, default `3`).
  - Non-dry-run cleanup writes an audit log to `~/.local/state/dust/logs/cleanup.log`.

## Safety Model

- Cleanup always previews candidates before deletion.
- Interactive confirmation is required unless `--yes` is provided.
- Deletion is blocked for critical system paths.
- Symlinks are not followed during scan/cleanup traversal.

## Development

```bash
# Start CLI
bun run start

# Run tests
bun run test
```

## Documentation Rule

- Keep `README.md` updated with every user-facing change.
- Update command examples whenever flags, defaults, or command names change.
- Update setup/run/test instructions whenever scripts or tooling change.
- Include at least one runnable example for any new command.

## Roadmap

- Faster scan execution with more aggressive parallelism.
- Optional interactive TUI for browsing space usage.
- Smarter cleanup recommendations based on file patterns and age.
- Cross-distro cleanup profiles.
