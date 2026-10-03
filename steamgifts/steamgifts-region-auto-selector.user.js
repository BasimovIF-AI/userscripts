// ==UserScript==
// @name         SteamGifts - Region Auto-Selector via SteamDB Tab
// @name:ru      SteamGifts - Автовыбор регионов через SteamDB
// @namespace    https://greasyfork.org/users/1522624-basimovif-ai
// @version      1.5.0
// @description  Bypasses Cloudflare by opening SteamDB in a temporary tab and auto-selects restricted countries when creating SteamGifts giveaways.
// @description:ru Обходит Cloudflare открытием временной вкладки SteamDB и автоматически отмечает региональные ограничения при создании раздачи на SteamGifts.
// @author       basimovif-ai
// @license      MIT
// @homepageURL  https://github.com/BasimovIF-AI/steamgifts-userscripts
// @supportURL   https://github.com/BasimovIF-AI/steamgifts-userscripts/issues
// @match        https://www.steamgifts.com/giveaways/new
// @match        https://steamdb.info/sub/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        window.close
// ==/UserScript==

(function() {
    'use strict';

    const isRu = (navigator.language || '').toLowerCase().startsWith('ru');
    const i18n = {
        subIdLabel: 'SteamDB SubID:',
        placeholder: isRu ? 'например, 828967' : 'e.g. 828967',
        applyBtn: isRu ? 'Применить' : 'Apply',
        enterValidSubId: isRu ? 'Введите корректный числовой SubID' : 'Please enter a valid numeric SubID',
        openingTab: isRu ? 'Открытие вкладки SteamDB...' : 'Opening SteamDB tab...',
        popupBlocked: isRu ? 'Браузер заблокировал открытие вкладки. Пожалуйста, разрешите всплывающие окна.' : 'Browser blocked opening a new tab. Please allow popups for SteamGifts.',
        timeout: isRu ? 'Время ожидания истекло. Если вкладка зависла на Cloudflare, пройдите проверку вручную.' : 'Timeout waiting for SteamDB. If blocked by Cloudflare, solve captcha manually.',
        noRestrictions: isRu ? 'Ограничений не найдено. Пакет доступен по всему миру.' : 'No restrictions found. Package is available worldwide.',
        partialWarning: (count, missingList) => isRu
            ? `Частично импортировано (выбрано: ${count}). Внимание! Отсутствуют на SteamGifts: ${missingList}`
            : `Partially imported (selected: ${count}). Warning! Missing on SteamGifts: ${missingList}`,
        success: (count) => isRu
            ? `Успешно импортировано! Выбрано стран: ${count}`
            : `Successfully imported! Countries selected: ${count}`,
    };

    if (location.hostname === 'www.steamgifts.com') {
        runSteamGifts();
    } else if (location.hostname === 'steamdb.info') {
        runSteamDB();
    }

    // --- ЛОГИКА ДЛЯ СТРАНИЦЫ STEAMGIFTS ---
    function runSteamGifts() {
        let regionRow = null;
        const headingTextElements = document.querySelectorAll('.form__heading__text');

        headingTextElements.forEach(el => {
            if (el.textContent.trim() === 'Region Restricted') {
                regionRow = el.closest('.form__row');
            }
        });

        if (!regionRow) return;

        const container = document.createElement('div');
        container.id = 'sg-steamdb-addon-container';
        container.style.display = 'none';
        container.style.alignItems = 'center';
        container.style.marginLeft = '20px';
        container.style.gap = '8px';

        container.innerHTML = `
            <span style="font-size: 12px; font-weight: normal; color: #555;">${i18n.subIdLabel}</span>
            <input type="text" id="sg-subid-input" placeholder="${i18n.placeholder}" style="width: 100px; padding: 4px 6px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px;">
            <button type="button" id="sg-subid-btn" style="padding: 4px 10px; font-size: 12px; background: #4b729f; color: #fff; border: none; border-radius: 4px; cursor: pointer;">${i18n.applyBtn}</button>
            <span id="sg-subid-status" style="font-size: 11px; color: #666; font-weight: bold;"></span>
        `;

        const heading = regionRow.querySelector('.form__heading');
        if (heading) {
            heading.appendChild(container);
        }

        const inputEl = document.getElementById('sg-subid-input');
        const btnEl = document.getElementById('sg-subid-btn');
        const statusEl = document.getElementById('sg-subid-status');

        const yesCheckbox = regionRow.querySelector('div[data-checkbox-value="1"]');
        const noCheckbox = regionRow.querySelector('div[data-checkbox-value="0"]');

        function updateUiVisibility() {
            if (yesCheckbox && yesCheckbox.classList.contains('is-selected')) {
                container.style.setProperty('display', 'inline-flex', 'important');
            } else {
                container.style.setProperty('display', 'none', 'important');
            }
        }

        if (yesCheckbox) yesCheckbox.addEventListener('click', () => setTimeout(updateUiVisibility, 50));
        if (noCheckbox) noCheckbox.addEventListener('click', () => setTimeout(updateUiVisibility, 50));

        setTimeout(updateUiVisibility, 200);

        function setStatus(text, color) {
            statusEl.textContent = text;
            statusEl.style.color = color || '#666';
        }

        btnEl.addEventListener('click', () => {
            const subId = inputEl.value.trim();
            if (!subId || isNaN(subId)) {
                setStatus(i18n.enterValidSubId, 'red');
                return;
            }

            setStatus(i18n.openingTab, 'orange');

            GM_setValue('parsed_sub_data', null);
            GM_setValue('requested_sub', subId);

            const steamDbUrl = `https://steamdb.info/sub/${subId}/?sg_sync=1`;
            const newTab = window.open(steamDbUrl, '_blank');

            if (!newTab) {
                setStatus(i18n.popupBlocked, 'red');
                return;
            }

            let attempts = 0;
            const maxAttempts = 60;
            const interval = setInterval(() => {
                attempts++;
                const result = GM_getValue('parsed_sub_data');

                if (result && result.subId === subId) {
                    clearInterval(interval);
                    applyRestrictions(result);
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    setStatus(i18n.timeout, 'red');
                }
            }, 500);
        });

        function applyRestrictions(data) {
            if (data.type === 'none') {
                setStatus(i18n.noRestrictions, 'green');
                if (noCheckbox && !noCheckbox.classList.contains('is-selected')) {
                    noCheckbox.click();
                    setTimeout(updateUiVisibility, 50);
                }
                return;
            }

            if (yesCheckbox && !yesCheckbox.classList.contains('is-selected')) {
                yesCheckbox.click();
            }

            const sgItems = regionRow.querySelectorAll('.form_list_item');
            const allSgCodes = [];

            sgItems.forEach(item => {
                const dataName = item.getAttribute('data-name') || '';
                const code = dataName.split(' ').pop().toUpperCase();
                if (code) {
                    allSgCodes.push(code);
                }
            });

            // Находим расхождения (страны из SteamDB, отсутствующие на SteamGifts)
            const missingCountries = data.countries.filter(item => !allSgCodes.includes(item.code));

            // Преобразуем данные в плоский массив кодов для выбора на странице
            const dbCodes = data.countries.map(item => item.code);

            let targetCodes = [];
            if (data.type === 'only') {
                targetCodes = dbCodes;
            } else if (data.type === 'not') {
                targetCodes = allSgCodes.filter(code => !dbCodes.includes(code));
            }

            // Изменяем чекбоксы
            sgItems.forEach(item => {
                const dataName = item.getAttribute('data-name') || '';
                const code = dataName.split(' ').pop().toUpperCase();
                const isSelected = item.classList.contains('is-selected');
                const shouldBeSelected = targetCodes.includes(code);

                if (isSelected !== shouldBeSelected) {
                    item.click();
                }
            });

            // Считаем количество РЕАЛЬНО отмеченных галочек на странице
            const actualSelectedCount = regionRow.querySelectorAll('.form_list_item.is-selected').length;

            if (missingCountries.length > 0) {
                const missingTextList = missingCountries.map(item => `${item.name} (${item.code})`).join(', ');
                setStatus(i18n.partialWarning(actualSelectedCount, missingTextList), '#d97706');
            } else {
                setStatus(i18n.success(actualSelectedCount), 'green');
            }
        }
    }

    // --- ЛОГИКА ДЛЯ ВРЕМЕННОЙ ВКЛАДКИ STEAMDB ---
    function runSteamDB() {
        if (!location.search.includes('sg_sync=1')) {
            return;
        }

        const match = location.pathname.match(/\/sub\/(\d+)/);
        if (!match) return;
        const subId = match[1];

        const requestedSub = GM_getValue('requested_sub');
        if (requestedSub !== subId) return;

        const isPageLoaded = document.getElementById('info') || document.querySelector('.pageheader');
        if (!isPageLoaded) return;

        const restrictionPanel = document.querySelector('.panel-error');
        let type = 'none';
        const countries = []; // Содержит объекты вида { code: 'FR', name: 'France' }

        if (restrictionPanel) {
            const headingSpan = restrictionPanel.querySelector('.panel-heading span');
            if (headingSpan) {
                const text = headingSpan.textContent.trim();
                if (text.includes('can only be activated')) {
                    type = 'only';
                } else if (text.includes('can NOT be activated')) {
                    type = 'not';
                }
            }

            // Парсим список стран (коды + текстовые названия)
            const listItems = restrictionPanel.querySelectorAll('.country-list-grid li');
            listItems.forEach(li => {
                const img = li.querySelector('img');
                if (!img) return;

                const src = img.getAttribute('src') || '';
                const m = src.match(/\/country\/([a-z0-9]+)\.svg/i);
                if (m) {
                    const code = m[1].toUpperCase();
                    const span = li.querySelector('span');
                    let name = span ? span.textContent : li.textContent;
                    name = name.replace(/\s+/g, ' ').trim();

                    countries.push({
                        code: code,
                        name: name
                    });
                }
            });
        }

        GM_setValue('parsed_sub_data', {
            subId: subId,
            type: type,
            countries: countries,
            timestamp: Date.now()
        });

        window.close();
    }
})();
