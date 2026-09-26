// ==UserScript==
// @name         GreasyFork - Auto-Publisher Bridge
// @name:ru      GreasyFork - Авто-публикатор скриптов
// @namespace    https://greasyfork.org/users/1522624-basimovif-ai
// @version      1.1.0
// @description  Automates script publishing and updating on GreasyFork with rich bilingual descriptions and URL triggers.
// @description:ru Автоматизирует публикацию и обновление скриптов на GreasyFork с подробным двуязычным описанием.
// @author       basimovif-ai
// @license      MIT
// @homepageURL  https://github.com/BasimovIF-AI/userscripts
// @supportURL   https://github.com/BasimovIF-AI/userscripts/issues
// @match        https://greasyfork.org/*/script_versions/new*
// @match        https://greasyfork.org/*/scripts/*/versions/new*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      github.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    const publishFile = params.get('auto_publish');
    const updateFile = params.get('auto_update');
    const directUrl = params.get('auto_url');
    const repoName = params.get('repo') || 'steamgifts-userscripts';
    const userName = params.get('user') || 'BasimovIF-AI';
    const branchName = params.get('branch') || 'main';

    if (!publishFile && !updateFile && !directUrl) {
        return; // Скрипт не активен, если нет специальных параметров
    }

    const fileName = publishFile || updateFile || (directUrl ? directUrl.split('/').pop() : 'script.user.js');
    const targetUrl = directUrl || `https://raw.githubusercontent.com/${userName}/${repoName}/${branchName}/${fileName}`;

    // --- КРАСИВЫЕ ПОДРОБНЫЕ ОПИСАНИЯ ДЛЯ СТРАНИЦЫ СКРИПТА ---
    const richDescriptions = {
        'steamgifts-chance-per-point.user.js': `### 🎯 About / О скрипте
**EN**: Calculates your **exact win probability per single entry point in basis points (‱)** and adds a dynamic filter to hide low-yield giveaways on SteamGifts.
**RU**: Рассчитывает **точный шанс на победу за одно затраченное очко в базисных пунктах (‱)** и позволяет скрывать невыгодные раздачи на странице участий SteamGifts.

---

### 🌟 Key Features / Возможности

* **🧮 Smart Calculation / Точный расчёт шанса**:
  * **Formula / Формула**: \`(Copies / (Entries * Points)) * 10,000‱\`
  * **Basis Points (‱)**: Instead of confusing numbers like \`0.0012%\`, values are shown as clean numbers like \`12.50‱\` or \`2.40‱\` (\`1‱ = 0.01% = 0.0001\`).
  * **Dedicated Column**: Adds a styled column \`Шанс/Очко (‱)\` / \`Chance/Pt (‱)\` to the entered giveaways table.
* **🔍 Dynamic Threshold Filter / Фильтр раздач**:
  * Input your threshold (e.g. \`1.00‱\`) and click **Filter** to instantly hide giveaways with lower winning chances.
  * **Reset** button restores all rows in 1 click.
  * Automatic observation via \`MutationObserver\` for continuous scrolling/pagination.
* **🌐 Bilingual UI / Двуязычный интерфейс**:
  * UI buttons, tooltips, and column headers automatically adapt to browser language (\`RU\` / \`EN\`).

---

### 💻 Source Code & Support
* **GitHub Repository**: [https://github.com/BasimovIF-AI/steamgifts-userscripts](https://github.com/BasimovIF-AI/steamgifts-userscripts)
* **License**: [MIT License](https://opensource.org/licenses/MIT)`,

        'steamgifts-group-stats-checker.user.js': `### 👥 About / О скрипте
**EN**: Displays interactive group statistics for the user on giveaway pages and automatically fills courteous creator thank-you comments.
**RU**: Отображает интерактивные кнопки статистики пользователя в группах раздачи и автоматически заполняет вежливую благодарность создателю раздачи.

---

### 🌟 Key Features / Возможности

* **📊 Group Stat Buttons / Проверка баланса в группах**:
  * Automatically detects all groups linked to the giveaway and places stat buttons next to group indicators.
  * Fetches gifts sent vs received and dollar value difference.
  * **Color Validation**: 🟢 Green for exact match with site data, 🔴 Red for discrepancies.
* **🔍 Clickable Math Breakdown / Раскрытие формулы по клику**:
  * **Collapsed**: Summary \`(+5; +$82.50)\`.
  * **Expanded (on click)**: Exact math formula \`(12-7=+5; $150-$67.5=+$82.50)\` and total \`Gifts Won\` count!
* **✍️ Creator Thank-You Autofill / Авто-комментарий автору**:
  * Automatically fills empty description field with: \`Thanks a lot [CreatorName]!\`.

---

### 💻 Source Code & Support
* **GitHub Repository**: [https://github.com/BasimovIF-AI/steamgifts-userscripts](https://github.com/BasimovIF-AI/steamgifts-userscripts)
* **License**: [MIT License](https://opensource.org/licenses/MIT)`,

        'steamgifts-region-auto-selector.user.js': `### 🌍 About / О скрипте
**EN**: Bypasses Cloudflare by opening SteamDB in a brief temporary tab and auto-selects restricted countries when creating SteamGifts giveaways.
**RU**: Обходит Cloudflare открытием временной вкладки SteamDB и автоматически отмечает региональные ограничения при создании раздачи на SteamGifts.

---

### 🌟 Key Features / Возможности

* **🛡️ Seamless Cloudflare Bypass / Обход Cloudflare**:
  * Opens a temporary tab to let the browser natively pass Cloudflare, parses package restrictions, and closes automatically.
* **⚡ 1-Click Import by SubID / Импорт по SubID в 1 клик**:
  * Enter Steam package SubID (e.g. \`828967\`) and click **Apply**. All restricted/allowed countries are selected automatically in the SteamGifts form!
* **⚠️ Discrepancy Warnings / Сверка стран**:
  * Warns you if any country codes from SteamDB are missing from SteamGifts database.

---

### 💻 Source Code & Support
* **GitHub Repository**: [https://github.com/BasimovIF-AI/steamgifts-userscripts](https://github.com/BasimovIF-AI/steamgifts-userscripts)
* **License**: [MIT License](https://opensource.org/licenses/MIT)`,

        'steamgifts-unlucky-7-winner-stats-copy.user.js': `### 🎲 About / О скрипте
**EN**: Displays interactive winner stats for the Unlucky-7 group on giveaway pages and allows 1-click formatted clipboard copying.
**RU**: Отображает интерактивную статистику победителей группы Unlucky-7 на страницах раздач и позволяет копировать отформатированные данные в буфер обмена.

---

### 🌟 Key Features / Возможности

* **🎯 Targeted Activation / Точечная активация**:
  * Runs exclusively on giveaway winner pages (\`.../giveaway/*/winners\`) for the \`Unlucky-7\` group.
* **📊 Interactive Winner Stats / Статистика победителя**:
  * Displays gift & value difference with clickable calculation breakdown.
  * Color-coded validation: 🟢 Green for match, 🔴 Red for discrepancy.
* **📋 1-Click Copy / Копирование для отчётности**:
  * Copies formatted string tailored for group accounting:
    * \`<= 8 wins\`: \`GA: <url>\\nWinner: <user> (Xth win)\`
    * \`> 8 wins\`: \`GA: <url>\\nWinner: <user> (Gifter, +X)\`

---

### 💻 Source Code & Support
* **GitHub Repository**: [https://github.com/BasimovIF-AI/steamgifts-userscripts](https://github.com/BasimovIF-AI/steamgifts-userscripts)
* **License**: [MIT License](https://opensource.org/licenses/MIT)`
    };

    const isRu = (navigator.language || '').toLowerCase().startsWith('ru');
    const i18n = {
        title: '🤖 GreasyFork Auto-Publisher',
        loading: isRu ? `Загрузка кода из ${fileName}...` : `Fetching code for ${fileName}...`,
        loaded: isRu ? 'Все поля (код, Markdown, описание) заполнены!' : 'All fields (code, Markdown, description) filled!',
        submittingIn: (sec) => isRu ? `Авто-отправка через: ${sec} сек...` : `Auto-submitting in: ${sec}s...`,
        submitting: isRu ? 'Отправка формы на сервер...' : 'Submitting to GreasyFork...',
        nowBtn: isRu ? '🚀 Опубликовать сейчас' : '🚀 Publish Now',
        pauseBtn: isRu ? '⏸️ Пауза / Проверить' : '⏸️ Pause / Review',
        paused: isRu ? 'Авто-отправка на паузе. Вы можете проверить форму и отправить вручную.' : 'Auto-submit paused. You can review the form and submit manually.',
        errorFetch: isRu ? 'Не удалось загрузить код скрипта с GitHub' : 'Failed to fetch code from GitHub',
    };

    // 1. Создание плавающего UI-баннера
    const banner = document.createElement('div');
    banner.id = 'gf-auto-publisher-banner';
    Object.assign(banner.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '999999',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        padding: '16px 20px',
        borderRadius: '10px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        border: '2px solid #38bdf8',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: '400px',
        fontSize: '14px',
        lineHeight: '1.5'
    });

    banner.innerHTML = `
        <div style="font-weight: 700; color: #38bdf8; font-size: 15px; margin-bottom: 6px;">${i18n.title}</div>
        <div id="gf-ap-status" style="color: #cbd5e1; margin-bottom: 12px;">${i18n.loading}</div>
        <div id="gf-ap-actions" style="display: none; gap: 8px;">
            <button id="gf-ap-submit-now" style="background: #2563eb; color: white; border: none; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">${i18n.nowBtn}</button>
            <button id="gf-ap-pause" style="background: #ef4444; color: white; border: none; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">${i18n.pauseBtn}</button>
        </div>
    `;
    document.body.appendChild(banner);

    const statusEl = document.getElementById('gf-ap-status');
    const actionsEl = document.getElementById('gf-ap-actions');
    const submitNowBtn = document.getElementById('gf-ap-submit-now');
    const pauseBtn = document.getElementById('gf-ap-pause');

    let countdownTimer = null;

    function triggerSubmit() {
        if (countdownTimer) clearInterval(countdownTimer);
        statusEl.innerHTML = `<span style="color: #38bdf8;">${i18n.submitting}</span>`;
        actionsEl.style.display = 'none';

        const submitBtn = document.querySelector('input[type="submit"][name="commit"]') ||
                          document.querySelector('input[type="submit"]') ||
                          document.querySelector('button[type="submit"]');

        if (submitBtn) {
            submitBtn.click();
        } else {
            const form = document.querySelector('form');
            if (form) form.submit();
        }
    }

    pauseBtn.addEventListener('click', () => {
        if (countdownTimer) clearInterval(countdownTimer);
        statusEl.innerHTML = `<span style="color: #fbbf24;">${i18n.paused}</span>`;
        pauseBtn.style.display = 'none';
        banner.style.borderColor = '#fbbf24';
    });

    submitNowBtn.addEventListener('click', () => {
        triggerSubmit();
    });

    // 2. Загрузка исходного кода скрипта
    function fetchScriptCode(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            resolve(res.responseText);
                        } else {
                            reject(new Error(`HTTP ${res.status}: ${res.statusText}`));
                        }
                    },
                    onerror: (err) => reject(err)
                });
            } else {
                fetch(url).then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.text();
                }).then(resolve).catch(reject);
            }
        });
    }

    // 3. Заполнение всех полей формы на GreasyFork
    async function startAutomation() {
        try {
            const code = await fetchScriptCode(targetUrl);

            // А. Заполнение поля кода
            const allTextareas = Array.from(document.querySelectorAll('textarea'));
            const codeTextarea = document.querySelector('textarea#script_version_code') ||
                                 document.querySelector('textarea[name="script_version[code]"]') ||
                                 allTextareas[0];

            if (!codeTextarea) {
                throw new Error('Поле ввода кода не найдено на странице!');
            }

            codeTextarea.value = code;
            codeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            codeTextarea.dispatchEvent(new Event('change', { bubbles: true }));

            // Если активен CodeMirror редактор
            const cmEl = document.querySelector('.CodeMirror');
            if (cmEl && cmEl.CodeMirror) {
                cmEl.CodeMirror.setValue(code);
            }

            // Б. Переключение радиокнопки описания на Markdown
            const markdownRadio = document.querySelector('input[type="radio"][value="markdown"]') ||
                                  Array.from(document.querySelectorAll('label')).find(l => /markdown/i.test(l.textContent))?.querySelector('input') ||
                                  Array.from(document.querySelectorAll('input[type="radio"]')).find(r => /markdown/i.test(r.parentElement?.textContent || ''));

            if (markdownRadio) {
                markdownRadio.click();
                markdownRadio.checked = true;
                markdownRadio.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // В. Заполнение поля "Дополнительная информация" (Markdown)
            const addInfoTextarea = allTextareas.find(t => t !== codeTextarea && (t.name?.includes('additional_info') || t.id?.includes('additional_info'))) ||
                                    allTextareas.find(t => t !== codeTextarea);

            const richText = richDescriptions[fileName] ||
                             `### About / О скрипте\nSource code available on GitHub: [https://github.com/${userName}/${repoName}](https://github.com/${userName}/${repoName})\n\nLicensed under [MIT License](https://opensource.org/licenses/MIT).`;

            if (addInfoTextarea) {
                addInfoTextarea.value = richText;
                addInfoTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                addInfoTextarea.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Г. Заполнение Changelog (если страница обновления)
            const changelogInput = document.querySelector('input[name*="changelog"], textarea[name*="changelog"], input#script_version_changelog');
            if (changelogInput && !changelogInput.value.trim()) {
                changelogInput.value = 'v1.4.1: Added Russian localization (@name:ru, @description:ru) for GreasyFork catalog';
                changelogInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            statusEl.innerHTML = `<span style="color: #4ade80;">${i18n.loaded}</span><br><b>${i18n.submittingIn(5)}</b>`;
            actionsEl.style.display = 'flex';
            banner.style.borderColor = '#4ade80';

            // 4. Обратный отсчёт 5 секунд
            let secondsLeft = 5;
            countdownTimer = setInterval(() => {
                secondsLeft--;
                if (secondsLeft > 0) {
                    statusEl.innerHTML = `<span style="color: #4ade80;">${i18n.loaded}</span><br><b>${i18n.submittingIn(secondsLeft)}</b>`;
                } else {
                    triggerSubmit();
                }
            }, 1000);

        } catch (err) {
            console.error('GreasyFork Auto-Publisher Error:', err);
            statusEl.innerHTML = `<span style="color: #f87171;">${i18n.errorFetch}: ${err.message}</span>`;
            banner.style.borderColor = '#f87171';
        }
    }

    setTimeout(startAutomation, 500);
})();
