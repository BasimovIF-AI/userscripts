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
