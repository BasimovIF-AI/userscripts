// ==UserScript==
// @name         SteamGifts - Chance Per Point (‱)
// @name:ru      SteamGifts - Шанс на очко (‱)
// @namespace    https://greasyfork.org/users/1522624-basimovif-ai
// @version      7.0.0
// @description  Adds a win chance per point column in basis points (‱) and enables hiding giveaways above a chosen threshold on SteamGifts entered page.
// @description:ru Добавляет столбец с шансом на победу на одно очко в базисных пунктах (‱) и позволяет скрывать раздачи с шансом выше заданного значения.
// @author       basimovif-ai
// @license      MIT
// @homepageURL  https://github.com/BasimovIF-AI/steamgifts-userscripts
// @supportURL   https://github.com/BasimovIF-AI/steamgifts-userscripts/issues
// @match        https://www.steamgifts.com/giveaways/entered*
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const isRu = (navigator.language || '').toLowerCase().startsWith('ru');
    const i18n = {
        filterLabel: isRu ? 'Фильтр по шансу: скрыть всё, что выше' : 'Win Chance Filter: hide entries above',
        filterBtn: isRu ? 'Фильтровать' : 'Filter',
        resetBtn: isRu ? 'Сбросить' : 'Reset',
        colHeader: isRu ? 'Шанс/Очко (‱)' : 'Chance/Pt (‱)',
        colHeaderTitle: isRu
            ? 'Шанс на победу за одно очко ((Копии / (Участники * Очки)) * 10000‱)'
            : 'Win chance per single point ((Copies / (Entries * Points)) * 10000‱)',
        errorText: isRu ? 'Ошибка' : 'Error',
    };

    // Стили для панели управления
    GM_addStyle(`
        .sg-chance-filter-panel {
            background-color: #f0f2f5;
            padding: 10px;
            margin-bottom: 15px;
            border-radius: 5px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .sg-chance-filter-panel input {
            border: 1px solid #ccc;
            padding: 5px;
            border-radius: 3px;
            width: 80px;
        }
        .sg-chance-filter-panel button {
            background-color: #4CAF50;
            color: white;
            border: none;
            padding: 6px 12px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 14px;
            cursor: pointer;
            border-radius: 3px;
        }
        .sg-chance-filter-panel button.reset {
            background-color: #f44336;
        }
    `);

    // --- ФУНКЦИИ ФИЛЬТРАЦИИ ---

    function applyFilter() {
        const filterValueInput = document.getElementById('chance-filter-input');
        if (!filterValueInput) return;

        // Получаем значение (максимальный порог) и конвертируем его из ‱ в чистое число
        const maxPerMyriad = parseFloat(filterValueInput.value);
        if (isNaN(maxPerMyriad)) {
            resetFilter();
            return;
        }
        const maxChance = maxPerMyriad / 10000.0; // Делим на 10000

        const allRows = document.querySelectorAll('.table__row-outer-wrap');
        allRows.forEach(rowWrapper => {
            const innerRow = rowWrapper.querySelector('.table__row-inner-wrap');
            const rowChance = parseFloat(innerRow.dataset.chancePerPoint);

            if (!isNaN(rowChance) && rowChance > maxChance) {
                rowWrapper.style.display = 'none';
            } else {
                rowWrapper.style.display = '';
            }
        });
    }

    function resetFilter() {
        const filterValueInput = document.getElementById('chance-filter-input');
        if (filterValueInput) filterValueInput.value = '';

        const allRows = document.querySelectorAll('.table__row-outer-wrap');
        allRows.forEach(rowWrapper => {
            rowWrapper.style.display = '';
        });
    }

    // --- ОСНОВНАЯ ЛОГИКА ---
    function createFilterPanel() {
        if (document.getElementById('chance-filter-panel')) return;

        const container = document.querySelector('.table');
        if (!container) return;

        const panel = document.createElement('div');
        panel.id = 'chance-filter-panel';
        panel.className = 'sg-chance-filter-panel';
        panel.innerHTML = `
            <label for="chance-filter-input"><b>${i18n.filterLabel}</b></label>
            <input type="number" id="chance-filter-input" placeholder="1.00" step="0.01">
            <span>‱</span>
            <button id="apply-chance-filter">${i18n.filterBtn}</button>
            <button id="reset-chance-filter" class="reset">${i18n.resetBtn}</button>
        `;

        container.parentNode.insertBefore(panel, container);

        document.getElementById('apply-chance-filter').addEventListener('click', applyFilter);
        document.getElementById('reset-chance-filter').addEventListener('click', resetFilter);
    }

    function processGiveaways() {
        const header = document.querySelector('.table__heading');
        const giveaways = document.querySelectorAll('.table__row-inner-wrap:not(.chance-processed)');

        if (!header || giveaways.length === 0) {
            return;
        }

        if (!header.querySelector('.chance-per-point-header')) {
            const newHeaderCell = document.createElement('div');
            newHeaderCell.className = 'table__column--width-small text-center chance-per-point-header';
            newHeaderCell.textContent = i18n.colHeader;
            newHeaderCell.title = i18n.colHeaderTitle;
            header.appendChild(newHeaderCell);

            const allRowsForGrid = document.querySelectorAll('.table__heading, .table__row-inner-wrap');
            allRowsForGrid.forEach(row => {
                if(!row.style.gridTemplateColumns.endsWith('110px')) {
                    const currentGridStyle = window.getComputedStyle(row).gridTemplateColumns;
                    row.style.gridTemplateColumns = currentGridStyle + ' 110px';
                }
            });
        }

        giveaways.forEach(row => {
            try {
                const titleElement = row.querySelector('a.table__column__heading');
                if (!titleElement) {
                    row.classList.add('chance-processed');
                    return;
                }
                const titleText = titleElement.textContent;

                const pointsMatch = titleText.match(/\((\d+)P\)/);
                const points = pointsMatch ? parseInt(pointsMatch[1], 10) : NaN;

                const copiesMatch = titleText.match(/\((\d+)\sCopies\)/);
                const copies = copiesMatch ? parseInt(copiesMatch[1], 10) : 1;

                let entries = NaN;
                const columns = row.querySelectorAll('.table__row-inner-wrap > div.table__column--width-small');
                for (const col of columns) {
                    if (/^[\d,]+$/.test(col.textContent.trim())) {
                         entries = parseInt(col.textContent.trim().replace(/,/g, ''), 10);
                         break;
                    }
                }

                let chanceText = 'N/A';
                let rawChance = 0;

                if (!isNaN(entries) && entries > 0 && !isNaN(points) && points > 0 && copies > 0) {
                    const chance = copies / (entries * points);
                    rawChance = chance;
                    chanceText = (chance * 10000).toFixed(2) + '‱';
                }

                row.dataset.chancePerPoint = rawChance;

                const newCell = document.createElement('div');
                newCell.className = 'table__column--width-small text-center';
                newCell.textContent = chanceText;
                row.appendChild(newCell);

            } catch (e) {
                console.error('SteamGifts Chance Per Point: error processing row:', row, e);
                row.dataset.chancePerPoint = 0;
                const errorCell = document.createElement('div');
                errorCell.className = 'table__column--width-small text-center';
                errorCell.textContent = i18n.errorText;
                row.appendChild(errorCell);
            } finally {
                row.classList.add('chance-processed');
            }
        });
    }

    // --- ИНИЦИАЛИЗАЦИЯ И НАБЛЮДЕНИЕ ЗА ИЗМЕНЕНИЯМИ ---
    const observer = new MutationObserver((mutationsList) => {
        for(const mutation of mutationsList) {
            if (mutation.addedNodes.length > 0) {
                 const hasNewRows = Array.from(mutation.addedNodes).some(node => node.nodeType === 1 && node.classList.contains('table__row-outer-wrap'));
                 if(hasNewRows){
                    setTimeout(() => {
                        processGiveaways();
                        if (document.getElementById('chance-filter-input').value) {
                            applyFilter();
                        }
                    }, 200);
                    return;
                }
            }
        }
    });

    const targetNode = document.querySelector('.table');
    if (targetNode) {
        observer.observe(targetNode, { childList: true, subtree: true });
    }

    setTimeout(() => {
        createFilterPanel();
        processGiveaways();
    }, 500);

})();
