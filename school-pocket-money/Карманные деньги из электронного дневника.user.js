// ==UserScript==
// @name         Карманные деньги из электронного дневника
// @namespace    http://tampermonkey.net/
// @version      1.5.1
// @description  Автоматический расчёт карманных денег в рублях по предметам и оценкам, динамический XP и история начислений, Fast Pay СБП QR, Smart Ledger (строка 26) и JSON-бэкап в стиле Neo-Fintech
// @author       Senior Software Engineer
// @match        https://cop.admhmao.ru/journal-app/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'school_pocket_money_ledger_v1';

    // ----------------------------------------------------
    // КОНФИГУРАЦИЯ ДЕТЕЙ И ПРЕДМЕТОВ
    // ----------------------------------------------------
    const presets = {
        "Юлиана": {
            name: "Басимова Юлиана",
            zeroMark: 3.7,
            age: 14,
            classNum: 9,
            inflationCoeff: 12.485, // 14 * 12.485 = 174.79 ₽ (B24)
            targetGoal: { title: "Новый планшет и стилус", target: 15000, saved: 4200 },
            subjects: [
                { name: "Алгебра", coeff: 2.0 },
                { name: "Англ. яз.", coeff: 1.0 },
                { name: "Биология", coeff: 1.0 },
                { name: "Вероятность и статистика", coeff: 0.5 },
                { name: "География", coeff: 1.0 },
                { name: "Геометрия", coeff: 2.0 },
                { name: "Информатика", coeff: 1.0 },
                { name: "История", coeff: 1.0 },
                { name: "Курс Проф.сам", coeff: 0.5 },
                { name: "Курс Семьеведение", coeff: 0.5 },
                { name: "Литература", coeff: 1.0 },
                { name: "Музыка", coeff: 0.5 },
                { name: "ОБЗР", coeff: 0.5 },
                { name: "Обществознание", coeff: 1.0 },
                { name: "Разговоры о важном", coeff: 0.5 },
                { name: "Россия -мои горизонты", coeff: 0.5 },
                { name: "Русский язык", coeff: 2.0 },
                { name: "Труд", coeff: 0.5 },
                { name: "Физика", coeff: 1.0 },
                { name: "Физкультура", coeff: 0.5 },
                { name: "Химия", coeff: 1.0 }
            ]
        },
        "Артём": {
            name: "Басимов Артём",
            zeroMark: 3.7,
            age: 12,
            classNum: 7,
            inflationCoeff: 12.5, // 12 * 12.5 = 150.00 ₽ (B24)
            targetGoal: { title: "Игровые беспроводные наушники", target: 6000, saved: 2100 },
            subjects: [
                { name: "Англ. яз.", coeff: 1.0 },
                { name: "Биология", coeff: 1.0 },
                { name: "География", coeff: 1.0 },
                { name: "Информатика", coeff: 1.0 },
                { name: "История", coeff: 1.0 },
                { name: "Литература", coeff: 1.0 },
                { name: "Математика", coeff: 2.0 },
                { name: "Музыка", coeff: 0.5 },
                { name: "ОБЗР", coeff: 0.5 },
                { name: "Обществознание", coeff: 1.0 },
                { name: "Русский язык", coeff: 2.0 },
                { name: "Труд", coeff: 0.5 },
                { name: "Физика", coeff: 1.0 },
                { name: "Физкультура", coeff: 0.5 }
            ]
        },
        "Диана": {
            name: "Басимова Диана",
            zeroMark: 3.7,
            age: 8,
            classNum: 3,
            inflationCoeff: 12.5, // 8 * 12.5 = 100.00 ₽ (B24)
            targetGoal: { title: "Набор для рисования и мольберт", target: 4500, saved: 1800 },
            subjects: [
                { name: "Англ. яз.", coeff: 1.0 },
                { name: "ИЗО", coeff: 0.5 },
                { name: "Литер. чтение", coeff: 0.5 },
                { name: "Математика", coeff: 2.0 },
                { name: "Музыка", coeff: 0.5 },
                { name: "Окруж. мир", coeff: 0.5 },
                { name: "ОРКСЭ", coeff: 0.5 },
                { name: "Русский язык", coeff: 2.0 },
                { name: "Труд", coeff: 0.5 },
                { name: "Физкультура", coeff: 0.5 },
                { name: "Функциональная грамотность", coeff: 0.5 }
            ]
        }
    };

    // ----------------------------------------------------
    // УРОВНИ И ТИТУЛЫ ОТ ОПЫТА (200 XP на каждый уровень)
    // ----------------------------------------------------
    const LEVEL_TITLES = [
        "Новичок знаний",     // 1 ур. (0-199 XP)
        "Искатель приключений",// 2 ур. (200-399 XP)
        "Юный исследователь", // 3 ур. (400-599 XP)
        "Страж наук",         // 4 ур. (600-799 XP)
        "Рыцарь Математики",  // 5 ур. (800-999 XP)
        "Магистр Знаний"      // 6+ ур. (1000+ XP)
    ];

    function calculateLevelInfo(totalXp) {
        const xp = Math.max(0, Number(totalXp) || 0);
        const level = Math.floor(xp / 200) + 1;
        const currentLevelXp = xp % 200;
        const nextLevelXp = 200;
        const titleIndex = Math.min(level - 1, LEVEL_TITLES.length - 1);
        const levelTitle = LEVEL_TITLES[titleIndex];
        return { totalXp: xp, level, currentLevelXp, nextLevelXp, levelTitle };
    }

    // ----------------------------------------------------
    // ХРАНИЛИЩЕ SMART LEDGER + ИСТОРИЯ XP (LocalStorage)
    // ----------------------------------------------------
    class LedgerStorage {
        static load() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    // Проверяем структуру и дополняем при необходимости
                    if (!parsed.children) parsed.children = {};
                    ["Юлиана", "Артём", "Диана"].forEach(k => {
                        if (!parsed.children[k]) parsed.children[k] = {};
                        if (!parsed.children[k].xpLedger) parsed.children[k].xpLedger = [];
                        if (!parsed.children[k].weeks) parsed.children[k].weeks = {};
                    });
                    return parsed;
                }
            } catch (e) {
                console.error("Ошибка чтения ledger:", e);
            }

            // Начальное состояние с базовой историей
            return {
                activeChild: "Диана",
                children: {
                    "Диана": {
                        xpLedger: [
                            { id: "xp_d1", date: "2026-09-07", week: "1 сен – 7 сен", amount: 50, reason: "Неделя закрыта без троек" },
                            { id: "xp_d2", date: "2026-09-14", week: "8 сен – 14 сен", amount: 50, reason: "Успешная неделя в плюсе (+64 ₽)" },
                            { id: "xp_d3", date: "2026-09-14", week: "8 сен – 14 сен", amount: 30, reason: "Ачивка: Снайпер 5.0 (Математика)" }
                        ],
                        weeks: {}
                    },
                    "Артём": {
                        xpLedger: [
                            { id: "xp_a1", date: "2026-09-14", week: "8 сен – 14 сен", amount: 50, reason: "Успешная неделя в плюсе (+50 ₽)" }
                        ],
                        weeks: {}
                    },
                    "Юлиана": {
                        xpLedger: [
                            { id: "xp_y1", date: "2026-09-07", week: "1 сен – 7 сен", amount: 50, reason: "Неделя в плюсе (+37 ₽)" },
                            { id: "xp_y2", date: "2026-09-14", week: "8 сен – 14 сен", amount: 50, reason: "Неделя в плюсе (+51 ₽)" },
                            { id: "xp_y3", date: "2026-09-14", week: "8 сен – 14 сен", amount: 30, reason: "Ачивка: Снайпер 5.0 (Алгебра)" },
                            { id: "xp_y4", date: "2026-09-21", week: "15 сен – 21 сен", amount: 50, reason: "Неделя в плюсе (+64 ₽)" }
                        ],
                        weeks: {}
                    }
                }
            };
        }

        static save(data) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (e) {
                console.error("Ошибка сохранения ledger:", e);
            }
        }

        static getChildData(childKey) {
            const db = this.load();
            if (!db.children[childKey]) {
                db.children[childKey] = { xpLedger: [], weeks: {} };
            }
            return db.children[childKey];
        }

        static getTotalXp(childKey) {
            const c = this.getChildData(childKey);
            return (c.xpLedger || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        }

        static getXpLedger(childKey) {
            return this.getChildData(childKey).xpLedger || [];
        }

        static addXp(childKey, amount, reason, weekDateRange) {
            const db = this.load();
            if (!db.children[childKey]) db.children[childKey] = { xpLedger: [], weeks: {} };
            if (!db.children[childKey].xpLedger) db.children[childKey].xpLedger = [];

            // Защита от дублей за одну и ту же причину на одной неделе
            const exists = db.children[childKey].xpLedger.some(x => x.week === weekDateRange && x.reason === reason);
            if (exists) return false;

            db.children[childKey].xpLedger.unshift({
                id: "xp_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
                date: new Date().toISOString().split('T')[0],
                week: weekDateRange,
                amount: Number(amount),
                reason: reason
            });
            this.save(db);
            return true;
        }

        static getWeekRecord(childKey, weekKey) {
            const c = this.getChildData(childKey);
            return (c.weeks && c.weeks[weekKey]) ? c.weeks[weekKey] : null;
        }

        static setWeekPaid(childKey, weekKey, calcAmt, paidAmt, note, dateRange) {
            const db = this.load();
            if (!db.children[childKey]) db.children[childKey] = { xpLedger: [], weeks: {} };
            if (!db.children[childKey].weeks) db.children[childKey].weeks = {};

            db.children[childKey].weeks[weekKey] = {
                status: "paid",
                calculatedAmount: Number(calcAmt),
                paidAmount: Number(paidAmt),
                paidAt: new Date().toISOString().split('T')[0],
                note: note || "Выплачено",
                dateRange: dateRange
            };
            this.save(db);
        }

        static unmarkWeekPaid(childKey, weekKey) {
            const db = this.load();
            if (db.children[childKey] && db.children[childKey].weeks && db.children[childKey].weeks[weekKey]) {
                delete db.children[childKey].weeks[weekKey];
                this.save(db);
            }
        }

        static exportBackup() {
            const data = this.load();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Карманные_деньги_бэкап_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }

        static importBackup(callback) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = e => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => {
                    try {
                        const parsed = JSON.parse(ev.target.result);
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                        alert("Резервная копия успешно восстановлена!");
                        if (callback) callback();
                    } catch (err) {
                        alert("Ошибка чтения JSON: " + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }
    }

    // Состояние сессии
    const state = {
        isOpen: false,
        activeTab: 'calc', // 'calc' | 'pay' | 'settings'
        activeChildKey: "Диана",
        currentWeekDateRange: "",
        currentWeekKey: "",
        showXpHistoryModal: false
    };

    // ----------------------------------------------------
    // АВТООПРЕДЕЛЕНИЕ РЕБЁНКА И ПАРСИНГ ОЦЕНОК ИЗ DOM
    // ----------------------------------------------------
    function autoDetectChild() {
        const selectedEl = document.querySelector('.selection .selected, .selection span');
        if (selectedEl) {
            const txt = selectedEl.textContent;
            for (const key of Object.keys(presets)) {
                if (txt.includes(key)) {
                    state.activeChildKey = key;
                    break;
                }
            }
        }
    }

    // Чтение даты открытой недели из дневника
    function scrapeWeekDateRange() {
        let dateRange = "";

        // Проверяем навигационные вкладки периода
        const periodEl = document.querySelector('.navigation-tabs__period, .navigation-tabs__item.active, .period-picker');
        if (periodEl && periodEl.textContent.trim()) {
            dateRange = periodEl.textContent.trim().replace(/\s+/g, ' ');
        }

        // Если не найдено, пробуем взять заголовок первого и последнего дня
        const days = document.querySelectorAll('.dnevnik-day');
        if (!dateRange && days.length > 0) {
            const firstTitle = days[0].querySelector('.dnevnik-day__title, h3, .day-title');
            const lastTitle = days[days.length - 1].querySelector('.dnevnik-day__title, h3, .day-title');
            if (firstTitle && lastTitle) {
                dateRange = `${firstTitle.textContent.trim()} – ${lastTitle.textContent.trim()}`;
            } else if (firstTitle) {
                dateRange = firstTitle.textContent.trim();
            }
        }

        if (!dateRange) {
            dateRange = "Текущая неделя";
        }

        state.currentWeekDateRange = dateRange;
        // Ключ для хранения в LocalStorage
        state.currentWeekKey = dateRange.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_]/g, '_').toLowerCase();
    }

    // Чтение оценок с открытой страницы dnevnik
    function scrapePageMarks() {
        const marksData = {};
        const days = document.querySelectorAll('.dnevnik-day');
        let totalMarksCount = 0;

        days.forEach(day => {
            day.querySelectorAll('.dnevnik-lesson').forEach(lesson => {
                const subjEl = lesson.querySelector('.js-rt_licey-dnevnik-subject');
                const subjName = subjEl ? subjEl.textContent.trim() : null;
                if (!subjName) return;

                lesson.querySelectorAll('.dnevnik-mark__value').forEach(mark => {
                    const rawVal = mark.getAttribute('value');
                    if (!rawVal) return;

                    const weightEl = mark.querySelector('.dnevnik-mark__weight');
                    let weight = 1;
                    if (weightEl) {
                        const wMatch = weightEl.textContent.match(/×(\d+(\.\d+)?)/);
                        if (wMatch && wMatch[1]) weight = parseFloat(wMatch[1]);
                    }

                    rawVal.split('/').forEach(mStr => {
                        const val = parseFloat(mStr.trim());
                        if (isNaN(val)) return;

                        if (!marksData[subjName]) {
                            marksData[subjName] = { marks: [], weightedSum: 0, totalWeight: 0 };
                        }
                        marksData[subjName].marks.push({ val, weight });
                        marksData[subjName].weightedSum += val * weight;
                        marksData[subjName].totalWeight += weight;
                        totalMarksCount++;
                    });
                });
            });
        });

        return { marksData, totalMarksCount };
    }

    // ----------------------------------------------------
    // МАТЕМАТИЧЕСКИЙ ДВИЖОК: РАСЧЕТ В РУБЛЯХ С ПООЦЕНОЧНЫМ ВКЛАДОМ
    // ----------------------------------------------------
    function calculateWeek(child, scrapedData) {
        const baseIncome = Math.round(child.age * child.inflationCoeff * 100) / 100;
        const rubPerPoint = baseIncome * 0.2; // 20% от базы за 1 балл дельты

        let totalRublesEarnings = 0;
        const activeSubjects = [];

        // Перебираем предметы ребёнка
        child.subjects.forEach(sub => {
            const data = scrapedData.marksData[sub.name];
            // ПОКАЗЫВАЕМ ТОЛЬКО ПРЕДМЕТЫ С ОЦЕНКАМИ!
            if (data && data.totalWeight > 0) {
                const avg = Math.round((data.weightedSum / data.totalWeight) * 100) / 100;

                // Вклад каждой индивидуальной оценки в рубли:
                // deltaRub_k = rubPerPoint * sub.coeff * weight * (val - 3.7)
                const marksBreakdown = data.marks.map(m => {
                    const markDeltaRub = Math.round(rubPerPoint * sub.coeff * m.weight * (m.val - child.zeroMark) * 100) / 100;
                    return {
                        val: m.val,
                        weight: m.weight,
                        markDeltaRub: markDeltaRub
                    };
                });

                // Сумма по предмету в точности равна сумме пооценочных вкладов
                const subjectMoneyRub = Math.round(marksBreakdown.reduce((sum, m) => sum + m.markDeltaRub, 0) * 100) / 100;
                totalRublesEarnings += subjectMoneyRub;

                activeSubjects.push({
                    name: sub.name,
                    coeff: sub.coeff,
                    avg: avg,
                    totalWeight: data.totalWeight,
                    marks: marksBreakdown,
                    moneyRub: subjectMoneyRub,
                    status: subjectMoneyRub > 0 ? 'bonus' : (subjectMoneyRub < 0 ? 'penalty' : 'neutral')
                });
            }
        });

        totalRublesEarnings = Math.round(totalRublesEarnings * 100) / 100;
        const totalPayout = Math.max(0, Math.round((baseIncome + totalRublesEarnings) * 100) / 100);

        // Ачивки недели
        const achievements = [];
        const hasAces = activeSubjects.some(s => s.marks.some(m => m.val === 5) && s.coeff >= 2.0);
        const bestSub = [...activeSubjects].sort((a,b) => b.moneyRub - a.moneyRub)[0];
        const allPositive = activeSubjects.length > 0 && activeSubjects.every(s => s.moneyRub >= 0);

        if (hasAces) achievements.push({ icon: "🎯", title: "Снайпер 5.0", desc: "Пятёрка по профильному предмету!" });
        if (bestSub && bestSub.moneyRub > 0) achievements.push({ icon: "🚀", title: "Прорыв недели", desc: `${bestSub.name}: +${bestSub.moneyRub} ₽!` });
        if (allPositive) achievements.push({ icon: "🛡️", title: "Без хвостов", desc: "Все сданные предметы в плюсе!" });

        return {
            baseIncome,
            rubPerPoint,
            totalRublesEarnings,
            totalPayout,
            activeSubjects,
            achievements,
            hasMarks: activeSubjects.length > 0
        };
    }

    // ----------------------------------------------------
    // СТИЛИ NEO-FINTECH
    // ----------------------------------------------------
    function injectStyles() {
        if (document.getElementById('pm-fintech-styles')) return;
        const st = document.createElement('style');
        st.id = 'pm-fintech-styles';
        st.textContent = `
            #pm-drawer-trigger {
                position: fixed; right: 0; top: 45%; transform: translateY(-50%); z-index: 999998;
                background: linear-gradient(135deg, #0284c7, #0369a1); color: #ffffff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px; font-weight: 800; padding: 12px 14px 12px 16px; border-radius: 20px 0 0 20px;
                box-shadow: -4px 4px 18px rgba(0, 0, 0, 0.22); cursor: pointer; display: flex; align-items: center;
                user-select: none; border: 2px solid rgba(255, 255, 255, 0.4); border-right: none;
                transition: padding 0.2s, background 0.2s;
            }
            #pm-drawer-trigger:hover { padding-right: 20px; background: linear-gradient(135deg, #0369a1, #075985); }

            #pm-sidebar-container {
                position: fixed; top: 0; right: 0; width: 440px; height: 100vh; z-index: 999999;
                box-sizing: border-box; display: flex; flex-direction: column;
                background: #ffffff; color: #0f172a;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                border-left: 1px solid #e2e8f0;
                box-shadow: -10px 0 35px rgba(0, 0, 0, 0.15);
                transform: translateX(100%);
                transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #pm-sidebar-container.open { transform: translateX(0); }

            .dnevnik-page-squish {
                max-width: calc(100% - 440px) !important;
                transition: max-width 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .pm-topbar {
                background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 14px 16px;
                display: flex; flex-direction: column; gap: 10px; flex-shrink: 0;
            }

            .pm-nav-tabs {
                display: flex; background: #f1f5f9; border-radius: 8px; padding: 3px; gap: 2px;
            }
            .pm-tab-btn {
                flex: 1; text-align: center; padding: 8px 4px; font-size: 13px; font-weight: 800;
                border-radius: 6px; cursor: pointer; transition: all 0.15s; user-select: none;
                color: #64748b; background: transparent; border: none;
            }
            .pm-tab-btn.active {
                background: #ffffff; color: #0284c7; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
            }

            .pm-content-scroll { flex: 1; overflow-y: auto; padding: 16px; box-sizing: border-box; }
            .pm-card {
                background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
                padding: 14px; margin-bottom: 12px; box-sizing: border-box;
            }
            .pm-pill {
                padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700;
                cursor: pointer; transition: all 0.15s; border: 1px solid #cbd5e1;
                background: #ffffff; color: #475569; white-space: nowrap;
            }
            .pm-pill.active {
                background: #0284c7; color: #ffffff; border-color: #0284c7;
            }

            /* Модальное окно истории XP */
            .pm-modal-backdrop {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px);
                z-index: 1000000; display: flex; align-items: center; justify-content: center; padding: 16px;
                box-sizing: border-box;
            }
            .pm-modal-window {
                background: #ffffff; border-radius: 16px; width: 100%; max-width: 420px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column;
                max-height: 85vh; animation: pmModalIn 0.2s ease;
            }
            @keyframes pmModalIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        `;
        document.head.appendChild(st);
    }

    // ----------------------------------------------------
    // РЕНДЕР САЙДБАРА
    // ----------------------------------------------------
    function renderSidebar() {
        let box = document.getElementById('pm-sidebar-container');
        if (!box) {
            box = document.createElement('div');
            box.id = 'pm-sidebar-container';
            document.body.appendChild(box);
        }

        // ЛЕНИВЫЙ РЕНДЕР: когда сайдбар закрыт — не строим DOM и не грузим CPU
        if (!state.isOpen) {
            box.classList.remove('open');
            box.innerHTML = '';
            adjustPageLayout(false);
            if (state.showXpHistoryModal) {
                state.showXpHistoryModal = false;
                renderXpModal(null, null);
            }
            return;
        }

        box.classList.add('open');
        adjustPageLayout(true);

        // Автоопределение и сбор реальных оценок строго когда сайдбар открыт
        autoDetectChild();
        scrapeWeekDateRange();
        const scraped = scrapePageMarks();

        const child = presets[state.activeChildKey] || presets["Диана"];
        const totalXp = LedgerStorage.getTotalXp(state.activeChildKey);
        const levelInfo = calculateLevelInfo(totalXp);
        const calc = calculateWeek(child, scraped);
        const record = LedgerStorage.getWeekRecord(state.activeChildKey, state.currentWeekKey) || { amount: calc.totalPayout, paid: false, note: "" };

        box.innerHTML = `
            <!-- ШАПКА NEO-FINTECH -->
            <div class="pm-topbar">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px;">💰</span>
                        <div>
                            <div style="font-size: 15px; font-weight: 800; color: #0f172a;">Карманные деньги</div>
                            <div style="font-size: 11px; color: #64748b; font-weight: 600;">Neo-Fintech • ${child.name}</div>
                        </div>
                    </div>
                    <button id="pm-close-btn" style="background: none; border: none; font-size: 20px; font-weight: 700; cursor: pointer; color: #64748b; padding: 4px 8px; border-radius: 6px;">✕</button>
                </div>

                <!-- НАВИГАЦИОННЫЕ ВКЛАДКИ -->
                <div class="pm-nav-tabs">
                    <button class="pm-tab-btn ${state.activeTab === 'calc' ? 'active' : ''}" onclick="window.pmSetTab('calc')">
                        📊 Расчёт
                    </button>
                    <button class="pm-tab-btn ${state.activeTab === 'pay' ? 'active' : ''}" onclick="window.pmSetTab('pay')">
                        💳 Оплата
                    </button>
                    <button class="pm-tab-btn ${state.activeTab === 'settings' ? 'active' : ''}" onclick="window.pmSetTab('settings')">
                        ⚙️ Настройки
                    </button>
                </div>
            </div>

            <!-- ТЕЛО ВКЛАДКИ -->
            <div class="pm-content-scroll">
                ${state.activeTab === 'calc' ? renderTabCalc(child, levelInfo, calc, record) : ''}
                ${state.activeTab === 'pay' ? renderTabPay(child, calc, record) : ''}
                ${state.activeTab === 'settings' ? renderTabSettings(child, levelInfo) : ''}
            </div>
        `;

        document.getElementById('pm-close-btn').onclick = () => {
            state.isOpen = false;
            renderSidebar();
        };

        // Рендер модалки истории XP если открыта
        renderXpModal(child, levelInfo);
    }

    // ----------------------------------------------------
    // ВКЛАДКА 1: РАСЧЕТ (НЕДЕЛЯ, ОЦЕНКИ И ПООЦЕНОЧНЫЙ ВКЛАД)
    // ----------------------------------------------------
    function renderTabCalc(child, levelInfo, calc, record) {
        return `
            <!-- ГЕЙМИФИКАЦИЯ: Кликабельная плашка уровня и XP -->
            <div class="pm-card" style="background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.04); cursor: pointer; transition: transform 0.15s;"
                 onclick="window.pmOpenXpHistory()" title="Нажмите, чтобы посмотреть историю начислений XP">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 13px; font-weight: 800; color: #0f172a;">⭐ Уровень ${levelInfo.level}: ${levelInfo.levelTitle}</span>
                    <span style="font-size: 11px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 2px 8px; border-radius: 10px;">
                        📜 История XP
                    </span>
                </div>
                <div style="font-size: 11px; color: #64748b; margin-bottom: 5px;">
                    Опыт: <b>${levelInfo.currentLevelXp} / ${levelInfo.nextLevelXp} XP</b> (Всего: <b>${levelInfo.totalXp} XP</b>)
                </div>
                <div style="background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden;">
                    <div style="background: #0284c7; width: ${(levelInfo.currentLevelXp / levelInfo.nextLevelXp)*100}%; height: 100%; border-radius: 3px;"></div>
                </div>
            </div>

            <!-- ШАПКА НЕДЕЛИ С БЫСТРОЙ НАВИГАЦИЕЙ -->
            <div class="pm-card" style="padding: 10px 14px; background: #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                <button class="pm-pill" style="padding: 6px 10px; font-size: 12px;" onclick="window.pmNavPrevWeek()" title="Предыдущая неделя в дневнике">
                    ◀ Пред.
                </button>
                <div style="text-align: center;">
                    <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">Текущая открытая неделя</div>
                    <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 1px;">
                        📅 ${state.currentWeekDateRange}
                    </div>
                </div>
                <button class="pm-pill" style="padding: 6px 10px; font-size: 12px;" onclick="window.pmNavNextWeek()" title="Следующая неделя в дневнике">
                    След. ▶
                </button>
            </div>

            <!-- ИТОГИ НЕДЕЛИ: База, Заработок, Итого -->
            <div class="pm-card">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 12px; color: #64748b;">Базовый доход (B24 = ${child.age} × ${child.inflationCoeff}):</span>
                    <span style="font-size: 13px; font-weight: 800;">${calc.baseIncome} ₽</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 12px; color: #64748b;">Заработок за оценки (Строка 24):</span>
                    <span style="font-size: 13px; font-weight: 800; color: ${calc.totalRublesEarnings >= 0 ? '#16a34a' : '#dc2626'};">
                        ${calc.totalRublesEarnings >= 0 ? '+' : ''}${calc.totalRublesEarnings} ₽
                    </span>
                </div>
                <hr style="border: none; border-top: 1px dashed #cbd5e1; margin: 10px 0;">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <div>
                        <div style="font-size: 14px; font-weight: 800; color: #0f172a;">Итого к выплате (Строка 25):</div>
                        <div style="font-size: 11px; color: #64748b;">${state.currentWeekDateRange}</div>
                    </div>
                    <span style="font-size: 26px; font-weight: 900; color: #16a34a;">${calc.totalPayout} ₽</span>
                </div>
            </div>

            <!-- SMART LEDGER (СТРОКА 26): Факт выплаты -->
            <div class="pm-card" style="background: ${record.paid ? '#f0fdf4' : '#f8fafc'}; border-color: ${record.paid ? '#86efac' : '#e2e8f0'};">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 4px;">Журнал выплат (Строка 26)</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 14px; font-weight: 800; color: ${record.paid ? '#166534' : '#0f172a'};">
                            ${record.paid ? `✅ Выплачено: ${record.amount} ₽` : `⏳ Ожидает: ${calc.totalPayout} ₽`}
                        </div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                            ${record.note || 'Статус не зафиксирован'}
                        </div>
                    </div>
                    <button class="pm-pill" style="background: #ffffff;" onclick="window.pmTogglePaid(${calc.totalPayout})">
                        ${record.paid ? 'Сбросить' : 'Подтвердить'}
                    </button>
                </div>
            </div>

            <!-- АЧИВКИ НЕДЕЛИ -->
            ${calc.achievements.length > 0 ? `
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">Достижения недели</div>
                <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;">
                    ${calc.achievements.map(a => `
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; display: flex; align-items: center; gap: 8px; font-size: 12px;">
                            <span style="font-size: 16px;">${a.icon}</span>
                            <div><b>${a.title}</b> — <span style="color: #64748b;">${a.desc}</span></div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            <!-- СПИСОК ПРЕДМЕТОВ: ТОЛЬКО С ОЦЕНКАМИ И С ВЛИЯНИЕМ КАЖДОЙ ОЦЕНКИ -->
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">
                Оценки за неделю и их денежный вклад (Норматив 3.7)
            </div>

            ${!calc.hasMarks ? `
                <div class="pm-card" style="text-align: center; padding: 20px 14px; background: #ffffff;">
                    <div style="font-size: 24px; margin-bottom: 6px;">📖</div>
                    <div style="font-weight: 800; font-size: 13px; color: #0f172a; margin-bottom: 4px;">На этой неделе оценок пока нет</div>
                    <div style="font-size: 11px; color: #64748b;">
                        Заработок за оценки равен 0 ₽. К выплате гарантирован базовый доход: <b>${calc.baseIncome} ₽</b>.
                    </div>
                </div>
            ` : `
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${calc.activeSubjects.map(s => `
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <div>
                                    <span style="font-size: 13px; font-weight: 800; color: #0f172a;">${s.name}</span>
                                    <span style="font-size: 11px; color: #64748b; margin-left: 4px;">(коэфф: ${s.coeff}, ср.балл: <b>${s.avg}</b>)</span>
                                </div>
                                <span style="font-weight: 800; font-size: 13px; color: ${s.moneyRub >= 0 ? '#16a34a' : '#dc2626'};">
                                    ${s.moneyRub >= 0 ? '+' : ''}${s.moneyRub} ₽
                                </span>
                            </div>

                            <!-- ПООЦЕНОЧНЫЙ ВКЛАД -->
                            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                ${s.marks.map(m => `
                                    <div style="display: inline-flex; align-items: center; background: ${m.markDeltaRub >= 0 ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${m.markDeltaRub >= 0 ? '#bbf7d0' : '#fecaca'}; border-radius: 6px; padding: 2px 6px; font-size: 11px;">
                                        <b style="color: ${m.val >= 4 ? '#166534' : (m.val === 3 ? '#854d0e' : '#991b1b')}; margin-right: 4px; font-size: 12px;">
                                            ${m.val}${m.weight > 1 ? `<span style="font-size: 9px; opacity: 0.7;">×${m.weight}</span>` : ''}
                                        </b>
                                        <span style="font-weight: 700; color: ${m.markDeltaRub >= 0 ? '#15803d' : '#b91c1c'};">
                                            ${m.markDeltaRub >= 0 ? '+' : ''}${m.markDeltaRub} ₽
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        `;
    }

    // ----------------------------------------------------
    // ВКЛАДКА 2: ОПЛАТА (FAST PAY СБП QR БЕЗ КНОПОК КОПИРОВАНИЯ)
    // ----------------------------------------------------
    function renderTabPay(child, calc, record) {
        const amt = record.paid ? record.amount : calc.totalPayout;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://qr.nspk.ru/pm-${amt}&margin=2`;

        return `
            <div style="text-align: center; padding: 16px 0;">
                <div style="font-size: 12px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Сумма к переводу (${state.currentWeekDateRange})</div>
                <div style="font-size: 42px; font-weight: 900; color: #16a34a; margin: 8px 0;">${amt} ₽</div>
                <div style="font-size: 13px; color: #475569; margin-bottom: 20px;">
                    Получатель: <b style="color: #0f172a;">${child.name}</b>
                </div>

                <!-- QR СБП -->
                <div style="background: #ffffff; padding: 18px; border-radius: 16px; border: 1px solid #e2e8f0; display: inline-block; box-shadow: 0 4px 16px rgba(0,0,0,0.06); margin-bottom: 20px;">
                    <img src="${qrUrl}" width="180" height="180" alt="QR СБП" style="display: block; border-radius: 4px;" />
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 10px;">Сканируйте приложением любого банка</div>
                </div>

                <!-- КНОПКА ФИКСАЦИИ ВЫПЛАТЫ (СТРОКА 26) -->
                <div style="max-width: 320px; margin: 0 auto;">
                    <button style="width: 100%; padding: 14px; border-radius: 10px; background: ${record.paid ? '#0284c7' : '#16a34a'}; color: #ffffff; font-size: 13px; font-weight: 800; border: none; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.12);"
                            onclick="window.pmTogglePaid(${calc.totalPayout})">
                        ${record.paid ? '✅ Выплата зафиксирована (Сбросить)' : 'Подтвердить перевод (Строка 26)'}
                    </button>
                </div>
            </div>
        `;
    }

    // ----------------------------------------------------
    // ВКЛАДКА 3: НАСТРОЙКИ (БЕЗ РАЗДЕЛА ИСТОЧНИК ОЦЕНОК)
    // ----------------------------------------------------
    function renderTabSettings(child, levelInfo) {
        return `
            <!-- РЕБЁНОК -->
            <div class="pm-card">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 6px;">Ребёнок (автоопределение)</div>
                <div style="display: flex; gap: 6px;">
                    ${Object.keys(presets).map(k => `
                        <button class="pm-pill ${state.activeChildKey === k ? 'active' : ''}" style="flex: 1; text-align: center;" onclick="window.pmSetChild('${k}')">
                            ${k}
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- СТАТУС ОПЫТА И УРОВНЯ -->
            <div class="pm-card">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 4px;">Профиль геймификации</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div>
                        <div style="font-size: 14px; font-weight: 800; color: #0f172a;">Уровень ${levelInfo.level}: ${levelInfo.levelTitle}</div>
                        <div style="font-size: 11px; color: #64748b;">Всего начислено: <b>${levelInfo.totalXp} XP</b></div>
                    </div>
                    <button class="pm-pill" style="font-size: 11px;" onclick="window.pmOpenXpHistory()">Журнал XP</button>
                </div>
            </div>

            <!-- ФИНАНСОВАЯ ЦЕЛЬ (КОПИЛКА) -->
            <div class="pm-card">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 4px;">Финансовая цель (Копилка)</div>
                <div style="font-size: 13px; font-weight: 800; margin-bottom: 2px;">🎯 ${child.targetGoal.title}</div>
                <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">
                    Накоплено: <b>${child.targetGoal.saved} ₽</b> из <b>${child.targetGoal.target} ₽</b> (${Math.round((child.targetGoal.saved / child.targetGoal.target)*100)}%)
                </div>
                <div style="background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
                    <div style="background: #16a34a; width: ${(child.targetGoal.saved / child.targetGoal.target)*100}%; height: 100%;"></div>
                </div>
                <div style="font-size: 11px; color: #16a34a; font-weight: 700;">
                    ⏳ При среднем доходе осталось ~${Math.ceil((child.targetGoal.target - child.targetGoal.saved) / 200)} недель!
                </div>
            </div>

            <!-- ФОРМУЛА И СТАВКИ -->
            <div class="pm-card" style="font-size: 12px;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 6px;">Параметры формулы</div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span>Возраст / Класс:</span><b>${child.age} лет (${child.classNum} класс)</b>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span>Коэфф. инфляции:</span><b>${child.inflationCoeff}</b>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span>Базовая ставка (B24):</span><b>${Math.round(child.age * child.inflationCoeff * 100) / 100} ₽</b>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Стоимость 1 балла дельты:</span><b>${Math.round((child.age * child.inflationCoeff * 0.2) * 100) / 100} ₽</b>
                </div>
            </div>

            <!-- РЕЗЕРВНАЯ КОПИЯ (JSON) -->
            <div class="pm-card">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 4px;">Резервная копия (JSON)</div>
                <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">Сохранение истории выплат и XP без Excel.</div>
                <div style="display: flex; gap: 6px;">
                    <button class="pm-pill" style="flex: 1;" onclick="window.pmExportJSON()">📥 Экспорт JSON</button>
                    <button class="pm-pill" style="flex: 1;" onclick="window.pmImportJSON()">📤 Импорт JSON</button>
                </div>
            </div>
        `;
    }

    // ----------------------------------------------------
    // МОДАЛЬНОЕ ОКНО ИСТОРИИ XP
    // ----------------------------------------------------
    function renderXpModal(child, levelInfo) {
        let m = document.getElementById('pm-xp-modal-root');
        if (!state.showXpHistoryModal) {
            if (m) m.remove();
            return;
        }

        if (!m) {
            m = document.createElement('div');
            m.id = 'pm-xp-modal-root';
            document.body.appendChild(m);
        }

        const history = LedgerStorage.getXpLedger(state.activeChildKey);

        m.innerHTML = `
            <div class="pm-modal-backdrop" onclick="if(event.target === this) window.pmCloseXpHistory()">
                <div class="pm-modal-window">
                    <div style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                        <div>
                            <div style="font-size: 15px; font-weight: 800; color: #0f172a;">⭐ Журнал начисления XP</div>
                            <div style="font-size: 12px; color: #64748b;">${child.name} • Уровень ${levelInfo.level} (${levelInfo.levelTitle})</div>
                        </div>
                        <button onclick="window.pmCloseXpHistory()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #64748b;">✕</button>
                    </div>

                    <div style="padding: 16px 20px; overflow-y: auto; flex: 1;">
                        <div style="background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 12px; color: #0369a1;">
                            Каждые <b>200 XP</b> повышают уровень персонажа. Опыт начисляется за успешные недели без долгов и высокие оценки.
                        </div>

                        ${history.length === 0 ? `
                            <div style="text-align: center; padding: 24px 0; color: #64748b; font-size: 13px;">
                                История начислений пока пуста.<br>Опыт начисляется при подтверждении выплат за неделю!
                            </div>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                ${history.map(item => `
                                    <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; background: #ffffff;">
                                        <div>
                                            <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${item.reason}</div>
                                            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                                                📅 ${item.week || item.date} • ${item.date}
                                            </div>
                                        </div>
                                        <span style="font-weight: 800; font-size: 14px; color: #16a34a; background: #dcfce7; padding: 3px 8px; border-radius: 6px;">
                                            +${item.amount} XP
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </div>

                    <div style="padding: 12px 20px; border-top: 1px solid #e2e8f0; text-align: right; background: #f8fafc;">
                        <button class="pm-pill active" onclick="window.pmCloseXpHistory()">Закрыть</button>
                    </div>
                </div>
            </div>
        `;
    }

    // ----------------------------------------------------
    // УПРАВЛЕНИЕ СЖАТИЕМ ДНЕВНИКА
    // ----------------------------------------------------
    function adjustPageLayout(squish) {
        const targets = document.querySelectorAll('.dnevnik, .content-main, #content, .page-wrapper');
        targets.forEach(el => {
            if (squish) el.classList.add('dnevnik-page-squish');
            else el.classList.remove('dnevnik-page-squish');
        });
    }

    // ----------------------------------------------------
    // ПЛАВАЮЩИЙ ЯРЛЫК
    // ----------------------------------------------------
    function injectTrigger() {
        if (document.getElementById('pm-drawer-trigger')) return;
        const b = document.createElement('div');
        b.id = 'pm-drawer-trigger';
        b.innerHTML = '<span>💰 Карманные деньги</span>';
        b.onclick = () => {
            state.isOpen = !state.isOpen;
            renderSidebar();
        };
        document.body.appendChild(b);
    }

    // ----------------------------------------------------
    // ГЛОБАЛЬНЫЕ МЕТОДЫ В WINDOW
    // ----------------------------------------------------
    window.pmSetTab = function(t) { state.activeTab = t; renderSidebar(); };
    window.pmSetChild = function(c) { state.activeChildKey = c; renderSidebar(); };
    window.pmOpenXpHistory = function() { state.showXpHistoryModal = true; renderSidebar(); };
    window.pmCloseXpHistory = function() { state.showXpHistoryModal = false; renderSidebar(); };

    // Быстрая навигация по неделям (эмулирует клик по стрелкам дневника)
    window.pmNavPrevWeek = function() {
        const btn = document.querySelector('.navigation-tabs__prev, .js-tabs-prev, a.navigation-tabs__item--prev, [data-action="prev-week"], .period-nav-prev');
        if (btn) {
            btn.click();
        } else {
            alert('Используйте стрелки переключения недели в шапке дневника.');
        }
    };

    window.pmNavNextWeek = function() {
        const btn = document.querySelector('.navigation-tabs__next, .js-tabs-next, a.navigation-tabs__item--next, [data-action="next-week"], .period-nav-next');
        if (btn) {
            btn.click();
        } else {
            alert('Используйте стрелки переключения недели в шапке дневника.');
        }
    };

    window.pmTogglePaid = function(calcAmt) {
        const cur = LedgerStorage.getWeekRecord(state.activeChildKey, state.currentWeekKey);
        if (cur && cur.status === "paid") {
            LedgerStorage.unmarkWeekPaid(state.activeChildKey, state.currentWeekKey);
        } else {
            LedgerStorage.setWeekPaid(state.activeChildKey, state.currentWeekKey, calcAmt, calcAmt, "Выплачено", state.currentWeekDateRange);
            // Если выплата подтверждена и на неделе есть заработок — начисляем XP в историю
            LedgerStorage.addXp(state.activeChildKey, 50, `Успешная неделя (${state.currentWeekDateRange})`, state.currentWeekDateRange);
        }
        renderSidebar();
    };

    window.pmExportJSON = function() {
        LedgerStorage.exportBackup();
    };

    window.pmImportJSON = function() {
        LedgerStorage.importBackup(() => renderSidebar());
    };

    // ----------------------------------------------------
    // ИНИЦИАЛИЗАЦИЯ
    // ----------------------------------------------------
    function init() {
        injectStyles();
        injectTrigger();

        // Закрытие по Esc
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (state.showXpHistoryModal) {
                    state.showXpHistoryModal = false;
                    renderSidebar();
                } else if (state.isOpen) {
                    state.isOpen = false;
                    renderSidebar();
                }
            }
        });

        // Наблюдатель с защитой от бесконечной петли (Self-Mutation Guard & Debounce)
        let debounceTimer = null;
        const obs = new MutationObserver((mutations) => {
            // Игнорируем любые мутации внутри наших собственных элементов
            const hasExternalMutation = mutations.some(m => {
                const target = m.target;
                if (!target || !target.closest) return true;
                if (target.closest('#pm-sidebar-container') ||
                    target.closest('#pm-drawer-trigger') ||
                    target.closest('#pm-xp-modal-root')) {
                    return false;
                }
                return true;
            });

            if (!hasExternalMutation) return;

            // Дебаунс 150мс: собираем мутации и запускаем обновление только после стабилизации DOM
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                // Если сайдбар закрыт — ничего не строим и не перерисовываем
                if (!state.isOpen) return;

                const prevChild = state.activeChildKey;
                const prevWeek = state.currentWeekDateRange;
                autoDetectChild();
                scrapeWeekDateRange();
                if (prevChild !== state.activeChildKey || prevWeek !== state.currentWeekDateRange) {
                    renderSidebar();
                }
            }, 150);
        });

        obs.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
