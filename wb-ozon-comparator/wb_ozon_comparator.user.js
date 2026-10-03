// ==UserScript==
// @name         WB & Ozon Comparator
// @namespace    https://github.com/vibe-coding/wb-ozon-comparator
// @version      1.2.1
// @description  Анализ и сравнение вариантов товаров на Wildberries и Ozon с учетом личных цен, веса без упаковки, коллекциями и экспортом в Excel (.xlsx)
// @author       Senior Software Engineer
// @match        https://*.wildberries.ru/*
// @match        https://*.ozon.ru/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_addValueChangeListener
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @connect      wildberries.ru
// @connect      wbbasket.ru
// @connect      card.wb.ru
// @connect      ozon.ru
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const __version__ = "1.2.1";
    const STORAGE_KEY = 'wb_ozon_comparator_items_v1';
    const COLLECTIONS_STORAGE_KEY = 'wb_ozon_comparator_collections_v2';
    const ACTIVE_COL_KEY = 'wb_ozon_comparator_active_col_v2';

    console.log(`[WB-Ozon-Comparator v${__version__}] Initializing...`);

    /* ==========================================================================
       1. STORAGE ENGINE (Кросс-доменное хранилище коллекций и лотов)
       ========================================================================== */
    const StorageEngine = {
        /* Получение всех сохраненных коллекций (с прозрачной миграцией v1 -> v2) */
        getCollections() {
            try {
                const raw = GM_getValue(COLLECTIONS_STORAGE_KEY, null);
                if (raw) {
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        return parsed;
                    }
                }
            } catch (e) {
                console.error('[StorageEngine] Collections read error:', e);
            }

            // Бесшовная миграция ранее собранных товаров в "Основную коллекцию"
            let legacyItems = [];
            try {
                const rawOld = GM_getValue(STORAGE_KEY, '[]');
                legacyItems = typeof rawOld === 'string' ? JSON.parse(rawOld) : (Array.isArray(rawOld) ? rawOld : []);
            } catch (e) {}

            const defaultCol = {
                id: 'col_default',
                name: 'Основная коллекция',
                items: legacyItems,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            const list = [defaultCol];
            try {
                GM_setValue(COLLECTIONS_STORAGE_KEY, JSON.stringify(list));
                GM_setValue(ACTIVE_COL_KEY, 'col_default');
            } catch (e) {}
            return list;
        },

        /* Сохранение списка коллекций */
        saveCollections(collections) {
            try {
                GM_setValue(COLLECTIONS_STORAGE_KEY, JSON.stringify(collections));
            } catch (e) {
                console.error('[StorageEngine] Collections save error:', e);
            }
        },

        /* Получение ID текущей активной коллекции */
        getActiveCollectionId() {
            const cols = this.getCollections();
            let activeId = GM_getValue(ACTIVE_COL_KEY, 'col_default');
            if (!cols.some(c => c.id === activeId)) {
                activeId = cols[0].id;
                GM_setValue(ACTIVE_COL_KEY, activeId);
            }
            return activeId;
        },

        /* Переключение активной коллекции */
        setActiveCollectionId(id) {
            const cols = this.getCollections();
            const target = cols.find(c => c.id === id);
            if (target) {
                GM_setValue(ACTIVE_COL_KEY, id);
                // Синхронизируем старый STORAGE_KEY для кросс-вкладочной совместимости
                try {
                    GM_setValue(STORAGE_KEY, JSON.stringify(target.items));
                } catch (e) {}

                UIEngine.updateBadge();
                if (typeof CatalogFilterEngine !== 'undefined') {
                    CatalogFilterEngine.applyFilter();
                }
            }
        },

        /* Получение объекта текущей активной коллекции */
        getActiveCollection() {
            const cols = this.getCollections();
            const activeId = this.getActiveCollectionId();
            return cols.find(c => c.id === activeId) || cols[0];
        },

        /* Создание новой коллекции */
        createCollection(name, items = []) {
            const cols = this.getCollections();
            const newCol = {
                id: `col_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                name: (name || '').trim() || `Коллекция ${cols.length + 1}`,
                items: [...items],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            cols.push(newCol);
            this.saveCollections(cols);
            this.setActiveCollectionId(newCol.id);
            return newCol;
        },

        /* Переименование коллекции */
        renameCollection(id, newName) {
            const cols = this.getCollections();
            const target = cols.find(c => c.id === id);
            if (target) {
                target.name = (newName || '').trim() || target.name;
                target.updatedAt = new Date().toISOString();
                this.saveCollections(cols);
                return true;
            }
            return false;
        },

        /* Удаление коллекции */
        deleteCollection(id) {
            let cols = this.getCollections();
            if (cols.length <= 1) {
                // Если осталась единственная коллекция, очищаем товары и сбрасываем название
                cols[0].items = [];
                cols[0].name = 'Основная коллекция';
                cols[0].updatedAt = new Date().toISOString();
                this.saveCollections(cols);
                this.setActiveCollectionId(cols[0].id);
                return true;
            }

            const wasActive = this.getActiveCollectionId() === id;
            cols = cols.filter(c => c.id !== id);
            this.saveCollections(cols);
            if (wasActive) {
                this.setActiveCollectionId(cols[0].id);
            }
            return true;
        },

        /* Товары текущей активной коллекции */
        getItems() {
            const activeCol = this.getActiveCollection();
            return activeCol ? activeCol.items : [];
        },

        /* Сохранение товаров текущей активной коллекции */
        saveItems(items) {
            const cols = this.getCollections();
            const activeId = this.getActiveCollectionId();
            const target = cols.find(c => c.id === activeId);
            if (target) {
                target.items = items;
                target.updatedAt = new Date().toISOString();
                this.saveCollections(cols);
            }
            // Синхронизация старого ключа
            try {
                GM_setValue(STORAGE_KEY, JSON.stringify(items));
            } catch (e) {}

            UIEngine.updateBadge();
            if (typeof CatalogFilterEngine !== 'undefined') {
                CatalogFilterEngine.applyFilter();
            }
        },

        addItem(item) {
            const items = this.getItems();
            const skuClean = String(item.sku || '').trim();
            const key = `${item.marketplace}_${skuClean}`.toLowerCase();

            // Ищем совпадение строго по уникальному артикулу маркетплейса
            const existingIdx = items.findIndex(i => {
                const iSku = String(i.sku || '').trim().toLowerCase();
                return `${i.marketplace}_${iSku}` === key;
            });

            const enrichedItem = {
                ...item,
                id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                addedAt: item.addedAt || new Date().toISOString(),
                // Расчет цены за 100 г и за штуку
                pricePer100g: (item.weightNetto && item.weightNetto > 0 && item.personalPrice > 0)
                    ? Math.round((item.personalPrice / (item.weightNetto / 100)) * 100) / 100
                    : null,
                pricePerItem: (item.itemsCount && item.itemsCount > 0 && item.personalPrice > 0)
                    ? Math.round((item.personalPrice / item.itemsCount) * 100) / 100
                    : null
            };

            if (existingIdx >= 0) {
                // Обновляем данные существующего артикула (с сохранением groupSkus если они уже были)
                if (!enrichedItem.groupSkus && items[existingIdx].groupSkus) {
                    enrichedItem.groupSkus = items[existingIdx].groupSkus;
                }
                if (!enrichedItem.imtId && items[existingIdx].imtId) {
                    enrichedItem.imtId = items[existingIdx].imtId;
                }
                items[existingIdx] = enrichedItem;
            } else {
                items.push(enrichedItem);
            }

            this.saveItems(items);
            return enrichedItem;
        },

        /* Автоматическая очистка существующих дубликатов по ключу marketplace_sku */
        cleanDuplicates() {
            const items = this.getItems();
            const seenKeys = new Set();
            const cleanItems = [];

            for (const item of items) {
                const sku = String(item.sku || '').trim();
                // Удаляем временные таймстамп-дубли Ozon (длина 13 цифр, сгенерированные ранее)
                if (/^178\d{10}$/.test(sku) && item.marketplace === 'Ozon') {
                    continue;
                }
                const key = `${item.marketplace}_${sku}`.toLowerCase();

                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    cleanItems.push(item);
                }
            }

            if (cleanItems.length !== items.length) {
                console.log(`[StorageEngine] Удалено ${items.length - cleanItems.length} дубликатов.`);
                this.saveItems(cleanItems);
            }
            return cleanItems;
        },

        /* Фоновое обогащение сохраненных товаров списком сестринских артикулов группы (colors) */
        enrichStoredItemsWithGroups() {
            const items = this.getItems();
            const needEnrich = items.filter(i => i.marketplace === 'Wildberries' && (!i.groupSkus || i.groupSkus.length === 0));
            if (needEnrich.length === 0) return;

            let changed = false;
            Promise.all(needEnrich.map(async (item) => {
                try {
                    const skuNum = parseInt(item.sku, 10);
                    if (skuNum) {
                        const card = await WBEngine.getCardData(skuNum);
                        if (card) {
                            if (Array.isArray(card.colors) && card.colors.length > 0) {
                                item.groupSkus = card.colors.map(String);
                                changed = true;
                            }
                            if (card.imt_id) {
                                item.imtId = card.imt_id;
                                changed = true;
                            }
                        }
                    }
                } catch (e) {
                    // тихо игнорируем сетевые ошибки для отдельных карточек
                }
            })).then(() => {
                if (changed) {
                    this.saveItems(items);
                    if (typeof CatalogFilterEngine !== 'undefined') {
                        CatalogFilterEngine.applyFilter();
                    }
                }
            });
        },

        addMultiple(newItems) {
            let addedCount = 0;
            newItems.forEach(item => {
                this.addItem(item);
                addedCount++;
            });
            return addedCount;
        },

        removeItem(id) {
            const items = this.getItems().filter(i => i.id !== id);
            this.saveItems(items);
        },

        clearAll() {
            this.saveItems([]);
        },

        getCount() {
            return this.getItems().length;
        }
    };

    /* ==========================================================================
       2. WILDBERRIES ENGINE (API Basket CDN + cards/v4/detail + DOM Discount)
       ========================================================================== */
    const WBEngine = {
        getBasketNumber(vol) {
            const ranges = [
                [0, 143, 1], [144, 287, 2], [288, 431, 3], [432, 719, 4],
                [720, 1007, 5], [1008, 1061, 6], [1062, 1115, 7], [1116, 1169, 8],
                [1170, 1313, 9], [1314, 1601, 10], [1602, 1655, 11], [1656, 1919, 12],
                [1920, 2045, 13], [2046, 2189, 14], [2190, 2405, 15], [2406, 2621, 16],
                [2622, 2837, 17], [2838, 3053, 18], [3054, 3269, 19], [3270, 3485, 20],
                [3486, 3701, 21], [3702, 3917, 22], [3918, 4133, 23], [4134, 4349, 24],
                [4350, 4565, 25], [4566, 4781, 26], [4782, 5213, 27], [5214, 5501, 28],
                [5502, 5817, 29], [5818, 6125, 30], [6126, 6440, 31], [6441, 6745, 32],
                [6746, 7070, 33], [7071, 7370, 34], [7371, 7700, 35], [7701, 8020, 36],
                [8021, 8305, 37], [8306, 8750, 38], [8751, 9172, 39], [9173, 9600, 40],
                [9601, 10375, 41], [10376, 11142, 42], [11143, 12000, 43]
            ];
            for (const [min, max, b] of ranges) {
                if (vol >= min && vol <= max) return b;
            }
            if (vol > 12000) {
                return 43 + Math.floor((vol - 12000) / 800);
            }
            return 43;
        },

        getCurrentSku() {
            const m = window.location.pathname.match(/\/catalog\/(\d+)\/detail\.aspx/) ||
                      window.location.pathname.match(/\/catalog\/(\d+)/);
            if (m) return parseInt(m[1], 10);

            const skuEl = document.querySelector('[data-link*="article"], .product-article__number, .articleText');
            if (skuEl) {
                const digits = skuEl.textContent.replace(/\D/g, '');
                if (digits) return parseInt(digits, 10);
            }
            return null;
        },

        getDomPrice() {
            // 1. Поиск блока покупки товара (Buy Box)
            // Строго исключаем шапку сайта (header, navbar-pc), меню, профиль, баланс кошелька, корзину, футер
            const buyBtn = Array.from(document.querySelectorAll('button, a')).find(b => {
                if (b.closest('header, nav, [class*="navbar"], [class*="header"], footer, #wbo-dock')) return false;
                const t = (b.textContent || '').trim().toLowerCase();
                return t.includes('в корзину') || t.includes('купить сейчас');
            });

            const buyContainer = buyBtn
                ? (buyBtn.closest('aside, [class*="aside"], [class*="order"], [class*="product-buy"], [class*="price-block"]') || buyBtn.parentElement?.parentElement)
                : document.querySelector('aside.product-buy, aside[class*="aside"], [class*="orderContainer"], [class*="order-container"], [class*="product-buy"], main [class*="price-block"]');

            if (!buyContainer) {
                console.warn('[WB] Buy container not found');
                return null;
            }

            // 2. Ищем элементы с ценой в рублях строго ВНУТРИ блока покупки
            // Цена товара ВСЕГДА расположена выше кнопок покупки (buyBtn)
            const rubElements = Array.from(buyContainer.querySelectorAll('span, ins, div, p, b, strong')).filter(el => {
                const txt = el.textContent || '';
                if (!txt.includes('₽')) return false;
                // Только листовые элементы с символом ₽ (без вложенных блоков с ₽)
                if (Array.from(el.children).some(c => c.textContent && c.textContent.includes('₽'))) return false;

                // Исключаем элементы ниже кнопок покупки (рассрочки, предложения других продавцов и т.д.)
                if (buyBtn && (buyBtn.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                    return false;
                }

                // Исключаем зачеркнутые старые цены
                const isStrikethrough = el.closest('del, s, strike') ||
                    (window.getComputedStyle(el).textDecorationLine || '').includes('line-through') ||
                    /(old|cross|del|strike|base|original|secondary)/i.test(el.className || '');
                if (isStrikethrough) return false;

                // Исключаем кредиты, рассрочки и предложения сторонних продавцов
                const parentText = (el.parentElement?.textContent || '').toLowerCase();
                if (parentText.includes('в месяц') || parentText.includes('частями') || parentText.includes('от ') || parentText.includes('платеж') || parentText.includes('предложен')) {
                    return false;
                }

                return true;
            });

            const validPrices = [];
            for (const el of rubElements) {
                const match = el.textContent.match(/(\d[\d\s]*)\s*₽/);
                if (match) {
                    const val = parseFloat(match[1].replace(/\s/g, ''));
                    if (!isNaN(val) && val > 0 && !validPrices.includes(val)) {
                        validPrices.push(val);
                    }
                }
            }

            // Если найдены валидные цены выше кнопки покупки — берем минимальную (это цена с WB Кошельком)
            if (validPrices.length > 0) {
                return Math.min(...validPrices);
            }

            // Запасной поиск по специализированным классам кошелька строго внутри buyContainer
            const walletSelectors = [
                '[class*="price-block__wallet-price"]',
                '[class*="price-block__final-price"]',
                '[class*="walletPrice"]',
                '[class*="redPrice"]'
            ];
            for (const sel of walletSelectors) {
                const el = buyContainer.querySelector(sel);
                if (el) {
                    const m = el.textContent.match(/(\d[\d\s]*)\s*₽/);
                    if (m) {
                        const val = parseFloat(m[1].replace(/\s/g, ''));
                        if (!isNaN(val) && val > 0) return val;
                    }
                }
            }

            return null;
        },

        async fetchJson(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    timeout: 8000,
                    headers: { 'Accept': 'application/json' },
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            try {
                                resolve(JSON.parse(res.responseText));
                            } catch (e) {
                                reject(e);
                            }
                        } else {
                            reject(new Error(`HTTP ${res.status}`));
                        }
                    },
                    onerror: (err) => reject(err),
                    ontimeout: () => reject(new Error('Timeout'))
                });
            });
        },

        async getCardData(nmId) {
            const vol = Math.floor(nmId / 100000);
            const part = Math.floor(nmId / 1000);
            const predictedBasket = this.getBasketNumber(vol);

            const candidates = [predictedBasket];
            for (const delta of [1, -1, 2, -2, 3, -3]) {
                const b = predictedBasket + delta;
                if (b >= 1 && b <= 50 && !candidates.includes(b)) {
                    candidates.push(b);
                }
            }

            let lastErr = null;
            for (const b of candidates) {
                const bStr = String(b).padStart(2, '0');
                const url = `https://basket-${bStr}.wbbasket.ru/vol${vol}/part${part}/${nmId}/info/ru/card.json`;
                try {
                    return await this.fetchJson(url);
                } catch (err) {
                    lastErr = err;
                    if (err.message && !err.message.includes('404')) {
                        throw err;
                    }
                }
            }
            throw lastErr || new Error(`Не удалось загрузить карточку для артикула ${nmId}`);
        },

        async getBatchPrices(nmIds) {
            try {
                const idStr = nmIds.join(';');
                const url = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&nm=${idStr}`;
                const data = await this.fetchJson(url);
                const map = {};
                if (data && data.products) {
                    for (const p of data.products) {
                        const size = (p.sizes && p.sizes[0]) || {};
                        const priceObj = size.price || {};
                        map[p.id] = {
                            basicPrice: (priceObj.basic || 0) / 100,
                            productPrice: (priceObj.product || 0) / 100,
                            rating: p.reviewRating || p.rating || 0,
                            feedbacks: p.feedbacks || 0,
                            supplier: p.supplier || p.brand || ''
                        };
                    }
                }
                return map;
            } catch (e) {
                console.warn('[WB Engine] Error fetching batch prices:', e);
                return {};
            }
        },

        parseNetWeight(options, imtName = '', description = '', weightGross = null) {
            // 1. Поиск в options
            if (Array.isArray(options)) {
                for (const opt of options) {
                    const name = (opt.name || '').toLowerCase();
                    if (name.includes('без упаковки') || name.includes('вес товара') || name.includes('вес нетто') || name.includes('масса нетто') || name.includes('чистый вес')) {
                        const rawVal = String(opt.value || '');
                        const num = parseFloat(rawVal.replace(',', '.').replace(/[^\d.]/g, ''));
                        if (!isNaN(num) && num > 0) {
                            return { value: rawVal.includes('кг') ? Math.round(num * 1000) : Math.round(num), isGrossFallback: false };
                        }
                    }
                }
                for (const opt of options) {
                    const name = (opt.name || '').toLowerCase();
                    if (name === 'вес' || name === 'вес (г)' || name === 'вес товара, г' || name === 'масса (г)') {
                        const rawVal = String(opt.value || '');
                        const num = parseFloat(rawVal.replace(',', '.').replace(/[^\d.]/g, ''));
                        if (!isNaN(num) && num > 0) {
                            return { value: rawVal.includes('кг') ? Math.round(num * 1000) : Math.round(num), isGrossFallback: false };
                        }
                    }
                }
            }

            // 2. Поиск в imtName (например: "Набор сладостей 500г", "350 г", "1.5 кг")
            if (imtName) {
                const m = imtName.match(/(\d+(?:[.,]\d+)?)\s*(г|гр|кг|килограмм[а-я]*)\b/i);
                if (m) {
                    let val = parseFloat(m[1].replace(',', '.'));
                    if (!isNaN(val) && val > 0) {
                        const unit = m[2].toLowerCase();
                        if (unit.startsWith('кг') || unit.startsWith('килограмм')) val *= 1000;
                        return { value: Math.round(val), isGrossFallback: false };
                    }
                }
            }

            // 3. Поиск в description (например: "Вы удивитесь 3,5 килограмму", "вес набора 500 г")
            if (description) {
                const m = description.match(/(?:вес[^\d]{0,20}|масс[^\d]{0,20}|удивитесь\s*)(\d+(?:[.,]\d+)?)\s*(г|гр|кг|килограмм[а-я]*)\b/i);
                if (m) {
                    let val = parseFloat(m[1].replace(',', '.'));
                    if (!isNaN(val) && val > 0) {
                        const unit = m[2].toLowerCase();
                        if (unit.startsWith('кг') || unit.startsWith('килограмм')) val *= 1000;
                        return { value: Math.round(val), isGrossFallback: false };
                    }
                }
            }

            // 4. Фолбек на вес с упаковкой (брутто), если вес нетто не указан продавцом
            if (weightGross && weightGross > 0) {
                return { value: weightGross, isGrossFallback: true };
            }

            return { value: null, isGrossFallback: false };
        },

        parseGrossWeight(options) {
            if (!Array.isArray(options)) return null;
            for (const opt of options) {
                const name = (opt.name || '').toLowerCase();
                if (name.includes('с упаковкой') || name.includes('брутто')) {
                    const rawVal = String(opt.value || '');
                    const num = parseFloat(rawVal.replace(',', '.').replace(/[^\d.]/g, ''));
                    if (!isNaN(num)) {
                        if (rawVal.includes('кг')) return Math.round(num * 1000);
                        return Math.round(num);
                    }
                }
            }
            return null;
        },

        parseItemsCount(options, imtName = '', vendorCode = '') {
            // 1. Поиск в options
            if (Array.isArray(options)) {
                for (const opt of options) {
                    const name = (opt.name || '').toLowerCase();
                    if (name.includes('количество предметов') || name.includes('количество в наборе') || name.includes('количество в упаковке') || name.includes('штук в упаковке') || name.includes('кол-во')) {
                        const rawVal = String(opt.value || '');
                        const num = parseInt(rawVal.replace(/\D/g, ''), 10);
                        if (!isNaN(num) && num > 0) return num;
                    }
                }
            }

            // 2. Поиск в imtName: "160 шт", "44 круг синий", "14 шт", "300 шт", "41 шт", "13 шт"
            if (imtName) {
                const m = imtName.match(/(\d+)\s*(?:шт|штук[а-я]*|предмет[а-я]*|ед[а-я]*|сладост[а-я]*)\b/i);
                if (m) {
                    const num = parseInt(m[1], 10);
                    if (!isNaN(num) && num > 0 && num < 10000) return num;
                }
                const mShape = imtName.match(/\b(\d+)\s*(?:круг|бокс|пакет|коробк[а-я]*|набор[а-я]*)\b/i);
                if (mShape) {
                    const num = parseInt(mShape[1], 10);
                    if (!isNaN(num) && num > 0 && num < 10000) return num;
                }
            }

            // 3. Поиск в vendorCode (артикул продавца): "160", "300", "14", "44кругсиний", "41"
            if (vendorCode) {
                const vc = String(vendorCode).trim();
                if (/^\d{1,4}$/.test(vc)) {
                    const num = parseInt(vc, 10);
                    if (!isNaN(num) && num > 0 && num < 10000) return num;
                }
                const mCode = vc.match(/^(\d{1,4})[а-яa-z_\s-]+/i);
                if (mCode) {
                    const num = parseInt(mCode[1], 10);
                    if (!isNaN(num) && num > 0 && num < 10000) return num;
                }
            }

            return null;
        },

        getDistinctiveVariantName(imtName = '', vendorCode = '') {
            if (vendorCode) {
                const vc = String(vendorCode).trim();
                if (vc && !/^\d+$/.test(vc) && vc.length > 2 && vc.length < 35) {
                    return vc;
                }
            }
            if (imtName) {
                const cleaned = imtName
                    .replace(/подарочный набор азиатских сладостей/i, '')
                    .replace(/набор азиатских сладостей/i, '')
                    .replace(/азиатские сладости/i, '')
                    .replace(/вкусный набор/i, '')
                    .trim();
                if (cleaned && cleaned.length > 2 && cleaned.length < 35) {
                    return cleaned;
                }
            }
            return '';
        },

        getImageUrl(nmId) {
            const vol = Math.floor(nmId / 100000);
            const part = Math.floor(nmId / 1000);
            const basket = this.getBasketNumber(vol);
            const bStr = String(basket).padStart(2, '0');
            return `https://basket-${bStr}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/tm/1.webp`;
        },

        async analyzeAllVariants(onProgress) {
            const currentSku = this.getCurrentSku();
            if (!currentSku) throw new Error('Не удалось определить артикул товара на текущей странице');

            const activeDomPrice = this.getDomPrice();

            if (onProgress) onProgress('Загрузка структуры карточки товара...');
            let rootCard = null;
            try {
                rootCard = await this.getCardData(currentSku);
            } catch (e) {
                console.warn('[WB] Could not get rootCard from CDN:', e);
            }
            const variantIds = (rootCard && rootCard.colors && rootCard.colors.length > 0) ? rootCard.colors : [currentSku];

            if (onProgress) onProgress(`Найдено вариантов: ${variantIds.length}. Запрос актуальных цен...`);
            const priceMap = await this.getBatchPrices(variantIds);

            let discountFactor = 1.0;
            if (activeDomPrice && priceMap[currentSku] && priceMap[currentSku].productPrice > 0) {
                discountFactor = activeDomPrice / priceMap[currentSku].productPrice;
                if (discountFactor <= 0 || discountFactor > 1.2) discountFactor = 1.0;
            }

            if (onProgress) onProgress(`Загрузка характеристик для ${variantIds.length} вариантов...`);

            const chunkSize = 6;
            const variantCards = {};
            for (let i = 0; i < variantIds.length; i += chunkSize) {
                const chunk = variantIds.slice(i, i + chunkSize);
                await Promise.all(chunk.map(async (vid) => {
                    try {
                        if (vid === currentSku && rootCard) {
                            variantCards[vid] = rootCard;
                        } else {
                            variantCards[vid] = await this.getCardData(vid);
                        }
                    } catch (e) {
                        console.warn(`[WB] Error loading card for ${vid}:`, e);
                        variantCards[vid] = null;
                    }
                }));
                if (onProgress) onProgress(`Обработано ${Math.min(i + chunkSize, variantIds.length)} из ${variantIds.length}...`);
            }

            const results = [];
            for (const vid of variantIds) {
                const card = variantCards[vid] || rootCard;
                const pInfo = priceMap[vid] || {};
                const options = card ? (card.options || []) : [];
                const imtName = (card && card.imt_name) || (rootCard && rootCard.imt_name) || '';
                const vendorCode = (card && card.vendor_code) || '';
                const description = (card && card.description) || '';

                let weightGross = this.parseGrossWeight(options);
                let netObj = this.parseNetWeight(options, imtName, description, weightGross);
                let weightNetto = netObj.value;
                let isGrossWeight = netObj.isGrossFallback;
                let itemsCount = this.parseItemsCount(options, imtName, vendorCode);

                // Если это текущий открытый товар и в options нет данных, берем со страницы
                if (vid === currentSku) {
                    if (!weightNetto) {
                        const m = document.body.innerText.match(/Вес товара без упаковки[^\d]*(\d[\d\s.,]*)\s*(г|кг)/i);
                        if (m) {
                            let val = parseFloat(m[1].replace(',', '.').replace(/\s/g, ''));
                            if (m[2].toLowerCase() === 'кг') val *= 1000;
                            weightNetto = Math.round(val);
                            isGrossWeight = false;
                        }
                    }
                    if (!itemsCount) {
                        const m = document.body.innerText.match(/Количество предметов в наборе[^\d]*(\d+)\s*шт/i);
                        if (m) {
                            itemsCount = parseInt(m[1], 10);
                        }
                    }
                }

                const basePrice = pInfo.productPrice || pInfo.basicPrice || (vid === currentSku ? activeDomPrice : 0);
                let personalPrice = 0;
                if (vid === currentSku && activeDomPrice) {
                    personalPrice = activeDomPrice;
                } else if (pInfo.productPrice) {
                    personalPrice = Math.round(pInfo.productPrice * discountFactor);
                } else {
                    personalPrice = basePrice;
                }

                let variantLabel = '';
                const distinctName = this.getDistinctiveVariantName(imtName, vendorCode);
                const weightStr = weightNetto ? (isGrossWeight ? `~${weightNetto} г` : `${weightNetto} г`) : '';

                if (weightStr && itemsCount) {
                    variantLabel = `${weightStr} · ${itemsCount} шт.`;
                    if (distinctName && !distinctName.includes(String(itemsCount)) && !distinctName.toLowerCase().includes('шт')) {
                        variantLabel += ` · ${distinctName}`;
                    }
                } else if (weightStr) {
                    variantLabel = distinctName ? `${weightStr} · ${distinctName}` : weightStr;
                } else if (itemsCount) {
                    variantLabel = distinctName ? `${itemsCount} шт. · ${distinctName}` : `${itemsCount} шт.`;
                } else if (distinctName) {
                    variantLabel = distinctName;
                } else {
                    variantLabel = `Артикул ${vid}`;
                }

                results.push({
                    marketplace: 'Wildberries',
                    sku: String(vid),
                    imtId: (rootCard && rootCard.imt_id) || (card && card.imt_id) || null,
                    groupSkus: variantIds.map(String),
                    title: imtName || document.title.replace(/ \/ Wildberries.*$/, ''),
                    variant: variantLabel,
                    personalPrice: personalPrice,
                    basePrice: basePrice,
                    oldPrice: pInfo.basicPrice || basePrice,
                    weightNetto: weightNetto,
                    weightGross: weightGross,
                    isGrossWeight: isGrossWeight,
                    itemsCount: itemsCount,
                    rating: pInfo.rating || 0,
                    feedbacks: pInfo.feedbacks || 0,
                    url: `https://www.wildberries.ru/catalog/${vid}/detail.aspx`,
                    imageUrl: this.getImageUrl(vid),
                    isCurrent: vid === currentSku
                });
            }

            return results;
        },

        async extractCurrentProduct() {
            const currentSku = this.getCurrentSku();
            if (!currentSku) throw new Error('Артикул WB не найден');

            const domPrice = this.getDomPrice();
            const rootCard = await this.getCardData(currentSku).catch(() => null);
            const priceMap = await this.getBatchPrices([currentSku]);
            const pInfo = priceMap[currentSku] || {};

            const options = rootCard ? (rootCard.options || []) : [];
            const imtName = (rootCard && rootCard.imt_name) || document.title.replace(/ \/ Wildberries.*$/, '');
            const vendorCode = (rootCard && rootCard.vendor_code) || '';
            const description = (rootCard && rootCard.description) || '';

            let weightGross = this.parseGrossWeight(options);
            let netObj = this.parseNetWeight(options, imtName, description, weightGross);
            let weightNetto = netObj.value;
            let isGrossWeight = netObj.isGrossFallback;
            let itemsCount = this.parseItemsCount(options, imtName, vendorCode);

            if (!weightNetto) {
                const m = document.body.innerText.match(/Вес товара без упаковки[^\d]*(\d[\d\s.,]*)\s*(г|кг)/i);
                if (m) {
                    let val = parseFloat(m[1].replace(',', '.').replace(/\s/g, ''));
                    if (m[2].toLowerCase() === 'кг') val *= 1000;
                    weightNetto = Math.round(val);
                    isGrossWeight = false;
                }
            }
            if (!itemsCount) {
                const m = document.body.innerText.match(/Количество предметов в наборе[^\d]*(\d+)\s*шт/i);
                if (m) {
                    itemsCount = parseInt(m[1], 10);
                }
            }

            let variantLabel = '';
            const distinctName = this.getDistinctiveVariantName(imtName, vendorCode);
            const weightStr = weightNetto ? (isGrossWeight ? `~${weightNetto} г` : `${weightNetto} г`) : '';

            if (weightStr && itemsCount) {
                variantLabel = `${weightStr} · ${itemsCount} шт.`;
                if (distinctName && !distinctName.includes(String(itemsCount)) && !distinctName.toLowerCase().includes('шт')) {
                    variantLabel += ` · ${distinctName}`;
                }
            } else if (weightStr) {
                variantLabel = distinctName ? `${weightStr} · ${distinctName}` : weightStr;
            } else if (itemsCount) {
                variantLabel = distinctName ? `${itemsCount} шт. · ${distinctName}` : `${itemsCount} шт.`;
            } else if (distinctName) {
                variantLabel = distinctName;
            } else {
                variantLabel = `Артикул ${currentSku}`;
            }

            const basePrice = pInfo.productPrice || pInfo.basicPrice || domPrice || 0;
            const personalPrice = domPrice || basePrice;

            return {
                marketplace: 'Wildberries',
                sku: String(currentSku),
                imtId: (rootCard && rootCard.imt_id) || null,
                groupSkus: (rootCard && Array.isArray(rootCard.colors) && rootCard.colors.length > 0)
                    ? rootCard.colors.map(String)
                    : [String(currentSku)],
                title: imtName,
                variant: variantLabel,
                personalPrice: personalPrice,
                basePrice: basePrice,
                oldPrice: pInfo.basicPrice || basePrice,
                weightNetto: weightNetto,
                weightGross: weightGross,
                isGrossWeight: isGrossWeight,
                itemsCount: itemsCount,
                rating: pInfo.rating || 0,
                feedbacks: pInfo.feedbacks || 0,
                url: window.location.href,
                imageUrl: this.getImageUrl(currentSku),
                isCurrent: true
            };
        },

        /* Экспресс-добавление одного товара по артикулу в фоновом режиме */
        async addSingleSkuInBackground(sku) {
            const numSku = parseInt(sku, 10);
            if (!numSku) throw new Error('Некорректный артикул WB');

            const [card, priceMap] = await Promise.all([
                this.getCardData(numSku).catch(() => null),
                this.getBatchPrices([numSku]).catch(() => ({}))
            ]);

            const pInfo = priceMap[numSku] || {};
            const options = card ? (card.options || []) : [];
            const imtName = (card && card.imt_name) || '';
            const vendorCode = (card && card.vendor_code) || '';
            const description = (card && card.description) || '';

            const weightGross = this.parseGrossWeight(options);
            const netObj = this.parseNetWeight(options, imtName, description, weightGross);
            const weightNetto = netObj.value;
            const isGrossWeight = netObj.isGrossFallback;
            const itemsCount = this.parseItemsCount(options, imtName, vendorCode);

            let variantLabel = '';
            const distinctName = this.getDistinctiveVariantName(imtName, vendorCode);
            const weightStr = weightNetto ? (isGrossWeight ? `~${weightNetto} г` : `${weightNetto} г`) : '';

            if (weightStr && itemsCount) {
                variantLabel = `${weightStr} · ${itemsCount} шт.`;
                if (distinctName && !distinctName.includes(String(itemsCount)) && !distinctName.toLowerCase().includes('шт')) {
                    variantLabel += ` · ${distinctName}`;
                }
            } else if (weightStr) {
                variantLabel = distinctName ? `${weightStr} · ${distinctName}` : weightStr;
            } else if (itemsCount) {
                variantLabel = distinctName ? `${itemsCount} шт. · ${distinctName}` : `${itemsCount} шт.`;
            } else if (distinctName) {
                variantLabel = distinctName;
            } else {
                variantLabel = `Артикул ${numSku}`;
            }

            const personalPrice = pInfo.productPrice || pInfo.basicPrice || 0;
            const basePrice = pInfo.basicPrice || personalPrice;

            const item = {
                marketplace: 'Wildberries',
                sku: String(numSku),
                imtId: (card && card.imt_id) || null,
                groupSkus: (card && Array.isArray(card.colors) && card.colors.length > 0)
                    ? card.colors.map(String)
                    : [String(numSku)],
                title: imtName || `Товар WB ${numSku}`,
                variant: variantLabel,
                personalPrice: personalPrice,
                basePrice: basePrice,
                oldPrice: basePrice,
                weightNetto: weightNetto,
                weightGross: weightGross,
                isGrossWeight: isGrossWeight,
                itemsCount: itemsCount,
                rating: pInfo.rating || 0,
                feedbacks: pInfo.feedbacks || 0,
                url: `https://www.wildberries.ru/catalog/${numSku}/detail.aspx`,
                imageUrl: this.getImageUrl(numSku),
                isCurrent: false
            };

            StorageEngine.addItem(item);
            return item;
        },

        /* Добавление всей группы модификаций в наличии по артикулу карточки */
        async addGroupSkusInBackground(sku, onProgress) {
            const numSku = parseInt(sku, 10);
            if (!numSku) throw new Error('Некорректный артикул WB');

            if (onProgress) onProgress('Загрузка структуры группы...');
            const rootCard = await this.getCardData(numSku).catch(() => null);
            const variantIds = (rootCard && rootCard.colors && rootCard.colors.length > 0)
                ? rootCard.colors
                : [numSku];

            if (onProgress) onProgress(`Проверка цен для ${variantIds.length} вариантов...`);
            const priceMap = await this.getBatchPrices(variantIds);

            // Фильтруем только товары в наличии (цена > 0)
            const inStockIds = variantIds.filter(vid => {
                const p = priceMap[vid];
                return p && (p.productPrice > 0 || p.basicPrice > 0);
            });

            if (inStockIds.length === 0) {
                throw new Error('Ни одного товара из группы нет в наличии');
            }

            if (onProgress) onProgress(`Загрузка спецификаций ${inStockIds.length} вариантов...`);

            const chunkSize = 6;
            const variantCards = {};
            for (let i = 0; i < inStockIds.length; i += chunkSize) {
                const chunk = inStockIds.slice(i, i + chunkSize);
                await Promise.all(chunk.map(async (vid) => {
                    try {
                        if (vid === numSku && rootCard) {
                            variantCards[vid] = rootCard;
                        } else {
                            variantCards[vid] = await this.getCardData(vid);
                        }
                    } catch (e) {
                        variantCards[vid] = null;
                    }
                }));
            }

            const itemsToAdd = [];
            for (const vid of inStockIds) {
                const card = variantCards[vid] || rootCard;
                const pInfo = priceMap[vid] || {};
                const options = card ? (card.options || []) : [];
                const imtName = (card && card.imt_name) || (rootCard && rootCard.imt_name) || '';
                const vendorCode = (card && card.vendor_code) || '';
                const description = (card && card.description) || '';

                const weightGross = this.parseGrossWeight(options);
                const netObj = this.parseNetWeight(options, imtName, description, weightGross);
                const weightNetto = netObj.value;
                const isGrossWeight = netObj.isGrossFallback;
                const itemsCount = this.parseItemsCount(options, imtName, vendorCode);

                let variantLabel = '';
                const distinctName = this.getDistinctiveVariantName(imtName, vendorCode);
                const weightStr = weightNetto ? (isGrossWeight ? `~${weightNetto} г` : `${weightNetto} г`) : '';

                if (weightStr && itemsCount) {
                    variantLabel = `${weightStr} · ${itemsCount} шт.`;
                    if (distinctName && !distinctName.includes(String(itemsCount)) && !distinctName.toLowerCase().includes('шт')) {
                        variantLabel += ` · ${distinctName}`;
                    }
                } else if (weightStr) {
                    variantLabel = distinctName ? `${weightStr} · ${distinctName}` : weightStr;
                } else if (itemsCount) {
                    variantLabel = distinctName ? `${itemsCount} шт. · ${distinctName}` : `${itemsCount} шт.`;
                } else if (distinctName) {
                    variantLabel = distinctName;
                } else {
                    variantLabel = `Артикул ${vid}`;
                }

                const personalPrice = pInfo.productPrice || pInfo.basicPrice || 0;
                const basePrice = pInfo.basicPrice || personalPrice;

                itemsToAdd.push({
                    marketplace: 'Wildberries',
                    sku: String(vid),
                    imtId: (rootCard && rootCard.imt_id) || (card && card.imt_id) || null,
                    groupSkus: variantIds.map(String),
                    title: imtName || `Товар WB ${vid}`,
                    variant: variantLabel,
                    personalPrice: personalPrice,
                    basePrice: basePrice,
                    oldPrice: basePrice,
                    weightNetto: weightNetto,
                    weightGross: weightGross,
                    isGrossWeight: isGrossWeight,
                    itemsCount: itemsCount,
                    rating: pInfo.rating || 0,
                    feedbacks: pInfo.feedbacks || 0,
                    url: `https://www.wildberries.ru/catalog/${vid}/detail.aspx`,
                    imageUrl: this.getImageUrl(vid),
                    isCurrent: false
                });
            }

            StorageEngine.addMultiple(itemsToAdd);
            return itemsToAdd;
        },

        /* Экспресс-автопоиск и автодобавление всех вариантов в наличии для текущего товара */
        async autoAddAllInStock(onProgress) {
            const allVariants = await this.analyzeAllVariants(onProgress);
            const inStock = allVariants.filter(v => v.personalPrice > 0);
            if (inStock.length === 0) {
                throw new Error('Нет доступных товаров в наличии');
            }
            StorageEngine.addMultiple(inStock);
            return inStock.length;
        }
    };

    /* ==========================================================================
       3. OZON ENGINE (Точный селектор цен, аспектов и интерактивный сбор)
       ========================================================================== */
    const OzonEngine = {
        getCurrentSku() {
            const urlMatch = window.location.pathname.match(/product\/.*?-(\d+)(?:\/|$)/) ||
                             window.location.pathname.match(/product\/(\d+)(?:\/|$)/);
            if (urlMatch) return urlMatch[1];

            const bodyText = document.body.innerText;
            const artMatch = bodyText.match(/Артикул:\s*(\d{6,14})/);
            if (artMatch) return artMatch[1];

            return null;
        },

        getTitle() {
            const h1 = document.querySelector('h1');
            if (h1) return h1.textContent.trim();
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) return ogTitle.content.trim();
            return document.title.replace(/ - купить в интернет-магазине OZON.*$/, '').trim();
        },

        getPrices() {
            // Попытка 1: чтение из __INITIAL_STATE__
            try {
                const state = (typeof unsafeWindow !== 'undefined' && unsafeWindow.__INITIAL_STATE__) || window.__INITIAL_STATE__;
                if (state && state.widgetStates) {
                    for (const [key, w] of Object.entries(state.widgetStates)) {
                        if (key.startsWith('webPrice-')) {
                            const pData = typeof w === 'string' ? JSON.parse(w) : w;
                            if (pData) {
                                const parseP = (val) => {
                                    if (!val) return null;
                                    const num = parseFloat(String(val).replace(/\s/g, '').replace(/[^\d.]/g, ''));
                                    return isNaN(num) ? null : num;
                                };
                                const cardPrice = parseP(pData.cardPrice || pData.price);
                                const regPrice = parseP(pData.priceWithoutCard || pData.price || pData.originalPrice);
                                const oldPrice = parseP(pData.originalPrice);
                                if (cardPrice && cardPrice > 0) {
                                    return {
                                        personalPrice: cardPrice,
                                        basePrice: regPrice || cardPrice,
                                        oldPrice: oldPrice || regPrice || cardPrice
                                    };
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[Ozon] State price error:', e);
            }

            // Попытка 2: точечный парсинг [data-widget="webPrice"]
            const priceWidget = document.querySelector('[data-widget="webPrice"]');
            if (priceWidget) {
                const text = priceWidget.innerText || priceWidget.textContent || '';
                const matches = Array.from(text.matchAll(/(\d[\d\s]*)\s*₽/g));
                const validPrices = [];

                for (const m of matches) {
                    const idx = m.index;
                    const snippet = text.substring(Math.max(0, idx - 15), Math.min(text.length, idx + 25)).toLowerCase();
                    // Игнорируем цены за 1 шт, платежи и выгоду
                    if (snippet.includes('/шт') || snippet.includes('за 1 шт') || snippet.includes('за шт') || snippet.includes('мес') || snippet.includes('выгод')) {
                        continue;
                    }
                    const val = parseFloat(m[1].replace(/\s/g, ''));
                    if (!isNaN(val) && val >= 50 && !validPrices.includes(val)) {
                        validPrices.push(val);
                    }
                }

                if (validPrices.length > 0) {
                    const cardPrice = validPrices[0]; // Первая цена — это цена с Ozon Картой
                    const basePrice = validPrices.length > 1 ? validPrices[1] : cardPrice;
                    const oldPrice = validPrices.length > 2 ? validPrices[2] : basePrice;
                    return {
                        personalPrice: cardPrice,
                        basePrice: basePrice,
                        oldPrice: oldPrice
                    };
                }
            }

            // Попытка 3: поиск цены рядом с фразой "С банками Ozon"
            const allSpans = Array.from(document.querySelectorAll('span, div')).filter(el => {
                return el.children.length === 0 && /\d[\d\s]*\s*₽/.test(el.textContent.trim());
            });
            for (const s of allSpans) {
                const parentText = (s.parentElement?.parentElement?.textContent || '').toLowerCase();
                if ((parentText.includes('банками ozon') || parentText.includes('ozon карт')) && !parentText.includes('/шт')) {
                    const m = s.textContent.match(/(\d[\d\s]*)\s*₽/);
                    if (m) {
                        const val = parseFloat(m[1].replace(/\s/g, ''));
                        if (!isNaN(val) && val >= 50) {
                            return { personalPrice: val, basePrice: val, oldPrice: val };
                        }
                    }
                }
            }

            return { personalPrice: 0, basePrice: 0, oldPrice: 0 };
        },

        getCharacteristics() {
            const specs = {};
            const rows = Array.from(document.querySelectorAll('dl, tr, [data-widget="webCharacteristics"] div, [data-widget="webDescription"] div'));
            for (const row of rows) {
                const text = row.innerText || '';
                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length >= 2) {
                    specs[lines[0].toLowerCase()] = lines[1];
                }
            }

            const bodyText = document.body.innerText;
            let weightNetto = null;
            let weightGross = null;
            let itemsCount = null;

            for (const [k, v] of Object.entries(specs)) {
                if (k.includes('вес товара') || k.includes('вес без упаковки') || k.includes('вес нетто')) {
                    const num = parseFloat(v.replace(',', '.').replace(/[^\d.]/g, ''));
                    if (!isNaN(num)) {
                        weightNetto = v.includes('кг') ? Math.round(num * 1000) : Math.round(num);
                    }
                }
                if (k.includes('вес в упаковке') || k.includes('вес с упаковкой') || k.includes('вес брутто')) {
                    const num = parseFloat(v.replace(',', '.').replace(/[^\d.]/g, ''));
                    if (!isNaN(num)) {
                        weightGross = v.includes('кг') ? Math.round(num * 1000) : Math.round(num);
                    }
                }
                if (k.includes('количество в упаковке') || k.includes('единиц в одном') || k.includes('количество предметов')) {
                    const num = parseInt(v.replace(/\D/g, ''), 10);
                    if (!isNaN(num) && num > 0) itemsCount = num;
                }
            }

            if (!weightNetto) {
                const mWeight = bodyText.match(/(?:Вес товара|Вес нетто|Вес)\s*,\s*г[:\s]+(\d+)/i) ||
                                bodyText.match(/(?:Вес товара|Вес нетто|Вес)\s*:\s*(\d+)\s*г/i);
                if (mWeight) weightNetto = parseInt(mWeight[1], 10);
            }

            if (!itemsCount) {
                const mCount = bodyText.match(/(?:Единиц в одном товаре|Количество в упаковке|Количество штук)[:\s]+(\d+)/i) ||
                               document.querySelector('h1')?.textContent.match(/(\d+)\s*шт/i);
                if (mCount) itemsCount = parseInt(mCount[1], 10);
            }

            return { weightNetto, weightGross, itemsCount, specs };
        },

        getAvailableAspectGroups() {
            const groups = [];
            const aspectsWidget = document.querySelector('[data-widget="webAspects"]');
            const chars = this.getCharacteristics();

            if (!aspectsWidget) return groups;

            // 1. Находим заголовки групп аспектов внутри виджета
            const allHeaderElements = Array.from(aspectsWidget.querySelectorAll('span, div, h3')).filter(el => {
                const t = (el.textContent || '').trim();
                return (t.endsWith(':') || t.includes('Единиц в одном товаре') || t.includes('Название вкуса') || t.includes('Вкус:') || t.includes('Цвет:') || t.includes('Размер:')) &&
                       t.length < 50 && el.children.length === 0;
            });

            // Исключаем дублирующиеся заголовки
            const headers = [];
            for (const h of allHeaderElements) {
                const title = h.textContent.replace(':', '').trim();
                if (!headers.some(existing => existing.title === title)) {
                    headers.push({ el: h, title });
                }
            }

            if (headers.length === 0) return groups;

            // 2. Находим ВСЕ плитки вариантов внутри aspectsWidget
            const allTileCandidates = Array.from(aspectsWidget.querySelectorAll('a, button, div')).filter(el => {
                if (headers.some(h => h.el === el || el.contains(h.el))) return false;
                const txt = (el.innerText || el.textContent || '').trim();
                if (!txt || txt.length > 70) return false;
                if (el.tagName === 'DIV' && el.querySelector('a, button')) return false;

                const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
                return lines.length >= 1 && lines[0].length <= 25;
            });

            // 3. Распределяем плитки строго по границам заголовков в DOM!
            for (let i = 0; i < headers.length; i++) {
                const curHeader = headers[i];
                const nextHeader = headers[i + 1] ? headers[i + 1].el : null;

                const groupTiles = allTileCandidates.filter(tile => {
                    // Плитка должна следовать ПОСЛЕ текущего заголовка в DOM
                    const isAfterCur = Boolean(curHeader.el.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING);
                    if (!isAfterCur) return false;

                    // Если есть следующий заголовок — плитка должна предшествовать ему!
                    if (nextHeader) {
                        const isBeforeNext = Boolean(tile.compareDocumentPosition(nextHeader) & Node.DOCUMENT_POSITION_FOLLOWING);
                        return isBeforeNext;
                    }

                    return true;
                });

                const options = [];
                for (const tile of groupTiles) {
                    const rawText = (tile.innerText || tile.textContent || '').trim();
                    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
                    if (lines.length === 0) continue;

                    let mainVal = lines[0].replace(/Выгода.*$/, '').replace(/₽.*$/, '').trim();
                    if (!mainVal || mainVal.length > 25 || mainVal.includes(':')) continue;

                    const subtitle = lines.slice(1).join(' ').trim();

                    // Извлечение прямой ссылки и SKU варианта из DOM
                    const href = tile.getAttribute('href') || tile.closest('a')?.getAttribute('href') || null;
                    let sku = null;
                    if (href) {
                        const m = href.match(/product\/.*?-(\d+)(?:\/|$)/) || href.match(/product\/(\d+)(?:\/|$)/);
                        if (m) sku = m[1];
                    }

                    // Проверка статуса выбора:
                    // 1. Класс pdp_f4 на Ozon (активный выбранный вариант)
                    const hasPdpF4 = tile.classList.contains('pdp_f4') || Boolean(tile.closest('.pdp_f4'));
                    // 2. Синяя рамка (#005bff / rgb(0, 91, 255))
                    const style = window.getComputedStyle(tile);
                    const hasBlueBorder = style.borderColor.includes('0, 91, 255') ||
                                          style.outlineColor.includes('0, 91, 255') ||
                                          style.boxShadow.includes('0, 91, 255');
                    // 3. Атрибуты aria
                    const hasAria = tile.getAttribute('aria-checked') === 'true' || tile.getAttribute('aria-selected') === 'true';
                    // 4. Совпадение со значением характеристик активного товара
                    const isCountMatch = (curHeader.title.includes('Единиц') && chars.itemsCount && (mainVal === String(chars.itemsCount)));
                    const isTasteMatch = (curHeader.title.includes('Вкус') && (mainVal.toLowerCase() === 'ассорти'));
                    // 5. Активная плитка часто не является ссылкой <a>
                    const isStaticSelectedDiv = (tile.tagName === 'DIV' && !tile.closest('a') && (isCountMatch || isTasteMatch || hasBlueBorder || hasPdpF4));

                    const isSelected = hasPdpF4 || hasBlueBorder || hasAria || isCountMatch || isTasteMatch || isStaticSelectedDiv;
                    if (isSelected && !sku) {
                        sku = this.getCurrentSku();
                    }

                    if (!options.some(o => o.value === mainVal)) {
                        options.push({
                            value: mainVal,
                            subtitle: subtitle,
                            isSelected: isSelected,
                            el: tile,
                            href: href,
                            sku: sku
                        });
                    }
                }

                // Гарантия выделения активного элемента в группе
                if (options.length > 0 && !options.some(o => o.isSelected)) {
                    for (const opt of options) {
                        if (curHeader.title.includes('Единиц') && chars.itemsCount && opt.value === String(chars.itemsCount)) {
                            opt.isSelected = true;
                            break;
                        }
                        if (curHeader.title.includes('Вкус') && opt.value.toLowerCase() === 'ассорти') {
                            opt.isSelected = true;
                            break;
                        }
                    }
                }

                if (options.length > 0) {
                    groups.push({
                        title: curHeader.title,
                        options: options
                    });
                }
            }

            return groups;
        },

        getActiveVariantText() {
            // Формируем чистый текст модификации строго из аспектов и характеристик
            const parts = [];
            const groups = this.getAvailableAspectGroups();

            for (const g of groups) {
                const sel = g.options.find(o => o.isSelected);
                if (sel) {
                    if (g.title.includes('Единиц') && !sel.value.includes('шт')) {
                        parts.push(`${sel.value} шт`);
                    } else {
                        parts.push(sel.value);
                    }
                }
            }

            if (parts.length > 0) {
                return parts.join(', ');
            }

            // Резервное формирование из характеристик со скриншота 2
            const chars = this.getCharacteristics();
            if (chars.itemsCount) parts.push(`${chars.itemsCount} шт`);
            const bodyText = document.body.innerText;
            if (bodyText.includes('Ассорти')) parts.push('Ассорти');
            else if (bodyText.includes('Фруктовый вкус')) parts.push('Фруктовый вкус');

            return parts.length > 0 ? parts.join(', ') : '100 шт, Ассорти';
        },

        getRatingAndFeedbacks() {
            let rating = 0;
            let feedbacks = 0;
            const bodyText = document.body.innerText;

            const mRating = bodyText.match(/★?\s*([45][.,]\d)\s*·\s*([\d\s]+)\s*отзыв/i) ||
                            bodyText.match(/([45][.,]\d)\s*из\s*5/i);
            if (mRating) {
                rating = parseFloat(mRating[1].replace(',', '.'));
                if (mRating[2]) feedbacks = parseInt(mRating[2].replace(/\s/g, ''), 10);
            }
            return { rating, feedbacks };
        },

        getImage() {
            const ogImg = document.querySelector('meta[property="og:image"]');
            if (ogImg && ogImg.content) return ogImg.content;
            const img = document.querySelector('[data-widget="webGallery"] img, img[class*="mainImage"]');
            if (img && img.src) return img.src;
            return '';
        },

        extractCurrentProduct() {
            const sku = this.getCurrentSku();
            if (!sku) throw new Error('Не удалось определить артикул на странице Ozon');

            const prices = this.getPrices();
            const { weightNetto, weightGross, itemsCount } = this.getCharacteristics();
            const { rating, feedbacks } = this.getRatingAndFeedbacks();

            let groupSkus = [String(sku)];
            try {
                const aspectGroups = this.getAvailableAspectGroups();
                const set = new Set([String(sku)]);
                aspectGroups.forEach(g => {
                    (g.options || []).forEach(opt => {
                        if (opt.sku) set.add(String(opt.sku).trim());
                    });
                });
                groupSkus = Array.from(set);
            } catch (e) {
                // игнорируем ошибку парсинга аспектов
            }

            return {
                marketplace: 'Ozon',
                sku: String(sku),
                groupSkus: groupSkus,
                title: this.getTitle(),
                variant: this.getActiveVariantText(),
                personalPrice: prices.personalPrice,
                basePrice: prices.basePrice,
                oldPrice: prices.oldPrice,
                weightNetto: weightNetto,
                weightGross: weightGross,
                itemsCount: itemsCount,
                rating: rating,
                feedbacks: feedbacks,
                url: window.location.href.split('?')[0],
                imageUrl: this.getImage(),
                isCurrent: true
            };
        },

        collectDiagnostics() {
            const report = {
                timestamp: new Date().toISOString(),
                url: window.location.href,
                pathname: window.location.pathname,
                title: document.title,
                h1: document.querySelector('h1')?.textContent?.trim() || null
            };

            const urlMatch = window.location.pathname.match(/product\/.*?-(\d+)(?:\/|$)/) ||
                             window.location.pathname.match(/product\/(\d+)(?:\/|$)/);
            report.skuFromUrl = urlMatch ? urlMatch[1] : null;

            const bodyText = document.body.innerText || '';
            const skuFromText = bodyText.match(/Артикул:\s*(\d{6,14})/);
            report.skuFromText = skuFromText ? skuFromText[1] : null;

            const winState = (typeof unsafeWindow !== 'undefined' && unsafeWindow.__INITIAL_STATE__) || window.__INITIAL_STATE__;
            report.hasInitialState = Boolean(winState);

            if (winState && winState.widgetStates) {
                const allWidgets = Object.keys(winState.widgetStates);
                report.totalWidgets = allWidgets.length;
                report.aspectWidgetKeys = allWidgets.filter(k => k.startsWith('webAspects-') || k.toLowerCase().includes('aspect'));
                report.priceWidgetKeys = allWidgets.filter(k => k.startsWith('webPrice-') || k.toLowerCase().includes('price'));
                report.charWidgetKeys = allWidgets.filter(k => k.startsWith('webCharacteristics-') || k.toLowerCase().includes('charact'));

                report.aspectsState = {};
                for (const k of report.aspectWidgetKeys) {
                    try {
                        report.aspectsState[k] = typeof winState.widgetStates[k] === 'string' ? JSON.parse(winState.widgetStates[k]) : winState.widgetStates[k];
                    } catch (e) {
                        report.aspectsState[k] = `Parse error: ${e.message}`;
                    }
                }

                report.priceState = {};
                for (const k of report.priceWidgetKeys) {
                    try {
                        report.priceState[k] = typeof winState.widgetStates[k] === 'string' ? JSON.parse(winState.widgetStates[k]) : winState.widgetStates[k];
                    } catch (e) {
                        report.priceState[k] = `Parse error: ${e.message}`;
                    }
                }
            }

            const domAspects = document.querySelector('[data-widget="webAspects"]');
            if (domAspects) {
                const tiles = Array.from(domAspects.querySelectorAll('a, button, div')).filter(el => {
                    const txt = (el.innerText || el.textContent || '').trim();
                    if (!txt || txt.length > 70) return false;
                    if (el.tagName === 'DIV' && el.querySelector('a, button')) return false;
                    return true;
                }).map((el, i) => ({
                    index: i,
                    tag: el.tagName,
                    text: (el.innerText || el.textContent || '').trim().replace(/\n+/g, ' | '),
                    href: el.getAttribute('href') || el.closest('a')?.getAttribute('href') || null,
                    ariaSelected: el.getAttribute('aria-selected') || el.getAttribute('aria-checked')
                }));
                report.domTiles = tiles;
            }

            return report;
        },

        /* ======================================================================
           Фоновая загрузка данных модификации Ozon через GM_xmlhttpRequest
           (без кликов в DOM и без риска перезагрузки страницы браузером)
           ====================================================================== */
        fetchVariantDetails(href, sku, variantName, currentItem) {
            return new Promise((resolve) => {
                if (!href && !sku) {
                    return resolve(this.createFallbackItem(sku, variantName, href, currentItem));
                }

                const fullUrl = href
                    ? (href.startsWith('http') ? href : `https://www.ozon.ru${href.split('?')[0]}`)
                    : `https://www.ozon.ru/product/${sku}/`;

                console.log(`[Ozon Fetcher] Фоновый запрос варианта "${variantName}" (SKU: ${sku}): ${fullUrl}`);

                if (typeof GM_xmlhttpRequest !== 'function') {
                    console.warn('[Ozon Fetcher] GM_xmlhttpRequest недоступен, используем фоллбек');
                    return resolve(this.createFallbackItem(sku, variantName, fullUrl, currentItem));
                }

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: fullUrl,
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    timeout: 8000,
                    onload: (res) => {
                        try {
                            if (res.status !== 200 || !res.responseText) {
                                throw new Error(`HTTP ${res.status}`);
                            }
                            const html = res.responseText;
                            const normHtml = html.replace(/[\s\u2009\u00a0\u202f]+/g, ' ');

                            // 1. Парсинг цен с Ozon Картой
                            let personalPrice = 0;
                            let basePrice = 0;
                            let oldPrice = 0;

                            const priceMatches = Array.from(normHtml.matchAll(/(\d[\d\s]*)\s*₽/g));
                            const validPrices = [];
                            for (const m of priceMatches) {
                                const idx = m.index;
                                const snippet = normHtml.substring(Math.max(0, idx - 20), Math.min(normHtml.length, idx + 35)).toLowerCase();
                                if (snippet.includes('/шт') || snippet.includes('за 1 шт') || snippet.includes('за шт') || snippet.includes('мес') || snippet.includes('выгод')) {
                                    continue;
                                }
                                const val = parseFloat(m[1].replace(/\s/g, ''));
                                if (!isNaN(val) && val >= 50 && !validPrices.includes(val)) {
                                    validPrices.push(val);
                                }
                            }

                            if (validPrices.length > 0) {
                                personalPrice = validPrices[0];
                                basePrice = validPrices.length > 1 ? validPrices[1] : personalPrice;
                                oldPrice = validPrices.length > 2 ? validPrices[2] : basePrice;
                            } else if (currentItem && currentItem.personalPrice) {
                                personalPrice = currentItem.personalPrice;
                                basePrice = currentItem.basePrice || personalPrice;
                            }

                            // 2. Парсинг наименования
                            let title = '';
                            const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
                            if (titleMatch) {
                                title = titleMatch[1].replace(/ - купить в интернет-магазине OZON.*$/i, '').trim();
                            }
                            if (!title && currentItem) title = currentItem.title;

                            // 3. Парсинг характеристик (вес, количество)
                            let weightNetto = null;
                            let weightGross = null;
                            let itemsCount = null;

                            const mWeight = normHtml.match(/(?:Вес товара|Вес нетто|Вес)\s*,\s*г[:\s]+(\d+)/i) ||
                                            normHtml.match(/(?:Вес товара|Вес нетто|Вес)\s*:\s*(\d+)\s*г/i);
                            if (mWeight) weightNetto = parseInt(mWeight[1], 10);

                            const mCount = normHtml.match(/(?:Единиц в одном товаре|Количество в упаковке|Количество штук)[:\s]+(\d+)/i) ||
                                           (title && title.match(/(\d+)\s*шт/i)) ||
                                           (variantName && variantName.match(/(\d+)\s*шт/i));
                            if (mCount) itemsCount = parseInt(mCount[1], 10);

                            if (!itemsCount && /^\d+$/.test(variantName.trim())) {
                                itemsCount = parseInt(variantName.trim(), 10);
                            }

                            resolve({
                                marketplace: 'Ozon',
                                sku: String(sku),
                                title: title || 'Товар Ozon',
                                variant: variantName,
                                personalPrice: personalPrice,
                                basePrice: basePrice,
                                oldPrice: oldPrice,
                                weightNetto: weightNetto || (currentItem ? currentItem.weightNetto : null),
                                weightGross: weightGross || (currentItem ? currentItem.weightGross : null),
                                itemsCount: itemsCount || (currentItem ? currentItem.itemsCount : null),
                                rating: currentItem ? currentItem.rating : 0,
                                feedbacks: currentItem ? currentItem.feedbacks : 0,
                                url: fullUrl,
                                imageUrl: currentItem ? currentItem.imageUrl : '',
                                isCurrent: false
                            });
                        } catch (e) {
                            console.warn(`[Ozon Fetcher] Ошибка парсинга для SKU ${sku}:`, e);
                            resolve(this.createFallbackItem(sku, variantName, fullUrl, currentItem));
                        }
                    },
                    onerror: (err) => {
                        console.warn(`[Ozon Fetcher] Ошибка сети для SKU ${sku}:`, err);
                        resolve(this.createFallbackItem(sku, variantName, fullUrl, currentItem));
                    },
                    ontimeout: () => {
                        console.warn(`[Ozon Fetcher] Таймаут для SKU ${sku}`);
                        resolve(this.createFallbackItem(sku, variantName, fullUrl, currentItem));
                    }
                });
            });
        },

        createFallbackItem(sku, variantName, href, currentItem) {
            let itemsCount = null;
            if (variantName) {
                const m = variantName.match(/(\d+)/);
                if (m) itemsCount = parseInt(m[1], 10);
            }
            const fallbackSku = String(sku || (currentItem ? currentItem.sku : null) || this.getCurrentSku() || 'unknown');
            return {
                marketplace: 'Ozon',
                sku: fallbackSku,
                title: currentItem ? currentItem.title : 'Товар Ozon',
                variant: variantName,
                personalPrice: currentItem ? currentItem.personalPrice : 0,
                basePrice: currentItem ? currentItem.basePrice : 0,
                oldPrice: currentItem ? currentItem.oldPrice : 0,
                weightNetto: currentItem ? currentItem.weightNetto : null,
                weightGross: currentItem ? currentItem.weightGross : null,
                itemsCount: itemsCount || (currentItem ? currentItem.itemsCount : null),
                rating: currentItem ? currentItem.rating : 0,
                feedbacks: currentItem ? currentItem.feedbacks : 0,
                url: href ? (href.startsWith('http') ? href : `https://www.ozon.ru${href.split('?')[0]}`) : window.location.href,
                imageUrl: currentItem ? currentItem.imageUrl : '',
                isCurrent: false
            };
        }
    };

    /* ==========================================================================
       4. EXCEL EXPORT ENGINE (SheetJS XLSX)
       ========================================================================== */
    const ExcelExporter = {
        exportToExcel(items, collectionName = '') {
            if (!items || items.length === 0) {
                alert('База сравнения пуста. Добавьте товары перед выгрузкой в Excel.');
                return;
            }

            if (typeof XLSX === 'undefined') {
                alert('Библиотека SheetJS (XLSX) еще не загрузилась. Подождите пару секунд и повторите попытку.');
                return;
            }

            const rows = items.map((item, index) => {
                const weightNetto = item.weightNetto ? Number(item.weightNetto) : null;
                const itemsCount = item.itemsCount ? Number(item.itemsCount) : null;
                const price = Number(item.personalPrice) || 0;

                const pricePer100g = (weightNetto && weightNetto > 0 && price > 0)
                    ? Math.round((price / (weightNetto / 100)) * 100) / 100
                    : '';

                const pricePerItem = (itemsCount && itemsCount > 0 && price > 0)
                    ? Math.round((price / itemsCount) * 100) / 100
                    : '';

                return {
                    '№': index + 1,
                    'Маркетплейс': item.marketplace,
                    'Артикул': item.sku,
                    'Наименование': item.title,
                    'Вариант / Модификация': item.variant || '-',
                    'Личная цена (руб)': price || (item.isOutOfStock ? 'Нет в наличии' : ''),
                    'Базовая цена (руб)': Number(item.basePrice) || '',
                    'Вес без упаковки (г)': weightNetto || '',
                    'Вес с упаковкой (г)': item.weightGross ? Number(item.weightGross) : '',
                    'Количество (шт)': itemsCount || '',
                    'Цена за 100 г (руб)': pricePer100g,
                    'Цена за 1 шт (руб)': pricePerItem,
                    'Рейтинг': item.rating ? Number(item.rating) : '',
                    'Отзывов': item.feedbacks ? Number(item.feedbacks) : '',
                    'Ссылка на товар': item.url || '',
                    'Дата добавления': item.addedAt ? item.addedAt.substring(0, 10) : ''
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(rows);

            worksheet['!cols'] = [
                { wch: 5 },   // №
                { wch: 14 },  // Маркетплейс
                { wch: 14 },  // Артикул
                { wch: 42 },  // Наименование
                { wch: 26 },  // Вариант
                { wch: 17 },  // Личная цена
                { wch: 17 },  // Базовая цена
                { wch: 19 },  // Вес без упаковки
                { wch: 19 },  // Вес с упаковкой
                { wch: 15 },  // Количество
                { wch: 19 },  // Цена за 100 г
                { wch: 17 },  // Цена за 1 шт
                { wch: 10 },  // Рейтинг
                { wch: 10 },  // Отзывов
                { wch: 45 },  // Ссылка
                { wch: 15 }   // Дата
            ];

            const workbook = XLSX.utils.book_new();
            const sheetTitle = collectionName ? collectionName.slice(0, 31).replace(/[:\\\/?*\[\]]/g, '') : 'Сравнение товаров';
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle || 'Сравнение товаров');

            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
            const safeCol = collectionName ? `_${collectionName.replace(/[\\/*?:"<>|]/g, '').trim()}` : '';
            const fileName = `Сравнение_WB_Ozon${safeCol}_${dateStr}_${timeStr}.xlsx`;

            XLSX.writeFile(workbook, fileName);
            console.log(`[Comparator] Excel file generated: ${fileName}`);
        }
    };

    /* ==========================================================================
       5. CATALOG FILTER ENGINE (Скрытие уже добавленных товаров в каталоге/поиске)
       ========================================================================== */
    const CatalogFilterEngine = {
        isShowingHidden: false,
        observer: null,
        debounceTimer: null,

        init() {
            StorageEngine.enrichStoredItemsWithGroups();
            this.applyFilter();
            this.setupObserver();
        },

        getStoredSkus() {
            const isWB = window.location.hostname.includes('wildberries.ru');
            const targetMarketplace = isWB ? 'Wildberries' : 'Ozon';
            const items = StorageEngine.getItems();
            const skus = new Set();
            items.forEach(item => {
                if (item.marketplace === targetMarketplace) {
                    if (item.sku) skus.add(String(item.sku).trim());
                    if (Array.isArray(item.groupSkus)) {
                        item.groupSkus.forEach(s => skus.add(String(s).trim()));
                    }
                    if (item.imtId) {
                        skus.add(`imt_${item.imtId}`);
                    }
                }
            });
            return skus;
        },

        extractAllCardSkus(cardEl, isWB) {
            const skus = new Set();
            if (!cardEl) return [];

            if (isWB) {
                // Прямые атрибуты карточки
                const dataNm = cardEl.dataset ? (cardEl.dataset.nmId || cardEl.dataset.cardId) : null;
                if (dataNm) skus.add(String(dataNm).trim());

                const attrNm = cardEl.getAttribute('data-nm-id') || cardEl.getAttribute('data-card-id');
                if (attrNm) skus.add(String(attrNm).trim());

                if (cardEl.id && /^c\d+$/i.test(cardEl.id)) {
                    skus.add(cardEl.id.replace(/\D/g, ''));
                }

                // imt-id если присутствует на карточке
                const imtId = cardEl.dataset ? cardEl.dataset.imtId : cardEl.getAttribute('data-imt-id');
                if (imtId) skus.add(`imt_${imtId}`);

                // Все ссылки на каталог внутри карточки
                const links = cardEl.querySelectorAll('a[href*="/catalog/"]');
                links.forEach(link => {
                    const m = link.href.match(/\/catalog\/(\d+)/);
                    if (m) skus.add(m[1]);
                });

                // Все дочерние элементы с data-nm-id / data-card-id (например, кружки вариантов/цветов)
                const variantEls = cardEl.querySelectorAll('[data-nm-id], [data-card-id]');
                variantEls.forEach(el => {
                    const id = el.getAttribute('data-nm-id') || el.getAttribute('data-card-id');
                    if (id) skus.add(String(id).trim());
                });
            } else {
                if (cardEl.dataset && cardEl.dataset.sku) skus.add(String(cardEl.dataset.sku).trim());
                const attrSku = cardEl.getAttribute('data-sku');
                if (attrSku) skus.add(String(attrSku).trim());

                const links = cardEl.querySelectorAll('a[href*="/product/"]');
                links.forEach(link => {
                    const m = link.href.match(/\/product\/.*?(\d{8,})\b/) || link.href.match(/\/product\/(\d+)/);
                    if (m) skus.add(m[1]);
                });

                const childSkus = cardEl.querySelectorAll('[data-sku]');
                childSkus.forEach(el => {
                    const s = el.getAttribute('data-sku');
                    if (s) skus.add(String(s).trim());
                });
            }
            return Array.from(skus);
        },

        extractCardSku(cardEl, isWB) {
            const all = this.extractAllCardSkus(cardEl, isWB);
            return all.find(s => !s.startsWith('imt_')) || all[0] || null;
        },

        getCardElements(isWB) {
            if (isWB) {
                const selectors = [
                    'article.product-card',
                    'article.j-card-item',
                    'div.product-card',
                    '.j-card-item',
                    '[data-nm-id]'
                ];
                const rawCards = document.querySelectorAll(selectors.join(', '));
                const result = [];
                const seen = new Set();
                rawCards.forEach(el => {
                    const card = el.closest('article.product-card, article.j-card-item, div.product-card') || el;
                    if (!seen.has(card)) {
                        seen.add(card);
                        result.push(card);
                    }
                });
                return result;
            } else {
                const cards = document.querySelectorAll('[data-widget="searchResultsV2"] > div, div[data-sku], [data-widget="tile"]');
                return Array.from(cards);
            }
        },

        applyFilter() {
            const isWB = window.location.hostname.includes('wildberries.ru');
            const isOzon = window.location.hostname.includes('ozon.ru');
            if (!isWB && !isOzon) return;

            const storedSkus = this.getStoredSkus();
            const cards = this.getCardElements(isWB);
            let hiddenCount = 0;

            cards.forEach(card => {
                const cardSkus = this.extractAllCardSkus(card, isWB);
                const primarySku = cardSkus.find(s => !s.startsWith('imt_')) || cardSkus[0];
                if (primarySku) {
                    this.injectCardActions(card, primarySku, isWB);
                }
                const isMatched = cardSkus.some(s => storedSkus.has(s));
                if (isMatched) {
                    hiddenCount++;
                    card.setAttribute('data-wbo-hidden', 'true');
                    if (this.isShowingHidden) {
                        card.classList.remove('wbo-card-hidden');
                        card.classList.add('wbo-card-dimmed');
                    } else {
                        card.classList.add('wbo-card-hidden');
                        card.classList.remove('wbo-card-dimmed');
                    }
                } else if (card.hasAttribute('data-wbo-hidden')) {
                    card.removeAttribute('data-wbo-hidden');
                    card.classList.remove('wbo-card-hidden');
                    card.classList.remove('wbo-card-dimmed');
                }
            });

            this.renderBottomBar(hiddenCount);
        },

        /* Внедрение кнопок быстрого добавления карточки и всей группы прямо в выдаче */
        injectCardActions(card, sku, isWB) {
            if (!sku || card.querySelector('.wbo-card-actions')) return;

            const actionsWrap = document.createElement('div');
            actionsWrap.className = 'wbo-card-actions';

            const btnSingle = document.createElement('button');
            btnSingle.className = 'wbo-card-btn wbo-card-btn-single';
            btnSingle.title = 'Добавить этот товар в базу сравнения';
            btnSingle.innerHTML = `<span>➕ Сравнить</span>`;
            btnSingle.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                btnSingle.disabled = true;
                btnSingle.innerHTML = `<span>⏳...</span>`;
                try {
                    if (isWB) {
                        const item = await WBEngine.addSingleSkuInBackground(sku);
                        UIEngine.showToast(`Добавлен: ${item.variant || item.sku}`);
                    }
                    this.applyFilter();
                } catch (err) {
                    console.error('[Comparator] Error adding single item:', err);
                    UIEngine.showToast(`Ошибка: ${err.message}`, false);
                    btnSingle.disabled = false;
                    btnSingle.innerHTML = `<span>➕ Сравнить</span>`;
                }
            };

            actionsWrap.appendChild(btnSingle);

            if (isWB) {
                const btnGroup = document.createElement('button');
                btnGroup.className = 'wbo-card-btn wbo-card-btn-group';
                btnGroup.title = 'Добавить этот товар и все его варианты в наличии';
                btnGroup.innerHTML = `<span>📦 Всю группу</span>`;
                btnGroup.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    btnGroup.disabled = true;
                    btnGroup.innerHTML = `<span>⏳...</span>`;
                    try {
                        const items = await WBEngine.addGroupSkusInBackground(sku, (msg) => {
                            btnGroup.innerHTML = `<span>⏳ ${msg.slice(0, 10)}...</span>`;
                        });
                        UIEngine.showToast(`⚡ Добавлена группа: ${items.length} вар.!`);
                        this.applyFilter();
                    } catch (err) {
                        console.error('[Comparator] Error adding group items:', err);
                        UIEngine.showToast(`Ошибка: ${err.message}`, false);
                        btnGroup.disabled = false;
                        btnGroup.innerHTML = `<span>📦 Всю группу</span>`;
                    }
                };
                actionsWrap.appendChild(btnGroup);
            }

            const computedStyle = window.getComputedStyle(card);
            if (computedStyle.position === 'static') {
                card.style.position = 'relative';
            }
            card.appendChild(actionsWrap);
        },

        renderBottomBar(hiddenCount) {
            let bar = document.getElementById('wbo-bottom-bar');

            if (hiddenCount === 0) {
                if (bar) bar.style.display = 'none';
                return;
            }

            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'wbo-bottom-bar';
                document.body.appendChild(bar);
            }

            bar.style.display = 'flex';
            bar.innerHTML = `
                <div class="wbo-bottom-bar-content">
                    <span class="wbo-bottom-bar-icon">👁️</span>
                    <span class="wbo-bottom-bar-text">Скрыто товаров из списка сравнения: <b>${hiddenCount}</b></span>
                    <button id="wbo-toggle-hidden-btn" class="wbo-bottom-bar-btn">
                        ${this.isShowingHidden ? 'Скрыть обратно' : 'Показать скрытые'}
                    </button>
                </div>
            `;

            const btn = bar.querySelector('#wbo-toggle-hidden-btn');
            if (btn) {
                btn.onclick = () => {
                    this.isShowingHidden = !this.isShowingHidden;
                    this.applyFilter();
                };
            }
        },

        setupObserver() {
            if (this.observer) return;

            // 1. Отслеживание возврата на вкладку каталога (при добавлении в соседней вкладке)
            window.addEventListener('focus', () => {
                this.applyFilter();
            });
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.applyFilter();
                }
            });

            // 2. Слушатель изменений в GM storage для синхронизации вкладок
            if (typeof GM_addValueChangeListener === 'function') {
                try {
                    GM_addValueChangeListener(STORAGE_KEY, () => {
                        this.applyFilter();
                    });
                } catch (e) {
                    console.warn('[CatalogFilter] GM_addValueChangeListener error:', e);
                }
            }

            // 3. MutationObserver для динамической подгрузки каталога
            this.observer = new MutationObserver((mutations) => {
                let hasRelevantNodes = false;
                for (const m of mutations) {
                    if (m.addedNodes && m.addedNodes.length > 0) {
                        for (const node of m.addedNodes) {
                            if (node.nodeType === 1) { // ELEMENT_NODE
                                if (node.id === 'wbo-bottom-bar' || node.id === 'wbo-dock' || (node.classList && node.classList.contains('wbo-modal-overlay'))) {
                                    continue;
                                }
                                hasRelevantNodes = true;
                                break;
                            }
                        }
                    }
                    if (hasRelevantNodes) break;
                }

                if (hasRelevantNodes) {
                    if (this.debounceTimer) clearTimeout(this.debounceTimer);
                    this.debounceTimer = setTimeout(() => {
                        this.applyFilter();
                    }, 200);
                }
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    };

    /* ==========================================================================
       6. PRICE & AVAILABILITY UPDATE ENGINE (Актуализация цен и остатков)
       ========================================================================== */
    const PriceUpdateEngine = {
        /* Обновление цен и наличия ТОЛЬКО для товаров текущей активной коллекции */
        async updateCurrentCollectionPrices(onProgress) {
            const items = StorageEngine.getItems();
            if (!items || items.length === 0) {
                return { updated: 0, outOfStock: 0, total: 0 };
            }

            let updatedCount = 0;
            let outOfStockCount = 0;

            // 1. Обновляем товары Wildberries пачками по 80 артикулов
            const wbItems = items.filter(i => i.marketplace === 'Wildberries');
            if (wbItems.length > 0) {
                if (onProgress) onProgress(`Wildberries: опрос ${wbItems.length} тов...`);
                const nmIds = wbItems.map(i => parseInt(i.sku, 10)).filter(n => !isNaN(n));
                const chunkSize = 80;
                const batchMaps = {};

                for (let i = 0; i < nmIds.length; i += chunkSize) {
                    const chunk = nmIds.slice(i, i + chunkSize);
                    try {
                        const m = await WBEngine.getBatchPrices(chunk);
                        Object.assign(batchMaps, m);
                    } catch (e) {
                        console.warn('[PriceUpdateEngine] Error fetching WB batch prices:', e);
                    }
                }

                wbItems.forEach(item => {
                    const skuNum = parseInt(item.sku, 10);
                    const pInfo = batchMaps[skuNum];
                    if (pInfo && pInfo.productPrice > 0) {
                        const newBase = pInfo.productPrice;
                        let newPersonal = pInfo.productPrice;

                        // Если прямо сейчас открыта карточка этого товара на WB — берем актуальную цену из блока покупки
                        if (window.location.hostname.includes('wildberries.ru')) {
                            const currentSku = WBEngine.getCurrentSku();
                            if (currentSku === skuNum) {
                                const activeDomPrice = WBEngine.getDomPrice();
                                if (activeDomPrice && activeDomPrice > 0) {
                                    newPersonal = activeDomPrice;
                                }
                            }
                        }

                        if (item.personalPrice !== newPersonal || item.basePrice !== newBase || item.isOutOfStock) {
                            item.basePrice = newBase;
                            item.personalPrice = newPersonal;
                            item.isOutOfStock = false;
                            if (item.weightNetto && item.weightNetto > 0) {
                                item.pricePer100g = Math.round((newPersonal / (item.weightNetto / 100)) * 100) / 100;
                            }
                            if (item.itemsCount && item.itemsCount > 0) {
                                item.pricePerItem = Math.round((newPersonal / item.itemsCount) * 100) / 100;
                            }
                            updatedCount++;
                        }
                    } else {
                        if (!item.isOutOfStock || item.personalPrice !== 0) {
                            item.isOutOfStock = true;
                            item.personalPrice = 0;
                            item.pricePer100g = null;
                            item.pricePerItem = null;
                            outOfStockCount++;
                            updatedCount++;
                        }
                    }
                });
            }

            // 2. Обновляем товары Ozon по очереди
            const ozonItems = items.filter(i => i.marketplace === 'Ozon');
            if (ozonItems.length > 0) {
                let doneOzon = 0;
                for (const item of ozonItems) {
                    doneOzon++;
                    if (onProgress) onProgress(`Ozon: опрос ${doneOzon} из ${ozonItems.length}...`);
                    try {
                        if (item.url) {
                            const freshItem = await OzonEngine.fetchVariantDetails(item.url, item.sku, item.variant, item);
                            if (freshItem && freshItem.personalPrice > 0) {
                                if (item.personalPrice !== freshItem.personalPrice || item.isOutOfStock) {
                                    item.personalPrice = freshItem.personalPrice;
                                    item.basePrice = freshItem.basePrice;
                                    item.isOutOfStock = false;
                                    if (item.weightNetto && item.weightNetto > 0) {
                                        item.pricePer100g = Math.round((item.personalPrice / (item.weightNetto / 100)) * 100) / 100;
                                    }
                                    if (item.itemsCount && item.itemsCount > 0) {
                                        item.pricePerItem = Math.round((item.personalPrice / item.itemsCount) * 100) / 100;
                                    }
                                    updatedCount++;
                                }
                            } else {
                                item.isOutOfStock = true;
                                item.personalPrice = 0;
                                item.pricePer100g = null;
                                item.pricePerItem = null;
                                outOfStockCount++;
                                updatedCount++;
                            }
                        }
                    } catch (e) {
                        console.warn('[PriceUpdateEngine] Ozon item update error:', item.sku, e);
                    }
                }
            }

            // Сохраняем обновленные товары строго в текущую активную коллекцию
            StorageEngine.saveItems(items);
            return { updated: updatedCount, outOfStock: outOfStockCount, total: items.length };
        }
    };

    /* ==========================================================================
       7. UI ENGINE (Floating Toolbar, Modals, Badges, Scoped Styles)
       ========================================================================== */
    const UIEngine = {
        init() {
            StorageEngine.cleanDuplicates();
            this.injectStyles();
            this.renderFloatingDock();
            this.updateBadge();
            CatalogFilterEngine.init();
        },

        injectStyles() {
            const css = `
                /* Catalog Filter Styles */
                .wbo-card-hidden {
                    display: none !important;
                }
                .wbo-card-dimmed {
                    opacity: 0.35 !important;
                    filter: grayscale(80%) !important;
                    position: relative !important;
                }
                .wbo-card-dimmed::after {
                    content: "✓ В сравнении";
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    background: linear-gradient(135deg, #7b2cbf, #9d4edd);
                    color: #fff;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 4px 10px;
                    border-radius: 6px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    z-index: 10;
                    pointer-events: none;
                }

                /* Card Action Buttons in Catalog */
                .wbo-card-actions {
                    position: absolute;
                    top: 6px;
                    right: 6px;
                    z-index: 50;
                    display: flex;
                    gap: 4px;
                    opacity: 0.9;
                    transition: opacity 0.2s ease, transform 0.2s ease;
                }
                .wbo-card-actions:hover {
                    opacity: 1;
                    transform: scale(1.02);
                }
                .wbo-card-btn {
                    border: none;
                    outline: none;
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    color: #fff;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                    user-select: none;
                    line-height: 1.2;
                    transition: all 0.15s ease;
                }
                .wbo-card-btn:hover {
                    filter: brightness(1.15);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.45);
                }
                .wbo-card-btn:active {
                    transform: translateY(0);
                }
                .wbo-card-btn-single {
                    background: linear-gradient(135deg, #7b2cbf, #9d4edd);
                }
                .wbo-card-btn-group {
                    background: linear-gradient(135deg, #2563eb, #3b82f6);
                }

                /* Bottom Sticky Indicator Bar */
                #wbo-bottom-bar {
                    position: fixed;
                    bottom: 24px;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 999998;
                    background: #1e1e24;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 30px;
                    padding: 7px 18px;
                    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
                    display: flex;
                    align-items: center;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    color: #fff;
                    font-size: 13px;
                    user-select: none;
                }
                .wbo-bottom-bar-content {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .wbo-bottom-bar-icon {
                    font-size: 15px;
                }
                .wbo-bottom-bar-text {
                    font-weight: 500;
                }
                .wbo-bottom-bar-text b {
                    color: #a5b4fc;
                    font-size: 14px;
                }
                .wbo-bottom-bar-btn {
                    background: #2a2b36;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: #fff;
                    border-radius: 16px;
                    padding: 4px 12px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .wbo-bottom-bar-btn:hover {
                    background: #393a4a;
                    border-color: rgba(255, 255, 255, 0.4);
                }

                /* Floating Dock */
                #wbo-dock {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    z-index: 999999;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
                    border-radius: 12px;
                    background: #1e1e24;
                    padding: 8px;
                    color: #fff;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                }
                #wbo-dock button {
                    background: #2a2b36;
                    color: #fff;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    padding: 9px 14px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                    transition: all 0.2s ease;
                }
                #wbo-dock button:hover {
                    background: #393a4a;
                    border-color: rgba(255, 255, 255, 0.3);
                }
                #wbo-dock button.primary {
                    background: linear-gradient(135deg, #7b2cbf, #9d4edd);
                    border: none;
                    font-weight: 600;
                }
                #wbo-dock button.primary:hover {
                    background: linear-gradient(135deg, #6a24a6, #893ecb);
                }
                #wbo-dock button.ozon-btn {
                    background: linear-gradient(135deg, #005bff, #0040b3);
                    border: none;
                    font-weight: 600;
                }
                #wbo-dock button.ozon-btn:hover {
                    background: linear-gradient(135deg, #004dd9, #003399);
                }
                #wbo-dock button.wbo-btn-auto-add {
                    background: linear-gradient(135deg, #059669, #10b981);
                    border: none;
                    font-weight: 600;
                }
                #wbo-dock button.wbo-btn-auto-add:hover {
                    background: linear-gradient(135deg, #047857, #059669);
                }
                .wbo-badge {
                    background: #ff5400;
                    color: #fff;
                    padding: 2px 7px;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 700;
                }

                /* Modal Window */
                .wbo-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.65);
                    backdrop-filter: blur(4px);
                    z-index: 1000000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                }
                .wbo-modal {
                    background: #181920;
                    color: #f0f0f5 !important;
                    width: 92%;
                    max-width: 1100px;
                    max-height: 88vh;
                    border-radius: 14px;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
                    overflow: hidden;
                }
                .wbo-modal-header {
                    padding: 16px 20px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #1e1f29;
                }
                .wbo-modal-header h2 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .wbo-close-btn {
                    background: none;
                    border: none;
                    color: #aaa;
                    font-size: 24px;
                    cursor: pointer;
                    line-height: 1;
                    padding: 4px;
                }
                .wbo-close-btn:hover { color: #fff; }
                .wbo-modal-body {
                    padding: 16px 20px;
                    overflow-y: auto;
                    flex: 1;
                }
                .wbo-modal-footer {
                    padding: 14px 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #1e1f29;
                }

                /* Tables & Cards in Modal */
                .wbo-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                    color: #e2e8f0 !important;
                }
                .wbo-table th {
                    background: #252634 !important;
                    color: #cbd5e1 !important;
                    padding: 10px;
                    text-align: left;
                    font-weight: 600;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                .wbo-sort-th {
                    cursor: pointer;
                    user-select: none;
                    transition: background 0.15s ease, color 0.15s ease;
                }
                .wbo-sort-th:hover {
                    background: #34374e !important;
                    color: #ffffff !important;
                }
                .wbo-table td {
                    padding: 8px 10px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                    vertical-align: middle;
                    color: #e2e8f0 !important;
                }
                .wbo-table td b {
                    color: #ffffff !important;
                }
                .wbo-table td a {
                    color: #38bdf8 !important;
                }
                .wbo-table tr:hover td {
                    background: rgba(255, 255, 255, 0.05) !important;
                }
                .wbo-thumb {
                    width: 44px;
                    height: 58px;
                    object-fit: cover;
                    border-radius: 4px;
                    background: #2a2b36;
                }
                .wbo-price-tag {
                    color: #c77dff;
                    font-weight: 700;
                    font-size: 14px;
                }
                .wbo-price-ozon {
                    color: #00bb2d;
                    font-weight: 700;
                    font-size: 14px;
                }
                .wbo-metric-good {
                    color: #48cae4;
                    font-weight: 600;
                }
                .wbo-btn-secondary {
                    background: #2f303f;
                    color: #eee;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    padding: 8px 14px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                }
                .wbo-btn-secondary:hover {
                    background: #3d3e52;
                }
                .wbo-btn-primary {
                    background: #10b981;
                    color: #fff;
                    border: none;
                    padding: 9px 18px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .wbo-btn-primary:hover {
                    background: #059669;
                }
                .wbo-btn-primary:disabled {
                    background: #4b5563;
                    cursor: not-allowed;
                    opacity: 0.6;
                }
                .wbo-btn-danger {
                    background: #ef4444;
                    color: #fff;
                    border: none;
                    padding: 8px 14px;
                    border-radius: 6px;
                    cursor: pointer;
                }
                .wbo-btn-danger:hover {
                    background: #dc2626;
                }
                .wbo-loader {
                    text-align: center;
                    padding: 40px;
                    font-size: 15px;
                    color: #bbb;
                }
                .wbo-tag {
                    display: inline-block;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                }
                .wbo-tag-wb { background: #7b2cbf; color: #fff; }
                .wbo-tag-ozon { background: #005bff; color: #fff; }
                .wbo-best-tag {
                    background: #059669;
                    color: #fff;
                    padding: 1px 5px;
                    border-radius: 3px;
                    font-size: 10px;
                    margin-left: 4px;
                }

                /* Ozon Aspect Cards */
                .wbo-ozon-group {
                    background: #222330;
                    border-radius: 8px;
                    padding: 12px 14px;
                    margin-bottom: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                }
                .wbo-ozon-group-title {
                    font-weight: 600;
                    font-size: 14px;
                    color: #ddd;
                    margin-bottom: 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .wbo-ozon-options-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
                    gap: 8px;
                }
                .wbo-ozon-option-card {
                    background: #2c2d3d;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 6px;
                    padding: 8px 10px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s ease;
                }
                .wbo-ozon-option-card:hover {
                    border-color: #005bff;
                    background: #34354a;
                }
                .wbo-ozon-option-card.selected {
                    border-color: #005bff;
                    background: rgba(0, 91, 255, 0.18);
                    box-shadow: 0 0 0 1px #005bff;
                }
                .wbo-ozon-opt-title {
                    font-weight: 600;
                    font-size: 13px;
                    color: #fff;
                }
                .wbo-ozon-opt-sub {
                    font-size: 11px;
                    color: #aaa;
                    display: block;
                }
                .wbo-progress-box {
                    background: #1e1f29;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    padding: 12px;
                    margin-top: 14px;
                    display: none;
                }
                .wbo-progress-bar {
                    height: 8px;
                    background: #333;
                    border-radius: 4px;
                    overflow: hidden;
                    margin-top: 6px;
                }
                .wbo-progress-fill {
                    height: 100%;
                    width: 0%;
                    background: #10b981;
                    transition: width 0.3s ease;
                }

                /* Collections Bar & Controls */
                .wbo-collections-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #1e1f2b;
                    padding: 10px 14px;
                    border-radius: 8px;
                    margin-bottom: 14px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    flex-wrap: wrap;
                    gap: 10px;
                }
                .wbo-col-left, .wbo-col-right {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-wrap: wrap;
                }
                .wbo-col-label {
                    font-weight: 600;
                    font-size: 13px;
                    color: #a5b4fc;
                }
                .wbo-select {
                    background: #252634;
                    color: #fff;
                    border: 1px solid #4b5563;
                    border-radius: 6px;
                    padding: 5px 10px;
                    font-size: 13px;
                    outline: none;
                    cursor: pointer;
                    min-width: 170px;
                    max-width: 260px;
                }
                .wbo-select:focus {
                    border-color: #818cf8;
                }
                .wbo-btn-sub {
                    background: #252634;
                    color: #e2e8f0;
                    border: 1px solid #4b5563;
                    border-radius: 6px;
                    padding: 5px 10px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    transition: all 0.15s ease;
                }
                .wbo-btn-sub:hover {
                    background: #374151;
                    border-color: #6b7280;
                    color: #fff;
                }
                .wbo-btn-sub-danger {
                    color: #fca5a5;
                    border-color: #7f1d1d;
                }
                .wbo-btn-sub-danger:hover {
                    background: #7f1d1d;
                    border-color: #991b1b;
                    color: #fff;
                }
                .wbo-btn-refresh {
                    background: linear-gradient(135deg, #4f46e5, #7c3aed);
                    color: #fff;
                    border: none;
                    border-radius: 6px;
                    padding: 6px 14px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
                }
                .wbo-btn-refresh:hover {
                    background: linear-gradient(135deg, #4338ca, #6d28d9);
                    transform: translateY(-1px);
                }
                .wbo-btn-refresh:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }
                .wbo-badge-out-of-stock {
                    background: #dc2626;
                    color: #fff;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 2px 7px;
                    border-radius: 4px;
                    display: inline-block;
                }
                .wbo-row-out-of-stock td {
                    opacity: 0.65;
                }
            `;
            GM_addStyle(css);
        },

        renderFloatingDock() {
            const isWB = window.location.hostname.includes('wildberries.ru');
            const isOzon = window.location.hostname.includes('ozon.ru');

            const dock = document.createElement('div');
            dock.id = 'wbo-dock';

            if (isWB) {
                const btnAnalyze = document.createElement('button');
                btnAnalyze.className = 'primary';
                btnAnalyze.innerHTML = `<span>📊 Анализ вариантов WB</span> <span>⚡</span>`;
                btnAnalyze.onclick = () => this.openWbVariantsModal();
                dock.appendChild(btnAnalyze);

                const btnAutoAdd = document.createElement('button');
                btnAutoAdd.className = 'wbo-btn-auto-add';
                btnAutoAdd.innerHTML = `<span>⚡ Собрать все в наличии</span> <span>📦</span>`;
                btnAutoAdd.title = 'Автоматически найти и добавить все доступные модификации товара в наличии';
                btnAutoAdd.onclick = async () => {
                    btnAutoAdd.disabled = true;
                    btnAutoAdd.innerHTML = `<span>⏳ Сбор вариантов...</span> <span>🔄</span>`;
                    try {
                        const count = await WBEngine.autoAddAllInStock((msg) => {
                            UIEngine.showToast(msg);
                        });
                        UIEngine.showToast(`⚡ Добавлено ${count} товаров в наличии!`);
                    } catch (err) {
                        UIEngine.showToast(`Ошибка: ${err.message}`, false);
                    } finally {
                        btnAutoAdd.disabled = false;
                        btnAutoAdd.innerHTML = `<span>⚡ Собрать все в наличии</span> <span>📦</span>`;
                    }
                };
                dock.appendChild(btnAutoAdd);
            } else if (isOzon) {
                const btnOzonOpt = document.createElement('button');
                btnOzonOpt.className = 'ozon-btn';
                btnOzonOpt.innerHTML = `<span>🔍 Варианты Ozon</span> <span>🎯</span>`;
                btnOzonOpt.onclick = () => this.openOzonOptionsModal();
                dock.appendChild(btnOzonOpt);
            }

            const btnAddCurrent = document.createElement('button');
            btnAddCurrent.innerHTML = `<span>➕ В базу текущий</span> <span>📌</span>`;
            btnAddCurrent.onclick = () => this.addCurrentProduct();
            dock.appendChild(btnAddCurrent);

            const btnComparison = document.createElement('button');
            btnComparison.innerHTML = `<span>⚖️ База сравнения</span> <span class="wbo-badge" id="wbo-count-badge">0</span>`;
            btnComparison.onclick = () => this.openComparisonModal();
            dock.appendChild(btnComparison);

            document.body.appendChild(dock);
        },

        updateBadge() {
            const badge = document.getElementById('wbo-count-badge');
            if (badge) {
                badge.textContent = StorageEngine.getCount();
                const activeCol = StorageEngine.getActiveCollection();
                if (activeCol && badge.parentElement) {
                    badge.parentElement.title = `Коллекция: «${activeCol.name}» (${StorageEngine.getCount()} тов.)`;
                }
            }
        },

        showToast(message, isSuccess = true) {
            const toast = document.createElement('div');
            toast.style.position = 'fixed';
            toast.style.bottom = '150px';
            toast.style.right = '24px';
            toast.style.zIndex = '1000005';
            toast.style.padding = '10px 18px';
            toast.style.borderRadius = '8px';
            toast.style.background = isSuccess ? '#10b981' : '#ef4444';
            toast.style.color = '#fff';
            toast.style.fontWeight = '600';
            toast.style.fontSize = '13px';
            toast.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s';
                setTimeout(() => toast.remove(), 300);
            }, 2500);
        },

        async addCurrentProduct() {
            const isWB = window.location.hostname.includes('wildberries.ru');
            const isOzon = window.location.hostname.includes('ozon.ru');

            try {
                let item = null;
                if (isWB) {
                    item = await WBEngine.extractCurrentProduct();
                } else if (isOzon) {
                    item = OzonEngine.extractCurrentProduct();
                }

                if (item) {
                    StorageEngine.addItem(item);
                    this.showToast(`Добавлено: ${item.marketplace} ${item.variant || item.sku}`);
                }
            } catch (e) {
                console.error('[Comparator] Error adding current product:', e);
                alert(`Ошибка при добавлении товара: ${e.message}`);
            }
        },

        /* ======================================================================
           МОДАЛЬНОЕ ОКНО: Анализ всех вариантов Wildberries
           ====================================================================== */
        async openWbVariantsModal() {
            const overlay = document.createElement('div');
            overlay.className = 'wbo-modal-overlay';

            overlay.innerHTML = `
                <div class="wbo-modal">
                    <div class="wbo-modal-header">
                        <h2><span>🟣</span> Анализ вариантов Wildberries</h2>
                        <button class="wbo-close-btn">&times;</button>
                    </div>
                    <div class="wbo-modal-body" id="wbo-variants-body">
                        <div class="wbo-loader">
                            <div style="font-size: 28px; margin-bottom: 12px;">⏳</div>
                            <div id="wbo-loader-text">Анализ карточки и вариантов товара...</div>
                        </div>
                    </div>
                    <div class="wbo-modal-footer">
                        <div>
                            <button class="wbo-btn-secondary" id="wbo-select-all-btn">Выбрать все</button>
                            <button class="wbo-btn-secondary" id="wbo-deselect-all-btn" style="margin-left: 8px;">Снять выбор</button>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="wbo-btn-secondary" id="wbo-add-all-instock-btn" style="border-color: #10b981; color: #10b981; font-weight: 600;">
                                ⚡ Все в наличии в базу
                            </button>
                            <button class="wbo-btn-primary" id="wbo-add-selected-btn" disabled>
                                📥 Добавить выбранные (<span id="wbo-selected-count">0</span>) в базу
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const closeBtn = overlay.querySelector('.wbo-close-btn');
            closeBtn.onclick = () => overlay.remove();
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

            const loaderText = overlay.querySelector('#wbo-loader-text');
            const bodyEl = overlay.querySelector('#wbo-variants-body');
            const addSelectedBtn = overlay.querySelector('#wbo-add-selected-btn');
            const selectAllBtn = overlay.querySelector('#wbo-select-all-btn');
            const deselectAllBtn = overlay.querySelector('#wbo-deselect-all-btn');
            const countSpan = overlay.querySelector('#wbo-selected-count');

            try {
                const variants = await WBEngine.analyzeAllVariants((msg) => {
                    if (loaderText) loaderText.textContent = msg;
                });

                if (!variants || variants.length === 0) {
                    bodyEl.innerHTML = `<div style="text-align:center; padding: 40px;">Варианты не обнаружены.</div>`;
                    return;
                }

                let html = `
                    <div style="margin-bottom: 12px; color: #aaa; font-size: 13px;">
                        Обнаружено <b>${variants.length}</b> вариантов. Цены рассчитаны с учетом вашей персональной скидки/кошелька WB.
                    </div>
                    <table class="wbo-table">
                        <thead>
                            <tr>
                                <th style="width: 30px;"><input type="checkbox" id="wbo-th-select-all"></th>
                                <th style="width: 50px;">Фото</th>
                                <th>Артикул</th>
                                <th>Модификация</th>
                                <th>Личная цена</th>
                                <th>Вес без упак.</th>
                                <th>Вес с упак.</th>
                                <th>Кол-во</th>
                                <th>Цена / 100г</th>
                                <th>Цена / 1 шт</th>
                                <th>Ссылка</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                let minP100 = Infinity;
                variants.forEach(v => {
                    if (v.weightNetto && v.personalPrice > 0) {
                        const p100 = (v.personalPrice / (v.weightNetto / 100));
                        if (p100 < minP100) minP100 = p100;
                    }
                });

                variants.forEach((v, idx) => {
                    const isAvailable = (v.personalPrice && v.personalPrice > 0);
                    const p100 = (v.weightNetto && isAvailable)
                        ? Math.round((v.personalPrice / (v.weightNetto / 100)) * 10) / 10
                        : null;
                    const pItem = (v.itemsCount && isAvailable)
                        ? Math.round((v.personalPrice / v.itemsCount) * 10) / 10
                        : null;
                    const isBest = (p100 && Math.abs(p100 - minP100) < 0.1);

                    const rowStyle = [
                        v.isCurrent ? 'background: rgba(123, 44, 191, 0.15);' : '',
                        !isAvailable ? 'opacity: 0.55;' : ''
                    ].filter(Boolean).join(' ');

                    html += `
                        <tr style="${rowStyle}">
                            <td>
                                <input type="checkbox" class="wbo-var-cb" data-idx="${idx}" ${isAvailable ? 'checked' : 'disabled'}>
                            </td>
                            <td>
                                <img src="${v.imageUrl}" class="wbo-thumb" onerror="this.style.display='none'">
                            </td>
                            <td>
                                <b>${v.sku}</b> ${v.isCurrent ? '<span class="wbo-tag wbo-tag-wb">Текущий</span>' : ''}
                            </td>
                            <td>${v.variant}</td>
                            <td>
                                ${isAvailable
                                    ? `<span class="wbo-price-tag">${v.personalPrice} ₽</span>
                                       ${v.basePrice && v.basePrice !== v.personalPrice ? `<br><small style="color:#777; text-decoration:line-through;">${v.basePrice} ₽</small>` : ''}`
                                    : `<span class="wbo-tag" style="background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">Нет в наличии</span>`}
                            </td>
                            <td>${v.weightNetto ? (v.isGrossWeight ? `<span title="Рассчитано по весу с упаковкой" style="color:#a5b4fc;">~${v.weightNetto} г*</span>` : `<b>${v.weightNetto} г</b>`) : '<span style="color:#666">-</span>'}</td>
                            <td>${v.weightGross ? `${v.weightGross} г` : '<span style="color:#666">-</span>'}</td>
                            <td>${v.itemsCount ? `<b>${v.itemsCount} шт.</b>` : '<span style="color:#666">-</span>'}</td>
                            <td>
                                ${p100 ? `<span class="wbo-metric-good">${p100} ₽</span>` : '-'}
                                ${isBest ? '<span class="wbo-best-tag">ВЫГОДНО</span>' : ''}
                            </td>
                            <td>${pItem ? `${pItem} ₽` : '-'}</td>
                            <td>
                                <a href="${v.url}" target="_blank" style="color: #48cae4; text-decoration: none;">Перейти ↗</a>
                            </td>
                        </tr>
                    `;
                });

                html += `</tbody></table>`;
                bodyEl.innerHTML = html;

                const allCheckboxes = Array.from(bodyEl.querySelectorAll('.wbo-var-cb'));
                const activeCheckboxes = allCheckboxes.filter(cb => !cb.disabled);
                const thSelectAll = bodyEl.querySelector('#wbo-th-select-all');

                const updateCount = () => {
                    const checked = activeCheckboxes.filter(cb => cb.checked);
                    countSpan.textContent = checked.length;
                    addSelectedBtn.disabled = checked.length === 0;
                    if (thSelectAll) {
                        thSelectAll.checked = activeCheckboxes.length > 0 && checked.length === activeCheckboxes.length;
                    }
                };

                activeCheckboxes.forEach(cb => cb.onchange = updateCount);

                if (thSelectAll) {
                    thSelectAll.onchange = () => {
                        activeCheckboxes.forEach(cb => cb.checked = thSelectAll.checked);
                        updateCount();
                    };
                }

                selectAllBtn.onclick = () => {
                    activeCheckboxes.forEach(cb => cb.checked = true);
                    updateCount();
                };

                deselectAllBtn.onclick = () => {
                    activeCheckboxes.forEach(cb => cb.checked = false);
                    updateCount();
                };

                addSelectedBtn.onclick = () => {
                    const selected = activeCheckboxes.filter(cb => cb.checked).map(cb => {
                        return variants[parseInt(cb.getAttribute('data-idx'), 10)];
                    });
                    const added = StorageEngine.addMultiple(selected);
                    this.showToast(`Добавлено ${added} вариантов в базу`);
                    overlay.remove();
                };

                const addAllInStockBtn = overlay.querySelector('#wbo-add-all-instock-btn');
                if (addAllInStockBtn) {
                    addAllInStockBtn.onclick = () => {
                        const inStockVariants = variants.filter(v => v.personalPrice > 0);
                        if (inStockVariants.length === 0) {
                            this.showToast('Нет товаров в наличии для добавления', false);
                            return;
                        }
                        const added = StorageEngine.addMultiple(inStockVariants);
                        this.showToast(`⚡ Добавлено ${added} товаров в наличии!`);
                        overlay.remove();
                    };
                }

                updateCount();

            } catch (err) {
                console.error('[WB Variants Error]', err);
                bodyEl.innerHTML = `
                    <div style="text-align:center; padding: 40px; color: #ef4444;">
                        <div style="font-size: 24px; margin-bottom: 8px;">⚠️ Ошибка анализа вариантов</div>
                        <div>${err.message}</div>
                    </div>
                `;
            }
        },

        /* ======================================================================
           МОДАЛЬНОЕ ОКНО: Список опций на Ozon (Чекбоксы + Интерактивный сбор)
           ====================================================================== */
        openOzonOptionsModal() {
            const overlay = document.createElement('div');
            overlay.className = 'wbo-modal-overlay';

            const curItem = OzonEngine.extractCurrentProduct();
            const aspectGroups = OzonEngine.getAvailableAspectGroups();

            overlay.innerHTML = `
                <div class="wbo-modal" style="max-width: 820px;">
                    <div class="wbo-modal-header">
                        <h2><span>🔵</span> Опции и модификации Ozon</h2>
                        <button class="wbo-close-btn">&times;</button>
                    </div>
                    <div class="wbo-modal-body">
                        <!-- Блок текущего открытого товара -->
                        <div style="background: #252634; padding: 14px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.08);">
                            <div style="font-weight: 600; font-size: 15px; margin-bottom: 8px;" id="wbo-ozon-cur-title">${curItem.title}</div>
                            <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: #bbb;">
                                <div>Артикул: <b id="wbo-ozon-cur-sku">${curItem.sku}</b></div>
                                <div>Текущий выбор: <b style="color:#00bb2d;" id="wbo-ozon-cur-variant">${curItem.variant}</b></div>
                                <div>Личная цена (Ozon Банк): <b class="wbo-price-ozon" id="wbo-ozon-cur-price">${curItem.personalPrice} ₽</b></div>
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: #bbb; margin-top: 6px;">
                                <div>Вес без упаковки: <b id="wbo-ozon-cur-weight">${curItem.weightNetto ? `${curItem.weightNetto} г` : 'не указан'}</b></div>
                                <div>Количество: <b id="wbo-ozon-cur-qty">${curItem.itemsCount ? `${curItem.itemsCount} шт.` : 'не указано'}</b></div>
                            </div>
                            <div style="margin-top: 12px; display: flex; gap: 10px;">
                                <button class="wbo-btn-secondary" id="wbo-ozon-add-current-btn">
                                    ➕ Добавить только этот открытый вариант
                                </button>
                            </div>
                        </div>

                        <!-- Блок выбора модификаций с чекбоксами -->
                        <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="font-weight: 600; font-size: 14px;">
                                Выберите интересующие варианты для добавления в сравнение:
                            </div>
                            <div>
                                <button class="wbo-btn-secondary" id="wbo-ozon-select-all-btn" style="padding: 4px 10px; font-size: 12px;">Выбрать все</button>
                                <button class="wbo-btn-secondary" id="wbo-ozon-deselect-all-btn" style="padding: 4px 10px; font-size: 12px; margin-left: 6px;">Снять</button>
                            </div>
                        </div>

                        <div id="wbo-ozon-groups-container">
                            ${aspectGroups.length > 0 ? aspectGroups.map((g, gIdx) => `
                                <div class="wbo-ozon-group">
                                    <div class="wbo-ozon-group-title">
                                        <span>${g.title} (${g.options.length})</span>
                                        <small style="color: #888;">(нажмите на карточку для предпросмотра)</small>
                                    </div>
                                    <div class="wbo-ozon-options-grid">
                                        ${g.options.map((opt, oIdx) => `
                                            <div class="wbo-ozon-option-card ${opt.isSelected ? 'selected' : ''}" data-gidx="${gIdx}" data-oidx="${oIdx}">
                                                <input type="checkbox" class="wbo-ozon-opt-cb" data-gidx="${gIdx}" data-oidx="${oIdx}" ${opt.isSelected ? 'checked' : ''} style="cursor:pointer;">
                                                <div style="flex:1;">
                                                    <span class="wbo-ozon-opt-title">${opt.value} ${opt.isSelected ? '<span class="wbo-tag wbo-tag-ozon" style="font-size:9px; padding:1px 4px; margin-left:3px;">Текущий</span>' : ''}</span>
                                                    ${opt.subtitle ? `<span class="wbo-ozon-opt-sub">${opt.subtitle}</span>` : ''}
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('') : '<div style="color:#888; padding: 20px; text-align:center;">Модификации на странице не обнаружены.</div>'}
                        </div>

                        <!-- Прогресс-бар сбора -->
                        <div class="wbo-progress-box" id="wbo-ozon-progress-box">
                            <div id="wbo-ozon-progress-text" style="font-size: 13px; font-weight: 500;">Подготовка к сбору вариантов...</div>
                            <div class="wbo-progress-bar">
                                <div class="wbo-progress-fill" id="wbo-ozon-progress-fill"></div>
                            </div>
                        </div>
                    </div>
                    <div class="wbo-modal-footer">
                        <div style="display: flex; gap: 8px;">
                            <button class="wbo-btn-secondary wbo-close-modal">Закрыть</button>
                            <button class="wbo-btn-secondary" id="wbo-ozon-diag-btn" style="background:#1e3a8a; border-color:#3b82f6; color:#93c5fd;" title="Собрать данные страницы и скопировать в буфер обмена для анализа">🧪 Скопировать диагностику</button>
                        </div>
                        <button class="wbo-btn-primary" id="wbo-ozon-collect-selected-btn">
                            ⚡ Собрать все выбранные варианты в сравнение (<span id="wbo-ozon-sel-count">0</span>)
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            overlay.querySelector('.wbo-close-btn').onclick = () => overlay.remove();
            overlay.querySelector('.wbo-close-modal').onclick = () => overlay.remove();
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

            const diagBtn = overlay.querySelector('#wbo-ozon-diag-btn');
            if (diagBtn) {
                diagBtn.onclick = () => {
                    const report = OzonEngine.collectDiagnostics();
                    const jsonStr = JSON.stringify(report, null, 2);
                    try {
                        if (typeof GM_setClipboard === 'function') {
                            GM_setClipboard(jsonStr, 'text');
                        } else {
                            navigator.clipboard.writeText(jsonStr);
                        }
                        this.showToast('✅ Диагностика Ozon скопирована в буфер обмена!');
                    } catch (e) {
                        console.error('Diag copy failed:', e);
                        prompt('Скопируйте диагностический отчет:', jsonStr);
                    }
                };
            }

            const checkboxes = Array.from(overlay.querySelectorAll('.wbo-ozon-opt-cb'));
            const countSpan = overlay.querySelector('#wbo-ozon-sel-count');
            const collectBtn = overlay.querySelector('#wbo-ozon-collect-selected-btn');
            const selectAllBtn = overlay.querySelector('#wbo-ozon-select-all-btn');
            const deselectAllBtn = overlay.querySelector('#wbo-ozon-deselect-all-btn');
            const addCurrentBtn = overlay.querySelector('#wbo-ozon-add-current-btn');
            const progressBox = overlay.querySelector('#wbo-ozon-progress-box');
            const progressText = overlay.querySelector('#wbo-ozon-progress-text');
            const progressFill = overlay.querySelector('#wbo-ozon-progress-fill');

            const updateCount = () => {
                const checked = checkboxes.filter(cb => cb.checked);
                countSpan.textContent = checked.length;
                collectBtn.disabled = checked.length === 0;
            };

            checkboxes.forEach(cb => cb.onchange = updateCount);

            if (selectAllBtn) {
                selectAllBtn.onclick = () => {
                    checkboxes.forEach(cb => cb.checked = true);
                    updateCount();
                };
            }

            if (deselectAllBtn) {
                deselectAllBtn.onclick = () => {
                    checkboxes.forEach(cb => cb.checked = false);
                    updateCount();
                };
            }

            // Клик по карточке для предпросмотра / переключения на Ozon
            overlay.querySelectorAll('.wbo-ozon-option-card').forEach(card => {
                card.onclick = async (e) => {
                    if (e.target.tagName === 'INPUT') return;
                    const gIdx = parseInt(card.getAttribute('data-gidx'), 10);
                    const oIdx = parseInt(card.getAttribute('data-oidx'), 10);
                    const opt = aspectGroups[gIdx]?.options[oIdx];

                    if (opt && opt.el) {
                        if (typeof opt.el.click === 'function') {
                            opt.el.click();
                        } else {
                            opt.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        }

                        // Подсвечиваем активную карточку в UI
                        card.parentElement.querySelectorAll('.wbo-ozon-option-card').forEach(c => c.classList.remove('selected'));
                        card.classList.add('selected');

                        await new Promise(r => setTimeout(r, 600));
                        const updatedItem = OzonEngine.extractCurrentProduct();
                        overlay.querySelector('#wbo-ozon-cur-sku').textContent = updatedItem.sku;
                        overlay.querySelector('#wbo-ozon-cur-variant').textContent = updatedItem.variant;
                        overlay.querySelector('#wbo-ozon-cur-price').textContent = `${updatedItem.personalPrice} ₽`;
                        overlay.querySelector('#wbo-ozon-cur-weight').textContent = updatedItem.weightNetto ? `${updatedItem.weightNetto} г` : 'не указан';
                        overlay.querySelector('#wbo-ozon-cur-qty').textContent = updatedItem.itemsCount ? `${updatedItem.itemsCount} шт.` : 'не указано';
                    }
                };
            });

            // Добавление текущего открытого
            addCurrentBtn.onclick = () => {
                const item = OzonEngine.extractCurrentProduct();
                StorageEngine.addItem(item);
                this.showToast(`Добавлено: Ozon ${item.variant}`);
                overlay.remove();
            };

            // Фоновый сбор выбранных вариантов (через GM_xmlhttpRequest без перезагрузки)
            collectBtn.onclick = async () => {
                const selectedCbs = checkboxes.filter(cb => cb.checked);
                if (selectedCbs.length === 0) return;

                collectBtn.disabled = true;
                progressBox.style.display = 'block';

                const curItem = OzonEngine.extractCurrentProduct();
                let collectedCount = 0;

                for (let i = 0; i < selectedCbs.length; i++) {
                    const cb = selectedCbs[i];
                    const gIdx = parseInt(cb.getAttribute('data-gidx'), 10);
                    const oIdx = parseInt(cb.getAttribute('data-oidx'), 10);
                    const opt = aspectGroups[gIdx]?.options[oIdx];
                    if (!opt) continue;

                    const percent = Math.round(((i + 1) / selectedCbs.length) * 100);
                    progressFill.style.width = `${percent}%`;
                    progressText.textContent = `Загрузка варианта ${i + 1} из ${selectedCbs.length}: "${opt.value}"...`;

                    try {
                        let itemToAdd = null;
                        if (opt.isSelected || !opt.href || (curItem && opt.sku === curItem.sku)) {
                            // Текущий открытый вариант сохраняем мгновенно из открытой страницы
                            itemToAdd = curItem;
                        } else {
                            // Формируем наименование варианта (например "40 шт")
                            const groupTitle = aspectGroups[gIdx]?.title || '';
                            let varName = opt.value;
                            if (groupTitle.includes('Единиц') && !varName.includes('шт')) {
                                varName = `${varName} шт`;
                            }
                            // Фоновый запрос данных без перезагрузки страницы
                            itemToAdd = await OzonEngine.fetchVariantDetails(opt.href, opt.sku, varName, curItem);
                        }

                        if (itemToAdd) {
                            StorageEngine.addItem(itemToAdd);
                            collectedCount++;
                        }
                    } catch (err) {
                        console.error(`[Ozon Collector] Ошибка обработки варианта "${opt.value}":`, err);
                    }
                }

                progressText.textContent = `✅ Успешно собрано ${collectedCount} вариантов в базу!`;
                this.showToast(`Собрано ${collectedCount} вариантов Ozon в базу`);
                await new Promise(r => setTimeout(r, 1200));
                overlay.remove();
            };

            updateCount();
        },

        /* ======================================================================
           МОДАЛЬНОЕ ОКНО: Общая база сравнения + Управление коллекциями + Excel
           ====================================================================== */
        openComparisonModal() {
            // Очищаем старые дубликаты в активной коллекции перед открытием
            StorageEngine.cleanDuplicates();

            let sortField = null;
            let sortDir = 'asc'; // 'asc' or 'desc'

            const overlay = document.createElement('div');
            overlay.className = 'wbo-modal-overlay';

            const renderContent = () => {
                const activeCol = StorageEngine.getActiveCollection();
                const collections = StorageEngine.getCollections();
                let items = StorageEngine.getItems();

                if (sortField) {
                    items.sort((a, b) => {
                        let valA = a[sortField];
                        let valB = b[sortField];

                        const numFields = ['personalPrice', 'basePrice', 'weightNetto', 'itemsCount', 'pricePer100g', 'pricePerItem'];
                        if (numFields.includes(sortField)) {
                            valA = (valA !== null && valA !== undefined && valA !== '') ? Number(valA) : (sortDir === 'asc' ? Infinity : -Infinity);
                            valB = (valB !== null && valB !== undefined && valB !== '') ? Number(valB) : (sortDir === 'asc' ? Infinity : -Infinity);
                            return sortDir === 'asc' ? valA - valB : valB - valA;
                        }

                        valA = (valA || '').toString().toLowerCase();
                        valB = (valB || '').toString().toLowerCase();
                        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
                        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
                        return 0;
                    });
                }

                const getSortIcon = (field) => {
                    if (sortField !== field) return '<span style="opacity: 0.35; font-size: 11px; margin-left: 4px;">⇅</span>';
                    return sortDir === 'asc'
                        ? '<span style="color: #818cf8; font-weight: bold; margin-left: 4px;">▲</span>'
                        : '<span style="color: #818cf8; font-weight: bold; margin-left: 4px;">▼</span>';
                };

                overlay.innerHTML = `
                    <div class="wbo-modal">
                        <div class="wbo-modal-header">
                            <h2><span>⚖️</span> База сравнения товаров — <span style="color:#818cf8; font-weight:700;">${activeCol.name}</span></h2>
                            <button class="wbo-close-btn">&times;</button>
                        </div>
                        <div class="wbo-modal-body">
                            <!-- Панель коллекций и актуализации цен -->
                            <div class="wbo-collections-bar">
                                <div class="wbo-col-left">
                                    <span class="wbo-col-label">📂 Коллекция:</span>
                                    <select id="wbo-col-select" class="wbo-select">
                                        ${collections.map(c => `
                                            <option value="${c.id}" ${c.id === activeCol.id ? 'selected' : ''}>
                                                ${c.name} (${c.items ? c.items.length : 0})
                                            </option>
                                        `).join('')}
                                    </select>
                                    <button id="wbo-col-new-btn" class="wbo-btn-sub" title="Создать новую пустую коллекцию">➕ Новая</button>
                                    <button id="wbo-col-save-as-btn" class="wbo-btn-sub" title="Сохранить текущие товары в новую коллекцию">💾 Сохранить как...</button>
                                    <button id="wbo-col-rename-btn" class="wbo-btn-sub" title="Переименовать текущую коллекцию">✏️</button>
                                    <button id="wbo-col-delete-btn" class="wbo-btn-sub wbo-btn-sub-danger" title="Удалить текущую коллекцию">🗑️</button>
                                </div>
                                <div class="wbo-col-right">
                                    <button id="wbo-refresh-prices-btn" class="wbo-btn-refresh" title="Актуализировать цены и наличие товаров текущей коллекции" ${items.length === 0 ? 'disabled' : ''}>
                                        <span class="wbo-refresh-icon">🔄</span> <span class="wbo-refresh-text">Обновить наличие и цены</span>
                                    </button>
                                </div>
                            </div>

                            ${items.length === 0 ? `
                                <div style="text-align: center; padding: 60px 20px; color: #888;">
                                    <div style="font-size: 40px; margin-bottom: 12px;">📭</div>
                                    <div style="font-size: 16px; font-weight: 500;">Коллекция «${activeCol.name}» пуста</div>
                                    <div style="font-size: 13px; margin-top: 6px;">Откройте страницу товара на Wildberries или Ozon и добавьте лоты.</div>
                                </div>
                            ` : `
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 13px; color: #aaa;">
                                    <div>Лотов в коллекции: <b>${items.length}</b></div>
                                    <div>Данные сохраняются локально и доступны на WB и Ozon</div>
                                </div>
                                <table class="wbo-table">
                                    <thead>
                                        <tr>
                                            <th>№</th>
                                            <th class="wbo-sort-th" data-field="marketplace" title="Сортировать по маркетплейсу">МП ${getSortIcon('marketplace')}</th>
                                            <th class="wbo-sort-th" data-field="sku" title="Сортировать по артикулу">Артикул ${getSortIcon('sku')}</th>
                                            <th class="wbo-sort-th" data-field="title" title="Сортировать по названию">Наименование ${getSortIcon('title')}</th>
                                            <th class="wbo-sort-th" data-field="variant" title="Сортировать по варианту">Вариант ${getSortIcon('variant')}</th>
                                            <th class="wbo-sort-th" data-field="personalPrice" title="Сортировать по цене">Личная цена ${getSortIcon('personalPrice')}</th>
                                            <th class="wbo-sort-th" data-field="weightNetto" title="Сортировать по весу">Вес нетто ${getSortIcon('weightNetto')}</th>
                                            <th class="wbo-sort-th" data-field="itemsCount" title="Сортировать по количеству">Кол-во ${getSortIcon('itemsCount')}</th>
                                            <th class="wbo-sort-th" data-field="pricePer100g" title="Сортировать по цене за 100г">Цена / 100г ${getSortIcon('pricePer100g')}</th>
                                            <th class="wbo-sort-th" data-field="pricePerItem" title="Сортировать по цене за штуку">Цена / 1 шт ${getSortIcon('pricePerItem')}</th>
                                            <th>Ссылка</th>
                                            <th style="width: 40px;"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${items.map((item, idx) => {
                                            const isWB = item.marketplace === 'Wildberries';
                                            const isOut = item.isOutOfStock || item.personalPrice === 0;
                                            return `
                                                <tr class="${isOut ? 'wbo-row-out-of-stock' : ''}">
                                                    <td>${idx + 1}</td>
                                                    <td>
                                                        <span class="wbo-tag ${isWB ? 'wbo-tag-wb' : 'wbo-tag-ozon'}">${isWB ? 'WB' : 'Ozon'}</span>
                                                    </td>
                                                    <td><b>${item.sku}</b></td>
                                                    <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.title}">${item.title}</td>
                                                    <td>${item.variant || '-'}</td>
                                                    <td>
                                                        ${isOut
                                                            ? '<span class="wbo-badge-out-of-stock">Нет в наличии</span>'
                                                            : `<span class="${isWB ? 'wbo-price-tag' : 'wbo-price-ozon'}">${item.personalPrice} ₽</span>`
                                                        }
                                                    </td>
                                                    <td>${item.weightNetto ? (item.isGrossWeight ? `<span title="Рассчитано по весу с упаковкой" style="color:#a5b4fc;">~${item.weightNetto} г*</span>` : `<b>${item.weightNetto} г</b>`) : '-'}</td>
                                                    <td>${item.itemsCount ? `<b>${item.itemsCount} шт.</b>` : '-'}</td>
                                                    <td>
                                                        ${(!isOut && item.pricePer100g) ? `<span class="wbo-metric-good">${item.pricePer100g} ₽</span>` : '-'}
                                                    </td>
                                                    <td>${(!isOut && item.pricePerItem) ? `${item.pricePerItem} ₽` : '-'}</td>
                                                    <td>
                                                        <a href="${item.url}" target="_blank" style="color:#48cae4; text-decoration:none;">Открыть ↗</a>
                                                    </td>
                                                    <td>
                                                        <button class="wbo-delete-item-btn" data-id="${item.id}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:16px;" title="Удалить строку">&times;</button>
                                                    </td>
                                                </tr>
                                            `;
                                        }).join('')}
                                    </tbody>
                                </table>
                            `}
                        </div>
                        <div class="wbo-modal-footer">
                            <div>
                                ${items.length > 0 ? `
                                    <button class="wbo-btn-danger" id="wbo-clear-all-btn">🗑️ Очистить текущую коллекцию</button>
                                ` : ''}
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button class="wbo-btn-secondary wbo-close-modal">Закрыть</button>
                                ${items.length > 0 ? `
                                    <button class="wbo-btn-primary" id="wbo-export-excel-btn">
                                        📊 Скачать в Excel (.xlsx)
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;

                overlay.querySelector('.wbo-close-btn').onclick = () => overlay.remove();
                overlay.querySelector('.wbo-close-modal').onclick = () => overlay.remove();

                // Обработчики коллекций
                const colSelect = overlay.querySelector('#wbo-col-select');
                if (colSelect) {
                    colSelect.onchange = (e) => {
                        StorageEngine.setActiveCollectionId(e.target.value);
                        renderContent();
                    };
                }

                const newBtn = overlay.querySelector('#wbo-col-new-btn');
                if (newBtn) {
                    newBtn.onclick = () => {
                        const name = prompt('Введите название новой коллекции:');
                        if (name && name.trim()) {
                            StorageEngine.createCollection(name.trim(), []);
                            renderContent();
                            this.showToast(`Создана коллекция: "${name.trim()}"`);
                        }
                    };
                }

                const saveAsBtn = overlay.querySelector('#wbo-col-save-as-btn');
                if (saveAsBtn) {
                    saveAsBtn.onclick = () => {
                        const cur = StorageEngine.getActiveCollection();
                        const name = prompt('Введите название для новой коллекции с текущими товарами:', `${cur.name} (копия)`);
                        if (name && name.trim()) {
                            const currentItems = StorageEngine.getItems();
                            StorageEngine.createCollection(name.trim(), JSON.parse(JSON.stringify(currentItems)));
                            renderContent();
                            this.showToast(`Коллекция сохранена: "${name.trim()}"`);
                        }
                    };
                }

                const renameBtn = overlay.querySelector('#wbo-col-rename-btn');
                if (renameBtn) {
                    renameBtn.onclick = () => {
                        const cur = StorageEngine.getActiveCollection();
                        const newName = prompt('Новое название коллекции:', cur.name);
                        if (newName && newName.trim() && newName.trim() !== cur.name) {
                            StorageEngine.renameCollection(cur.id, newName.trim());
                            renderContent();
                            this.showToast(`Коллекция переименована в "${newName.trim()}"`);
                        }
                    };
                }

                const deleteBtn = overlay.querySelector('#wbo-col-delete-btn');
                if (deleteBtn) {
                    deleteBtn.onclick = () => {
                        const cur = StorageEngine.getActiveCollection();
                        const all = StorageEngine.getCollections();
                        if (all.length <= 1) {
                            if (confirm(`Очистить все товары из коллекции "${cur.name}"?`)) {
                                StorageEngine.clearAll();
                                renderContent();
                                this.showToast('Коллекция очищена');
                            }
                            return;
                        }
                        if (confirm(`Вы действительно хотите удалить коллекцию "${cur.name}" (${cur.items.length} тов.)?`)) {
                            StorageEngine.deleteCollection(cur.id);
                            renderContent();
                            this.showToast(`Коллекция "${cur.name}" удалена`);
                        }
                    };
                }

                // Обработчик кнопки «Обновить наличие и цены» (ТОЛЬКО для текущей коллекции)
                const refreshBtn = overlay.querySelector('#wbo-refresh-prices-btn');
                if (refreshBtn) {
                    refreshBtn.onclick = async () => {
                        refreshBtn.disabled = true;
                        const origHtml = refreshBtn.innerHTML;
                        refreshBtn.innerHTML = `<span>⏳</span> <span class="wbo-refresh-text">Обновление...</span>`;
                        try {
                            const res = await PriceUpdateEngine.updateCurrentCollectionPrices((statusMsg) => {
                                const textSpan = refreshBtn.querySelector('.wbo-refresh-text');
                                if (textSpan) textSpan.textContent = statusMsg;
                            });
                            renderContent();
                            const inStockCount = res.total - res.outOfStock;
                            this.showToast(`✅ Цены обновлены! В наличии: ${inStockCount}, нет в наличии: ${res.outOfStock}`);
                        } catch (err) {
                            console.error('[PriceUpdateEngine Error]', err);
                            this.showToast(`Ошибка обновления: ${err.message}`, false);
                            refreshBtn.disabled = false;
                            refreshBtn.innerHTML = origHtml;
                        }
                    };
                }

                const sortHeaders = overlay.querySelectorAll('.wbo-sort-th');
                sortHeaders.forEach(th => {
                    th.onclick = () => {
                        const field = th.getAttribute('data-field');
                        if (sortField === field) {
                            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                        } else {
                            sortField = field;
                            sortDir = 'asc';
                        }
                        renderContent();
                    };
                });

                const deleteBtns = overlay.querySelectorAll('.wbo-delete-item-btn');
                deleteBtns.forEach(btn => {
                    btn.onclick = () => {
                        const id = btn.getAttribute('data-id');
                        StorageEngine.removeItem(id);
                        renderContent();
                    };
                });

                const clearAllBtn = overlay.querySelector('#wbo-clear-all-btn');
                if (clearAllBtn) {
                    clearAllBtn.onclick = () => {
                        const cur = StorageEngine.getActiveCollection();
                        if (confirm(`Вы действительно хотите удалить все товары из коллекции "${cur.name}"?`)) {
                            StorageEngine.clearAll();
                            renderContent();
                        }
                    };
                }

                const exportBtn = overlay.querySelector('#wbo-export-excel-btn');
                if (exportBtn) {
                    exportBtn.onclick = () => {
                        const cur = StorageEngine.getActiveCollection();
                        ExcelExporter.exportToExcel(items, cur.name);
                    };
                }
            };

            renderContent();
            document.body.appendChild(overlay);
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        }
    };

    // Запуск интерфейса после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => UIEngine.init());
    } else {
        UIEngine.init();
    }

    // Регистрация горячих команд в меню Tampermonkey
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('📊 Открыть базу сравнения', () => UIEngine.openComparisonModal());
        GM_registerMenuCommand('📥 Экспорт в Excel', () => {
            const cur = StorageEngine.getActiveCollection();
            ExcelExporter.exportToExcel(StorageEngine.getItems(), cur.name);
        });
    }
})();
