# AGENTS.md — Operational Manual: Userscripts Collection & Distribution Hub

## 1. Миссия, KPI и границы проекта (Mission & Scope)

- **Миссия:** Единый централизованный репозиторий-витрина (Showcase & Distribution Hub) для публикации, каталогизации и автоматической дистрибьюции многоцелевых браузерных Tampermonkey / Violentmonkey скриптов на GitHub и GreasyFork.
- **Ключевые KPI:**
  - 100% доступность прямых ссылок на установку (`https://raw.githubusercontent.com/BasimovIF-AI/userscripts/main/*.user.js`).
  - Нулевая ручная рутина при публикации новых версий на GreasyFork (автоматизация через `greasyfork-auto-publisher.user.js`).
  - Синхронизация каталогов в двуязычной документации (`README.md` / `README.ru.md`) при добавлении каждого нового скрипта.
- **Границы и ограничения (Scope / Non-Goals):**
  - **In-Scope:** Хранение чистовых релизных файлов `.user.js`, ведение единой таблицы скриптов со ссылками на установку, скрипт-мост `greasyfork-auto-publisher.user.js`.
  - **Non-Goals:** Хранение тяжелых промежуточных дампов, сырых логов и мокапов (глубокая разработка ведется в профильных изолированных папках `TM_Scritps/<проект>`).

---

## 2. Сборка и верификация (Build & Verification)

- **Команда проверки синтаксиса и создания архива:**
  ```powershell
  pwsh -NoProfile -File build.ps1
  ```
- **Проверка синтаксиса всех скриптов в хабе:**
  ```powershell
  Get-ChildItem -Filter "*.user.js" | ForEach-Object { node -c $_.FullName }
  ```

---

## 3. Архитектурные правила и регламент публикации

1. **Регламент добавления нового юзерскрипта в Хаб:**
   - Скопировать релизный файл `<name>.user.js` из рабочего проекта в корень этого репозитория.
   - Проверить наличие обязательных метаданных Tampermonkey (`@name`, `@version`, `@description`, `@author`, `@match`, `@grant`).
   - Добавить строку в таблицу каталога `README.md` и `README.ru.md` с прямой ссылкой `https://raw.githubusercontent.com/BasimovIF-AI/userscripts/main/<name>.user.js`.
   - Запустить `build.ps1` для синтаксической валидации и архивации.
2. **Архитектура `greasyfork-auto-publisher.user.js`:**
   Скрипт перехватывает URL-параметры на `https://greasyfork.org/*/script_versions/new*` и `.../scripts/*/versions/new*`:
   - `?auto_publish=<filename>.user.js` — автоматическая первичная публикация скрипта.
   - `?auto_update=<filename>.user.js` — обновление существующего скрипта.
   - Загружает актуальный код через `GM_xmlhttpRequest`, вставляет в редактор, выставляет Markdown и отправляет форму после 3-секундного обратного отсчета.

---

## 4. Подводные камни и нетривиальные решения

1. **Обход CodeMirror в форме GreasyFork:**
   GreasyFork использует редактор CodeMirror поверх стандартной `textarea`. Прямая запись в `textarea.value` игнорируется CodeMirror. Скрипт-мост детектирует экземпляр CodeMirror (`editor.setValue(...)`) и одновременно диспатчит нативные события `input` и `change` для совместимости.
2. **Безопасная отмена авто-публикации:**
   Плавающий оверлей с кнопкой `[Отмена]` и 3-секундным таймером защищает от случайной публикации ошибочных ссылок.
