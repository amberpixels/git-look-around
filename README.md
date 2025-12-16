# Git Look Around

> Lightning-fast command palette for GitHub repos, PRs, and issues.

A Chrome/Firefox extension that drops a command palette on any GitHub repo, PR, or issue so you can jump without breaking flow. Built with Vue 3 + WXT; Firefox build is work in progress (packaging TBD).

## What it does
- Toggle the overlay from any GitHub page: `Cmd+Shift+K` (macOS) / `Ctrl+Shift+K` (Linux/Windows).
- Fuzzy search across repos, PRs, and issues with ghost-text hints for the top hit.
- Filter to your contributions or visited items; per-repo badges show PR/issue counts at a glance.
- Popup shows sync status and rate limits, with quick options to reload or open settings.

## Why this palette?
- Lighter and more focused than GitHub’s feature-preview palette—built for fast navigation.
- Reactive results: new repos/PRs/issues appear as soon as sync finishes; no GitHub reload needed.
- Quick hop back to recent places (visited filter), inspired by fast switchers in modern IDEs.

## Download & links
- Chrome Web Store: coming soon (placeholder).
- Firefox Add-ons: work in progress (built with WXT, packaging TBD).
- Landing page: https://eugene.md/git-look-around
- Keyboard shortcuts: `chrome://extensions/shortcuts` to remap the toggle command.
- Questions or support? Open an issue in this repo.

## Demo
- GIF/video demo coming soon.

## Coming soon
- Firefox build: tested, release packaging in progress.
- VIM mode: modal hotkeys for faster keyboard-only navigation.

## Development
- Requirements: Node 18.17+ (or 20+), pnpm 9+.
- Install deps: `pnpm install`
- Dev: `pnpm dev` (Chrome) or `pnpm dev:firefox`
- Build: `pnpm build` or `pnpm build:firefox`
