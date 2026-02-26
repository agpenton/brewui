# brewui

A keyboard-driven TUI for Homebrew bundle inventory and package maintenance.

Layout:
- Left pane: package list
- Top-right pane: local package details (from Brewfile parsing/state)
- Bottom-right pane: source info output (`brew info` / `mas info`)

## Requirements

- macOS
- Homebrew installed
- Node.js 20+
- pnpm

## Quick start

```bash
pnpm install
pnpm dev
```

Ghostty note:
- `brewui` auto-falls back to `TERM=xterm-256color` when it detects Ghostty to avoid a `blessed` terminfo parsing crash.
- Manual fallback (if needed): `TERM=xterm-256color pnpm dev`

## Scripts

- `pnpm dev` run TUI in development
- `pnpm build` compile TypeScript
- `pnpm start` run compiled app
- `pnpm test` run tests

## Publishing

- GitHub Actions workflow: `.github/workflows/publish.yml`
- Triggered on tags matching `v*` (example: `v0.1.1`) or manual run (`workflow_dispatch`)
- Required repository secret: `NPM_TOKEN` (npm automation token with publish access)

## Keybindings

- `d` dump Brewfile (`brew bundle dump --force`)
- `r` refresh from Brewfile
- `j`/`k` or arrows move selection
- `/` filter list
- `enter` fetch selected item source info (`brew info` / `mas info`)
- `x` delete selected package (confirmation required)
- `c` run `brew cleanup` (confirmation required)
- `q` quit
