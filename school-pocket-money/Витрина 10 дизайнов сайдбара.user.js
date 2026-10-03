// ==UserScript==
// @name         Витрина 10 дизайнов сайдбара карманных денег
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  3-вкладочный сайдбар с расчётом в рублях по каждому предмету, геймификацией (уровни, стрик, ачивки), автоопределением ребёнка/недели и 10 визуальными стилями
// @author       Senior Software Engineer
// @match        https://cop.admhmao.ru/journal-app/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ----------------------------------------------------
    // КОНФИГУРАЦИЯ ДЕТЕЙ И ПРЕДМЕТОВ
    // ----------------------------------------------------
    const presets = {
        "Юлиана": {
            name: "Басимова Юлиана",
            zeroMark: 3.7,
            age: 14,
            classNum: 9,
            inflationCoeff: 12.485,
            level: 5,
            levelTitle: "Рыцарь Математики",
            xp: 820,
            nextLevelXp: 1000,
            streakWeeks: 3,
            targetGoal: { title: "Новый планшет и стилус", target: 15000, saved: 4200 },
            subjects: [
                { name: "Алгебра", coeff: 2.0 },
                { name: "Англ. яз.", coeff: 1.0 },
                { name: "Биология", coeff: 1.0 },
                { name: "География", coeff: 1.0 },
                { name: "Геометрия", coeff: 2.0 },
                { name: "Информатика", coeff: 1.0 },
                { name: "История", coeff: 1.0 },
                { name: "Литература", coeff: 1.0 },
                { name: "Русский язык", coeff: 2.0 },
                { name: "Физика", coeff: 1.0 },
                { name: "Химия", coeff: 1.0 }
            ]
        },
        "Артём": {
            name: "Басимов Артём",
            zeroMark: 3.7,
            age: 12,
            classNum: 7,
            inflationCoeff: 12.5,
            level: 4,
            levelTitle: "Страж Естествознания",
            xp: 540,
            nextLevelXp: 800,
            streakWeeks: 2,
            targetGoal: { title: "Игровые беспроводные наушники", target: 6000, saved: 2100 },
            subjects: [
                { name: "Англ. яз.", coeff: 1.0 },
                { name: "Биология", coeff: 1.0 },
                { name: "География", coeff: 1.0 },
                { name: "История", coeff: 1.0 },
                { name: "Математика", coeff: 2.0 },
                { name: "Русский язык", coeff: 2.0 },
                { name: "Физика", coeff: 1.0 },
                { name: "Физкультура", coeff: 0.5 }
            ]
        },
        "Диана": {
            name: "Басимова Диана",
            zeroMark: 3.7,
            age: 8,
            classNum: 3,
            inflationCoeff: 12.5,
            level: 3,
            levelTitle: "Юная Художница",
            xp: 320,
            nextLevelXp: 500,
            streakWeeks: 4,
            targetGoal: { title: "Набор для рисования и мольберт", target: 4500, saved: 1800 },
            subjects: [
                { name: "Англ. яз.", coeff: 1.0 },
                { name: "ИЗО", coeff: 0.5 },
                { name: "Литер. чтение", coeff: 0.5 },
                { name: "Математика", coeff: 2.0 },
                { name: "Окруж. мир", coeff: 0.5 },
                { name: "Русский язык", coeff: 2.0 },
                { name: "Труд", coeff: 0.5 }
            ]
        }
    };

    // Реалистичные недели
    const sampleWeeks = [
        {
            weekCode: "С1",
            dateRange: "1 сен – 7 сен",
            marks: {
                "Геометрия": { weightedSum: 4.0, totalWeight: 1.0 },
                "Физика": { weightedSum: 4.0, totalWeight: 1.0 },
                "Русский язык": { weightedSum: 4.0, totalWeight: 1.0 }
            }
        },
        {
            weekCode: "С2",
            dateRange: "8 сен – 14 сен",
            marks: {
                "Алгебра": { weightedSum: 5.0, totalWeight: 1.0 },
                "Англ. яз.": { weightedSum: 6.0, totalWeight: 2.0 },
                "Биология": { weightedSum: 4.0, totalWeight: 1.0 },
                "Русский язык": { weightedSum: 4.0, totalWeight: 1.0 },
                "Физика": { weightedSum: 2.0, totalWeight: 1.0 },
                "Химия": { weightedSum: 5.0, totalWeight: 1.0 }
            }
        },
        {
            weekCode: "С3",
            dateRange: "15 сен – 21 сен",
            marks: {
                "Алгебра": { weightedSum: 5.0, totalWeight: 1.0 },
                "Англ. яз.": { weightedSum: 5.0, totalWeight: 1.0 },
                "Биология": { weightedSum: 3.0, totalWeight: 1.0 },
                "География": { weightedSum: 8.0, totalWeight: 2.0 },
                "Геометрия": { weightedSum: 4.0, totalWeight: 1.0 },
                "История": { weightedSum: 4.0, totalWeight: 1.0 },
                "Русский язык": { weightedSum: 5.0, totalWeight: 2.0 },
                "Физика": { weightedSum: 4.0, totalWeight: 1.0 },
                "Химия": { weightedSum: 4.0, totalWeight: 1.0 }
            }
        }
    ];

    // Названия 10 визуальных стилей
    const STYLE_NAMES = {
        1: "1. Neo-Fintech (Необанк)",
        2: "2. RPG Quest (Геймификация)",
        3: "3. ED-Native (Стиль Дневника)",
        4: "4. Cyberpunk Dark (OLED Неон)",
        5: "5. Glassmorphism (Матовое стекло)",
        6: "6. Piggy Bank (Тёплая копилка)",
        7: "7. Smart Receipt (Кассовый чек)",
        8: "8. Apple iOS (Cupertino Clean)",
        9: "9. Dashboard Pro (Аналитический)",
        10: "10. Arcade 8-Bit (Ретро-игра)"
    };

    // Состояние
    let state = {
        isOpen: true,
        currentStyle: 1,
        activeTab: 'calc', // 'calc' | 'pay' | 'settings'
        activeChildKey: "Юлиана",
        activeWeekIndex: 2,
        paidRecords: {
            "С1": { amount: 182, paid: true, note: "Выплачено (перерасчет)" },
            "С2": { amount: 198, paid: true, note: "Выплачено" },
            "С3": { amount: 230, paid: false, note: "" }
        }
    };

    // ----------------------------------------------------
    // АВТООПРЕДЕЛЕНИЕ РЕБЁНКА И НЕДЕЛИ ИЗ ДНЕВНИКА
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

    function autoDetectWeek() {
        // Проверяем активную вкладку периода в дневнике
        const periodEl = document.querySelector('.navigation-tabs__period, .navigation-tabs__item.active');
        if (periodEl) {
            const txt = periodEl.textContent;
            // Сопоставляем с неделями если есть совпадения
            sampleWeeks.forEach((w, idx) => {
                if (txt.includes(w.weekCode) || txt.includes(w.dateRange.slice(0, 5))) {
                    state.activeWeekIndex = idx;
                }
            });
        }
    }

    // ----------------------------------------------------
    // МАТЕМАТИЧЕСКИЙ ДВИЖОК: РАСЧЕТ В РУБЛЯХ ПО ПРЕДМЕТАМ
    // ----------------------------------------------------
    function calculateWeek(child, weekMarks) {
        const baseIncome = Math.round(child.age * child.inflationCoeff * 100) / 100;
        const rubPerPoint = baseIncome * 0.2; // 20% от базы за 1 балл коэффициента

        let totalRublesEarnings = 0;
        const subjectsDetail = [];

        child.subjects.forEach(sub => {
            const data = weekMarks[sub.name];
            if (data && data.totalWeight > 0) {
                const avg = Math.round((data.weightedSum / data.totalWeight) * 100) / 100;
                // Формула H = (Avg - 3.7) * Coeff * Weight
                const deltaCoeff = Math.round((avg - child.zeroMark) * sub.coeff * data.totalWeight * 100) / 100;
                // Точный заработок в РУБЛЯХ по этому предмету:
                const moneyRub = Math.round(rubPerPoint * deltaCoeff * 100) / 100;
                totalRublesEarnings += moneyRub;

                subjectsDetail.push({
                    name: sub.name,
                    coeff: sub.coeff,
                    avg,
                    weight: data.totalWeight,
                    deltaCoeff,
                    moneyRub,
                    status: moneyRub > 0 ? 'bonus' : (moneyRub < 0 ? 'penalty' : 'neutral')
                });
            } else {
                subjectsDetail.push({
                    name: sub.name,
                    coeff: sub.coeff,
                    avg: null,
                    weight: null,
                    deltaCoeff: null,
                    moneyRub: null,
                    status: 'none'
                });
            }
        });

        totalRublesEarnings = Math.round(totalRublesEarnings * 100) / 100;
        const totalPayout = Math.max(0, Math.round((baseIncome + totalRublesEarnings) * 100) / 100);

        // Расчёт ачивок недели (геймификация)
        const bestSubject = [...subjectsDetail].filter(s => s.moneyRub !== null).sort((a,b) => b.moneyRub - a.moneyRub)[0];
        const hasAces = subjectsDetail.some(s => s.avg >= 4.8 && s.coeff >= 2.0);
        const allPositive = subjectsDetail.filter(s => s.moneyRub !== null).every(s => s.moneyRub >= 0);

        const achievements = [];
        if (hasAces) achievements.push({ icon: "🎯", title: "Снайпер 5.0", desc: "Отличный балл по ключевому предмету!" });
        if (bestSubject && bestSubject.moneyRub > 0) achievements.push({ icon: "🚀", title: "Прорыв недели", desc: `${bestSubject.name} принёс +${bestSubject.moneyRub} ₽!` });
        if (allPositive) achievements.push({ icon: "🛡️", title: "Без хвостов", desc: "Все предметы сданы без убытка!" });

        return {
            baseIncome,
            rubPerPoint,
            totalRublesEarnings,
            totalPayout,
            subjectsDetail,
            bestSubject,
            achievements
        };
    }

    // ----------------------------------------------------
    // НАСТРОЙКИ 10 ВИЗУАЛЬНЫХ СТИЛЕЙ
    // ----------------------------------------------------
    function getTheme(styleId) {
        switch(Number(styleId)) {
            case 1: // Neo-Fintech
                return {
                    bg: "#ffffff", text: "#0f172a", subtext: "#64748b", border: "1px solid #e2e8f0",
                    topbarBg: "#f8fafc", navBg: "#f1f5f9", navActiveBg: "#ffffff", navActiveColor: "#0284c7",
                    cardBg: "#f8fafc", cardBorder: "1px solid #e2e8f0", accent: "#0284c7",
                    plusBg: "#dcfce7", plusColor: "#15803d", minusBg: "#fee2e2", minusColor: "#b91c1c",
                    radius: "12px", font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                };
            case 2: // RPG Quest
                return {
                    bg: "#1e1b4b", text: "#f8fafc", subtext: "#c7d2fe", border: "2px solid #6366f1",
                    topbarBg: "#312e81", topbarText: "#facc15", navBg: "#3730a3", navActiveBg: "#f59e0b", navActiveColor: "#000000",
                    cardBg: "#2e2a72", cardBorder: "1px solid #4338ca", accent: "#f59e0b",
                    plusBg: "#14532d", plusColor: "#4ade80", minusBg: "#7f1d1d", minusColor: "#f87171",
                    radius: "16px", font: '"Plus Jakarta Sans", sans-serif'
                };
            case 3: // ED-Native
                return {
                    bg: "#ffffff", text: "#222222", subtext: "#666666", border: "1px solid #cbd5e1",
                    topbarBg: "#0284c7", topbarText: "#ffffff", navBg: "rgba(0,0,0,0.06)", navActiveBg: "#0284c7", navActiveColor: "#ffffff",
                    cardBg: "#ffffff", cardBorder: "1px solid #e5e7eb", accent: "#0284c7",
                    plusBg: "#e0f2fe", plusColor: "#0369a1", minusBg: "#fee2e2", minusColor: "#dc2626",
                    radius: "4px", font: '"Open Sans", Arial, sans-serif'
                };
            case 4: // Cyberpunk Dark
                return {
                    bg: "#090d16", text: "#f8fafc", subtext: "#94a3b8", border: "1px solid #1e293b",
                    topbarBg: "#0f172a", topbarText: "#38bdf8", navBg: "#1e293b", navActiveBg: "#10b981", navActiveColor: "#000000",
                    cardBg: "#111827", cardBorder: "1px solid #1f2937", accent: "#10b981",
                    plusBg: "#064e3b", plusColor: "#34d399", minusBg: "#881337", minusColor: "#fb7185",
                    radius: "10px", font: '"Inter", monospace, sans-serif'
                };
            case 5: // Glassmorphism
                return {
                    bg: "rgba(255, 255, 255, 0.82)", backdrop: "blur(20px)", text: "#1e1b4b", subtext: "#6b7280", border: "1px solid rgba(255,255,255,0.6)",
                    topbarBg: "rgba(99, 102, 241, 0.1)", navBg: "rgba(255,255,255,0.5)", navActiveBg: "linear-gradient(135deg, #6366f1, #8b5cf6)", navActiveColor: "#ffffff",
                    cardBg: "rgba(255, 255, 255, 0.65)", cardBorder: "1px solid rgba(255,255,255,0.8)", accent: "#6366f1",
                    plusBg: "#dcfce7", plusColor: "#15803d", minusBg: "#fee2e2", minusColor: "#b91c1c",
                    radius: "18px", font: '"Plus Jakarta Sans", sans-serif'
                };
            case 6: // Piggy Bank (Уютная копилка)
                return {
                    bg: "#fffbeb", text: "#78350f", subtext: "#92400e", border: "2px solid #fde68a",
                    topbarBg: "linear-gradient(135deg, #f59e0b, #d97706)", topbarText: "#ffffff", navBg: "rgba(254, 243, 199, 0.8)", navActiveBg: "#f59e0b", navActiveColor: "#ffffff",
                    cardBg: "#ffffff", cardBorder: "2px solid #fcd34d", accent: "#d97706",
                    plusBg: "#fef3c7", plusColor: "#b45309", minusBg: "#fee2e2", minusColor: "#b91c1c",
                    radius: "20px", font: '"Nunito", "Comic Sans MS", sans-serif'
                };
            case 7: // Smart Receipt
                return {
                    bg: "#fafaf9", text: "#1c1917", subtext: "#78716c", border: "1px dashed #a8a29e",
                    topbarBg: "#f5f5f4", navBg: "#e7e5e4", navActiveBg: "#292524", navActiveColor: "#fafaf9",
                    cardBg: "#ffffff", cardBorder: "1px dashed #d6d3d1", accent: "#292524",
                    plusBg: "#f5f5f4", plusColor: "#166534", minusBg: "#f5f5f4", minusColor: "#dc2626",
                    radius: "0px", font: '"Courier New", Courier, monospace'
                };
            case 8: // Apple iOS
                return {
                    bg: "#f2f2f7", text: "#000000", subtext: "#8e8e93", border: "none",
                    topbarBg: "#ffffff", navBg: "rgba(118, 118, 128, 0.12)", navActiveBg: "#ffffff", navActiveColor: "#007aff",
                    cardBg: "#ffffff", cardBorder: "none", cardShadow: "0 2px 8px rgba(0,0,0,0.04)", accent: "#007aff",
                    plusBg: "#e8f5e9", plusColor: "#2e7d32", minusBg: "#ffebee", minusColor: "#c62828",
                    radius: "22px", font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif'
                };
            case 9: // Dashboard Pro
                return {
                    bg: "#ffffff", text: "#0f172a", subtext: "#64748b", border: "1px solid #cbd5e1",
                    topbarBg: "#1e293b", topbarText: "#f8fafc", navBg: "#334155", navActiveBg: "#38bdf8", navActiveColor: "#0f172a",
                    cardBg: "#f8fafc", cardBorder: "1px solid #e2e8f0", accent: "#0284c7",
                    plusBg: "#dcfce7", plusColor: "#15803d", minusBg: "#fee2e2", minusColor: "#b91c1c",
                    radius: "6px", font: '"Inter", "Segoe UI", sans-serif'
                };
            case 10: // Arcade 8-Bit
                return {
                    bg: "#18181b", text: "#f4f4f5", subtext: "#a1a1aa", border: "3px solid #e11d48",
                    topbarBg: "#27272a", topbarText: "#fb7185", navBg: "#3f3f46", navActiveBg: "#e11d48", navActiveColor: "#ffffff",
                    cardBg: "#27272a", cardBorder: "2px solid #52525b", accent: "#e11d48",
                    plusBg: "#14532d", plusColor: "#86efac", minusBg: "#881337", minusColor: "#fda4af",
                    radius: "0px", font: '"Courier New", monospace'
                };
            default:
                return getTheme(1);
        }
    }

    // ----------------------------------------------------
    // БАЗОВЫЕ СТИЛИ САЙДБАРА
    // ----------------------------------------------------
    function injectStyles() {
        if (document.getElementById('pm-theme-styles')) return;
        const st = document.createElement('style');
        st.id = 'pm-theme-styles';
        st.textContent = `
            #pm-drawer-trigger {
                position: fixed; right: 0; top: 45%; transform: translateY(-50%); z-index: 999998;
                background: linear-gradient(135deg, #0284c7, #0369a1); color: white;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px; font-weight: 800; padding: 12px 14px 12px 16px; border-radius: 20px 0 0 20px;
                box-shadow: -4px 4px 18px rgba(0, 0, 0, 0.25); cursor: pointer; display: flex; align-items: center;
                user-select: none; border: 2px solid rgba(255, 255, 255, 0.4); border-right: none;
                transition: all 0.2s;
            }
            #pm-drawer-trigger:hover { padding-right: 20px; background: linear-gradient(135deg, #0369a1, #075985); }

            #pm-sidebar-container {
                position: fixed; top: 0; right: 0; width: 440px; height: 100vh; z-index: 999999;
                box-sizing: border-box; display: flex; flex-direction: column;
                box-shadow: -10px 0 35px rgba(0, 0, 0, 0.2);
                transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #pm-sidebar-container.closed { transform: translateX(100%); }

            .pm-topbar { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
            .pm-style-badges { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
            .pm-style-btn {
                width: 28px; height: 28px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.12);
                background: white; color: #334155; font-size: 12px; font-weight: 800; cursor: pointer;
                display: flex; align-items: center; justify-content: center; transition: all 0.15s;
            }
            .pm-style-btn.active { background: #0284c7; color: white; border-color: #0284c7; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.4); }

            .pm-nav-tabs-row { display: flex; border-radius: 8px; padding: 3px; flex-shrink: 0; }
            .pm-tab-btn {
                flex: 1; text-align: center; padding: 7px 4px; font-size: 12px; font-weight: 800;
                border-radius: 6px; cursor: pointer; transition: all 0.2s; user-select: none;
            }

            .pm-content-scroll { flex: 1; overflow-y: auto; padding: 16px; box-sizing: border-box; }
            .pm-card { padding: 14px; margin-bottom: 12px; }
            .pm-pill {
                padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700;
                cursor: pointer; transition: all 0.2s; white-space: nowrap;
            }
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

        // Автоопределение ребёнка и недели из разметки
        autoDetectChild();
        autoDetectWeek();

        const child = presets[state.activeChildKey] || presets["Юлиана"];
        const week = sampleWeeks[state.activeWeekIndex] || sampleWeeks[2];
        const calc = calculateWeek(child, week.marks);
        const record = state.paidRecords[week.weekCode] || { amount: calc.totalPayout, paid: false, note: "" };
        const tm = getTheme(state.currentStyle);

        box.style.background = tm.bg;
        box.style.backdropFilter = tm.backdrop || 'none';
        box.style.color = tm.text;
        box.style.fontFamily = tm.font;
        box.style.borderLeft = tm.border;

        box.innerHTML = `
            <!-- ШАПКА: 10 Стилей + Название + Закрыть -->
            <div class="pm-topbar" style="background: ${tm.topbarBg}; color: ${tm.topbarText || tm.text}; border-bottom: 1px solid rgba(0,0,0,0.08);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 10px; text-transform: uppercase; font-weight: 800; opacity: 0.8; letter-spacing: 0.5px;">10 стилей макета №1</div>
                        <div style="font-size: 14px; font-weight: 800; margin-top: 1px;">
                            ${STYLE_NAMES[state.currentStyle]}
                        </div>
                    </div>
                    <button id="pm-close-btn" style="background: none; border: none; font-size: 20px; font-weight: 700; cursor: pointer; color: inherit; padding: 4px;">✕</button>
                </div>

                <div class="pm-style-badges">
                    <span style="font-size: 11px; font-weight: 700; opacity: 0.8; margin-right: 2px;">Стиль:</span>
                    ${[1,2,3,4,5,6,7,8,9,10].map(n => `
                        <button class="pm-style-btn ${state.currentStyle === n ? 'active' : ''}" onclick="window.pmSetStyle(${n})">${n}</button>
                    `).join('')}
                </div>

                <!-- 3 ВКЛАДКИ МАКЕТА №1 -->
                <div class="pm-nav-tabs-row" style="background: ${tm.navBg};">
                    <div class="pm-tab-btn" style="${state.activeTab === 'calc' ? `background: ${tm.navActiveBg}; color: ${tm.navActiveColor}; box-shadow: 0 2px 6px rgba(0,0,0,0.1);` : 'color: inherit;'}" onclick="window.pmSetTab('calc')">
                        📊 Расчёт
                    </div>
                    <div class="pm-tab-btn" style="${state.activeTab === 'pay' ? `background: ${tm.navActiveBg}; color: ${tm.navActiveColor}; box-shadow: 0 2px 6px rgba(0,0,0,0.1);` : 'color: inherit;'}" onclick="window.pmSetTab('pay')">
                        💳 Оплата
                    </div>
                    <div class="pm-tab-btn" style="${state.activeTab === 'settings' ? `background: ${tm.navActiveBg}; color: ${tm.navActiveColor}; box-shadow: 0 2px 6px rgba(0,0,0,0.1);` : 'color: inherit;'}" onclick="window.pmSetTab('settings')">
                        ⚙️ Настройки
                    </div>
                </div>
            </div>

            <!-- ТЕЛО ВКЛАДКИ -->
            <div class="pm-content-scroll">
                ${state.activeTab === 'calc' ? renderTabCalc(child, week, calc, record, tm) : ''}
                ${state.activeTab === 'pay' ? renderTabPay(child, week, calc, record, tm) : ''}
                ${state.activeTab === 'settings' ? renderTabSettings(child, tm) : ''}
            </div>
        `;

        document.getElementById('pm-close-btn').onclick = () => box.classList.add('closed');
    }

    // ----------------------------------------------------
    // ВКЛАДКА 1: РАСЧЕТ (РУБЛИ ПО ПРЕДМЕТАМ + ГЕЙМИФИКАЦИЯ)
    // ----------------------------------------------------
    function renderTabCalc(child, week, calc, record, tm) {
        return `
            <!-- ГЕЙМИФИКАЦИЯ: Уровень, XP и Стрик -->
            <div class="pm-card" style="background: ${tm.cardBg}; border: ${tm.cardBorder}; border-radius: ${tm.radius}; box-shadow: ${tm.cardShadow || 'none'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div>
                        <span style="font-size: 13px; font-weight: 800;">⭐ Уровень ${child.level}: ${child.levelTitle}</span>
                    </div>
                    <span style="font-size: 11px; font-weight: 800; background: #fef08a; color: #854d0e; padding: 2px 8px; border-radius: 12px;">
                        🔥 Стрик: ${child.streakWeeks} нед. в плюсе!
                    </span>
                </div>
                <div style="font-size: 11px; color: ${tm.subtext}; margin-bottom: 4px;">
                    Опыт: <b>${child.xp} / ${child.nextLevelXp} XP</b> (+${calc.totalRublesEarnings > 0 ? 50 : 10} XP за неделю)
                </div>
                <div style="background: rgba(0,0,0,0.08); height: 6px; border-radius: 3px; overflow: hidden;">
                    <div style="background: ${tm.accent}; width: ${(child.xp / child.nextLevelXp)*100}%; height: 100%;"></div>
                </div>
            </div>

            <!-- Селектор недель -->
            <div style="display: flex; gap: 6px; margin-bottom: 12px; overflow-x: auto;">
                ${sampleWeeks.map((w, idx) => `
                    <div class="pm-pill" style="${state.activeWeekIndex === idx ? `background: ${tm.accent}; color: white; border: none;` : `background: ${tm.cardBg}; border: ${tm.cardBorder}; color: inherit;`}" onclick="window.pmSetWeek(${idx})">
                        ${w.weekCode}
                    </div>
                `).join('')}
            </div>

            <!-- ИТОГИ НЕДЕЛИ: База B24, Рубли за оценки (строка 24), К выплате (строка 25) -->
            <div class="pm-card" style="background: ${tm.cardBg}; border: ${tm.cardBorder}; border-radius: ${tm.radius}; box-shadow: ${tm.cardShadow || 'none'};">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 12px; color: ${tm.subtext};">Базовый доход (B24 = ${child.age} × ${child.inflationCoeff}):</span>
                    <span style="font-size: 13px; font-weight: 800;">${calc.baseIncome} ₽</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 12px; color: ${tm.subtext};">Заработок за оценки (Строка 24):</span>
                    <span style="font-size: 13px; font-weight: 800; color: ${calc.totalRublesEarnings >= 0 ? tm.plusColor : tm.minusColor};">
                        ${calc.totalRublesEarnings >= 0 ? '+' : ''}${calc.totalRublesEarnings} ₽
                    </span>
                </div>
                <hr style="border: none; border-top: 1px dashed rgba(0,0,0,0.15); margin: 8px 0;">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <span style="font-size: 14px; font-weight: 800;">Итого к выплате (Строка 25):</span>
                    <span style="font-size: 24px; font-weight: 900; color: #16a34a;">${calc.totalPayout} ₽</span>
                </div>
            </div>

            <!-- СТРОКА 26: Факт выплаты -->
            <div class="pm-card" style="background: ${record.paid ? '#f0fdf4' : tm.cardBg}; border: ${record.paid ? '1px solid #86efac' : tm.cardBorder}; border-radius: ${tm.radius};">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: ${tm.subtext}; margin-bottom: 4px;">Журнал выплат (Строка 26)</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 15px; font-weight: 800; color: ${record.paid ? '#166534' : tm.text};">
                            ${record.paid ? `✅ Выплачено: ${record.amount} ₽` : `⏳ Ожидает: ${calc.totalPayout} ₽`}
                        </div>
                        <div style="font-size: 11px; color: ${tm.subtext}; margin-top: 2px;">
                            ${record.note || 'Статус не подтверждён'}
                        </div>
                    </div>
                    <button class="pm-pill" style="border: 1px solid #cbd5e1; background: white; color: #334155;" onclick="window.pmTogglePaid('${week.weekCode}', ${calc.totalPayout})">
                        ${record.paid ? 'Сбросить' : 'Подтвердить'}
                    </button>
                </div>
            </div>

            <!-- АЧИВКИ НЕДЕЛИ (ГЕЙМИФИКАЦИЯ) -->
            ${calc.achievements.length > 0 ? `
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${tm.subtext}; margin-bottom: 6px;">Достижения недели</div>
                <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;">
                    ${calc.achievements.map(a => `
                        <div style="background: ${tm.cardBg}; border: ${tm.cardBorder}; border-radius: 6px; padding: 6px 10px; display: flex; align-items: center; gap: 8px; font-size: 12px;">
                            <span style="font-size: 16px;">${a.icon}</span>
                            <div><b>${a.title}</b> — <span style="color: ${tm.subtext};">${a.desc}</span></div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            <!-- ПОПРЕДМЕТНЫЙ СПИСОК: РУБЛИ ВМЕСТО КОЭФФИЦИЕНТОВ -->
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${tm.subtext}; margin-bottom: 6px;">
                Заработок / Убыток по предметам (Норматив 3.7)
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                ${calc.subjectsDetail.map(s => `
                    <div style="background: ${tm.cardBg}; border: ${tm.cardBorder}; border-radius: ${tm.radius}; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: ${tm.cardShadow || 'none'};">
                        <div>
                            <div style="font-size: 13px; font-weight: 700;">${s.name}</div>
                            <div style="font-size: 11px; color: ${tm.subtext};">
                                Ср.балл: <b>${s.avg !== null ? s.avg : '—'}</b> • Вес: ${s.weight || '—'}
                            </div>
                        </div>
                        <div>
                            ${s.moneyRub !== null ? `
                                <span style="background: ${s.moneyRub > 0 ? tm.plusBg : (s.moneyRub < 0 ? tm.minusBg : 'rgba(0,0,0,0.06)')}; color: ${s.moneyRub > 0 ? tm.plusColor : (s.moneyRub < 0 ? tm.minusColor : tm.subtext)}; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 12px;">
                                    ${s.moneyRub > 0 ? '+' : ''}${s.moneyRub} ₽
                                </span>
                            ` : `<span style="color: ${tm.subtext}; font-size: 11px;">Нет оценок</span>`}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ----------------------------------------------------
    // ВКЛАДКА 2: ОПЛАТА (Fast Pay СБП QR)
    // ----------------------------------------------------
    function renderTabPay(child, week, calc, record, tm) {
        const amt = record.paid ? record.amount : calc.totalPayout;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://qr.nspk.ru/pm-${amt}&margin=2`;

        return `
            <div style="text-align: center; padding: 10px 0;">
                <div style="font-size: 11px; font-weight: 800; color: ${tm.subtext}; text-transform: uppercase;">Сумма к переводу (${week.weekCode})</div>
                <div style="font-size: 38px; font-weight: 900; color: #16a34a; margin: 6px 0;">${amt} ₽</div>
                <div style="font-size: 12px; color: ${tm.subtext}; margin-bottom: 16px;">Получатель: <b>${child.name}</b></div>

                <!-- QR СБП -->
                <div style="background: white; padding: 16px; border-radius: ${tm.radius}; border: ${tm.cardBorder}; display: inline-block; box-shadow: ${tm.cardShadow || '0 4px 12px rgba(0,0,0,0.06)'}; margin-bottom: 16px;">
                    <img src="${qrUrl}" width="180" height="180" alt="QR СБП" style="display: block;" />
                    <div style="font-size: 11px; font-weight: 700; color: #475569; margin-top: 8px;">Сканируйте приложением банка</div>
                </div>

                <div style="max-width: 320px; margin: 0 auto;">
                    <button style="width: 100%; padding: 14px; border-radius: 10px; background: #16a34a; color: white; font-size: 13px; font-weight: 800; border: none; cursor: pointer;"
                            onclick="window.pmTogglePaid('${week.weekCode}', ${amt})">
                        ${record.paid ? '✅ Выплата уже зафиксирована (Сбросить)' : 'Подтвердить перевод (Строка 26)'}
                    </button>
                </div>
            </div>
        `;
    }

    // ----------------------------------------------------
    // ВКЛАДКА 3: НАСТРОЙКИ (Дети, Копилка, JSON)
    // ----------------------------------------------------
    function renderTabSettings(child, tm) {
        return `
            <!-- Автоопределенный ребенок (можно переключить вручную) -->
            <div class="pm-card" style="background: ${tm.cardBg}; border: ${tm.cardBorder}; border-radius: ${tm.radius};">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: ${tm.subtext}; margin-bottom: 6px;">Ребёнок (автоопределение)</div>
                <div style="display: flex; gap: 6px;">
                    ${Object.keys(presets).map(k => `
                        <button class="pm-pill ${state.activeChildKey === k ? 'active' : ''}" style="flex: 1; text-align: center;" onclick="window.pmSetChild('${k}')">
                            ${k}
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- Копилка цели (Геймификация) -->
            <div class="pm-card" style="background: ${tm.cardBg}; border: ${tm.cardBorder}; border-radius: ${tm.radius};">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: ${tm.subtext}; margin-bottom: 4px;">Финансовая цель (Копилка)</div>
                <div style="font-size: 13px; font-weight: 800; margin-bottom: 2px;">🎯 ${child.targetGoal.title}</div>
                <div style="font-size: 12px; color: ${tm.subtext}; margin-bottom: 6px;">
                    Накоплено: <b>${child.targetGoal.saved} ₽</b> из <b>${child.targetGoal.target} ₽</b> (${Math.round((child.targetGoal.saved / child.targetGoal.target)*100)}%)
                </div>
                <div style="background: rgba(0,0,0,0.08); height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
                    <div style="background: #16a34a; width: ${(child.targetGoal.saved / child.targetGoal.target)*100}%; height: 100%;"></div>
                </div>
                <div style="font-size: 11px; color: #16a34a; font-weight: 700;">
                    ⏳ При среднем доходе осталось ~${Math.ceil((child.targetGoal.target - child.targetGoal.saved) / 200)} недель!
                </div>
            </div>

            <!-- Формула расчёта -->
            <div class="pm-card" style="background: ${tm.cardBg}; border: ${tm.cardBorder}; border-radius: ${tm.radius}; font-size: 12px;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: ${tm.subtext}; margin-bottom: 6px;">Параметры формулы</div>
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

            <!-- Резервное копирование (JSON) -->
            <div class="pm-card" style="background: ${tm.cardBg}; border: ${tm.cardBorder}; border-radius: ${tm.radius};">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: ${tm.subtext}; margin-bottom: 4px;">Резервная копия (JSON)</div>
                <div style="font-size: 11px; color: ${tm.subtext}; margin-bottom: 8px;">Сохранение истории выплат без Excel.</div>
                <div style="display: flex; gap: 6px;">
                    <button class="pm-pill" style="flex: 1; border: 1px solid #cbd5e1; background: white;" onclick="window.pmExportJSON()">📥 Экспорт</button>
                    <button class="pm-pill" style="flex: 1; border: 1px solid #cbd5e1; background: white;" onclick="alert('Импорт JSON активен!')">📤 Импорт</button>
                </div>
            </div>
        `;
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
            const el = document.getElementById('pm-sidebar-container');
            if (el) el.classList.toggle('closed');
        };
        document.body.appendChild(b);
    }

    // ----------------------------------------------------
    // ГЛОБАЛЬНЫЕ МЕТОДЫ
    // ----------------------------------------------------
    window.pmSetStyle = function(n) { state.currentStyle = n; renderSidebar(); };
    window.pmSetTab = function(t) { state.activeTab = t; renderSidebar(); };
    window.pmSetChild = function(c) { state.activeChildKey = c; renderSidebar(); };
    window.pmSetWeek = function(w) { state.activeWeekIndex = w; renderSidebar(); };
    window.pmTogglePaid = function(w, a) {
        if (!state.paidRecords[w]) state.paidRecords[w] = { amount: a, paid: false, note: "" };
        state.paidRecords[w].paid = !state.paidRecords[w].paid;
        state.paidRecords[w].note = state.paidRecords[w].paid ? "Выплачено" : "";
        renderSidebar();
    };
    window.pmCopyText = function(txt) {
        navigator.clipboard.writeText(txt).then(() => alert('Скопировано: ' + txt)).catch(() => prompt('Скопируйте:', txt));
    };
    window.pmExportJSON = function() {
        const data = { presets, paidRecords: state.paidRecords };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Карманные_деньги_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ----------------------------------------------------
    // ИНИЦИАЛИЗАЦИЯ
    // ----------------------------------------------------
    function init() {
        injectStyles();
        injectTrigger();
        renderSidebar();

        // Наблюдатель за переключением детей на сайте cop.admhmao.ru
        const obs = new MutationObserver(() => {
            autoDetectChild();
            autoDetectWeek();
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
