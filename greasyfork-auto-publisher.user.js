// ==UserScript==
// @name         GreasyFork - Auto-Publisher Bridge
// @name:ru      GreasyFork - Авто-публикатор скриптов
// @namespace    https://greasyfork.org/users/1522624-basimovif-ai
// @version      1.0.0
// @description  Automates script publishing and updating on GreasyFork when launched with URL parameters.
// @description:ru Автоматизирует публикацию и обновление скриптов на GreasyFork при переходе по ссылке с параметрами.
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

    const isRu = (navigator.language || '').toLowerCase().startsWith('ru');
    const i18n = {
        title: '🤖 GreasyFork Auto-Publisher',
        loading: isRu ? `Загрузка кода из ${fileName}...` : `Fetching code for ${fileName}...`,
        loaded: isRu ? 'Код успешно вставлен в форму!' : 'Code successfully populated!',
        submittingIn: (sec) => isRu ? `Автоматическая отправка через: ${sec} сек...` : `Auto-submitting in: ${sec}s...`,
        submitting: isRu ? 'Отправка формы на сервер...' : 'Submitting to GreasyFork...',
        cancelBtn: isRu ? '🛑 Отменить отправку' : '🛑 Cancel',
        canceled: isRu ? 'Авто-отправка отменена. Проверьте форму и отправьте вручную.' : 'Auto-submit canceled. You can review and submit manually.',
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
        maxWidth: '380px',
        fontSize: '14px',
        lineHeight: '1.5'
    });

    banner.innerHTML = `
        <div style="font-weight: 700; color: #38bdf8; font-size: 15px; margin-bottom: 6px;">${i18n.title}</div>
        <div id="gf-ap-status" style="color: #cbd5e1; margin-bottom: 10px;">${i18n.loading}</div>
        <button id="gf-ap-cancel" style="display: none; background: #ef4444; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">${i18n.cancelBtn}</button>
    `;
    document.body.appendChild(banner);

    const statusEl = document.getElementById('gf-ap-status');
    const cancelBtn = document.getElementById('gf-ap-cancel');

    let countdownTimer = null;

    cancelBtn.addEventListener('click', () => {
        if (countdownTimer) clearInterval(countdownTimer);
        statusEl.innerHTML = `<span style="color: #fbbf24;">${i18n.canceled}</span>`;
        cancelBtn.style.display = 'none';
        banner.style.borderColor = '#fbbf24';
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

    // 3. Заполнение формы на странице
    async function startAutomation() {
        try {
            const code = await fetchScriptCode(targetUrl);

            // Поиск поля ввода кода
            const textarea = document.querySelector('textarea#script_version_code') ||
                             document.querySelector('textarea[name="script_version[code]"]');

            if (!textarea) {
                throw new Error('Поле ввода кода не найдено на странице!');
            }

            textarea.value = code;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));

            // Если активен CodeMirror редактор
            const cmEl = document.querySelector('.CodeMirror');
            if (cmEl && cmEl.CodeMirror) {
                cmEl.CodeMirror.setValue(code);
            }

            // Переключение радиокнопки описания на Markdown
            const markdownRadios = document.querySelectorAll('input[type="radio"]');
            markdownRadios.forEach(radio => {
                const label = radio.parentElement ? radio.parentElement.textContent.trim().toLowerCase() : '';
                if (radio.value === 'markdown' || label.includes('markdown')) {
                    radio.click();
                }
            });

            // Авто-описание в Дополнительную информацию, если поле присутствует и пустое
            const addInfoTextarea = document.querySelector('textarea[name="script_version[additional_info]"]') ||
                                    document.querySelector('textarea#script_version_additional_info');
            if (addInfoTextarea && addInfoTextarea.value.trim() === '') {
                addInfoTextarea.value = `### Repository & Source Code\nSource code and issue tracking available on GitHub: [https://github.com/${userName}/${repoName}](https://github.com/${userName}/${repoName})\n\nLicensed under [MIT License](https://opensource.org/licenses/MIT).`;
                addInfoTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            }

            statusEl.innerHTML = `<span style="color: #4ade80;">${i18n.loaded}</span><br><b>${i18n.submittingIn(3)}</b>`;
            cancelBtn.style.display = 'inline-block';
            banner.style.borderColor = '#4ade80';

            // 4. Обратный отсчёт 3 секунды перед отправкой
            let secondsLeft = 3;
            countdownTimer = setInterval(() => {
                secondsLeft--;
                if (secondsLeft > 0) {
                    statusEl.innerHTML = `<span style="color: #4ade80;">${i18n.loaded}</span><br><b>${i18n.submittingIn(secondsLeft)}</b>`;
                } else {
                    clearInterval(countdownTimer);
                    statusEl.innerHTML = `<span style="color: #38bdf8;">${i18n.submitting}</span>`;
                    cancelBtn.style.display = 'none';

                    // Нажатие кнопки Submit
                    const submitBtn = document.querySelector('input[type="submit"][name="commit"]') ||
                                      document.querySelector('input[type="submit"]') ||
                                      document.querySelector('button[type="submit"]');

                    if (submitBtn) {
                        submitBtn.click();
                    } else {
                        // Fallback: отправка родительской формы
                        const form = textarea.closest('form');
                        if (form) form.submit();
                    }
                }
            }, 1000);

        } catch (err) {
            console.error('GreasyFork Auto-Publisher Error:', err);
            statusEl.innerHTML = `<span style="color: #f87171;">${i18n.errorFetch}: ${err.message}</span>`;
            banner.style.borderColor = '#f87171';
        }
    }

    setTimeout(startAutomation, 400);
})();
