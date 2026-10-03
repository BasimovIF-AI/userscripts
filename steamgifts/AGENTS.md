# AGENTS.md — Operational Manual: steamgifts-userscripts

## 1. Миссия, KPI и границы проекта (Mission & Scope)

- **Миссия:** Высокопроизводительный пакет Tampermonkey / Violentmonkey скриптов для платформы SteamGifts, обеспечивающий автоматизацию анализа раздач, сверку правил региональных ограничений, аудит статистики групп и бесшовную публикацию на GreasyFork.
- **Ключевые KPI:**
  - 0 ложных срабатываний фильтров раздач на странице `giveaways/entered`.
  - Мгновенный расчет шанса на 1 очко в базисных пунктах (‱) без замедления отрисовки страницы.
  - 100% надежность межвкладочного транспорта SteamGifts $\longleftrightarrow$ SteamDB при создании раздач.
  - Автономная публикация и обновление версий на GreasyFork через постоянный мост браузера.
- **Границы и ограничения (Scope / Non-Goals):**
  - **In-Scope:** 4 клиентских юзерскрипта (`chance-per-point`, `group-stats-checker`, `region-auto-selector`, `unlucky-7-winner-stats-copy`), инструменты автоматизации публикации (`tools/greasyfork-*`).
  - **Non-Goals:** Автоматический спам или обход капчи SteamGifts; проект строго соблюдает правила сообщества SteamGifts.

---

## 2. Сборка и верификация (Build & Verification)

- **Команда сборки и верификации пакета:**
  ```powershell
  pwsh -NoProfile -File build.ps1
  ```
- **Проверка синтаксиса всех юзерскриптов:**
  ```powershell
  Get-ChildItem -Filter "*.user.js" | ForEach-Object { node -c $_.FullName }
  ```
- **Запуск локального сервера публикации GreasyFork CLI:**
  ```powershell
  node tools/greasyfork-cli.js
  ```

---

## 3. Архитектурные правила и инварианты

1. **Компонентная изоляция юзерскриптов:**
   Каждый юзерскрипт решает строго одну задачу и имеет минимально необходимый набор прав `@grant`:
   - `steamgifts-chance-per-point`: `@grant GM_addStyle` (отслеживание и фильтрация таблицы).
   - `steamgifts-group-stats-checker`: `@grant none` (нативный контекст страницы, фоновые запросы `fetch`).
   - `steamgifts-region-auto-selector`: `@grant GM_setValue`, `GM_getValue`, `GM_deleteValue` (двухдоменный транспорт SteamGifts $\leftrightarrow$ SteamDB).
   - `steamgifts-unlucky-7-winner-stats-copy`: `@grant GM_setClipboard` (копирование форматированных данных в буфер).
2. **Межвкладочный мост SteamDB (Cross-Origin Sync):**
   При создании новой раздачи на SteamGifts скрипт открывает служебную вкладку `steamdb.info/sub/XXXX/?sg_sync=1`, парсит ограничения пакета и передает результат обратно через `GM_setValue('parsed_sub_data')`, после чего вкладка SteamDB автоматически закрывается (`window.close()`).
3. **Безопасная публикация на GreasyFork (Browser Tab Bridge v3.0):**
   Публикация на GreasyFork выполняется не через сырые headless HTTP-запросы (блокируемые Cloudflare WAF и требующие CSRF токена), а через открытую вкладку браузера под управлением `tools/greasyfork-auto-publisher.user.js` по протоколу WebSocket/HTTP к локальному демону `tools/greasyfork-cli.js:18234`.

---

## 4. Подводные камни и нетривиальные решения

1. **Базисные пункты (‱) вместо процентов:**
   Шансы на раздачах SteamGifts крайне малы (доли сотых процента). Использование стандартных процентов приводило к отображению `0.00%`. Формула переведена в базисные пункты: `copies / (entries * points) * 10000 ‱`.
2. **Debounce в MutationObserver:**
   Страница раздач при бесконечном скролле часто триггерит мутации DOM. Чтобы избежать повторных перерисовок, обработчик строк использует флаг `isProcessing` и пакетную фильтрацию.
3. **Авто-комментарии авторам раздач:**
   Скрипт `group-stats-checker` автоматически подставляет вежливое приветствие `Thanks a lot ${creatorName}!` только если поле комментария пустое, не перезаписывая введенный пользователем текст.
