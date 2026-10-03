// ==UserScript==
// @name         Ozon Deep Diagnostics (Диагностика страниц Ozon)
// @namespace    https://github.com/vibe-coding/wb-ozon-comparator
// @version      1.0.0
// @description  Глубокий анализ архитектуры данных, __INITIAL_STATE__ и структуры аспектов/модификаций Ozon с копированием отчета в буфер обмена в 1 клик
// @author       Senior Software Engineer
// @match        https://*.ozon.ru/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    console.log('[Ozon-Diagnostics] Скрипт диагностики загружен.');

    // Внедрение стилей интерфейса
    GM_addStyle(`
        .ozd-dock-btn {
            position: fixed;
            bottom: 80px;
            right: 20px;
            z-index: 999999;
            background: linear-gradient(135deg, #005bff, #003dbb);
            color: #ffffff !important;
            border: 2px solid rgba(255, 255, 255, 0.4);
            border-radius: 50px;
            padding: 12px 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 700;
            box-shadow: 0 8px 24px rgba(0, 91, 255, 0.5);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s ease;
        }
        .ozd-dock-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 28px rgba(0, 91, 255, 0.7);
            background: linear-gradient(135deg, #0066ff, #0047dc);
        }
        .ozd-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(4px);
            z-index: 1000000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .ozd-modal {
            background: #181924;
            color: #f1f5f9 !important;
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            width: 90%;
            max-width: 800px;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 40px rgba(0,0,0,0.8);
            overflow: hidden;
        }
        .ozd-modal-header {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #202230;
        }
        .ozd-modal-header h2 {
            margin: 0;
            font-size: 16px;
            color: #fff !important;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .ozd-close-btn {
            background: none;
            border: none;
            color: #aaa;
            font-size: 24px;
            cursor: pointer;
            padding: 4px;
            line-height: 1;
        }
        .ozd-close-btn:hover { color: #fff; }
        .ozd-modal-body {
            padding: 20px;
            overflow-y: auto;
            flex: 1;
        }
        .ozd-code-box {
            background: #0d0e15;
            color: #38bdf8 !important;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 12px;
            font-family: Consolas, 'Courier New', monospace;
            font-size: 12px;
            max-height: 350px;
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .ozd-btn-copy {
            background: #10b981;
            color: #fff !important;
            border: none;
            padding: 10px 18px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .ozd-btn-copy:hover { background: #059669; }
        .ozd-toast {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: #10b981;
            color: #ffffff !important;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 14px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            z-index: 1000001;
            animation: ozdFadeIn 0.3s ease-out;
        }
        @keyframes ozdFadeIn {
            from { opacity: 0; transform: translate(-50%, 15px); }
            to { opacity: 1; transform: translate(-50%, 0); }
        }
    `);

    // Функция глубокого сбора диагностики
    function collectDiagnostics() {
        const report = {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            pathname: window.location.pathname,
            title: document.title,
            h1: document.querySelector('h1')?.textContent?.trim() || null
        };

        // 1. Анализ артикула (SKU)
        const urlMatch = window.location.pathname.match(/product\/.*?-(\d+)(?:\/|$)/) ||
                         window.location.pathname.match(/product\/(\d+)(?:\/|$)/);
        report.skuFromUrl = urlMatch ? urlMatch[1] : null;

        const bodyText = document.body.innerText || '';
        const skuFromText = bodyText.match(/Артикул:\s*(\d{6,14})/);
        report.skuFromText = skuFromText ? skuFromText[1] : null;

        // 2. Анализ __INITIAL_STATE__
        const winState = (typeof unsafeWindow !== 'undefined' && unsafeWindow.__INITIAL_STATE__) || window.__INITIAL_STATE__;
        report.hasInitialState = Boolean(winState);

        if (winState && winState.widgetStates) {
            const allWidgets = Object.keys(winState.widgetStates);
            report.totalWidgets = allWidgets.length;
            report.widgetNames = allWidgets;

            // Виджет аспектов
            const aspectKeys = allWidgets.filter(k => k.startsWith('webAspects-') || k.toLowerCase().includes('aspect'));
            report.aspectWidgetKeys = aspectKeys;
            report.aspectsState = {};
            for (const k of aspectKeys) {
                try {
                    const val = typeof winState.widgetStates[k] === 'string' ? JSON.parse(winState.widgetStates[k]) : winState.widgetStates[k];
                    report.aspectsState[k] = val;
                } catch (e) {
                    report.aspectsState[k] = `Parse error: ${e.message}`;
                }
            }

            // Виджет цены
            const priceKeys = allWidgets.filter(k => k.startsWith('webPrice-') || k.toLowerCase().includes('price'));
            report.priceWidgetKeys = priceKeys;
            report.priceState = {};
            for (const k of priceKeys) {
                try {
                    const val = typeof winState.widgetStates[k] === 'string' ? JSON.parse(winState.widgetStates[k]) : winState.widgetStates[k];
                    report.priceState[k] = val;
                } catch (e) {
                    report.priceState[k] = `Parse error: ${e.message}`;
                }
            }

            // Виджет характеристик
            const charKeys = allWidgets.filter(k => k.startsWith('webCharacteristics-') || k.toLowerCase().includes('charact'));
            report.characteristicWidgetKeys = charKeys;
            report.characteristicsSample = {};
            for (const k of charKeys.slice(0, 2)) {
                try {
                    const val = typeof winState.widgetStates[k] === 'string' ? JSON.parse(winState.widgetStates[k]) : winState.widgetStates[k];
                    report.characteristicsSample[k] = val;
                } catch (e) {
                    report.characteristicsSample[k] = `Parse error: ${e.message}`;
                }
            }
        }

        // 3. Анализ DOM виджета аспектов [data-widget="webAspects"]
        const domAspects = document.querySelector('[data-widget="webAspects"]');
        report.hasDomAspectsWidget = Boolean(domAspects);

        if (domAspects) {
            // Заголовки
            const headers = Array.from(domAspects.querySelectorAll('span, div, h3')).filter(el => {
                const t = (el.textContent || '').trim();
                return (t.endsWith(':') || t.includes('Единиц') || t.includes('Вкус') || t.includes('Цвет') || t.includes('Размер')) &&
                       t.length < 50 && el.children.length === 0;
            }).map(el => el.textContent.trim());
            report.domHeadersFound = headers;

            // Все интерактивные плитки
            const tiles = Array.from(domAspects.querySelectorAll('a, button, div')).filter(el => {
                const txt = (el.innerText || el.textContent || '').trim();
                if (!txt || txt.length > 70) return false;
                if (el.tagName === 'DIV' && el.querySelector('a, button')) return false;
                return true;
            }).map((el, i) => {
                const style = window.getComputedStyle(el);
                const hasBlue = style.borderColor.includes('0, 91, 255') || style.outlineColor.includes('0, 91, 255') || style.boxShadow.includes('0, 91, 255');
                return {
                    index: i,
                    tag: el.tagName,
                    text: (el.innerText || el.textContent || '').trim().replace(/\n+/g, ' | '),
                    href: el.getAttribute('href') || el.closest('a')?.getAttribute('href') || null,
                    className: el.className,
                    ariaSelected: el.getAttribute('aria-selected') || el.getAttribute('aria-checked'),
                    hasBlueBorder: hasBlue,
                    isClickable: typeof el.click === 'function'
                };
            });

            report.domTilesCount = tiles.length;
            report.domTiles = tiles;
            report.domAspectsOuterHTMLSnippet = domAspects.outerHTML.substring(0, 1500);
        }

        // 4. Анализ цен в DOM
        const domPrice = document.querySelector('[data-widget="webPrice"]');
        report.domPriceSnippet = domPrice ? (domPrice.innerText || domPrice.textContent || '').trim() : null;

        return report;
    }

    // Всплывающее уведомление
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'ozd-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // Скопировать отчет и показать модалку
    async function runDiagnosticsAndCopy() {
        const report = collectDiagnostics();
        const jsonStr = JSON.stringify(report, null, 2);

        // Копирование через GM_setClipboard (100% надежно в Tampermonkey)
        let copied = false;
        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(jsonStr, 'text');
                copied = true;
            }
        } catch (e) {
            console.warn('[Ozon-Diagnostics] GM_setClipboard failed:', e);
        }

        if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(jsonStr);
                copied = true;
            } catch (e) {
                console.warn('[Ozon-Diagnostics] navigator.clipboard failed:', e);
            }
        }

        // Рендер модального окна с результатом
        const overlay = document.createElement('div');
        overlay.className = 'ozd-modal-overlay';
        overlay.innerHTML = `
            <div class="ozd-modal">
                <div class="ozd-modal-header">
                    <h2><span>🧪</span> Диагностика Ozon завершена</h2>
                    <button class="ozd-close-btn">&times;</button>
                </div>
                <div class="ozd-modal-body">
                    <div style="background: #1e3a29; border: 1px solid #10b981; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;">
                        <div style="font-weight: 700; color: #34d399; font-size: 15px;">
                            ${copied ? '✅ Полный отчет скопирован в буфер обмена!' : '⚠️ Не удалось скопировать автоматически'}
                        </div>
                        <div style="color: #cbd5e1; font-size: 13px; margin-top: 4px;">
                            ${copied 
                                ? 'Просто перейдите в диалог и нажмите <b>Ctrl + V</b> (Вставить).' 
                                : 'Нажмите кнопку «📋 Скопировать в буфер обмена» ниже.'}
                        </div>
                    </div>

                    <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 13px; color: #94a3b8;">Краткая сводка:</span>
                        <button class="ozd-btn-copy" id="ozd-manual-copy-btn">📋 Скопировать повторно</button>
                    </div>

                    <div class="ozd-code-box" id="ozd-report-text">${jsonStr}</div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('.ozd-close-btn').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        const manualCopyBtn = overlay.querySelector('#ozd-manual-copy-btn');
        if (manualCopyBtn) {
            manualCopyBtn.onclick = () => {
                if (typeof GM_setClipboard === 'function') {
                    GM_setClipboard(jsonStr, 'text');
                } else {
                    navigator.clipboard.writeText(jsonStr);
                }
                showToast('✅ Отчет скопирован в буфер обмена!');
            };
        }

        if (copied) {
            showToast('✅ Диагностика Ozon скопирована в буфер обмена!');
        }
    }

    // Создаем плавающую кнопку для запуска в 1 клик
    function createDiagnosticsButton() {
        const btn = document.createElement('button');
        btn.className = 'ozd-dock-btn';
        btn.innerHTML = '🧪 Диагностика Ozon';
        btn.title = 'Собрать архитектурный отчет Ozon и скопировать в буфер обмена';
        btn.onclick = runDiagnosticsAndCopy;
        document.body.appendChild(btn);
    }

    // Инициализация при готовности страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createDiagnosticsButton);
    } else {
        createDiagnosticsButton();
    }
})();
