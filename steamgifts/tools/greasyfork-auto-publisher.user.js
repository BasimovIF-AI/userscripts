// ==UserScript==
// @name         GreasyFork - Universal Persistent Browser Bridge
// @name:ru      GreasyFork - Универсальный постоянный мост браузера
// @namespace    https://greasyfork.org/users/1522624-basimovif-ai
// @version      3.0.0
// @description  Universal persistent bridge connecting browser tabs to local AI agent for hands-free script publishing, updates, and Markdown styling.
// @description:ru Универсальный постоянный мост, связывающий вкладку браузера с локальным агентом для полностью автономной публикации, обновления и оформления скриптов на GreasyFork.
// @author       basimovif-ai
// @license      MIT
// @homepageURL  https://github.com/BasimovIF-AI/steamgifts-userscripts
// @supportURL   https://github.com/BasimovIF-AI/steamgifts-userscripts/issues
// @match        https://greasyfork.org/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const BRIDGE_URL = 'http://127.0.0.1:18234';
    let pollInterval = null;

    // 1. Создание плавающего индикатора моста
    const badge = document.createElement('div');
    badge.id = 'gf-agent-bridge-badge';
    Object.assign(badge.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '99999999',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        padding: '12px 18px',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        border: '2px solid #64748b',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        fontWeight: '600',
        lineHeight: '1.4',
        maxWidth: '360px',
        transition: 'all 0.3s ease'
    });
    badge.innerHTML = `<span style="color: #94a3b8;">⚪ Мост агента: Ожидание подключения...</span>`;
    document.body.appendChild(badge);

    function updateBadge(color, borderColor, html) {
        badge.style.borderColor = borderColor;
        badge.innerHTML = html;
    }

    // 2. Внедрение скрипта в нативный контекст страницы для взаимодействия с CodeMirror и формами
    function injectPageScript(fn, ...args) {
        const script = document.createElement('script');
        script.textContent = '(' + fn.toString() + ')(' + args.map(a => JSON.stringify(a)).join(',') + ');';
        document.documentElement.appendChild(script);
        script.remove();
    }

    function pageContextFiller(code, desc, changelog, isEditDesc) {
        // Код скрипта и CodeMirror
        const codeArea = document.querySelector('textarea#script_version_code, textarea[name="script_version[code]"]');
        if (codeArea && code && !isEditDesc) {
            codeArea.value = code;
            codeArea.dispatchEvent(new Event('input', { bubbles: true }));
            codeArea.dispatchEvent(new Event('change', { bubbles: true }));

            const cmEls = document.querySelectorAll('.CodeMirror');
            cmEls.forEach(cmEl => {
                if (cmEl.CodeMirror) {
                    cmEl.CodeMirror.setValue(code);
                    cmEl.CodeMirror.save();
                }
            });
        }

        // Переключение разметки на Markdown
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        const mdRadio = radios.find(r => r.value === 'markdown' || (r.id && r.id.toLowerCase().includes('markdown')));
        if (mdRadio) {
            mdRadio.checked = true;
            mdRadio.click();
            mdRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Поле дополнительной информации / описания
        const allTextareas = Array.from(document.querySelectorAll('textarea'));
        const descArea = allTextareas.find(t => t !== codeArea && (t.name?.includes('additional_info') || t.id?.includes('additional_info'))) ||
                         allTextareas.find(t => t !== codeArea);

        if (descArea && desc) {
            descArea.value = desc;
            descArea.dispatchEvent(new Event('input', { bubbles: true }));
            descArea.dispatchEvent(new Event('change', { bubbles: true }));

            const cmDesc = descArea.nextElementSibling;
            if (cmDesc && cmDesc.CodeMirror) {
                cmDesc.CodeMirror.setValue(desc);
                cmDesc.CodeMirror.save();
            }
        }

        // Changelog
        const clInput = document.querySelector('input[name*="changelog"], textarea[name*="changelog"], input#script_version_changelog');
        if (clInput && changelog) {
            clInput.value = changelog;
            clInput.dispatchEvent(new Event('input', { bubbles: true }));
            clInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Чекбокс дубликата кода
        const dupCheck = document.querySelector('input[type="checkbox"][name*="allow_code_previously_posted"], input[type="checkbox"][name*="previously_posted"], input[type="checkbox"][name*="allow_code"], input[type="checkbox"][name*="version_check_override"]');
        if (dupCheck && !dupCheck.checked) {
            dupCheck.checked = true;
            dupCheck.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function pageContextSubmit() {
        document.querySelectorAll('.CodeMirror').forEach(cm => {
            if (cm.CodeMirror) cm.CodeMirror.save();
        });

        const dupCheck = document.querySelector('input[type="checkbox"][name*="allow_code_previously_posted"], input[type="checkbox"][name*="previously_posted"], input[type="checkbox"][name*="allow_code"], input[type="checkbox"][name*="version_check_override"]');
        if (dupCheck && !dupCheck.checked) {
            dupCheck.checked = true;
            dupCheck.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const form = document.querySelector('form.new_script_version, form.edit_script, form.new_script, form[action*="script"]') ||
                     document.querySelector('#main-script-container form, .text-content form') ||
                     document.querySelector('form');
        const submitBtn = form ? form.querySelector('input[type="submit"][name="commit"], input[type="submit"], button[type="submit"]') :
                                 document.querySelector('input[type="submit"][name="commit"], input[type="submit"], button[type="submit"]');
        if (submitBtn) {
            submitBtn.click();
        } else if (form) {
            form.submit();
        }
    }

    // 3. Сетевые запросы к локальному агенту через GM_xmlhttpRequest
    function bridgeRequest(endpoint, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: method,
                url: `${BRIDGE_URL}${endpoint}`,
                headers: { 'Content-Type': 'application/json' },
                data: data ? JSON.stringify(data) : undefined,
                timeout: 3000,
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        try {
                            resolve(JSON.parse(res.responseText));
                        } catch (e) {
                            resolve(res.responseText);
                        }
                    } else {
                        reject(new Error(`HTTP ${res.status}`));
                    }
                },
                onerror: (err) => reject(err),
                ontimeout: () => reject(new Error('Timeout'))
            });
        });
    }

    // 4. Главный конечный автомат (State Machine)
    async function processWorkflow() {
        const rawJob = sessionStorage.getItem('gf_active_job');
        const step = sessionStorage.getItem('gf_job_step') || 'idle';
        const pendingDesc = sessionStorage.getItem('gf_pending_desc') || '';

        // А. Если есть активная задача, проверяем, на каком шаге мы находимся
        if (rawJob) {
            let job;
            try { job = JSON.parse(rawJob); } catch (e) { sessionStorage.removeItem('gf_active_job'); return; }

            // Шаг 1: Форма версии отправлена, произошел переход на страницу скрипта -> переходим в /admin для оформления
            if (step === 'version_submitted') {
                if (window.location.pathname.match(/\/scripts\/\d+(-[^\/]+)?\/?$/)) {
                    updateBadge('#38bdf8', '#38bdf8', `⏳ [${job.name}] Переход в /admin для оформления описания...`);
                    sessionStorage.setItem('gf_job_step', 'on_admin');
                    const cleanPath = window.location.pathname.replace(/\/$/, '');
                    window.location.href = cleanPath + '/admin';
                    return;
                }

                // Если страница перезагрузилась с запросом подтверждения дубликата кода
                const dupCheck = document.querySelector('input[type="checkbox"][name*="allow_code_previously_posted"], input[type="checkbox"][name*="previously_posted"], input[type="checkbox"][name*="allow_code"], input[type="checkbox"][name*="version_check_override"]');
                if (dupCheck) {
                    updateBadge('#eab308', '#eab308', `⚠️ [${job.name}] Подтверждение дубликата кода...`);
                    dupCheck.checked = true;
                    dupCheck.dispatchEvent(new Event('change', { bubbles: true }));
                    setTimeout(() => {
                        injectPageScript(pageContextSubmit);
                    }, 1000);
                    return;
                }
            }

            // Проверка наличия ошибок валидации на странице
            const errorEl = document.querySelector('.flash.error, .errors, #error_explanation, .flash-alert');
            if (errorEl && step !== 'idle') {
                const errText = errorEl.innerText.trim().replace(/\s+/g, ' ');
                updateBadge('#ef4444', '#ef4444', `❌ [Ошибка]: ${errText.slice(0, 100)}`);
                try {
                    bridgeRequest('/report', 'POST', {
                        jobId: job.id,
                        status: 'error',
                        error: errText
                    });
                } catch (e) {}
            }

            // Шаг 2: На странице /admin -> заполняем Markdown и отправляем
            if (step === 'on_admin' && window.location.pathname.endsWith('/admin')) {
                updateBadge('#a855f7', '#a855f7', `📝 [${job.name}] Оформление Markdown-описания...`);
                const descToUse = pendingDesc || job.description || '';
                injectPageScript(pageContextFiller, '', descToUse, '', true);

                setTimeout(() => {
                    updateBadge('#38bdf8', '#38bdf8', `🚀 [${job.name}] Сохранение описания...`);
                    sessionStorage.setItem('gf_job_step', 'admin_submitted');
                    injectPageScript(pageContextSubmit);
                }, 1500);
                return;
            }

            // Шаг 3: Страница /admin отправлена -> вернулись на страницу скрипта. Задача полностью завершена!
            if ((step === 'admin_submitted' || step === 'desc_submitted') && window.location.pathname.match(/\/scripts\/\d+(-[^\/]+)?\/?$/)) {
                updateBadge('#22c55e', '#22c55e', `✅ [${job.name}] Успешно опубликовано!`);
                const finalUrl = window.location.href;

                // Рапортуем агенту
                try {
                    await bridgeRequest('/report', 'POST', {
                        jobId: job.id,
                        status: 'success',
                        finalUrl: finalUrl
                    });
                } catch (e) {}

                sessionStorage.removeItem('gf_active_job');
                sessionStorage.removeItem('gf_job_step');
                sessionStorage.removeItem('gf_pending_desc');

                // Запрашиваем следующую задачу
                setTimeout(checkNextJob, 2000);
                return;
            }

            // Шаг 4: Мы находимся на целевой форме (открытие формы для заполнения)
            const isVersionPage = window.location.pathname.includes('/versions/new') || window.location.pathname.endsWith('/script_versions/new');
            const isAdminPage = window.location.pathname.endsWith('/admin');

            if (job.action === 'edit_desc' && isAdminPage && step === 'idle') {
                updateBadge('#a855f7', '#a855f7', `📝 [${job.name}] Заполнение Markdown-описания...`);
                injectPageScript(pageContextFiller, '', job.description, '', true);

                setTimeout(() => {
                    updateBadge('#38bdf8', '#38bdf8', `🚀 [${job.name}] Сохранение формы...`);
                    sessionStorage.setItem('gf_job_step', 'desc_submitted');
                    injectPageScript(pageContextSubmit);
                }, 1500);
                return;
            }

            if ((job.action === 'update' || job.action === 'publish') && isVersionPage && step === 'idle') {
                updateBadge('#38bdf8', '#38bdf8', `🚀 [${job.name}] Заполнение кода и параметров...`);
                injectPageScript(pageContextFiller, job.code || '', '', job.changelog || '', false);

                setTimeout(() => {
                    updateBadge('#2563eb', '#2563eb', `🚀 [${job.name}] Отправка версии...`);
                    sessionStorage.setItem('gf_job_step', 'version_submitted');
                    if (job.description) {
                        sessionStorage.setItem('gf_pending_desc', job.description);
                    }
                    injectPageScript(pageContextSubmit);
                }, 1500);
                return;
            }

            // Если URL не совпадает с целевым, переходим на него
            if (window.location.href !== job.url) {
                updateBadge('#38bdf8', '#38bdf8', `⏳ [${job.name}] Переход на целевую страницу...`);
                window.location.href = job.url;
                return;
            }
        }

        // Б. Если активных задач в сессии нет — опрашиваем агента
        checkNextJob();
    }

    async function checkNextJob() {
        try {
            const data = await bridgeRequest('/next-job', 'GET');
            updateBadge('#22c55e', '#22c55e', `🟢 Мост агента: На связи (готов к приёму задач)`);

            if (data && data.allDone) {
                updateBadge('#22c55e', '#22c55e', `🎉 Все 4 скрипта успешно опубликованы и оформлены!`);
                if (!window.location.pathname.includes('/users/1522624-basimovif-ai')) {
                    window.location.href = 'https://greasyfork.org/ru/users/1522624-basimovif-ai';
                }
                return;
            }

            if (data && data.job) {
                const job = data.job;
                updateBadge('#38bdf8', '#38bdf8', `📥 [${data.index}/${data.total}] Получена задача: ${job.name}`);
                sessionStorage.setItem('gf_active_job', JSON.stringify(job));
                sessionStorage.setItem('gf_job_step', 'idle');
                if (job.description) {
                    sessionStorage.setItem('gf_pending_desc', job.description);
                }

                setTimeout(() => {
                    window.location.href = job.url;
                }, 1000);
            }
        } catch (e) {
            updateBadge('#94a3b8', '#64748b', `⚪ Мост агента: Ожидание подключения (127.0.0.1:18234)...`);
        }
    }

    // Запуск процесса при загрузке страницы
    setTimeout(processWorkflow, 600);

    // Фоновый поллинг каждые 3 секунды, если нет активной задачи
    pollInterval = setInterval(() => {
        if (!sessionStorage.getItem('gf_active_job')) {
            checkNextJob();
        }
    }, 3000);

})();
