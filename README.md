# GitHub Look-Around

> Lightning-fast command palette for GitHub repos, PRs, and issues.

A Chrome/Firefox extension that adds a command palette to GitHub so you can jump to repos, pull requests, and issues without losing your flow. It syncs your GitHub data in the background, shows rate-limit awareness, and stays out of the way until you hit the shortcut.

## What it does

- Toggle the overlay with `Cmd+Shift+K` (macOS) or `Ctrl+Shift+K` (Linux/Windows) from any GitHub page.
- Fuzzy search across repos, PRs, and issues with a single input and ghost-text suggestions for the top hit.
- Filter to just your contributions or items you have visited; per-repo badges show PR/issue counts at a glance.
- Popup panel shows sync status, rate limits, and lets you reload or jump to options.

## Demo

_Video demo coming soon - check back for a live demo!_

![Command Palette in action](https://amberpixels.io/git-look-around/screenshot1-chrome.png)
![Search and navigation](https://amberpixels.io/git-look-around/screenshot2-chrome.png)

[View more on the Chrome Web Store →](https://chromewebstore.google.com/detail/github-look-around/dfccngcojkfnbjmocdicmobjhhkbopco)

## Why this palette?

- GitHub's feature-preview Command Palette is heavier and broader; GitHub Look-Around stays lightweight and focused on fast search + navigation.
- Everything is reactive: as soon as sync finishes, repo/PR/issue results update without reloading GitHub.
- Quick hop back to recent places (visited filter), inspired by the fast-switcher experience in modern IDEs.

## Download & Links

- Chrome Web Store: https://chromewebstore.google.com/detail/github-look-around/dfccngcojkfnbjmocdicmobjhhkbopco
- Firefox Add-ons: Coming soon ([track progress](https://github.com/amberpixels/git-look-around/issues/1))
- Landing page: https://amberpixels.io/git-look-around
- Source & updates: https://github.com/amberpixels/git-look-around
- Keyboard shortcuts: `chrome://extensions/shortcuts` lets you remap the toggle command if you prefer a different combo.
- Questions or support? Open an issue on GitHub.

## Coming soon

- [Firefox support](https://github.com/amberpixels/git-look-around/issues/1) - tested, release packaging in progress
- VIM mode - modal hotkeys for faster keyboard-only navigation

## Under the hood

- Built with Vue 3 + WXT; background workers index your GitHub repos, pull requests, and issues for fast local filtering.
- Content script mounts the command palette UI directly on GitHub; the popup detects the current repo and lets you force a sync if needed.
- Icons and branding come from the extension bundle; keep assets under `/git-look-around/` when updating this page.

## Development

- Requirements: Node 18.17+ (or 20+), pnpm 9+.
- Install deps: `pnpm install`
- Dev: `pnpm dev` (Chrome) or `pnpm dev:firefox`
- Build: `pnpm build` or `pnpm build:firefox`
