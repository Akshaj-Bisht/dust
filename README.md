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
# Show command help
bun run src/index.ts --help

# Scan home and show top 10 directories
bun run src/index.ts scan

# Scan a specific path and return JSON
bun run src/index.ts scan /var --top 15 --json

# Preview cleanup only
bun run src/index.ts clean all --dry-run

# Clean cache without prompt
bun run src/index.ts clean cache --yes
```

## Command Reference

- `dust scan [path] --top <n> --json --verbose`
  - Reports largest folders in the target path.
  - Ignores noisy system paths by default (`/proc`, `/sys`, `/dev`, etc.).
- `dust clean [target] --dry-run --yes --stale-days <days> --verbose`
  - `target`: `cache`, `tmp`, `logs`, or `all`.
  - Uses safety checks to avoid deleting critical paths.
  - `tmp` and `logs` cleanup apply stale-age filtering (`--stale-days`, default `3`).

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

## Roadmap

- Faster scan execution with more aggressive parallelism.
- Optional interactive TUI for browsing space usage.
- Smarter cleanup recommendations based on file patterns and age.
- Cross-distro cleanup profiles.
