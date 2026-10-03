# Userscripts Collection

<p align="center">
  <b>English</b> | <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/BasimovIF-AI/userscripts"><img src="https://img.shields.io/badge/GitHub-BasimovIF--AI%2Fuserscripts-181717?logo=github" alt="GitHub Repository"></a>
  <a href="https://greasyfork.org/en/users/1522624-basimovif-ai"><img src="https://img.shields.io/badge/GreasyFork-BasimovIF--AI-red.svg" alt="GreasyFork Profile"></a>
</p>

A collection of multipurpose Tampermonkey & Violentmonkey userscripts for web automation, workflow acceleration, and browser productivity across various platforms.

> **Documentation:** [AGENTS.md](AGENTS.md) | [CHANGELOG.md](CHANGELOG.md) | [build.ps1](build.ps1)

---

## 📦 Scripts Catalog

| Script | Version | Direct Install (Raw) | Description |
| :--- | :---: | :---: | :--- |
| **GreasyFork Auto-Publisher Bridge** | `1.0.0` | [Install](https://raw.githubusercontent.com/BasimovIF-AI/userscripts/main/greasyfork-auto-publisher.user.js) | Automates script publishing and version updating on GreasyFork via URL query triggers. |

---

## 🚀 Script Highlights

### GreasyFork - Auto-Publisher Bridge (`v1.0.0`)
- **Target URLs**: `https://greasyfork.org/*/script_versions/new*`, `https://greasyfork.org/*/scripts/*/versions/new*`
- **Key Features**:
  - Automatically fetches source code from GitHub repositories when opened with URL parameters.
  - Inserts code into GreasyFork form (supports plain textareas and CodeMirror editors).
  - Automatically selects Markdown formatting for additional info.
  - Floating UI overlay with a 3-second countdown and a manual cancellation button (`[Cancel]`).
  - Automatically submits the form.

#### Usage Example:
Opening this URL in your browser will automatically fetch, fill, and submit the script:
```text
https://greasyfork.org/ru/script_versions/new?auto_publish=steamgifts-chance-per-point.user.js
```

---

## 🛠️ Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Click **Install** in the table above.
3. Confirm installation in your browser extension.

---

## 📄 License

This repository is licensed under the [MIT License](LICENSE).
