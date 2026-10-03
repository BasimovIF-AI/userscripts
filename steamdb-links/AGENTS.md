# AGENTS.md — Operational Manual: userscript-steamdb-links

## 1. Миссия, KPI и границы проекта (Mission & Scope)

- **Миссия:** Ультралегковесный Tampermonkey-юзерскрипт (`steamdb_link_game.user.js`) для страниц каталога бесплатных пакетов SteamDB (`https://steamdb.info/freepackages/*`) и страниц подписок (`https://steamdb.info/sub/*`), трансформирующий клики по SubID в моментальный переход на страницы конкретных игр Steam (`store.steampowered.com/app/<AppID>/`) с нулевой нагрузкой на DOM (In-Place Link Transformation).
- **Ключевые KPI:**
  - Zero-DOM Overhead: полное отсутствие вставки новых узлов, кнопок и элементов оберток (предотвращение reflow/repaint таблицы на 1000+ строк).
  - Мгновенная реакция: прямая подмена атрибута `href` существующих ссылок.
  - 100% отказоустойчивость: автоматический fallback на `store.steampowered.com/sub/<subId>/` при ошибках страницы SteamDB (HTTP 451/404).
- **Границы и ограничения (Scope / Non-Goals):**
  - **In-Scope:** Инъекция логики в `#freepackages` и `#loading`, извлечение AppID со страниц `/sub/*`, переход по хэшу `#autosteam`.
  - **Non-Goals:** Автоматическая активация лицензий в Steam (скрипт служит исключительно навигатором).

---

## 2. Сборка и верификация (Build & Verification)

- **Команда сборки и валидации:**
  ```powershell
  pwsh -NoProfile -File build.ps1
  ```
- **Синтаксическая проверка скрипта:**
  ```powershell
  node -c steamdb_link_game.user.js
  ```

---

## 3. Архитектурные правила и инварианты

1. **In-Place Link Transformation (v3.2.0):**
   Скрипт находит все ссылки `a[href*="/sub/"]` и модифицирует их атрибуты:
   - Добавляет хэш `#autosteam` к URL перехода на SteamDB.
   - Выставляет data-атрибут `data-tm-autosteam="true"` для защиты от повторной обработки.
   - Стилизуется легковесным псевдоэлементом `::after` (`🚀`) без создания дочерних DOM-тегов.
2. **Маршрутизация `#autosteam` на странице `/sub/*`:**
   При открытии страницы пакета с хэшем `#autosteam`:
   - Скрипт извлекает ссылку на первое приложение из таблицы приложений `table.table-apps a[href*="/app/"]`.
   - Если приложение найдено — выполняет моментальный редирект на страницу магазина Steam `https://store.steampowered.com/app/<AppID>/`.
   - Если таблица отсутствует (региональный блок / 451 / 404) — редиректит на `https://store.steampowered.com/sub/<subId>/`.

---

## 4. Подводные камни и нетривиальные решения

1. **Динамическая подгрузка лога активации:**
   Блок `#loading` на странице `freepackages` наполняется скриптами SteamDB в реальном времени. Скрипт использует дебаунсированный `MutationObserver` (200 мс) для пакетной разметки ссылок без лагов интерфейса.
2. **CSP и изоляция:**
   Скрипт работает в изолированном контексте Tampermonkey (`@grant none`, `@run-at document-idle`), не требуя повышенных привилегий.
