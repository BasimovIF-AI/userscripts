// ==UserScript==
// @name         SteamGifts - Group Stats Checker (Universal)
// @name:ru      SteamGifts - Проверка статистики в группах (Универсальный)
// @namespace    https://greasyfork.org/users/1522624-basimovif-ai
// @version      1.7.0
// @description  Displays interactive group stat buttons on giveaway pages and autofills thank-you comments for giveaway creator.
// @description:ru Отображает кнопки статистики групп на страницах раздач и автоматически заполняет благодарность создателю раздачи.
// @author       basimovif-ai
// @license      MIT
// @homepageURL  https://github.com/BasimovIF-AI/steamgifts-userscripts
// @supportURL   https://github.com/BasimovIF-AI/steamgifts-userscripts/issues
// @match        https://www.steamgifts.com/giveaway/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const isRu = (navigator.language || '').toLowerCase().startsWith('ru');
    const i18n = {
        btnTitle: (groupName) => isRu ? `Проверить мою статистику в группе: ${groupName}` : `Check my stats in group: ${groupName}`,
        formulaTitle: isRu ? 'Нажмите для формулы расчета' : 'Click to toggle calculation formula',
        notFound: isRu ? '(не найден)' : '(not found)',
        error: isRu ? 'Ошибка' : 'Error',
        networkError: isRu ? 'Ошибка сети при запросе к группе' : 'Network error fetching group stats',
    };

    // Проверяем, что находимся на главной странице раздачи (исключаем подразделы)
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length !== 2 && !(pathParts.length === 3 && pathParts[0] === 'giveaway')) {
        // Поддерживает и /giveaway/:id/:slug, и стандартный формат
        if (pathParts[0] !== 'giveaway') return;
        if (pathParts.length > 3) return; // Исключаем /winners, /entries и т.д.
    }

    const origin = window.location.origin;

    // Вспомогательные функции парсинга
    const parseSentRec = (text) => {
        const cleaned = text.replace(/,/g, '');
        const m = cleaned.match(/([\d.]+)\s*\(\$([\d.]+)\)/);
        return m ? [parseFloat(m[1]), parseFloat(m[2])] : [0, 0];
    };

    const parseDiff = (text) => {
        return parseFloat(text.replace(/[^0-9.-]/g, ''));
    };

    // Кэш для общего количества побед текущего пользователя
    let cachedGiftsWon = null;

    async function fetchGiftsWon(username) {
        if (cachedGiftsWon !== null) return cachedGiftsWon;
        try {
            const r = await fetch(`${origin}/user/${username}`);
            if (!r.ok) return 0;
            const html = await r.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const profileRows = doc.querySelectorAll('.featured__table__row');
            for (const pRow of profileRows) {
                const left = pRow.querySelector('.featured__table__row__left');
                if (left && left.textContent.trim() === 'Gifts Won') {
                    const right = pRow.querySelector('.featured__table__row__right a');
                    if (right) {
                        cachedGiftsWon = parseInt(right.textContent.replace(/,/g, ''), 10);
                        return cachedGiftsWon;
                    }
                }
            }
        } catch (e) {
            console.error('SteamGifts Group Stats: error fetching Gifts Won:', e);
        }
        return 0;
    }

    // Запрос статистики пользователя внутри конкретной группы
    async function fetchGroupStats(groupPath, username) {
        const groupSearchUrl = `${origin}${groupPath}/users/search?q=${encodeURIComponent(username)}`;
        const r = await fetch(groupSearchUrl);
        if (!r.ok) throw new Error(i18n.networkError);
        const html = await r.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const memberRows = doc.querySelectorAll('.table__rows .table__row-outer-wrap');

        for (const memberRow of memberRows) {
            const nameEl = memberRow.querySelector('.table__column__heading');
            if (nameEl && nameEl.textContent.trim().toLowerCase() === username.toLowerCase()) {
                const cols = memberRow.querySelectorAll('.table__column--width-small.text-center');
                if (cols.length >= 4) {
                    return {
                        sentText: cols[0].textContent.trim(),
                        recText: cols[1].textContent.trim(),
                        siteGiftDiffStr: cols[2].textContent.trim(),
                        siteValueDiffStr: cols[3].textContent.trim()
                    };
                }
            }
        }
        return null; // Пользователь не найден в группе
    }

    async function init() {
        // 1. Поиск имени текущего пользователя на странице
        const avatarEl = document.querySelector('a.nav__avatar-outer-wrap[href^="/user/"]');
        if (!avatarEl) return;
        const username = avatarEl.getAttribute('href').replace('/user/', '');

        // 2. Поиск создателя раздачи
        const creatorLink = document.querySelector('.featured__columns a[href^="/user/"]:not(.featured_giveaway_image_avatar)');
        const creatorName = creatorLink ? creatorLink.textContent.trim() : null;

        // 3. Автозаполнение комментария, если поле присутствует и оно пустое
        if (creatorName) {
            const commentTextarea = document.querySelector('textarea[name="description"]');
            if (commentTextarea && commentTextarea.value.trim() === "") {
                commentTextarea.value = `Thanks a lot ${creatorName}!`;
            }
        }

        // 4. Поиск ссылки на страницу со списком групп раздачи
        const groupLinkEl = document.querySelector('a.featured__column--group');
        if (!groupLinkEl) return;

        const groupsPageUrl = origin + groupLinkEl.getAttribute('href');

        // Создаем контейнер для кнопок рядом с индикатором групп
        const container = document.createElement('span');
        container.className = 'sg-group-stats-wrapper';
        container.style.marginLeft = '10px';
        container.style.display = 'inline-flex';
        container.style.gap = '6px';
        container.style.alignItems = 'center';
        groupLinkEl.parentNode.insertBefore(container, groupLinkEl.nextSibling);

        try {
            // Загружаем вспомогательную страницу со списком групп раздачи
            const r = await fetch(groupsPageUrl);
            if (!r.ok) return;
            const html = await r.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Находим все текстовые ссылки на группы (они ведут на /group/...)
            const groupLinks = doc.querySelectorAll('.table__rows a.table__column__heading[href^="/group/"]');

            const groups = [];
            groupLinks.forEach(el => {
                const href = el.getAttribute('href');
                const name = el.textContent.trim();
                if (href && name) {
                    groups.push({ name, path: href });
                }
            });

            // Для каждой обнаруженной группы создаем интерактивную кнопку
            groups.forEach(group => {
                const btn = document.createElement('button');
                btn.style.background = '#4b5668';
                btn.style.color = '#d2d6da';
                btn.style.border = 'none';
                btn.style.padding = '2px 6px';
                btn.style.borderRadius = '3px';
                btn.style.fontSize = '11px';
                btn.style.cursor = 'pointer';
                btn.style.display = 'inline-flex';
                btn.style.alignItems = 'center';
                btn.style.gap = '4px';
                btn.style.fontFamily = 'inherit';
                btn.style.transition = 'background 0.2s';
                btn.title = i18n.btnTitle(group.name);
                btn.innerHTML = `<i class="fa fa-bar-chart"></i> ${group.name}`;

                btn.addEventListener('mouseenter', () => btn.style.background = '#5a687c');
                btn.addEventListener('mouseleave', () => btn.style.background = '#4b5668');

                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    btn.disabled = true;
                    btn.innerHTML = `<i class="fa fa-refresh fa-spin"></i> ${group.name}`;

                    try {
                        const [userData, giftsWon] = await Promise.all([
                            fetchGroupStats(group.path, username),
                            fetchGiftsWon(username)
                        ]);

                        const resultContainer = document.createElement('span');
                        resultContainer.style.fontSize = '12px';
                        resultContainer.style.display = 'inline-flex';
                        resultContainer.style.alignItems = 'center';
                        resultContainer.style.gap = '4px';

                        const label = document.createElement('span');
                        label.textContent = `${group.name}:`;
                        label.style.fontWeight = 'bold';
                        label.style.color = '#7f8c8d';
                        resultContainer.appendChild(label);

                        if (userData) {
                            // Расчет и отрисовка интерактивной статистики
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

                            const statsSpan = document.createElement('span');
                            statsSpan.style.cursor = 'pointer';
                            statsSpan.style.fontWeight = 'bold';
                            statsSpan.style.userSelect = 'none';
                            statsSpan.style.color = '#7f8c8d';
                            statsSpan.style.transition = 'opacity 0.15s ease';
                            statsSpan.title = i18n.formulaTitle;

                            const renderStats = (expanded) => {
                                statsSpan.innerHTML = '';
                                statsSpan.appendChild(document.createTextNode('('));

                                if (expanded) {
                                    const formula = document.createElement('span');
                                    formula.textContent = `${sentCount}-${recCount}=`;
                                    statsSpan.appendChild(formula);
                                }
                                const giftResult = document.createElement('span');
                                giftResult.textContent = userData.siteGiftDiffStr;
                                giftResult.style.color = giftColor;
                                statsSpan.appendChild(giftResult);

                                statsSpan.appendChild(document.createTextNode('; '));

                                if (expanded) {
                                    const formula = document.createElement('span');
                                    formula.textContent = `$${sentValue}-$${recValue}=`;
                                    statsSpan.appendChild(formula);
                                }
                                const valueResult = document.createElement('span');
                                valueResult.textContent = userData.siteValueDiffStr;
                                valueResult.style.color = valueColor;
                                statsSpan.appendChild(valueResult);

                                statsSpan.appendChild(document.createTextNode(')'));

                                if (expanded) {
                                    const winsSpan = document.createElement('span');
                                    winsSpan.textContent = ` ${giftsWon}`;
                                    statsSpan.appendChild(winsSpan);
                                }
                            };

                            let isExpanded = false;
                            renderStats(isExpanded);

                            statsSpan.addEventListener('mouseenter', () => { statsSpan.style.opacity = '0.7'; });
                            statsSpan.addEventListener('mouseleave', () => { statsSpan.style.opacity = '1'; });
                            statsSpan.addEventListener('click', (ev) => {
                                ev.preventDefault();
                                isExpanded = !isExpanded;
                                renderStats(isExpanded);
                            });

                            resultContainer.appendChild(statsSpan);
                        } else {
                            const notMember = document.createElement('span');
                            notMember.textContent = i18n.notFound;
                            notMember.style.color = '#7f8c8d';
                            notMember.style.fontStyle = 'italic';
                            resultContainer.appendChild(notMember);
                        }

                        btn.replaceWith(resultContainer);
                    } catch (err) {
                        console.error('SteamGifts Group Stats error:', err);
                        btn.disabled = false;
                        btn.innerHTML = `<i class="fa fa-exclamation-triangle"></i> ${i18n.error}`;
                    }
                });

                container.appendChild(btn);
            });

        } catch (e) {
            console.error('SteamGifts Group Stats: failed to load giveaway groups:', e);
        }
    }

    init();
})();
