# AGENTS.md — Operational Manual: userscript-aistudio-folders

## 1. Миссия, KPI и границы проекта (Mission & Scope)

- **Миссия:** Автономный Tampermonkey-юзерскрипт (`aistudio-search-folders.user.js`) для веб-интерфейса Google AI Studio (`https://aistudio.google.com/*`), добавляющий полнотекстовый поиск по всем сообщениям (включая скрытые блоки размышлений `Thought`), древовидные иерархические папки для диалогов и нативную автосинхронизацию структуры папок через внутренний RPC Google Диска (MakerSuite Service).
- **Ключевые KPI:**
  - 100% полнота локального поискового индекса по всем диалогам пользователя.
  - Zero-Latency UI: рендеринг дерева папок и фильтрации мгновенно из IndexedDB без ожидания сетевых ответов.
  - Автоматическая синхронизация структуры через скрытый системный файл `[AI Studio Enhancer Sync]` на Google Диске пользователя без внешних сторонних серверов.
  - Бесшовное перехватывание токенов авторизации через `window.fetch` при загрузке страницы (`@run-at document-start`).
- **Границы и ограничения (Scope / Non-Goals):**
  - **In-Scope:** Индексация сообщений диалогов, дерево папок (drag-and-drop, вложенность), нативный RPC Google (`MakerSuiteService`), IndexedDB, перехват сетевых заголовков.
  - **Non-Goals:** Отправка запросов к сторонним API, генерация ответов вместо моделей Gemini.

---

## 2. Сборка и верификация (Build & Verification)

- **Команда сборки и валидации:**
  ```powershell
  pwsh -NoProfile -File build.ps1
  ```
- **Синтаксическая проверка скрипта:**
  ```powershell
  node -c aistudio-search-folders.user.js
  ```

---

## 3. Архитектурные правила и инварианты

1. **Единый самодостаточный юзерскрипт (`aistudio-search-folders.user.js`):**
   Работает без внешних библиотек при `@run-at document-start` для гарантированного перехвата сетевых заголовков авторизации Google AI Studio.
2. **Слой хранения IndexedDB (`AISDatabase`):**
   - База: `AIStudioEnhancedDB` (версия 1).
   - Таблица `prompts`: метаданные и тело диалогов, привязка `folderId`.
   - Таблица `folders`: иерархия папок с поддержкой `parentId` (древовидная структура).
3. **Облачная синхронизация через Google Диск (`AISDriveSync`):**
   - Использует эндпоинт `MakerSuiteService` (`$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService`).
   - Сохраняет структуру папок и привязки внутри служебного файла `[AI Studio Enhancer Sync]`.
   - Кэширует заголовки авторизации (`authorization`, `x-goog-api-key`, `x-goog-authuser`) в `localStorage`.
4. **Безопасность сетевого слоя (`AISApiClient`):**
   - Перехват `fetch` через `unsafeWindow.fetch` или `window.fetch`.
   - Клонирование тела запроса RPC для формирования валидных envelope-запросов к Google API.

---

## 4. Подводные камни и нетривиальные решения

1. **Перехват заголовков Google RPC:**
   Google AI Studio использует внутренний протокол RPC с динамическими токенами. Скрипт перехватывает первый валидный исходящий запрос к `MakerSuiteService` и кэширует заголовки для фонового опроса.
2. **Дедупликация и защита от Race Conditions в облачном Sync:**
   Для исключения параллельных конфликтующих записей на Диск методы `pushToDrive` и `pullFromDrive` используют shared-промисы (`activePushPromise`, `activePullPromise`) и дебаунс в 5 секунд.
3. **Изоляция стилей в Angular / Material Web Components:**
   AI Studio использует Web Components и Angular. Дерево папок инжектируется в левый сайдбар с префиксами `.ais-*` и динамическим расчетом высоты для предотвращения сдвигов интерфейса.
4. **Интеграция в левый Angular-сайдбар (`ms-nav-items-main-v2`) и нативную шестерёнку (`⚙️ Settings`):**
   Дерево папок монтируется строго под элементом `History` внутри раздела `EXPLORE` (с явной фильтрацией, исключающей захват ссылки `Playground` `/prompts/new_chat`). Разделы `BUILD` и `MANAGE` скрываются через `applyBuildManageVisibility`. Настройки расширения встроены непосредственно в нативное всплывающее меню штатной кнопки `⚙️ Settings` (`mat-mdc-menu-panel`) через наблюдатель CDK-оверлея, исключая создание сторонних кнопок в сайдбаре. Управление папками переведено на контекстное меню (ПКМ) и клавишу F2.
5. **Адаптивность к светлой и темной темам без ложного срабатывания:**
   Удалены прямые привязки к системному медиа-запросу `@media (prefers-color-scheme: dark)`, вызывавшему почернение окна настроек при тёмной теме Windows и светлом оформлении сайта. Динамический `detectAiStudioTheme()` замеряет вычисленный цвет фона ключевых контейнеров (`ms-library-page`, `main`, `.mat-drawer-content`) и синхронизирует классы темы на `body` и `#ais-modal-backdrop` как через `MutationObserver`, так и при каждом открытии модального окна (`openModal()`).
6. **Нативный монохромный дизайн, выровненный поиск и компактные фильтры:**
   Интерфейс скрипта строго следует монохромному дизайну Google AI Studio (полный отказ от синих акцентов `#1a73e8`, нейтральные границы `#dadce0`/`#3c4043`). Контейнер `.ais-search-wrapper` имеет `position: relative`, а блок фильтров `.ais-scope-dots-row` спозиционирован абсолютно (`top: calc(100% + 3px); right: 0;`), благодаря чему высота контейнера поиска равна высоте поля ввода (36px), и строка поиска выровнена строго по центру одной линии с заголовком `History`. Фильтры выполнены в стиле Notion / Linear со сверхкомпактным шрифтом `9px`, микро-точками `4px` (чёрная при включении, светло-серая при выключении) и зазором `gap: 3.5px`. В полосе над таблицей (`.ais-lib-top-bar`) остаются только хлебные крошки папок. Активная вкладка в окне настроек оформлена как мягкий нейтральный чип Google Chip (`#e8eaed`). Статусный индикатор синхронизации (`.ais-cloud-drive-dot`) монтируется непосредственно перед `<ms-library-search-bar>` на общей оптической оси (`y = 96px`).
7. **Безотказная Protobuf-Native синхронизация (Google Drive Sync):**
   Для исключения ошибок десериализации Google MakerSuite `HTTP 400 (Unexpected list for single non-message field)` скрипт не пытается конструировать синтетические массивы реплик `root[2] = [["user", ...]]`. Вместо этого методы `AISParser.findSyncPayload()` и `AISParser.findAndReplaceSyncPayload()` аккуратно находят текстовое поле в существующей реплике клонированного диалога и подменяют строку полезной нагрузки `AIS_SYNC_PAYLOAD::...`, сохраняя 100% исходной protobuf-структуры дерева Google. Метод `CreatePrompt([root])` и `UpdatePrompt([root])` отрабатывают с `HTTP 200 OK`. В карточке настроек статус отображается в нативном бейдже Google Status Pill (`.ais-sync-badge` с микро-точкой 7px и временем последней синхронизации).
8. **Регламент релизов и синхронизации с монорепозиторием GitHub (`BasimovIF-AI/userscripts`):**
   При выпуске любого релиза (SemVer `vMAJOR.MINOR.PATCH`) агент ОБЯЗАН:
   1. Выполнить синтаксическую валидацию `node -c aistudio-search-folders.user.js` и сборку `build.ps1`.
   2. Закоммитить изменения в локальном репозитории `userscript-aistudio-folders`.
   3. Скопировать актуальные файлы проекта (`aistudio-search-folders.user.js`, `CHANGELOG.md`, `README.md`, `AGENTS.md`, `build.ps1`) в монорепозиторий `E:\Ильгиз\Documents\VibeCoding\TM_Scripts\userscript-hub\aistudio-folders\`.
   4. Зафиксировать обновление в `userscript-hub/CHANGELOG.md`.
   5. Закоммитить и выполнить обязательный `git push origin main` в приватный репозиторий `https://github.com/BasimovIF-AI/userscripts.git`.
