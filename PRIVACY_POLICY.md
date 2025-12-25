# Privacy Policy for GitHub Look-Around

**Last Updated:** December 17, 2025

## Overview

GitHub Look-Around is a browser extension that provides a command palette for quickly searching and navigating GitHub repositories, pull requests, and issues. We are committed to protecting your privacy and being transparent about what data we collect and how we use it.

## What Data We Collect

### 1. GitHub Personal Access Token
- **What:** Your GitHub personal access token that you provide during setup
- **Why:** To authenticate API requests to GitHub on your behalf
- **Storage:** Stored locally in your browser's encrypted storage (browser.storage.local)
- **Sharing:** Never shared with anyone. Only sent directly to GitHub's API (api.github.com) for authentication

### 2. GitHub Data (Repositories, Pull Requests, Issues)
- **What:** Metadata about your GitHub repos, PRs, and issues including:
  - Repository names, descriptions, and statistics
  - Pull request titles, numbers, and states
  - Issue titles, numbers, and states
  - User avatars (loaded from github.com)
- **Why:** To enable fast offline search and instant results in the command palette
- **Storage:** Cached locally in your browser's IndexedDB
- **Sharing:** Never shared. This data stays on your device

### 3. Usage Data
- **What:** Local tracking of which GitHub repos, PRs, and issues you visit
- **Why:** To show "recently visited" items and improve search relevance
- **Storage:** Stored locally in IndexedDB (visit counts, timestamps)
- **Sharing:** Never shared. This data never leaves your device

### 4. User Preferences
- **What:** Your extension settings including:
  - Import preferences (which content to sync)
  - Keyboard shortcut preferences (where to activate the command palette)
  - Theme preferences
  - Debug mode settings
- **Why:** To customize the extension's behavior to your preferences
- **Storage:** Stored locally in browser.storage.local
- **Sharing:** Never shared

## What Data We Do NOT Collect

- ❌ No browsing history outside of GitHub
- ❌ No analytics or telemetry
- ❌ No tracking pixels or third-party cookies
- ❌ No personal information beyond what GitHub provides
- ❌ No data sent to our servers (we don't have any servers)

## How We Use Your Data

All data collected is used **exclusively** for the extension's core functionality:

1. **Authentication:** Your GitHub token authenticates API requests to GitHub
2. **Search:** Cached GitHub data enables instant fuzzy search in the command palette
3. **Navigation:** Visit history helps you quickly return to recently viewed items
4. **Personalization:** Settings control how and where the extension operates

## Data Sharing and Third Parties

**We do not share any data with third parties. Period.**

The only external communication is:
- **GitHub API** (api.github.com) - Direct API calls using your personal access token to fetch your repos, PRs, and issues
- **GitHub CDN** (github.com) - Loading user avatar images for display in search results

All data remains on your device. We have no servers, no backend, and no data collection infrastructure.

## Data Security

- Your GitHub token is stored in browser.storage.local, which is encrypted by the browser
- All data is stored locally in your browser (IndexedDB and browser.storage)
- API calls to GitHub use HTTPS for secure transmission
- The extension follows the principle of least privilege - it only requests permissions necessary for its functionality

## Data Retention

- **GitHub Token:** Stored until you remove it via the extension settings or uninstall the extension
- **Cached Data:** Stored indefinitely until you clear it via the extension options page or uninstall
- **Visit History:** Stored indefinitely until you clear it or uninstall the extension
- **Preferences:** Stored until you change them or uninstall the extension

## Your Data Rights

You have full control over your data:

- **Access:** All data is stored locally in your browser - you can inspect it using browser developer tools
- **Deletion:** Clear all data by using the "Clear All Data" button in the extension options page
- **Removal:** Uninstalling the extension removes all stored data
- **Token Revocation:** Revoke your GitHub token anytime at https://github.com/settings/tokens

## Host Permissions Explanation

The extension requests "Access your data for all websites" permission because:

1. **GitHub.com by default:** The command palette runs on GitHub.com to inject the search overlay
2. **Optional custom hosts:** Users can enable the palette on enterprise GitHub instances or other Git hosting sites
3. **Runtime checks:** The extension only activates on sites you explicitly enable in settings
4. **No tracking:** The permission is for UI injection only - we don't track browsing on any site

## Updates to This Policy

We may update this privacy policy from time to time. Updates will be reflected by the "Last Updated" date at the top of this document. Continued use of the extension after updates constitutes acceptance of the changes.

## Contact

Questions or concerns about privacy?

- **GitHub Issues:** https://github.com/amberpixels/git-look-around/issues
- **Project Page:** https://amberpixels.io/git-look-around
- **Source Code:** https://github.com/amberpixels/git-look-around (fully open source - audit our code anytime)

## Open Source Commitment

GitHub Look-Around is fully open source. You can audit our code at any time to verify these privacy practices:
- Repository: https://github.com/amberpixels/git-look-around
- License: MIT License

If you find any privacy concerns in our code, please report them immediately via GitHub Issues.
