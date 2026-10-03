// ==UserScript==
// @name         SteamGifts - Unlucky-7 Winner Stats & Copy
// @name:ru      SteamGifts - Статистика победителей Unlucky-7 и копирование
// @namespace    https://greasyfork.org/users/1522624-basimovif-ai
// @version      1.4.1
// @description  Displays interactive winner stats for the Unlucky-7 group on giveaway pages and allows copying formatted data to the clipboard.
// @description:ru Отображает интерактивную статистику победителей группы Unlucky-7 на страницах раздач и позволяет копировать отформатированные данные в буфер обмена.
// @author       basimovif-ai
// @license      MIT
// @homepageURL  https://github.com/BasimovIF-AI/steamgifts-userscripts
// @supportURL   https://github.com/BasimovIF-AI/steamgifts-userscripts/issues
// @match        https://www.steamgifts.com/giveaway/*/winners
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const isRu = (navigator.language || '').toLowerCase().startsWith('ru');
    const i18n = {
        formulaTitle: isRu ? 'Нажмите для полной формулы расчета' : 'Click to toggle calculation formula',
        copyTitle: isRu ? 'Скопировать информацию о победителе' : 'Copy winner info to clipboard',
        errorLog: isRu ? 'Ошибка при сборе данных для пользователя ' : 'Error fetching data for user ',
    };

    // 1. Проверяем наличие группы "Unlucky-7" на странице раздачи
    const groupLink = Array.from(document.querySelectorAll('a.featured__column--group'))
        .find(el => el.getAttribute('title') === 'Unlucky-7' || el.textContent.trim() === 'Unlucky-7');

    if (!groupLink) {
        return; // Если группа не найдена, завершаем работу
    }

    const groupSearchBaseUrl = 'https://www.steamgifts.com/group/WWF2y/unlucky-7/users/search?q=';
    const gaUrl = window.location.origin + window.location.pathname.replace(/\/winners$/, '');

    // Вспомогательная функция для получения порядкового суффикса числительных (1st, 2nd, 3rd, 4th...)
    const getOrdinalSuffix = (num) => {
        const j = num % 10, k = num % 100;
        if (j === 1 && k !== 11) return num + "st";
        if (j === 2 && k !== 12) return num + "nd";
        if (j === 3 && k !== 13) return num + "rd";
        return num + "th";
    };

    // Вспомогательные функции парсинга
    const parseSentRec = (text) => {
        const cleaned = text.replace(/,/g, '');
        const m = cleaned.match(/([\d.]+)\s*\(\$([\d.]+)\)/);
        return m ? [parseFloat(m[1]), parseFloat(m[2])] : [0, 0];
    };

    const parseDiff = (text) => {
        return parseFloat(text.replace(/[^0-9.-]/g, ''));
    };

    // 2. Находим всех победителей в таблице
    const winnerRows = document.querySelectorAll('.table__rows .table__row-outer-wrap');

    winnerRows.forEach(row => {
        const userLink = row.querySelector('.table__column__heading a');
        if (!userLink) return;

        const username = userLink.textContent.trim();
        const parentNode = userLink.parentNode;

        // Создаем индикатор загрузки
        const loader = document.createElement('i');
        loader.className = 'fa fa-refresh fa-spin';
        loader.style.marginLeft = '8px';
        loader.style.color = '#7f8c8d';
        loader.style.fontSize = '12px';
        parentNode.appendChild(loader);

        const groupSearchUrl = groupSearchBaseUrl + encodeURIComponent(username);
        const profileUrl = `https://www.steamgifts.com/user/${username}`;

        // Выполняем запросы к группе и к профилю параллельно
        Promise.all([
            fetch(groupSearchUrl).then(r => r.text()),
            fetch(profileUrl).then(r => r.text())
        ])
        .then(([groupHtml, profileHtml]) => {
            loader.remove();

            const parser = new DOMParser();

            // --- Парсинг данных из группы ---
            const groupDoc = parser.parseFromString(groupHtml, 'text/html');
            const memberRows = groupDoc.querySelectorAll('.table__rows .table__row-outer-wrap');
            let userData = null;

            for (const memberRow of memberRows) {
                const nameEl = memberRow.querySelector('.table__column__heading');
                if (nameEl && nameEl.textContent.trim().toLowerCase() === username.toLowerCase()) {
                    const cols = memberRow.querySelectorAll('.table__column--width-small.text-center');
                    if (cols.length >= 4) {
                        userData = {
                            sentText: cols[0].textContent.trim(),
                            recText: cols[1].textContent.trim(),
                            siteGiftDiffStr: cols[2].textContent.trim(),
                            siteValueDiffStr: cols[3].textContent.trim()
                        };
                        break;
                    }
                }
            }

            if (!userData) return;

            // --- Парсинг "Gifts Won" из профиля ---
            const profileDoc = parser.parseFromString(profileHtml, 'text/html');
            const profileRows = profileDoc.querySelectorAll('.featured__table__row');
            let giftsWon = 0;

            for (const pRow of profileRows) {
                const left = pRow.querySelector('.featured__table__row__left');
                if (left && left.textContent.trim() === 'Gifts Won') {
                    const right = pRow.querySelector('.featured__table__row__right a');
                    if (right) {
                        giftsWon = parseInt(right.textContent.replace(/,/g, ''), 10);
                    }
                    break;
                }
            }

            // Вычисления и независимая валидация для каждой разницы
            const [sentCount, sentValue] = parseSentRec(userData.sentText);
            const [recCount, recValue] = parseSentRec(userData.recText);
            const siteGiftDiff = parseDiff(userData.siteGiftDiffStr);
            const siteValueDiff = parseDiff(userData.siteValueDiffStr);

            const calculatedGiftDiff = sentCount - recCount;
            const calculatedValueDiff = sentValue - recValue;

            const isGiftMatch = Math.abs(calculatedGiftDiff - siteGiftDiff) < 0.05;
            const isValueMatch = Math.abs(calculatedValueDiff - siteValueDiff) < 0.05;

            const giftColor = isGiftMatch ? '#2e7d32' : '#c62828';
            const valueColor = isValueMatch ? '#2e7d32' : '#c62828';

            // Отрисовка интерактивного элемента статистики
            const statsContainer = document.createElement('span');
            statsContainer.style.cursor = 'pointer';
            statsContainer.style.marginLeft = '8px';
            statsContainer.style.fontSize = '12px';
            statsContainer.style.fontWeight = 'bold';
            statsContainer.style.userSelect = 'none';
            statsContainer.style.color = '#7f8c8d';
            statsContainer.style.transition = 'opacity 0.15s ease';
            statsContainer.title = i18n.formulaTitle;

            // Генерация DOM структуры в зависимости от состояния свертки
            const renderStats = (expanded) => {
                statsContainer.innerHTML = '';

                // Открывающая скобка
                const openBracket = document.createElement('span');
                openBracket.textContent = '(';
                statsContainer.appendChild(openBracket);

                // Блок разницы подарков
                if (expanded) {
                    const formula = document.createElement('span');
                    formula.textContent = `${sentCount}-${recCount}=`;
                    statsContainer.appendChild(formula);
                }
                const giftResult = document.createElement('span');
                giftResult.textContent = userData.siteGiftDiffStr;
                giftResult.style.color = giftColor;
                statsContainer.appendChild(giftResult);

                // Разделитель
                const separator = document.createElement('span');
                separator.textContent = '; ';
                statsContainer.appendChild(separator);

                // Блок разницы стоимости
                if (expanded) {
                    const formula = document.createElement('span');
                    formula.textContent = `$${sentValue}-$${recValue}=`;
                    statsContainer.appendChild(formula);
                }
                const valueResult = document.createElement('span');
                valueResult.textContent = userData.siteValueDiffStr;
                valueResult.style.color = valueColor;
                statsContainer.appendChild(valueResult);

                // Закрывающая скобка
                const closeBracket = document.createElement('span');
                closeBracket.textContent = ')';
                statsContainer.appendChild(closeBracket);

                // Количество побед в развернутом режиме
                if (expanded) {
                    const winsSpan = document.createElement('span');
                    winsSpan.textContent = ` ${giftsWon}`;
                    statsContainer.appendChild(winsSpan);
                }
            };

            let isExpanded = false;
            renderStats(isExpanded);

            statsContainer.addEventListener('mouseenter', () => { statsContainer.style.opacity = '0.7'; });
            statsContainer.addEventListener('mouseleave', () => { statsContainer.style.opacity = '1'; });

            statsContainer.addEventListener('click', (e) => {
                e.preventDefault();
                isExpanded = !isExpanded;
                renderStats(isExpanded);
            });

            parentNode.appendChild(statsContainer);

            // --- Создание кнопки копирования ---
            const badgeText = (giftsWon <= 8)
                ? `${getOrdinalSuffix(giftsWon)} win`
                : `Gifter, ${userData.siteGiftDiffStr}`;

            const clipboardText = `GA: ${gaUrl}\nWinner: ${profileUrl} (${badgeText})`;

            const copyBtn = document.createElement('i');
            copyBtn.className = 'fa fa-clipboard';
            copyBtn.style.marginLeft = '8px';
            copyBtn.style.cursor = 'pointer';
            copyBtn.style.color = '#7f8c8d';
            copyBtn.style.fontSize = '12px';
            copyBtn.style.transition = 'color 0.15s ease';
            copyBtn.title = i18n.copyTitle;

            copyBtn.addEventListener('mouseenter', () => { copyBtn.style.color = '#333'; });
            copyBtn.addEventListener('mouseleave', () => { copyBtn.style.color = '#7f8c8d'; });

            copyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                navigator.clipboard.writeText(clipboardText).then(() => {
                    copyBtn.className = 'fa fa-check';
                    copyBtn.style.color = '#2e7d32';
                    setTimeout(() => {
                        copyBtn.className = 'fa fa-clipboard';
                        copyBtn.style.color = '#7f8c8d';
                    }, 1500);
                }).catch(err => {
                    console.error('SteamGifts Unlucky-7: clipboard error:', err);
                });
            });

            parentNode.appendChild(copyBtn);
        })
        .catch(err => {
            loader.remove();
            console.error(i18n.errorLog + username, err);
        });
    });
})();
