// ==UserScript==
// @name         SteamDB Free Packages - Direct Steam Game Links
// @namespace    https://steamdb.info/
// @version      3.2.0
// @description  Мгновенный умный переход из SubID в страницы игр Steam (store.steampowered.com/app/<AppID>/) при клике по номеру пакета. In-place замена ссылок с нулевой нагрузкой на DOM.
// @author       Antigravity
// @match        https://steamdb.info/freepackages/*
// @match        https://steamdb.info/sub/*
// @icon         https://steamdb.info/static/logos/favicon-16x16.png
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/**
 * SteamDB Free Packages - Direct Steam Game Links
 * Version: 3.2.0 (In-Place Link Transformation & Zero-DOM Overhead)
 * 
 * Особенности v3.2.0:
 * 1. Прямая трансформация ссылок: заменяет href существующей ссылки на SubID (например, Package 1747068 🚀).
 *    Полный отказ от создания дополнительных кнопочных элементов в DOM (Zero-DOM Overhead).
 * 2. Нулевая нагрузка на процессор: нет вставки элементов, нет рефлоу и исключены циклы MutationObserver.
 * 3. Легковесный визуал через CSS: ненавязчивый значок ракеты через ::after и подсказка при наведении.
 * 4. Прямой fallback на store.steampowered.com/sub/<subId>/ при ошибках SteamDB (HTTP 451 / 404).
 */

(function () {
    'use strict';

    const AUTO_HASH = '#autosteam';

    // =============================================================
    // 1. СТРАНИЦА КАТАЛОГА: https://steamdb.info/freepackages/*
    // =============================================================
    if (window.location.pathname.startsWith('/freepackages')) {
        function transformSubLinks() {
            // Ищем ссылки на SubID в логе активации #loading (или в активной таблице #freepackages)
            const container = document.querySelector('#loading') || document.querySelector('#freepackages');
            if (!container) return;

            const subLinks = container.querySelectorAll('a[href*="/sub/"]:not([data-tm-autosteam="true"])');
            subLinks.forEach(link => {
                const href = link.getAttribute('href') || '';
                const match = href.match(/\/sub\/(\d+)/);
                if (!match) return;

                const subId = match[1];
                link.dataset.tmAutosteam = 'true';
                link.href = `/sub/${subId}/${AUTO_HASH}?subid=${subId}`;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.title = `🚀 Открыть пакет ${subId} в магазине Steam (прямой переход по AppID)`;
                link.classList.add('tm-steam-direct-link');
            });
        }

        const style = document.createElement('style');
        style.textContent = `
            .tm-steam-direct-link {
                color: #66c0f4 !important;
                transition: color 0.15s ease, text-shadow 0.15s ease;
            }
            .tm-steam-direct-link::after {
                content: ' 🚀';
                font-size: 11px;
                opacity: 0.85;
                vertical-align: baseline;
            }
            .tm-steam-direct-link:hover {
                color: #ffffff !important;
                text-shadow: 0 0 6px rgba(102, 192, 244, 0.6);
            }
        `;
        document.head.appendChild(style);

        // Проверяем наличие ссылок при загрузке
        transformSubLinks();

        // Дебаунсированный наблюдатель за появлением и наполнением лога #loading
        let debounceTimer = null;
        const observer = new MutationObserver(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                transformSubLinks();
            }, 80);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // =============================================================
    // 2. СТРАНИЦА ПАКЕТА: https://steamdb.info/sub/*
    // =============================================================
    if (window.location.pathname.startsWith('/sub/') && window.location.hash.includes('autosteam')) {
        const hash = window.location.hash;
        const subMatch = window.location.pathname.match(/\/sub\/(\d+)/) || hash.match(/[?&]subid=(\d+)/);
        const subId = subMatch ? subMatch[1] : '';
        const nameMatch = hash.match(/[?&]name=([^&]+)/);
        const fallbackName = nameMatch ? decodeURIComponent(nameMatch[1]) : '';

        // Проверяем статус ошибки страницы (HTTP 451 / геоблок / 404)
        const isErrorPage = document.title.includes('Error · SteamDB') ||
                            document.querySelector('.error-content, #error') !== null;

        if (isErrorPage) {
            // Страница заблокирована или отсутствует — прямой fallback на страницу пакета в Steam
            if (subId) {
                console.info(`[SteamDB Direct Links] Страница SubID ${subId} недоступна на SteamDB (451/Error). Прямой переход в магазин Steam.`);
                window.location.replace(`https://store.steampowered.com/sub/${subId}/`);
            } else if (fallbackName) {
                window.location.replace(`https://store.steampowered.com/search/?term=${encodeURIComponent(fallbackName)}`);
            }
            return;
        }

        // Извлекаем все AppID из разметки пакета
        const appIds = new Set();

        // 1. Поиск по строкам tr[data-appid]
        document.querySelectorAll('tr[data-appid]').forEach(tr => {
            const id = tr.getAttribute('data-appid');
            if (id) appIds.add(id);
        });

        // 2. Поиск по ссылкам /app/<id>/ в теле страницы (исключая навигацию)
        if (appIds.size === 0) {
            document.querySelectorAll('a[href*="/app/"]').forEach(a => {
                if (a.closest('nav, header, footer, .navbar, .site-header, .site-footer')) return;
                const m = (a.getAttribute('href') || '').match(/\/app\/(\d+)/);
                if (m) appIds.add(m[1]);
            });
        }

        const idsArray = Array.from(appIds);

        if (idsArray.length === 1) {
            // Одиночная игра — мгновенный прямой переход на страницу игры
            window.location.replace(`https://store.steampowered.com/app/${idsArray[0]}/`);
        } else if (idsArray.length > 1) {
            // Мульти-пакет: открываем остальные игры в новых вкладках, а текущую перенаправляем на первую
            for (let i = 1; i < idsArray.length; i++) {
                window.open(`https://store.steampowered.com/app/${idsArray[i]}/`, '_blank');
            }
            window.location.replace(`https://store.steampowered.com/app/${idsArray[0]}/`);
        } else if (subId) {
            // Если AppID не извлеклись из разметки SteamDB — перенаправляем на пакет в Steam
            window.location.replace(`https://store.steampowered.com/sub/${subId}/`);
        } else if (fallbackName) {
            window.location.replace(`https://store.steampowered.com/search/?term=${encodeURIComponent(fallbackName)}`);
        }
    }
})();
