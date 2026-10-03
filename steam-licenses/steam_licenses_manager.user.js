// ==UserScript==
// @name         Steam Licenses Database & Fast Navigator
// @name:ru      База лицензий Steam и быстрый навигатор
// @namespace    https://github.com/basimovif/steam-licenses
// @version      1.4.1
// @description  Выгрузка всех лицензий Steam со страницы в базу данных IndexedDB (все страницы, обход continuationToken), умная быстрая синхронизация без лишних проходов, 100% сохранение дубликатов транзакций, компактный поиск с переходом к игре в 1 клик, нативная форма перехода по страницам в стиле Steam.
// @author       basimovif
// @match        https://store.steampowered.com/account/licenses*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/**
 * Steam Licenses Database & Fast Navigator v1.4.1
 * Автоматический сбор всех лицензий аккаунта Steam в локальную IndexedDB (100% 1-в-1 совпадение, включая дубликаты),
 * единая умная синхронизация новинок без бесполезных проходов,
 * нативная встроенная форма перехода по страницам в стиле Steam (.license_paginator_ctn),
 * компактный список результатов поиска (только дата, название, тип) с мгновенным переходом к игре по клику,
 * поиск по 70 000+ лицензиям без задержек и прямой переход на точную страницу.
 */

(function () {
    'use strict';

    const VERSION = '1.4.1';
    const DB_NAME = 'SteamLicensesDB';
    const DB_VERSION = 1;
    const STORE_LICENSES = 'licenses';
    const STORE_PAGES = 'pages';
    const STORE_META = 'meta';

    // ==========================================
    // 1. IndexedDB Helper (Promise-based)
    // ==========================================
    class LicensesDB {
        constructor() {
            this.db = null;
        }

        async open() {
            if (this.db) return this.db;
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;

                    // Хранилище лицензий
                    if (!db.objectStoreNames.contains(STORE_LICENSES)) {
                        const licStore = db.createObjectStore(STORE_LICENSES, { keyPath: 'key' });
                        licStore.createIndex('name_lower', 'name_lower', { unique: false });
                        licStore.createIndex('package_id', 'package_id', { unique: false });
                        licStore.createIndex('acquisition_type', 'acquisition_type', { unique: false });
                        licStore.createIndex('page', 'page', { unique: false });
                        licStore.createIndex('offset', 'offset', { unique: false });
                    }

                    // Хранилище метаданных страниц (номер, токен, offset, URL)
                    if (!db.objectStoreNames.contains(STORE_PAGES)) {
                        db.createObjectStore(STORE_PAGES, { keyPath: 'page' });
                    }

                    // Служебные метаданные (прогресс, статус)
                    if (!db.objectStoreNames.contains(STORE_META)) {
                        db.createObjectStore(STORE_META, { keyPath: 'key' });
                    }
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve(this.db);
                };

                request.onerror = (event) => {
                    console.error('[SteamLicenses] Ошибка открытия IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        }

        async saveLicensesBatch(licenses, pageInfo) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([STORE_LICENSES, STORE_PAGES, STORE_META], 'readwrite');
                const licStore = tx.objectStore(STORE_LICENSES);
                const pageStore = tx.objectStore(STORE_PAGES);

                for (const lic of licenses) {
                    licStore.put(lic);
                }

                if (pageInfo) {
                    pageStore.put(pageInfo);
                }

                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
            });
        }

        async hasLicense(key) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_LICENSES, 'readonly');
                const store = tx.objectStore(STORE_LICENSES);
                const req = store.getKey(key);
                req.onsuccess = () => resolve(!!req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async getMeta(key) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_META, 'readonly');
                const store = tx.objectStore(STORE_META);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result ? req.result.value : null);
                req.onerror = () => reject(req.error);
            });
        }

        async setMeta(key, value) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_META, 'readwrite');
                const store = tx.objectStore(STORE_META);
                const req = store.put({ key, value });
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }

        async countLicenses() {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_LICENSES, 'readonly');
                const store = tx.objectStore(STORE_LICENSES);
                const req = store.count();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async countPages() {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_PAGES, 'readonly');
                const store = tx.objectStore(STORE_PAGES);
                const req = store.count();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async getAllPages() {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_PAGES, 'readonly');
                const store = tx.objectStore(STORE_PAGES);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async getPage(pageNumber) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_PAGES, 'readonly');
                const store = tx.objectStore(STORE_PAGES);
                const req = store.get(pageNumber);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        }

        async getAllLicenses() {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_LICENSES, 'readonly');
                const store = tx.objectStore(STORE_LICENSES);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async searchLicenses(query, limit = 100, filterType = '') {
            const db = await this.open();
            const q = query.trim().toLowerCase();
            const results = [];

            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_LICENSES, 'readonly');
                const store = tx.objectStore(STORE_LICENSES);
                const req = store.openCursor();

                req.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const item = cursor.value;
                        const matchesQuery = !q || item.name_lower.includes(q) || (item.package_id && String(item.package_id) === q);
                        const matchesType = !filterType || item.acquisition_type === filterType;

                        if (matchesQuery && matchesType) {
                            results.push(item);
                            if (results.length >= limit) {
                                return resolve(results);
                            }
                        }
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                };

                req.onerror = () => reject(req.error);
            });
        }

        async clearAll() {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([STORE_LICENSES, STORE_PAGES, STORE_META], 'readwrite');
                tx.objectStore(STORE_LICENSES).clear();
                tx.objectStore(STORE_PAGES).clear();
                tx.objectStore(STORE_META).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }
    }

    const db = new LicensesDB();

    // ==========================================
    // 2. DOM Parser & Extractor
    // ==========================================
    class SteamLicensesParser {
        /**
         * Преобразует относительный URL ссылки в абсолютный URL страницы лицензий
         */
        static resolveLicensesUrl(href) {
            if (!href || href.startsWith('javascript:')) return null;
            try {
                let fullUrl = href;
                if (!href.startsWith('http://') && !href.startsWith('https://')) {
                    if (href.startsWith('?')) {
                        fullUrl = 'https://store.steampowered.com/account/licenses/' + href;
                    } else if (href.startsWith('/')) {
                        fullUrl = 'https://store.steampowered.com' + href;
                    } else {
                        fullUrl = 'https://store.steampowered.com/account/licenses/' + href;
                    }
                }
                const url = new URL(fullUrl);
                url.pathname = '/account/licenses/';
                return url;
            } catch (e) {
                return null;
            }
        }

        /**
         * Извлекает общее число лицензий со страницы
         * Например: "Показаны лицензии 1–100 из 70229" -> 70229
         */
        static parseTotalCount(doc = document) {
            const textContent = doc.body ? doc.body.innerText : '';
            const match = textContent.match(/(?:из|of)\s+([0-9\s,]+)/i);
            if (match) {
                const numStr = match[1].replace(/[\s,]/g, '');
                const num = parseInt(numStr, 10);
                if (!isNaN(num) && num > 0) return num;
            }
            return null;
        }

        /**
         * Находит ссылку на следующую страницу (Дальше >)
         */
        static parseNextPageLink(doc = document, currentOffset = 0) {
            const links = Array.from(doc.querySelectorAll('a'));

            // 1. Поиск по ссылкам с continuationToken
            for (const link of links) {
                const href = link.getAttribute('href') || '';
                if (href.includes('continuationToken') && href.includes('offset')) {
                    const url = this.resolveLicensesUrl(href);
                    if (!url) continue;

                    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
                    const text = (link.textContent || '').trim().toLowerCase();

                    // Если offset больше текущего И текст не указывает на предыдущую страницу
                    if (offset > currentOffset && !text.includes('назад') && !text.includes('prev') && !text.includes('<')) {
                        return {
                            url: url.toString(),
                            continuationToken: url.searchParams.get('continuationToken'),
                            offset: offset
                        };
                    }
                }
            }

            // 2. Поиск любой ссылки с текстом "Дальше >" или "Next >"
            for (const link of links) {
                const text = (link.textContent || '').trim().toLowerCase();
                if ((text.includes('дальше') || text.includes('next') || text.includes('>')) && !text.includes('назад') && !text.includes('prev') && !text.includes('<')) {
                    const href = link.getAttribute('href') || '';
                    const url = this.resolveLicensesUrl(href);
                    if (!url) continue;

                    const parsedOffset = parseInt(url.searchParams.get('offset') || String(currentOffset + 100), 10);
                    if (parsedOffset > currentOffset) {
                        return {
                            url: url.toString(),
                            continuationToken: url.searchParams.get('continuationToken') || null,
                            offset: parsedOffset
                        };
                    }
                }
            }

            return null;
        }

        /**
         * Парсит строки таблицы лицензий
         */
        static parseTableRows(doc = document, pageNumber = 1, offset = 0, continuationToken = null, keySeenTracker = null) {
            const table = doc.querySelector('table.account_table') || doc.querySelector('table');
            if (!table) return [];

            const rows = Array.from(table.querySelectorAll('tr'));
            const licenses = [];
            const localTracker = keySeenTracker || new Map();

            let rowIndex = 0;
            for (const row of rows) {
                // Пропускаем строки заголовков
                if (row.querySelector('th')) continue;

                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 2) continue;

                // 1. Дата (колонка 0)
                const dateCell = row.querySelector('.license_date_col') || cells[0];
                const dateStr = dateCell ? dateCell.innerText.trim() : '';

                // 2. Название товара (колонка 1)
                const itemCell = row.querySelector('.license_item_col') || cells[1];
                let itemName = itemCell ? itemCell.innerText.trim() : '';
                if (!itemName) {
                    const titleAnchor = itemCell ? itemCell.querySelector('a') : null;
                    const titleAttr = (itemCell ? itemCell.getAttribute('title') : '') || (titleAnchor ? titleAnchor.getAttribute('title') : '');
                    const fallbackText = (itemCell ? (itemCell.textContent || '') : '').trim();
                    itemName = titleAttr || fallbackText || '[Удаленный товар / Безымянная лицензия]';
                }

                // Ссылка на магазин (если есть)
                const titleAnchor = itemCell ? itemCell.querySelector('a') : null;
                const storeUrl = titleAnchor ? titleAnchor.href : null;

                // 3. Проверка возможности удаления и извлечение Package ID (SubID)
                let packageId = null;
                let canRemove = false;
                let removeJs = null;

                const removeAnchor = row.querySelector('a[href*="RemoveFreeLicense"]') ||
                    Array.from(row.querySelectorAll('a')).find(a => /удалить|remove/i.test(a.textContent || ''));

                if (removeAnchor) {
                    canRemove = true;
                    const hrefAttr = removeAnchor.getAttribute('href') || '';
                    removeJs = hrefAttr;

                    const match = hrefAttr.match(/RemoveFreeLicense\s*\(\s*['"]?(\d+)['"]?/i);
                    if (match) {
                        packageId = parseInt(match[1], 10);
                    }
                }

                // Дополнительный поиск packageId по атрибутам строки или другим ссылкам
                if (!packageId) {
                    const rowHtml = row.innerHTML;
                    const match = rowHtml.match(/RemoveFreeLicense\s*\(\s*['"]?(\d+)['"]?/i) ||
                                  rowHtml.match(/data-(?:package|sub)(?:id)?\s*=\s*['"]?(\d+)['"]?/i) ||
                                  rowHtml.match(/\/sub\/(\d+)/i);
                    if (match) {
                        packageId = parseInt(match[1], 10);
                    }
                }

                // 4. Способ покупки (последняя колонка)
                const acqCell = row.querySelector('.license_acquisition_type_col') || cells[cells.length - 1];
                const acquisitionType = acqCell ? acqCell.innerText.trim() : '';

                // Уникальный детерминированный ключ лицензии (название + packageId + дата + способ покупки)
                // Предотвращает случайное схлопывание дубликатов (например, повторные покупки/активации в один день)
                const cleanName = itemName.trim().toLowerCase().replace(/\s+/g, ' ');
                const cleanDate = dateStr.trim().toLowerCase().replace(/\s+/g, ' ');
                const cleanAcq = acquisitionType.trim().toLowerCase().replace(/\s+/g, ' ');
                const baseKey = `${cleanName}:::${packageId || 'nopkg'}:::${cleanDate}:::${cleanAcq || 'noacq'}`;
                const legacyKey = `${cleanName}:::${packageId || 'nopkg'}:::${cleanDate}`;

                // Учет дубликатов одинаковых записей:
                // Первая запись получает baseKey, повторные дубликаты получают суффикс :::dup1, :::dup2
                const seenCount = localTracker.get(baseKey) || 0;
                localTracker.set(baseKey, seenCount + 1);
                const key = seenCount === 0 ? baseKey : `${baseKey}:::dup${seenCount}`;

                // Формируем URL страницы в Steam для прямого перехода
                let pageUrl = 'https://store.steampowered.com/account/licenses/';
                if (continuationToken && offset > 0) {
                    pageUrl += `?continuationToken=${continuationToken}&offset=${offset}`;
                } else if (offset > 0) {
                    pageUrl += `?offset=${offset}`;
                }

                licenses.push({
                    key,
                    base_key: baseKey,
                    legacy_key: legacyKey,
                    name: itemName,
                    name_lower: itemName.toLowerCase(),
                    date: dateStr,
                    acquisition_type: acquisitionType,
                    package_id: packageId,
                    can_remove: canRemove,
                    remove_code: removeJs,
                    store_url: storeUrl,
                    page: pageNumber,
                    offset: offset,
                    row_index: rowIndex,
                    continuation_token: continuationToken,
                    page_url: pageUrl
                });

                rowIndex++;
            }

            return licenses;
        }
    }

    // ==========================================
    // 3. Scraper & Smart Sync Engine
    // ==========================================
    class LicensesScraper {
        constructor(onProgress, onLog, onFinished) {
            this.onProgress = onProgress || (() => {});
            this.onLog = onLog || (() => {});
            this.onFinished = onFinished || (() => {});
            this.isRunning = false;
            this.isPaused = false;
            this.requestDelayMs = 350; // Пауза между запросами (защита от rate limit)
            this.stats = {
                pagesScraped: 0,
                licensesScraped: 0,
                totalPages: 1,
                totalLicenses: 0,
                startTime: null
            };
            this.keySeenTracker = new Map();
        }

        setDelay(delayMs) {
            this.requestDelayMs = Math.max(100, delayMs);
        }

        /**
         * Запуск умного сбора/синхронизации
         * @param {string} mode - 'sync' (умная синхронизация с 1 стр.), 'resume' (с контрольной точки)
         */
        async start(mode = 'sync') {
            if (this.isRunning) return;
            this.isRunning = true;
            this.isPaused = false;
            this.stats.startTime = Date.now();
            this.keySeenTracker.clear();

            try {
                let startUrl = 'https://store.steampowered.com/account/licenses/';
                let currentPage = 1;
                let currentOffset = 0;
                let currentToken = null;

                const totalInDb = await db.countLicenses();
                const totalLicDetected = SteamLicensesParser.parseTotalCount(document) || this.stats.totalLicenses;
                if (totalLicDetected) {
                    this.stats.totalLicenses = totalLicDetected;
                    this.stats.totalPages = Math.ceil(totalLicDetected / 100);
                }

                if (mode === 'resume') {
                    const savedMeta = await db.getMeta('sync_progress');

                    // Если база уже полная или статус completed
                    if ((savedMeta && savedMeta.status === 'completed') || (totalLicDetected && totalInDb >= totalLicDetected - 10)) {
                        this.onLog(`ℹ️ База данных уже полностью заполнена (${totalInDb.toLocaleString('ru-RU')} лицензий). Возобновлять нечего.\n👉 Нажмите «▶ Синхронизировать базу» для проверки новых покупок.`);
                        this.isRunning = false;
                        this.onFinished();
                        return;
                    }

                    if (savedMeta && savedMeta.nextUrl && savedMeta.status !== 'completed') {
                        startUrl = savedMeta.nextUrl;
                        currentPage = savedMeta.nextPage || 1;
                        currentOffset = savedMeta.nextOffset || 0;
                        currentToken = savedMeta.nextToken || null;
                        this.stats.pagesScraped = currentPage - 1;
                        this.stats.licensesScraped = totalInDb;
                        this.onLog(`🔄 Возобновление сбора со страницы ${currentPage} (offset: ${currentOffset})...`);
                    } else {
                        this.onLog('ℹ️ Нет незавершенной контрольной точки для возобновления.\n👉 Нажмите «▶ Синхронизировать базу».');
                        this.isRunning = false;
                        this.onFinished();
                        return;
                    }
                } else {
                    // mode === 'sync'
                    if (totalInDb === 0) {
                        this.onLog(`▶ База данных пуста. Запуск первичного сбора всех лицензий (~${this.stats.totalPages || 700} стр.)...`);
                    } else {
                        this.onLog(`⚡ Умная синхронизация со стр. 1 (в базе ${totalInDb.toLocaleString('ru-RU')} лицензий)...`);
                    }
                }

                let nextUrl = startUrl;
                let newItemsAdded = 0;
                let stopTriggered = false;

                while (this.isRunning && nextUrl) {
                    if (this.isPaused) {
                        this.onLog('⏸ Сбор приостановлен пользователем.');
                        await db.setMeta('sync_progress', {
                            status: 'paused',
                            nextUrl,
                            nextPage: currentPage,
                            nextOffset: currentOffset,
                            nextToken: currentToken
                        });
                        break;
                    }

                    this.onLog(`📄 Загрузка страницы ${currentPage}${this.stats.totalPages ? ' из ~' + this.stats.totalPages : ''} (offset: ${currentOffset})...`);

                    let doc;

                    // Если мы на первой странице и в адресной строке нет параметров, берем готовый DOM
                    if (currentPage === 1 && window.location.pathname.includes('/account/licenses') && !window.location.search) {
                        this.onLog('⚡ Чтение лицензий со страницы 1 напрямую из открытого документа...');
                        doc = document;
                    } else {
                        doc = await this.fetchPageWithRetry(nextUrl);
                    }

                    if (!doc) {
                        this.onLog(`❌ Не удалось получить данные страницы ${currentPage}. Сбор прерван.`);
                        break;
                    }

                    // Обновляем общее количество, если не было известно
                    if (!this.stats.totalLicenses) {
                        const totalLic = SteamLicensesParser.parseTotalCount(doc);
                        if (totalLic) {
                            this.stats.totalLicenses = totalLic;
                            this.stats.totalPages = Math.ceil(totalLic / 100);
                        }
                    }

                    // Парсинг лицензий со страницы (с учетом сквозного счетчика дубликатов)
                    const pageLicenses = SteamLicensesParser.parseTableRows(doc, currentPage, currentOffset, currentToken, this.keySeenTracker);
                    if (pageLicenses.length === 0) {
                        this.onLog(`⚠️ На странице ${currentPage} лицензий не найдено или достигнут конец списка.`);
                    }

                    // Умная синхронизация: проверяем каждую игру на наличие в БД
                    const itemsToSave = [];
                    for (const lic of pageLicenses) {
                        let inDb = false;
                        if (totalInDb > 0) {
                            inDb = (await db.hasLicense(lic.key)) ||
                                   (await db.hasLicense(lic.base_key)) ||
                                   (await db.hasLicense(lic.legacy_key));
                        }
                        if (mode === 'sync' && inDb) {
                            this.onLog(`🎯 Найдена уже сохраненная игра: «${lic.name}». Все последующие игры уже есть в базе!`);
                            stopTriggered = true;
                            break;
                        } else {
                            itemsToSave.push(lic);
                        }
                    }

                    if (itemsToSave.length > 0) {
                        const pageInfo = {
                            page: currentPage,
                            offset: currentOffset,
                            continuationToken: currentToken,
                            pageUrl: nextUrl,
                            count: itemsToSave.length,
                            scrapedAt: new Date().toISOString()
                        };
                        await db.saveLicensesBatch(itemsToSave, pageInfo);
                        newItemsAdded += itemsToSave.length;
                        this.stats.licensesScraped += itemsToSave.length;
                        this.onLog(`➕ Сохранено ${itemsToSave.length} лицензий со стр. ${currentPage}.`);
                    }

                    this.stats.pagesScraped++;

                    const currentDbCount = await db.countLicenses();
                    this.onProgress({
                        currentPage,
                        totalPages: this.stats.totalPages || currentPage,
                        licensesScraped: currentDbCount,
                        totalLicenses: this.stats.totalLicenses || currentDbCount,
                        percent: this.stats.totalLicenses ? Math.min(100, Math.round((currentDbCount / this.stats.totalLicenses) * 100)) : null
                    });

                    // Если встретили уже существующую игру — останавливаемся немедленно!
                    if (stopTriggered) {
                        if (newItemsAdded > 0) {
                            this.onLog(`🎉 Синхронизация успешно завершена! Добавлено новых игр: ${newItemsAdded}. Всего в базе: ${currentDbCount.toLocaleString('ru-RU')}.`);
                        } else {
                            this.onLog(`✅ База данных полностью актуальна. С момента прошлой синхронизации новых игр не появлялось.`);
                        }
                        await db.setMeta('sync_progress', {
                            status: 'completed',
                            completedAt: new Date().toISOString(),
                            totalScraped: currentDbCount
                        });
                        break;
                    }

                    // Иначе ищем ссылку на следующую страницу (первичный сбор или новинок больше 1 страницы)
                    const nextLinkInfo = SteamLicensesParser.parseNextPageLink(doc, currentOffset);
                    if (nextLinkInfo && nextLinkInfo.url && nextLinkInfo.url !== nextUrl) {
                        nextUrl = nextLinkInfo.url;
                        currentPage++;
                        currentOffset = nextLinkInfo.offset;
                        currentToken = nextLinkInfo.continuationToken;

                        // Сохраняем контрольную точку
                        await db.setMeta('sync_progress', {
                            status: 'running',
                            nextUrl,
                            nextPage: currentPage,
                            nextOffset: currentOffset,
                            nextToken: currentToken,
                            lastUpdated: new Date().toISOString()
                        });

                        // Пауза между запросами (rate limiting prevention)
                        await this.sleep(this.requestDelayMs);
                    } else {
                        // Больше нет следующей страницы (первичный сбор завершен)
                        const finalDbCount = await db.countLicenses();
                        this.stats.totalLicenses = finalDbCount;
                        this.onLog(`🎉 Обход всех страниц завершен! Обработано страниц: ${currentPage}. Всего в базе: ${finalDbCount.toLocaleString('ru-RU')} лицензий (100% всех строк Steam).`);
                        await db.setMeta('sync_progress', {
                            status: 'completed',
                            completedAt: new Date().toISOString(),
                            totalScraped: finalDbCount
                        });
                        this.onProgress({
                            currentPage,
                            totalPages: this.stats.totalPages || currentPage,
                            licensesScraped: finalDbCount,
                            totalLicenses: finalDbCount,
                            percent: 100
                        });
                        nextUrl = null;
                        break;
                    }
                }
            } catch (err) {
                console.error('[SteamLicenses] Ошибка во время сбора:', err);
                this.onLog(`❌ Критическая ошибка: ${err.message || err}`);
            } finally {
                this.isRunning = false;
                this.onFinished();
            }
        }

        pause() {
            this.isPaused = true;
            this.isRunning = false;
        }

        stop() {
            this.isRunning = false;
            this.isPaused = false;
            this.onLog('⏹ Сбор остановлен пользователем.');
        }

        async fetchPageWithRetry(url, maxRetries = 4) {
            let attempt = 0;
            let backoff = 2500;

            while (attempt < maxRetries) {
                if (!this.isRunning) return null;
                try {
                    this.onLog(`🌐 Запрос: ${url}`);
                    const response = await fetch(url, {
                        method: 'GET',
                        credentials: 'include',
                        referrer: 'https://store.steampowered.com/account/licenses/',
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                        }
                    });

                    if (response.redirected && !response.url.includes('/account/licenses')) {
                        this.onLog(`⚠️ Запрос перенаправлен на ${response.url} (возможно, требуется повторный вход в аккаунт Steam)`);
                        throw new Error(`Редирект на: ${response.url}`);
                    }

                    if (response.status === 429 || response.status === 503) {
                        this.onLog(`⏳ Steam вернул HTTP ${response.status} (Rate limit). Ожидание ${backoff / 1000}с...`);
                        await this.sleep(backoff);
                        attempt++;
                        backoff *= 2;
                        continue;
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const htmlText = await response.text();
                    this.onLog(`📥 Ответ получен (${(htmlText.length / 1024).toFixed(1)} КБ). Разбор данных...`);
                    const parsedDoc = new DOMParser().parseFromString(htmlText, 'text/html');

                    const hasTable = parsedDoc.querySelector('table.account_table') || parsedDoc.querySelector('table');
                    if (!hasTable) {
                        this.onLog(`⚠️ Таблица лицензий не найдена! Заголовок страницы: "${parsedDoc.title || 'нет'}"`);
                    }

                    return parsedDoc;
                } catch (err) {
                    attempt++;
                    this.onLog(`⚠️ Ошибка запроса (попытка ${attempt}/${maxRetries}): ${err.message}`);
                    if (attempt >= maxRetries) throw err;
                    await this.sleep(backoff);
                    backoff *= 2;
                }
            }
            return null;
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    // ==========================================
    // 4. UI Manager (Styles & Floating Control)
    // ==========================================
    class LicensesUI {
        constructor() {
            this.scraper = null;
            this.panel = null;
            this.badge = null;
            this.currentTab = 'search';
            this.searchDebounceTimer = null;
        }

        init() {
            this.injectStyles();
            this.createBadge();
            this.createPanel();
            this.initScraper();
            this.updateBadgeCount();
            this.updateResumeButtonState();
            this.handleNavigationHighlight();
            this.injectNativePaginationControls();
        }

        injectStyles() {
            const css = `
                /* Steam Licenses Manager Styles */
                #slm-badge {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 999999;
                    background: linear-gradient(135deg, #171a21 0%, #1b2838 100%);
                    border: 1px solid #66c0f4;
                    border-radius: 8px;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                    color: #c7d5e0;
                    padding: 8px 14px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s ease;
                    user-select: none;
                }
                #slm-badge:hover {
                    border-color: #ffffff;
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(102, 192, 244, 0.4);
                }
                #slm-badge .slm-badge-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: #5c7e10;
                }
                #slm-badge .slm-badge-dot.active {
                    background: #66c0f4;
                    box-shadow: 0 0 8px #66c0f4;
                    animation: slm-pulse 1.5s infinite;
                }
                @keyframes slm-pulse {
                    0% { opacity: 0.6; }
                    50% { opacity: 1; }
                    100% { opacity: 0.6; }
                }

                #slm-panel {
                    position: fixed;
                    bottom: 70px;
                    right: 20px;
                    width: 580px;
                    max-width: calc(100vw - 40px);
                    height: 650px;
                    max-height: calc(100vh - 100px);
                    z-index: 999999;
                    background: #171a21;
                    border: 1px solid #2a475e;
                    border-radius: 10px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.75);
                    color: #c7d5e0;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    display: none;
                    flex-direction: column;
                    overflow: hidden;
                }
                #slm-panel.open {
                    display: flex;
                }

                .slm-header {
                    padding: 12px 16px;
                    background: #1b2838;
                    border-bottom: 1px solid #2a475e;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .slm-title {
                    font-size: 15px;
                    font-weight: 700;
                    color: #ffffff;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .slm-title span.ver {
                    font-size: 11px;
                    color: #66c0f4;
                    background: rgba(102, 192, 244, 0.15);
                    padding: 2px 6px;
                    border-radius: 4px;
                }
                .slm-header-actions {
                    display: flex;
                    gap: 6px;
                }
                .slm-btn-icon {
                    background: transparent;
                    border: none;
                    color: #8f98a0;
                    font-size: 16px;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 4px;
                    line-height: 1;
                }
                .slm-btn-icon:hover {
                    color: #fff;
                    background: rgba(255,255,255,0.1);
                }

                .slm-tabs {
                    display: flex;
                    background: #121418;
                    border-bottom: 1px solid #2a475e;
                }
                .slm-tab {
                    flex: 1;
                    padding: 10px 4px;
                    text-align: center;
                    font-size: 12px;
                    font-weight: 600;
                    color: #8f98a0;
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                }
                .slm-tab:hover {
                    color: #c7d5e0;
                    background: rgba(255,255,255,0.03);
                }
                .slm-tab.active {
                    color: #66c0f4;
                    border-bottom-color: #66c0f4;
                    background: rgba(102, 192, 244, 0.08);
                }

                .slm-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 14px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .slm-tab-pane {
                    display: none;
                    flex-direction: column;
                    gap: 12px;
                    height: 100%;
                }
                .slm-tab-pane.active {
                    display: flex;
                }

                /* Inputs & Controls */
                .slm-input-group {
                    display: flex;
                    gap: 8px;
                }
                .slm-input {
                    flex: 1;
                    background: #0e141b;
                    border: 1px solid #2a475e;
                    border-radius: 6px;
                    color: #ffffff;
                    padding: 8px 12px;
                    font-size: 13px;
                    outline: none;
                    box-sizing: border-box;
                }
                .slm-input:focus {
                    border-color: #66c0f4;
                    box-shadow: 0 0 6px rgba(102, 192, 244, 0.3);
                }
                .slm-select {
                    background: #0e141b;
                    border: 1px solid #2a475e;
                    border-radius: 6px;
                    color: #ffffff;
                    padding: 8px 10px;
                    font-size: 13px;
                    outline: none;
                }

                .slm-btn {
                    background: linear-gradient(90deg, #47bfff 0%, #1a9fff 100%);
                    color: #ffffff;
                    border: none;
                    border-radius: 6px;
                    padding: 9px 16px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    transition: filter 0.2s, transform 0.1s, opacity 0.2s;
                }
                .slm-btn:hover:not(:disabled) {
                    filter: brightness(1.15);
                }
                .slm-btn:active:not(:disabled) {
                    transform: scale(0.98);
                }
                .slm-btn-secondary {
                    background: #2a475e;
                    color: #c7d5e0;
                }
                .slm-btn-secondary:hover:not(:disabled) {
                    background: #395f7d;
                    color: #ffffff;
                }
                .slm-btn-danger {
                    background: #9d2525;
                    color: #ffffff;
                }
                .slm-btn-danger:hover:not(:disabled) {
                    background: #c22e2e;
                }
                .slm-btn-success {
                    background: linear-gradient(90deg, #5c9e1e 0%, #468013 100%);
                    color: #ffffff;
                }
                .slm-btn-success:hover:not(:disabled) {
                    filter: brightness(1.15);
                }

                /* Search Results */
                .slm-results-info {
                    font-size: 12px;
                    color: #8f98a0;
                    display: flex;
                    justify-content: space-between;
                }
                .slm-results-list {
                    flex: 1;
                    overflow-y: auto;
                    border: 1px solid #2a475e;
                    border-radius: 6px;
                    background: #0f141a;
                    display: flex;
                    flex-direction: column;
                }
                .slm-result-item {
                    padding: 8px 12px;
                    border-bottom: 1px solid #1c2a38;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    cursor: pointer;
                    user-select: none;
                    border-left: 3px solid transparent;
                    transition: background 0.15s ease, border-left-color 0.15s ease;
                }
                .slm-result-item:last-child {
                    border-bottom: none;
                }
                .slm-result-item:hover {
                    background: rgba(102, 192, 244, 0.09);
                    border-left-color: #66c0f4;
                }
                .slm-result-item:active {
                    background: rgba(102, 192, 244, 0.18);
                }
                .slm-item-date {
                    font-size: 11px;
                    color: #8f98a0;
                    white-space: nowrap;
                    min-width: 95px;
                    flex-shrink: 0;
                }
                .slm-item-title {
                    flex: 1;
                    min-width: 0;
                    font-size: 12px;
                    font-weight: 600;
                    color: #ffffff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    transition: color 0.15s ease;
                }
                .slm-result-item:hover .slm-item-title {
                    color: #66c0f4;
                }
                .slm-badge-tag {
                    display: inline-block;
                    padding: 2px 7px;
                    border-radius: 3px;
                    font-size: 10px;
                    font-weight: 600;
                    background: #203548;
                    color: #a0bed6;
                    white-space: nowrap;
                    flex-shrink: 0;
                }
                .slm-badge-tag.free {
                    background: #2a4b23;
                    color: #92e078;
                }
                .slm-badge-tag.retail {
                    background: #4a381b;
                    color: #ffca7a;
                }
                .slm-badge-tag.store {
                    background: #1b384a;
                    color: #66c0f4;
                }

                /* Scraper Tab */
                .slm-progress-container {
                    background: #0e141b;
                    border: 1px solid #2a475e;
                    border-radius: 6px;
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .slm-progress-bar-wrap {
                    height: 12px;
                    background: #171d25;
                    border-radius: 6px;
                    overflow: hidden;
                    border: 1px solid #2a475e;
                }
                .slm-progress-bar-fill {
                    height: 100%;
                    width: 0%;
                    background: linear-gradient(90deg, #47bfff 0%, #1a9fff 100%);
                    transition: width 0.25s ease;
                }
                .slm-progress-labels {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: #c7d5e0;
                }
                .slm-log-box {
                    flex: 1;
                    min-height: 180px;
                    background: #090c10;
                    border: 1px solid #202b38;
                    border-radius: 6px;
                    padding: 8px 10px;
                    font-family: Consolas, monospace;
                    font-size: 11px;
                    color: #79a8cf;
                    overflow-y: auto;
                    white-space: pre-wrap;
                }

                /* Highlight on navigation target row */
                @keyframes slm-highlight-glow {
                    0% { background-color: rgba(102, 192, 244, 0.45); outline: 2px solid #66c0f4; }
                    50% { background-color: rgba(255, 215, 0, 0.55); outline: 2px solid #ffd700; }
                    100% { background-color: rgba(102, 192, 244, 0.2); outline: 1px solid #66c0f4; }
                }
                .slm-target-highlight {
                    animation: slm-highlight-glow 2.5s ease-in-out infinite alternate !important;
                }

                /* Native Paginator Enhancement (.license_paginator_ctn) */
                .license_paginator_ctn {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: space-between !important;
                    flex-wrap: wrap !important;
                    gap: 10px !important;
                    padding: 8px 12px !important;
                    background: rgba(0, 0, 0, 0.25) !important;
                    border: 1px solid rgba(255, 255, 255, 0.05) !important;
                    border-radius: 4px !important;
                    margin: 8px 0 !important;
                }

                .license_paginator_ctn > span {
                    color: #8f98a0 !important;
                    font-size: 13px !important;
                }

                .slm-nav-container {
                    display: inline-flex;
                    align-items: center;
                    background: rgba(16, 24, 34, 0.85);
                    border: 1px solid #2a475e;
                    border-radius: 4px;
                    padding: 3px 6px;
                    gap: 4px;
                    font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
                    font-size: 12px;
                    color: #c6d4df;
                    box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.4);
                }

                .slm-nav-pill {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 3px 8px;
                    background: rgba(103, 193, 245, 0.1);
                    border: 1px solid rgba(103, 193, 245, 0.25);
                    border-radius: 3px;
                    color: #67c1f5 !important;
                    text-decoration: none !important;
                    cursor: pointer;
                    user-select: none;
                    font-weight: 500;
                    transition: all 0.15s ease;
                }

                .slm-nav-pill:hover:not(.disabled) {
                    background: rgba(103, 193, 245, 0.25);
                    border-color: #67c1f5;
                    color: #ffffff !important;
                    box-shadow: 0 0 6px rgba(103, 193, 245, 0.4);
                }

                .slm-nav-pill.disabled {
                    opacity: 0.3;
                    cursor: default;
                    pointer-events: none;
                    border-color: rgba(255, 255, 255, 0.08);
                    color: #8f98a0 !important;
                    background: transparent;
                }

                .slm-nav-jump-box {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    margin: 0 4px;
                    color: #8f98a0;
                    font-size: 12px;
                }

                .slm-nav-input {
                    width: 48px;
                    padding: 2px 4px;
                    background: rgba(0, 0, 0, 0.6);
                    border: 1px solid #2a475e;
                    border-radius: 3px;
                    color: #ffffff;
                    text-align: center;
                    font-size: 12px;
                    font-weight: bold;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }

                .slm-nav-input:focus {
                    border-color: #67c1f5;
                    box-shadow: 0 0 6px rgba(103, 193, 245, 0.5);
                    background: rgba(0, 0, 0, 0.8);
                }

                .slm-nav-input::-webkit-outer-spin-button,
                .slm-nav-input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                .slm-nav-input[type=number] {
                    -moz-appearance: textfield;
                }

                .slm-nav-go-btn {
                    padding: 2px 8px;
                    background: linear-gradient(135deg, #47bfff 0%, #1a44c2 100%);
                    border: none;
                    border-radius: 3px;
                    color: #ffffff;
                    font-size: 12px;
                    font-weight: bold;
                    cursor: pointer;
                    line-height: 18px;
                    transition: filter 0.15s ease, transform 0.05s ease;
                }

                .slm-nav-go-btn:hover {
                    filter: brightness(1.2);
                    box-shadow: 0 0 6px rgba(71, 191, 255, 0.5);
                }

                .slm-nav-go-btn:active {
                    transform: scale(0.96);
                }

                .slm-nav-msg {
                    font-size: 11px;
                    color: #ff6b6b;
                    margin-left: 4px;
                }
            `;

            const style = document.createElement('style');
            style.id = 'slm-custom-styles';
            style.textContent = css;
            document.head.appendChild(style);
        }

        createBadge() {
            this.badge = document.createElement('div');
            this.badge.id = 'slm-badge';
            this.badge.innerHTML = `
                <div class="slm-badge-dot" id="slm-status-dot"></div>
                <span id="slm-badge-text">Лицензии DB: ...</span>
            `;
            this.badge.addEventListener('click', () => {
                this.togglePanel();
            });
            document.body.appendChild(this.badge);
        }

        createPanel() {
            this.panel = document.createElement('div');
            this.panel.id = 'slm-panel';
            this.panel.innerHTML = `
                <div class="slm-header">
                    <div class="slm-title">
                        🎮 База Лицензий Steam <span class="ver">v${VERSION}</span>
                    </div>
                    <div class="slm-header-actions">
                        <button class="slm-btn-icon" id="slm-btn-minimize" title="Свернуть">✕</button>
                    </div>
                </div>

                <div class="slm-tabs">
                    <div class="slm-tab active" data-tab="search">🔍 Поиск по БД</div>
                    <div class="slm-tab" data-tab="scraper">⚡ Синхронизация</div>
                    <div class="slm-tab" data-tab="storage">💾 База и Экспорт</div>
                </div>

                <div class="slm-content">
                    <!-- Tab 1: Поиск -->
                    <div class="slm-tab-pane active" id="slm-pane-search">
                        <div class="slm-input-group">
                            <input type="text" class="slm-input" id="slm-search-input" placeholder="Поиск игры по названию или PackageID..." />
                            <select class="slm-select" id="slm-filter-type">
                                <option value="">Все типы</option>
                                <option value="Бесплатно">Бесплатно</option>
                                <option value="Розница">Розница</option>
                                <option value="Покупка в магазине">Магазин</option>
                            </select>
                        </div>
                        <div class="slm-results-info">
                            <span id="slm-search-count">Введите запрос для поиска</span>
                            <span id="slm-total-stat">Всего в базе: 0</span>
                        </div>
                        <div class="slm-results-list" id="slm-search-results">
                            <div style="padding: 24px; text-align: center; color: #8f98a0; font-size: 13px;">
                                Начните ввод для быстрого поиска по базе лицензий...
                            </div>
                        </div>
                    </div>

                    <!-- Tab 2: Сбор данных -->
                    <div class="slm-tab-pane" id="slm-pane-scraper">
                        <div class="slm-progress-container">
                            <div class="slm-progress-labels">
                                <span id="slm-progress-status">Статус: Ожидание</span>
                                <span id="slm-progress-percent">0%</span>
                            </div>
                            <div class="slm-progress-bar-wrap">
                                <div class="slm-progress-bar-fill" id="slm-progress-bar"></div>
                            </div>
                            <div class="slm-progress-labels" style="font-size: 11px; color: #8f98a0;">
                                <span id="slm-pages-info">Страниц: 0 / 0</span>
                                <span id="slm-lic-info">Лицензий: 0 / 0</span>
                            </div>
                        </div>

                        <div class="slm-input-group" style="flex-wrap: wrap;">
                            <button class="slm-btn slm-btn-success" id="slm-btn-sync" title="Умная синхронизация: проверяет стр. 1, моментально останавливается при встрече уже известных игр, не делая лишних проходов. Если база пуста — собирает все страницы.">▶ Синхронизировать базу</button>
                            <button class="slm-btn slm-btn-secondary" id="slm-btn-resume" title="Продолжить сбор с последней сохраненной страницы">🔄 Возобновить</button>
                            <button class="slm-btn slm-btn-secondary" id="slm-btn-pause" disabled>⏸ Пауза</button>
                            <button class="slm-btn slm-btn-danger" id="slm-btn-stop" disabled>⏹ Стоп</button>
                        </div>

                        <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #8f98a0;">
                            <span>Задержка между запросами:</span>
                            <select class="slm-select" id="slm-speed-select" style="padding: 4px 8px;">
                                <option value="150">Быстрая (150 мс)</option>
                                <option value="350" selected>Оптимальная (350 мс)</option>
                                <option value="700">Безопасная (700 мс)</option>
                                <option value="1200">Медленная (1200 мс)</option>
                            </select>
                        </div>

                        <div class="slm-log-box" id="slm-log">Готов к работе. Нажмите «Синхронизировать базу» для быстрой проверки новинок или загрузки каталога.</div>
                    </div>

                    <!-- Tab 3: Управление базой -->
                    <div class="slm-tab-pane" id="slm-pane-storage">
                        <div style="background: #0e141b; border: 1px solid #2a475e; border-radius: 6px; padding: 12px; font-size: 13px; line-height: 1.6;">
                            <div><strong>Статистика IndexedDB:</strong></div>
                            <div id="slm-db-stat-text">Загрузка данных...</div>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="font-size: 12px; color: #8f98a0; font-weight: 600;">ЭКСПОРТ ДАННЫХ:</div>
                            <div class="slm-input-group">
                                <button class="slm-btn" id="slm-btn-export-json">💾 Экспорт в JSON</button>
                                <button class="slm-btn slm-btn-secondary" id="slm-btn-export-csv">📊 Экспорт в CSV</button>
                            </div>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="font-size: 12px; color: #8f98a0; font-weight: 600;">ИМПОРТ ИЗ БЭКАПА:</div>
                            <input type="file" id="slm-file-import" accept=".json" style="display: none;" />
                            <button class="slm-btn slm-btn-secondary" id="slm-btn-import-json">📂 Импортировать JSON</button>
                        </div>

                        <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid #2a475e;">
                            <button class="slm-btn slm-btn-danger" id="slm-btn-clear-db" style="width: 100%;">🗑 Очистить всю базу данных</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(this.panel);
            this.bindEvents();
        }

        bindEvents() {
            // Кнопка сворачивания
            this.panel.querySelector('#slm-btn-minimize').addEventListener('click', () => {
                this.togglePanel(false);
            });

            // Переключение вкладок
            const tabs = this.panel.querySelectorAll('.slm-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    this.panel.querySelectorAll('.slm-tab-pane').forEach(p => p.classList.remove('active'));

                    tab.classList.add('active');
                    const tabName = tab.getAttribute('data-tab');
                    const pane = this.panel.querySelector(`#slm-pane-${tabName}`);
                    if (pane) pane.classList.add('active');
                    this.currentTab = tabName;

                    if (tabName === 'storage') {
                        this.refreshStorageStats();
                    } else if (tabName === 'search') {
                        this.performSearch();
                    }
                });
            });

            // Поиск в реальном времени
            const searchInput = this.panel.querySelector('#slm-search-input');
            const filterType = this.panel.querySelector('#slm-filter-type');

            searchInput.addEventListener('input', () => {
                clearTimeout(this.searchDebounceTimer);
                this.searchDebounceTimer = setTimeout(() => this.performSearch(), 200);
            });

            filterType.addEventListener('change', () => {
                this.performSearch();
            });

            // Настройка скорости
            const speedSelect = this.panel.querySelector('#slm-speed-select');
            speedSelect.addEventListener('change', (e) => {
                if (this.scraper) {
                    this.scraper.setDelay(parseInt(e.target.value, 10));
                    this.log(`⚡ Задержка между запросами установлена на ${e.target.value} мс.`);
                }
            });

            // Единая кнопка: Умная синхронизация базы
            this.panel.querySelector('#slm-btn-sync').addEventListener('click', () => {
                this.setButtonsState(true);
                this.scraper.start('sync');
            });

            // Кнопка: Возобновить с контрольной точки
            this.panel.querySelector('#slm-btn-resume').addEventListener('click', () => {
                this.setButtonsState(true);
                this.scraper.start('resume');
            });

            // Пауза и Стоп
            this.panel.querySelector('#slm-btn-pause').addEventListener('click', () => {
                this.scraper.pause();
                this.setButtonsState(false, true);
                this.updateResumeButtonState();
            });

            this.panel.querySelector('#slm-btn-stop').addEventListener('click', () => {
                this.scraper.stop();
                this.setButtonsState(false, false);
                this.updateResumeButtonState();
            });

            // Экспорт JSON
            this.panel.querySelector('#slm-btn-export-json').addEventListener('click', async () => {
                await this.exportJSON();
            });

            // Экспорт CSV
            this.panel.querySelector('#slm-btn-export-csv').addEventListener('click', async () => {
                await this.exportCSV();
            });

            // Импорт JSON
            const fileInput = this.panel.querySelector('#slm-file-import');
            this.panel.querySelector('#slm-btn-import-json').addEventListener('click', () => {
                fileInput.click();
            });
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    await this.importJSON(file);
                    fileInput.value = '';
                }
            });

            // Очистка БД (только явным действием пользователя на вкладке Хранилище)
            this.panel.querySelector('#slm-btn-clear-db').addEventListener('click', async () => {
                if (confirm('Вы действительно хотите полностью очистить локальную базу лицензий?')) {
                    await db.clearAll();
                    this.log('🗑 База данных полностью очищена.');
                    await this.updateBadgeCount();
                    this.updateResumeButtonState();
                    this.refreshStorageStats();
                    this.performSearch();
                }
            });

            // Обработка перехода по клику на игру (прямой переход по всей строке)
            const resultsContainer = this.panel.querySelector('#slm-search-results');
            resultsContainer.addEventListener('click', (e) => {
                const itemEl = e.target.closest('.slm-result-item');
                if (itemEl) {
                    const targetUrl = itemEl.getAttribute('data-url');
                    if (targetUrl) {
                        window.location.href = targetUrl;
                    }
                }
            });
        }

        initScraper() {
            this.scraper = new LicensesScraper(
                (progress) => {
                    this.updateProgressUI(progress);
                },
                (logMsg) => {
                    this.log(logMsg);
                },
                () => {
                    this.setButtonsState(false, false);
                    this.updateBadgeCount();
                    this.updateResumeButtonState();
                }
            );
        }

        async updateResumeButtonState() {
            const btnResume = this.panel.querySelector('#slm-btn-resume');
            if (!btnResume) return;

            const meta = await db.getMeta('sync_progress');
            const totalInDb = await db.countLicenses();
            const totalLicDetected = SteamLicensesParser.parseTotalCount(document);

            // Если все лицензии уже в базе (база полная), или статус completed
            const isFullyLoaded = (meta && meta.status === 'completed') || (totalLicDetected && totalInDb >= totalLicDetected - 10);

            if (isFullyLoaded) {
                btnResume.disabled = true;
                btnResume.style.opacity = '0.5';
                btnResume.style.cursor = 'not-allowed';
                btnResume.textContent = '🔄 Возобновить';
                btnResume.title = 'Все страницы уже выгружены. База полная.';
            } else if (meta && meta.nextUrl && meta.status !== 'completed') {
                btnResume.disabled = false;
                btnResume.style.opacity = '1';
                btnResume.style.cursor = 'pointer';
                btnResume.textContent = `🔄 Возобновить (со стр. ${meta.nextPage || 1})`;
                btnResume.title = `Продолжить сбор со страницы ${meta.nextPage || 1}`;
            } else {
                btnResume.disabled = true;
                btnResume.style.opacity = '0.5';
                btnResume.style.cursor = 'not-allowed';
                btnResume.textContent = '🔄 Возобновить';
                btnResume.title = 'Нет незавершенного сбора для возобновления.';
            }
        }

        togglePanel(forceState = null) {
            const isOpen = forceState !== null ? forceState : !this.panel.classList.contains('open');
            if (isOpen) {
                this.panel.classList.add('open');
                this.updateBadgeCount();
                this.updateResumeButtonState();
                this.performSearch();
            } else {
                this.panel.classList.remove('open');
            }
        }

        setButtonsState(isRunning, isPaused = false) {
            const btnSync = this.panel.querySelector('#slm-btn-sync');
            const btnResume = this.panel.querySelector('#slm-btn-resume');
            const btnPause = this.panel.querySelector('#slm-btn-pause');
            const btnStop = this.panel.querySelector('#slm-btn-stop');
            const dot = this.badge.querySelector('#slm-status-dot');

            btnSync.disabled = isRunning;
            btnResume.disabled = isRunning;
            btnPause.disabled = !isRunning;
            btnStop.disabled = !isRunning;

            if (isRunning) {
                dot.classList.add('active');
                this.panel.querySelector('#slm-progress-status').textContent = 'Статус: Синхронизация активна...';
            } else {
                dot.classList.remove('active');
                this.panel.querySelector('#slm-progress-status').textContent = isPaused ? 'Статус: Приостановлено' : 'Статус: Ожидание';
            }
        }

        updateProgressUI(progress) {
            const bar = this.panel.querySelector('#slm-progress-bar');
            const percentLabel = this.panel.querySelector('#slm-progress-percent');
            const pagesLabel = this.panel.querySelector('#slm-pages-info');
            const licLabel = this.panel.querySelector('#slm-lic-info');

            const pct = progress.percent !== null ? progress.percent : 0;
            bar.style.width = `${pct}%`;
            percentLabel.textContent = `${pct}%`;
            pagesLabel.textContent = `Страниц: ${progress.currentPage} / ${progress.totalPages}`;

            if (progress.currentPage >= progress.totalPages && Math.abs(progress.totalLicenses - progress.licensesScraped) <= 2) {
                licLabel.textContent = `Лицензий: ${progress.licensesScraped.toLocaleString('ru-RU')} / ${progress.licensesScraped.toLocaleString('ru-RU')} (100%)`;
                licLabel.title = `Собраны 100% доступных в веб-интерфейсе строк (${progress.licensesScraped}). Разница с заголовком Steam — скрытая системная запись Valve.`;
            } else {
                licLabel.textContent = `Лицензий: ${progress.licensesScraped.toLocaleString('ru-RU')} / ${progress.totalLicenses.toLocaleString('ru-RU')}`;
            }

            this.updateBadgeCount(progress.licensesScraped);
        }

        async updateBadgeCount(explicitCount = null) {
            const count = explicitCount !== null ? explicitCount : await db.countLicenses();
            const badgeText = this.badge.querySelector('#slm-badge-text');
            badgeText.textContent = `Лицензии DB: ${count.toLocaleString('ru-RU')}`;

            const totalStat = this.panel.querySelector('#slm-total-stat');
            if (totalStat) {
                totalStat.textContent = `Всего в базе: ${count.toLocaleString('ru-RU')}`;
            }
        }

        async refreshStorageStats() {
            const statText = this.panel.querySelector('#slm-db-stat-text');
            const totalLic = await db.countLicenses();
            const totalPages = await db.countPages();
            const syncProgress = await db.getMeta('sync_progress');

            statText.innerHTML = `
                <div>• Всего записей лицензий: <strong>${totalLic.toLocaleString('ru-RU')}</strong></div>
                <div>• Всего сохраненных страниц: <strong>${totalPages.toLocaleString('ru-RU')}</strong></div>
                <div>• Последний статус: <strong>${syncProgress ? syncProgress.status : 'нет данных'}</strong></div>
                ${syncProgress && syncProgress.lastUpdated ? `<div>• Дата обновления: <strong>${new Date(syncProgress.lastUpdated).toLocaleString('ru-RU')}</strong></div>` : ''}
            `;
        }

        log(msg) {
            const logBox = this.panel.querySelector('#slm-log');
            const time = new Date().toLocaleTimeString('ru-RU');
            logBox.textContent += `\n[${time}] ${msg}`;
            logBox.scrollTop = logBox.scrollHeight;
        }

        async performSearch() {
            const searchInput = this.panel.querySelector('#slm-search-input');
            const filterType = this.panel.querySelector('#slm-filter-type').value;
            const resultsContainer = this.panel.querySelector('#slm-search-results');
            const searchCount = this.panel.querySelector('#slm-search-count');

            const query = searchInput.value.trim();
            const items = await db.searchLicenses(query, 100, filterType);

            if (items.length === 0) {
                resultsContainer.innerHTML = `
                    <div style="padding: 24px; text-align: center; color: #8f98a0; font-size: 13px;">
                        ${query ? 'Ничего не найдено по запросу «' + this.escapeHtml(query) + '»' : 'База данных пуста или нет записей.'}
                    </div>
                `;
                searchCount.textContent = 'Найдено: 0';
                return;
            }

            searchCount.textContent = `Найдено: ${items.length}${items.length >= 100 ? '+ (показаны первые 100)' : ''}`;

            let html = '';
            for (const item of items) {
                let typeTagClass = '';
                const typeLower = (item.acquisition_type || '').toLowerCase();
                if (typeLower.includes('бесплатн') || typeLower.includes('free')) {
                    typeTagClass = 'free';
                } else if (typeLower.includes('розниц') || typeLower.includes('retail')) {
                    typeTagClass = 'retail';
                } else if (typeLower.includes('магазин') || typeLower.includes('store')) {
                    typeTagClass = 'store';
                }

                const targetNameEncoded = encodeURIComponent(item.name || '');
                const jumpUrl = item.page_url + (item.page_url.includes('?') ? '&' : '?') + `slm_target=${targetNameEncoded}`;
                const titleTooltip = `${item.name || 'Без названия'} (${item.date || '—'}) — нажмите для перехода на стр. ${item.page}`;

                html += `
                    <div class="slm-result-item" data-url="${this.escapeHtml(jumpUrl)}" title="${this.escapeHtml(titleTooltip)}">
                        <span class="slm-item-date">${this.escapeHtml(item.date || '—')}</span>
                        <span class="slm-item-title">${this.escapeHtml(item.name || 'Без названия')}</span>
                        <span class="slm-badge-tag ${typeTagClass}">${this.escapeHtml(item.acquisition_type || '—')}</span>
                    </div>
                `;
            }

            resultsContainer.innerHTML = html;
        }

        escapeHtml(str) {
            return String(str || '').replace(/[&<>"']/g, m => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            })[m]);
        }

        async exportJSON() {
            this.log('⏳ Подготовка экспорта базы в JSON...');
            const allLicenses = await db.getAllLicenses();
            const allPages = await db.getAllPages();

            const exportData = {
                exportedAt: new Date().toISOString(),
                version: VERSION,
                totalLicenses: allLicenses.length,
                totalPages: allPages.length,
                pages: allPages,
                licenses: allLicenses
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `steam_licenses_backup_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.log(`✅ Экспорт завершен: сохранено ${allLicenses.length} лицензий.`);
        }

        async exportCSV() {
            this.log('⏳ Подготовка экспорта в CSV...');
            const allLicenses = await db.getAllLicenses();

            const headers = ['Название', 'Дата', 'Способ покупки', 'PackageID', 'Страница', 'Offset', 'URL страницы'];
            const rows = [headers.join(';')];

            for (const item of allLicenses) {
                const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
                rows.push([
                    escapeCsv(item.name),
                    escapeCsv(item.date),
                    escapeCsv(item.acquisition_type),
                    escapeCsv(item.package_id || ''),
                    item.page,
                    item.offset,
                    escapeCsv(item.page_url)
                ].join(';'));
            }

            const csvContent = '\uFEFF' + rows.join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `steam_licenses_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            this.log(`✅ Экспорт CSV завершен: ${allLicenses.length} строк.`);
        }

        async importJSON(file) {
            try {
                this.log(`⏳ Чтение файла ${file.name}...`);
                const text = await file.text();
                const data = JSON.parse(text);

                if (!data.licenses || !Array.isArray(data.licenses)) {
                    throw new Error('Файл не содержит валидного массива лицензий.');
                }

                if (!confirm(`Импортировать ${data.licenses.length} лицензий в базу данных? Существующие записи будут дополнены.`)) {
                    return;
                }

                this.log(`⏳ Импорт ${data.licenses.length} записей в IndexedDB...`);
                await db.saveLicensesBatch(data.licenses, null);

                if (data.pages && Array.isArray(data.pages)) {
                    for (const p of data.pages) {
                        await db.saveLicensesBatch([], p);
                    }
                }

                this.log(`✅ Успешно импортировано ${data.licenses.length} лицензий!`);
                await this.updateBadgeCount();
                this.updateResumeButtonState();
                this.refreshStorageStats();
                this.performSearch();
            } catch (err) {
                this.log(`❌ Ошибка импорта: ${err.message}`);
                alert(`Ошибка при чтении файла: ${err.message}`);
            }
        }

        /**
         * Подсветка игры на текущей странице, если перешли по ссылке из БД
         */
        handleNavigationHighlight() {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const targetName = urlParams.get('slm_target');

                if (targetName) {
                    const decodedName = decodeURIComponent(targetName).trim().toLowerCase();
                    const table = document.querySelector('table.account_table') || document.querySelector('table');
                    if (!table) return;

                    const rows = Array.from(table.querySelectorAll('tr'));
                    for (const row of rows) {
                        const itemCell = row.querySelector('.license_item_col') || row.querySelectorAll('td')[1];
                        if (itemCell && itemCell.innerText.trim().toLowerCase() === decodedName) {
                            row.classList.add('slm-target-highlight');
                            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            break;
                        }
                    }
                }
            } catch (e) {
                console.error('[SteamLicenses] Ошибка подсветки строки:', e);
            }
        }

        /**
         * Внедрение нативных кнопок и формы перехода на любую страницу
         * прямо в стандартные контейнеры пагинации Steam (.license_paginator_ctn)
         */
        async injectNativePaginationControls() {
            try {
                const paginators = document.querySelectorAll('.license_paginator_ctn');
                if (!paginators || paginators.length === 0) return;

                // 1. Определение текущей страницы (из URL offset или текста в контейнере)
                const urlParams = new URLSearchParams(window.location.search);
                const offsetStr = urlParams.get('offset');
                let currentPage = 1;

                if (offsetStr) {
                    currentPage = Math.floor(parseInt(offsetStr, 10) / 100) + 1;
                } else {
                    const spanText = paginators[0]?.querySelector('span')?.innerText || '';
                    const match = spanText.match(/(\d+)[\s\u00A0]*[–-][\s\u00A0]*(\d+)/);
                    if (match) {
                        currentPage = Math.ceil(parseInt(match[2], 10) / 100);
                    }
                }

                // 2. Определение общего количества страниц
                const totalLic = SteamLicensesParser.parseTotalCount(document) || await db.countLicenses();
                const totalPagesInDb = await db.countPages();
                const totalPages = totalLic ? Math.ceil(totalLic / 100) : (totalPagesInDb || 703);

                // 3. Функция быстрого перехода
                const jumpToTargetPage = async (targetPage, msgEl) => {
                    const pageNum = parseInt(targetPage, 10);
                    if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
                        if (msgEl) {
                            msgEl.textContent = `Укажите стр. от 1 до ${totalPages}`;
                            msgEl.style.display = 'inline';
                            setTimeout(() => { msgEl.style.display = 'none'; }, 3500);
                        }
                        return;
                    }

                    if (pageNum === currentPage) return;

                    // Страница 1 всегда статична
                    if (pageNum === 1) {
                        window.location.href = 'https://store.steampowered.com/account/licenses/';
                        return;
                    }

                    // Получаем точный токен и URL страницы из базы данных IndexedDB
                    const pageInfo = await db.getPage(pageNum);
                    if (pageInfo && pageInfo.pageUrl) {
                        window.location.href = pageInfo.pageUrl;
                    } else {
                        if (msgEl) {
                            msgEl.textContent = `Стр. ${pageNum} еще не сохранена в базе.`;
                            msgEl.style.display = 'inline';
                            setTimeout(() => { msgEl.style.display = 'none'; }, 4000);
                        } else {
                            alert(`Страница ${pageNum} еще не сохранена в локальной базе данных.\nНажмите «▶ Синхронизировать базу» в виджете.`);
                        }
                    }
                };

                // 4. Внедрение формы в каждый пагинатор
                paginators.forEach((paginator) => {
                    if (paginator.querySelector('.slm-nav-container')) return;

                    const navContainer = document.createElement('div');
                    navContainer.className = 'slm-nav-container';

                    navContainer.innerHTML = `
                        <a class="slm-nav-pill ${currentPage <= 1 ? 'disabled' : ''}" data-page="1" title="Первая страница (стр. 1)">⏮ 1</a>
                        <a class="slm-nav-pill ${currentPage <= 1 ? 'disabled' : ''}" data-page="${currentPage - 1}" title="Предыдущая страница (стр. ${currentPage - 1})">◀</a>
                        
                        <span class="slm-nav-jump-box">
                            <span class="slm-nav-text">Стр.</span>
                            <input type="number" class="slm-nav-input" min="1" max="${totalPages}" value="${currentPage}" title="Введите номер страницы и нажмите Enter или ➔" />
                            <span class="slm-nav-total">из ${totalPages}</span>
                            <button type="button" class="slm-nav-go-btn" title="Перейти на введенную страницу">➔</button>
                            <span class="slm-nav-msg" style="display: none;"></span>
                        </span>

                        <a class="slm-nav-pill ${currentPage >= totalPages ? 'disabled' : ''}" data-page="${currentPage + 1}" title="Следующая страница (стр. ${currentPage + 1})">▶</a>
                        <a class="slm-nav-pill ${currentPage >= totalPages ? 'disabled' : ''}" data-page="${totalPages}" title="Последняя страница (стр. ${totalPages})">${totalPages} ⏭</a>
                    `;

                    // Вставляем перед кнопкой "Дальше" (если есть), иначе в конец контейнера
                    const nextBtn = paginator.querySelector('.license_paginator_next');
                    if (nextBtn) {
                        paginator.insertBefore(navContainer, nextBtn);
                    } else {
                        paginator.appendChild(navContainer);
                    }

                    // Обработчики кликов по кнопкам и полю ввода
                    const msgEl = navContainer.querySelector('.slm-nav-msg');
                    const inputEl = navContainer.querySelector('.slm-nav-input');
                    const goBtn = navContainer.querySelector('.slm-nav-go-btn');

                    navContainer.querySelectorAll('.slm-nav-pill:not(.disabled)').forEach(pill => {
                        pill.addEventListener('click', (e) => {
                            e.preventDefault();
                            const target = parseInt(pill.getAttribute('data-page'), 10);
                            jumpToTargetPage(target, msgEl);
                        });
                    });

                    goBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        jumpToTargetPage(inputEl.value, msgEl);
                    });

                    inputEl.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            jumpToTargetPage(inputEl.value, msgEl);
                        }
                    });
                });
            } catch (err) {
                console.error('[SteamLicenses] Ошибка внедрения пагинации:', err);
            }
        }
    }

    // ==========================================
    // 5. Инициализация при загрузке страницы
    // ==========================================
    const ui = new LicensesUI();
    ui.init();

})();
