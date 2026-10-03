#!/usr/bin/env node

/**
 * GreasyFork Universal Persistent CLI Bridge (v3.0.0)
 * 
 * Acts as the agent's server, communicating directly with the open GreasyFork
 * browser tab via HTTP (127.0.0.1:18234) for completely automated publishing.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 18234;
const rootDir = path.resolve(__dirname, '..');

const DESCRIPTIONS = {
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

// Очередь задач для публикации
const queue = [
    {
        id: 'job-1',
        name: '1. SteamGifts - Chance Per Point (ID: 597589)',
        action: 'edit_desc',
        scriptId: '597589',
        scriptSlug: '597589-steamgifts-chance-per-point',
        url: 'https://greasyfork.org/ru/scripts/597589-steamgifts-chance-per-point/admin',
        description: DESCRIPTIONS['steamgifts-chance-per-point.user.js']
    },
    {
        id: 'job-2',
        name: '2. SteamGifts - Unlucky-7 Winner Stats & Copy (ID: 580030, v1.4.1)',
        action: 'update',
        scriptId: '580030',
        scriptSlug: '580030-steamgifts-unlucky-7-winner-stats-copy',
        url: 'https://greasyfork.org/ru/scripts/580030-steamgifts-unlucky-7-winner-stats-copy/versions/new',
        code: fs.readFileSync(path.join(rootDir, 'steamgifts-unlucky-7-winner-stats-copy.user.js'), 'utf8'),
        changelog: 'v1.4.1: Added Russian localization (@name:ru, @description:ru) for GreasyFork catalog',
        description: DESCRIPTIONS['steamgifts-unlucky-7-winner-stats-copy.user.js']
    },
    {
        id: 'job-3',
        name: '3. SteamGifts - Group Stats Checker (v1.7.0, Новый скрипт)',
        action: 'publish',
        url: 'https://greasyfork.org/ru/script_versions/new',
        code: fs.readFileSync(path.join(rootDir, 'steamgifts-group-stats-checker.user.js'), 'utf8'),
        description: DESCRIPTIONS['steamgifts-group-stats-checker.user.js']
    },
    {
        id: 'job-4',
        name: '4. SteamGifts - Region Auto-Selector (v1.5.0, Новый скрипт)',
        action: 'publish',
        url: 'https://greasyfork.org/ru/script_versions/new',
        code: fs.readFileSync(path.join(rootDir, 'steamgifts-region-auto-selector.user.js'), 'utf8'),
        description: DESCRIPTIONS['steamgifts-region-auto-selector.user.js']
    }
];

let currentIndex = 0;
const results = [];
let tabConnected = false;

function createServer() {
    return http.createServer((req, res) => {
        const parsedUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // 1. Health check & handshake
        if (parsedUrl.pathname === '/ping' || parsedUrl.pathname === '/health') {
            if (!tabConnected) {
                tabConnected = true;
                console.log('🟢 [Bridge] Вкладка Firefox успешно подключилась к агенту!');
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                connected: true,
                currentIndex: currentIndex,
                total: queue.length,
                pendingCount: queue.length - currentIndex
            }));
            return;
        }

        // 2. Next job for the browser tab
        if (parsedUrl.pathname === '/next-job') {
            if (!tabConnected) {
                tabConnected = true;
                console.log('🟢 [Bridge] Вкладка Firefox запросила задачу!');
            }

            if (currentIndex >= queue.length) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ allDone: true }));
                return;
            }

            const currentJob = queue[currentIndex];
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
                job: currentJob,
                index: currentIndex + 1,
                total: queue.length
            }));
            return;
        }

        // 3. Status report from the browser tab
        if (parsedUrl.pathname === '/report' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);

                    if (data.status === 'success') {
                        const job = queue[currentIndex];
                        console.log(`✅ [${currentIndex + 1}/${queue.length}] ${job.name} -> ${data.finalUrl}`);
                        results.push({ name: job.name, url: data.finalUrl });
                        currentIndex++;
                    } else if (data.status === 'navigating') {
                        console.log(`⏳ [${currentIndex + 1}/${queue.length}] Переход: ${data.url}`);
                    } else if (data.status === 'submitting') {
                        console.log(`🚀 [${currentIndex + 1}/${queue.length}] Отправка формы в GreasyFork...`);
                    } else if (data.status === 'error') {
                        console.error(`❌ [Ошибка шага] ${data.error}`);
                    }

                    if (data.allDone || currentIndex >= queue.length) {
                        finishAll();
                    }
                } catch (e) {
                    console.error('Error parsing report:', e);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, nextIndex: currentIndex }));
            });
            return;
        }

        res.writeHead(404);
        res.end('Not found');
    });
}

let serverInstance = null;

function finishAll() {
    console.log('\n======================================================');
    console.log('🎉 ВСЕ 4 СКРИПТА УСПЕШНО ОПУБЛИКОВАНЫ И ОФОРМЛЕНЫ:');
    for (const r of results) {
        console.log(`  • ${r.name} -> ${r.url}`);
    }
    console.log('======================================================\n');

    setTimeout(() => {
        if (serverInstance) {
            serverInstance.close(() => {
                console.log('[Bridge] Сервер завершил работу. Готово!');
                process.exit(0);
            });
        }
    }, 1500);
}

function main() {
    serverInstance = createServer();
    serverInstance.listen(PORT, '127.0.0.1', () => {
        console.log('======================================================');
        console.log(`🤖 GREASYFORK AGENT BRIDGE v3.0.0 ЗАПУЩЕН НА ПОРТУ ${PORT}`);
        console.log('======================================================');
        console.log('⏳ Ожидание подключения вкладки GreasyFork в Firefox...');
        console.log('👉 Пожалуйста, откройте любую страницу GreasyFork в браузере');
        console.log('   (например: https://greasyfork.org/ru/users/1522624-basimovif-ai)');
        console.log('======================================================\n');
    });
}

main();
