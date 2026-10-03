# SteamGifts Userscripts Suite

<p align="center">
  <b>English</b> | <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/BasimovIF-AI/steamgifts-userscripts"><img src="https://img.shields.io/badge/GitHub-BasimovIF--AI%2Fsteamgifts--userscripts-181717?logo=github" alt="GitHub Repository"></a>
  <a href="https://greasyfork.org/en/users/1522624-basimovif-ai"><img src="https://img.shields.io/badge/GreasyFork-BasimovIF--AI-red.svg" alt="GreasyFork Profile"></a>
</p>

A curated collection of lightweight, high-performance Tampermonkey / Violentmonkey userscripts designed to enhance your experience on [SteamGifts](https://www.steamgifts.com).

> **Documentation:** [AGENTS.md](AGENTS.md) | [CHANGELOG.md](CHANGELOG.md) | [build.ps1](build.ps1)

---

## 📦 Scripts Overview

| Script | Version | GreasyFork | Direct Install (Raw) | Description |
| :--- | :---: | :---: | :---: | :--- |
| **Chance Per Point (‱)** | `7.0.0` | [Browse](https://greasyfork.org/en/scripts/by-site/steamgifts.com?filter_locale=0) | [Install](https://raw.githubusercontent.com/BasimovIF-AI/steamgifts-userscripts/main/steamgifts-chance-per-point.user.js) | Adds win chance per point in basis points (‱) & filter panel on entered giveaways. |
| **Group Stats Checker** | `1.7.0` | [Browse](https://greasyfork.org/en/scripts/by-site/steamgifts.com?filter_locale=0) | [Install](https://raw.githubusercontent.com/BasimovIF-AI/steamgifts-userscripts/main/steamgifts-group-stats-checker.user.js) | Interactive giveaway group stats checker & creator comment autofill. |
| **Region Auto-Selector** | `1.5.0` | [Browse](https://greasyfork.org/en/scripts/by-site/steamgifts.com?filter_locale=0) | [Install](https://raw.githubusercontent.com/BasimovIF-AI/steamgifts-userscripts/main/steamgifts-region-auto-selector.user.js) | Cloudflare bypass via SteamDB tab to auto-select restricted countries on giveaway creation. |
| **Unlucky-7 Winner Stats & Copy** | `1.4.1` | [GreasyFork #580030](https://greasyfork.org/en/scripts/580030-steamgifts-unlucky-7-winner-stats-copy) | [Install](https://raw.githubusercontent.com/BasimovIF-AI/steamgifts-userscripts/main/steamgifts-unlucky-7-winner-stats-copy.user.js) | Detailed stats for Unlucky-7 group winners with 1-click clipboard copy. |

---

## 🚀 Features & Details

### 1. SteamGifts - Chance Per Point (‱) (`v7.0.0`)
- **Target URL**: `https://www.steamgifts.com/giveaways/entered*`
- **What it does**:
  - Calculates win chance per point: `(Copies / (Entries * Points)) * 10,000‱`.
  - Injects a new column into the entered giveaways table.
  - Adds a dynamic filtering bar at the top allowing you to hide giveaways with a chance above your specified value.
  - Fully bilingual interface (English / Russian) automatically adapting to browser language.

---

### 2. SteamGifts - Group Stats Checker (Universal) (`v1.7.0`)
- **Target URL**: `https://www.steamgifts.com/giveaway/*`
- **What it does**:
  - Discovers all groups associated with the giveaway and generates interactive stat buttons.
  - Fetches and verifies sent vs received gifts and dollar value difference (`sent - received`).
  - Interactive clickable formula: click to expand exact difference calculation and total `Gifts Won`.
  - Color-coded validation: green for mathematical match, red for discrepancy.
  - Autofills polite creator thank-you comment in description textarea if empty.

---

### 3. SteamGifts - Region Auto-Selector via SteamDB Tab (`v1.5.0`)
- **Target URL**: `https://www.steamgifts.com/giveaways/new`, `https://steamdb.info/sub/*`
- **What it does**:
  - Eliminates manual country selection when creating region-locked giveaways.
  - Simply enter the Steam package SubID (e.g. `828967`) and click **Apply**.
  - Opens a temporary SteamDB tab to retrieve restriction data (bypassing Cloudflare protection seamlessly) and closes it automatically.
  - Automatically checks all restricted countries on SteamGifts and warns about unmatched country codes.

---

### 4. SteamGifts - Unlucky-7 Winner Stats & Copy (`v1.4.1`)
- **Target URL**: `https://www.steamgifts.com/giveaway/*/winners`
- **What it does**:
  - Runs on giveaway winners page if the giveaway is hosted for the `Unlucky-7` group.
  - Displays winner gift difference and value difference with expandable mathematical breakdown.
  - 1-click clipboard copy button formatted specifically for group accounting:
    - `<= 8 wins`: `GA: <url>\nWinner: <user> (Xth win)`
    - `> 8 wins`: `GA: <url>\nWinner: <user> (Gifter, +X)`

---

## 🛠️ Installation

1. Install a userscript manager extension:
   - [Tampermonkey](https://www.tampermonkey.net/) (Recommended)
   - [Violentmonkey](https://violentmonkey.github.io/)
2. Click on the **Install** link in the table above or install directly from [GreasyFork](https://greasyfork.org/en/users/1522624-basimovif-ai).
3. Confirm the script installation in your userscript manager.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
