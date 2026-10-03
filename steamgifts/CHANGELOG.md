# Changelog

All notable changes to the userscripts in this repository will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [GreasyFork Persistent Browser Tab Bridge - 3.0.0] - 2026-09-27
### Added
- **Persistent Browser Tab Bridge** (`tools/greasyfork-auto-publisher.user.js` v3.0.0):
  - Listens to local agent daemon (`http://127.0.0.1:18234`) from any open GreasyFork page in Firefox.
  - Floating live status badge (`⚪ Ожидание`, `🟢 На связи`, `🚀 Публикация [X/Y]`).
  - Robust `sessionStorage` state machine managing navigation, CodeMirror code injection, Markdown description styling, version update chaining, and duplicate warning overrides.
  - Reports final URLs directly back to the agent CLI upon task completion.
- **Agent Bridge CLI Server** (`tools/greasyfork-cli.js` v3.0.0):
  - Lightweight local server (port 18234) with CORS and real-time live console reporting.
  - Feeds batch publication jobs sequentially to the active browser tab.
  - Bypasses Windows Session Isolation and Cloudflare WAF entirely with 0 clicks required from the user on GreasyFork.

---

## [GreasyFork Universal Bridge & Hub - 2.1.0] - 2026-09-27
### Added
- **Universal Bridge UserScript** (`tools/greasyfork-auto-publisher.user.js` v2.1.0):
  - Completely detached from hardcoded scripts — acts as a universal automation agent bridge for any userscript.
  - Dual transport support: local machine CLI bridge (`http://127.0.0.1:18234`) and direct URL hash parameters (`#auto_code_url=...&auto_desc=...`).
  - Native page script injection for 100% reliable CodeMirror text injection and saving.
  - Automated chaining: redirects from newly created script AND updated script versions to `/admin` to populate rich Markdown descriptions.
  - Safe form submit button targeting restricting clicks strictly within script forms (preventing collision with header search forms).
  - Automatic handling of duplicate code warnings (`allow_code_previously_posted`).
- **1-Click Autopilot Hub** (`publish_to_greasyfork.html`):
  - 1-click button to sequentially publish/update all 4 scripts with automatic delays.
  - Browser popup blocker detection and user feedback.
  - Individual 1-click launch buttons and direct clipboard copy buttons for codes and rich Markdown.
- **Agent CLI** (`tools/greasyfork-cli.js`):
  - Command-line tool enabling the AI assistant to publish and update any script with one command.
  - Single mode (`--file`, `--desc`, `--id`, `--action`) and batch mode (`--all`).

---

## [GreasyFork Auto-Publisher Tool - 1.3.0] - 2026-09-27
### Added
- Local publisher hub `publish_to_greasyfork.html` with 1-click clipboard copy for code and rich Markdown descriptions.
- `tools/greasyfork-auto-publisher.user.js`: automated script publisher for GreasyFork supporting `/admin` description editing, `/versions/new` version updates, and `/script_versions/new` initial publication.
- Auto-selection of Markdown markup, CodeMirror syncing, duplicate code warning override, and 6-second countdown with pause control.

---

## [Unlucky-7 Winner Stats & Copy - 1.4.1] - 2026-09-27
### Added
- Internationalization support (English & Russian auto-switching for tooltips and console logs).
- GitHub repository links (`@homepageURL`, `@supportURL`) and `@license MIT`.

### Changed
- Standardized file name to `steamgifts-unlucky-7-winner-stats-copy.user.js`.
- Synchronized author namespace with GreasyFork profile (`basimovif-ai`).

---

## [Chance Per Point - 7.0.0] - 2026-09-27
### Added
- Bilingual UI (English / Russian) for filter labels, column headers, and action buttons.
- GreasyFork and GitHub repository metadata tags.

### Changed
- Renamed script file to `steamgifts-chance-per-point.user.js`.
- Cleaned up grid resizing logic to prevent column overflow on varied SteamGifts viewports.

---

## [Group Stats Checker - 1.7.0] - 2026-09-27
### Added
- Bilingual tooltips and UI feedback (`Check my stats`, `Formula`, `Not found`, `Error`).
- GreasyFork and GitHub repository links in metadata.

### Changed
- Renamed script file to `steamgifts-group-stats-checker.user.js`.
- Refined URL path matching to reliably handle both `/giveaway/:code/:slug` and sub-view exclusions.

---

## [Region Auto-Selector - 1.5.0] - 2026-09-27
### Added
- Bilingual interface for SubID input label, buttons, and detailed status/warning messages.
- Cloudflare bypass status guidance for temporary SteamDB tab.

### Changed
- Renamed script file to `steamgifts-region-auto-selector.user.js`.
- Standardized country difference parser between SteamDB and SteamGifts form DOM.
