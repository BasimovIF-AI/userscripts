# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Monorepo 2.0.0] - 2026-10-04
### Added
- Consolidated all standalone userscripts into a single monorepo structure:
  - `greasyfork-auto-publisher/`
  - `steamgifts/` (4 automation scripts & publishing tools)
  - `aistudio-folders/`
  - `wb-ozon-comparator/`
  - `steam-licenses/`
  - `steamdb-links/`
  - `huggingface-notes/`
  - `school-pocket-money/`
  - `lestrades-toolkit/`
- Implemented strict Deny-All Whitelist `.gitignore` standard (rev 8).
- Central index showcase in `README.md`.

## [GreasyFork Auto-Publisher Bridge - 1.1.0] - 2026-09-27
### Added
- Rich bilingual Markdown descriptions for all SteamGifts scripts (features, math formulas, links).
- Robust fallback selection for GreasyFork additional info textarea.
- Reliable Markdown radio button activation.
- Interactive control buttons in overlay: **`[Publish Now]`** and **`[Pause / Review]`**.
- Changelog autofill on script update pages.

---

## [GreasyFork Auto-Publisher Bridge - 1.0.0] - 2026-09-27
### Added
- Automated script code fetching from GitHub raw endpoints via `GM_xmlhttpRequest`.
- URL query triggers (`auto_publish`, `auto_update`, `auto_url`, `repo`, `user`).
- Dual editor support (native `textarea` & `CodeMirror` syntax highlighting).
- Floating UI overlay with status indicator and countdown timer.
