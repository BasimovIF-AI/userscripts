// ==UserScript==
// @name         Карманные деньги из электронного дневника
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Нативная вкладка «💰 Карманные деньги» прямо в синем меню рядом с «Дневником» (Smart Ledger + Kid Motivation + Fast Pay QR + JSON Бэкап)
// @author       Senior Software Engineer
// @match        https://cop.admhmao.ru/journal-app/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const APP_VERSION = "1.0.0";
    const STORAGE_KEY = 'school_pocket_money_ledger_v1';
    const DEMO_STORAGE_KEY = 'school_pocket_money_demo_mode';

    // Конфигурация детей и предметов
    const presets = {
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
                { name: "Разговоры о важном", coeff: 0.5 },
                { name: "Русский язык", coeff: 2.0 },
                { name: "Труд", coeff: 0.5 },
                { name: "Физкультура", coeff: 0.5 },
                { name: "Функциональная грамотность", coeff: 0.5 }
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
                { name: "ИЗО", coeff: 0.5 },
                { name: "История", coeff: 1.0 },
                { name: "Курс я гражданин России", coeff: 0.5 },
                { name: "Литература", coeff: 1.0 },
                { name: "Математика", coeff: 2.0 },
                { name: "Музыка", coeff: 0.5 },
                { name: "Разговоры о важном", coeff: 0.5 },
                { name: "Россия -мои горизонты", coeff: 0.5 },
                { name: "Русский язык", coeff: 2.0 },
                { name: "Труд", coeff: 0.5 },
                { name: "Физкультура", coeff: 0.5 },
                { name: "Функциональная грамотность", coeff: 0.5 }
            ]
        },
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
        }
    };

    // Реалистичные демо-данные (недели С1, С2, С3)
    const DEMO_WEEKS_JULIANA = [
        {
            weekCode: "С1",
            dateRange: "1 сен – 7 сен",
            marks: {
                "Геометрия": { weightedSum: 4.0, totalWeight: 1.0 },
                "ОБЗР": { weightedSum: 4.0, totalWeight: 1.0 },
                "Физика": { weightedSum: 4.0, totalWeight: 1.0 }
            }
        },
        {
            weekCode: "С2",
            dateRange: "8 сен – 14 сен",
            marks: {
                "Алгебра": { weightedSum: 5.0, totalWeight: 1.0 },
                "Англ. яз.": { weightedSum: 6.0, totalWeight: 2.0 },
                "Биология": { weightedSum: 4.0, totalWeight: 1.0 },
                "География": { weightedSum: 4.0, totalWeight: 1.0 },
                "Информатика": { weightedSum: 3.0, totalWeight: 1.0 },
                "Русский язык": { weightedSum: 4.0, totalWeight: 1.0 },
                "Физика": { weightedSum: 2.0, totalWeight: 1.0 },
                "Физкультура": { weightedSum: 4.0, totalWeight: 1.0 },
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
                "Информатика": { weightedSum: 4.0, totalWeight: 1.0 },
                "История": { weightedSum: 4.0, totalWeight: 1.0 },
                "Музыка": { weightedSum: 4.0, totalWeight: 1.0 },
                "ОБЗР": { weightedSum: 4.0, totalWeight: 1.0 },
                "Обществознание": { weightedSum: 3.0, totalWeight: 1.0 },
                "Русский язык": { weightedSum: 5.0, totalWeight: 2.0 },
                "Труд": { weightedSum: 5.0, totalWeight: 1.0 },
                "Физика": { weightedSum: 4.0, totalWeight: 1.0 },
                "Физкультура": { weightedSum: 9.0, totalWeight: 2.0 },
                "Химия": { weightedSum: 4.0, totalWeight: 1.0 }
            }
        }
    ];

    // Smart Ledger (LocalStorage)
    class LedgerStorage {
        static load() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) return JSON.parse(raw);
            } catch (e) {
                console.error("Ошибка чтения ledger:", e);
            }
            return {
                "Юлиана": {
                    weeks: {
                        "С1": { status: "paid", calculatedAmount: 212, paidAmount: 182, paidAt: "2026-09-08", note: "Выплачено (перерасчет)" },
                        "С2": { status: "paid", calculatedAmount: 225, paidAmount: 198, paidAt: "2026-09-15", note: "Выплачено" },
                        "С3": { status: "paid", calculatedAmount: 239, paidAmount: 230, paidAt: "2026-09-22", note: "Выплачено" }
                    }
                },
                "Артём": { weeks: {} },
                "Диана": { weeks: {} }
            };
        }

        static save(data) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (e) {
                console.error("Ошибка сохранения ledger:", e);
            }
        }

        static getWeekRecord(childKey, weekCode) {
            const data = this.load();
            if (data[childKey] && data[childKey].weeks && data[childKey].weeks[weekCode]) {
                return data[childKey].weeks[weekCode];
            }
            return null;
        }

        static setWeekPaid(childKey, weekCode, calculatedAmount, paidAmount, note = "") {
            const data = this.load();
            if (!data[childKey]) data[childKey] = { weeks: {} };
            if (!data[childKey].weeks) data[childKey].weeks = {};
            data[childKey].weeks[weekCode] = {
                status: "paid",
                calculatedAmount: Number(calculatedAmount),
                paidAmount: Number(paidAmount),
                paidAt: new Date().toISOString().split('T')[0],
                note: note || "Выплачено"
            };
            this.save(data);
        }

        static unmarkWeekPaid(childKey, weekCode) {
            const data = this.load();
            if (data[childKey] && data[childKey].weeks && data[childKey].weeks[weekCode]) {
                delete data[childKey].weeks[weekCode];
                this.save(data);
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
                        alert("Ошибка чтения JSON файла: " + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }
    }

    // Вычислительное ядро
    class PocketMoneyEngine {
        static calculate(preset, weekMarks) {
            const zeroMark = preset.zeroMark;
            const baseIncome = Math.round(preset.age * preset.inflationCoeff * 100) / 100; // B24 = A25 * A26

            let sumDeltaCoeff = 0;
            const subjectsDetail = [];

            preset.subjects.forEach(subj => {
                const parsed = weekMarks ? weekMarks[subj.name] : null;
                if (!parsed || !parsed.totalWeight) {
                    subjectsDetail.push({
                        name: subj.name,
                        coeff: subj.coeff,
                        weightedSum: null,
                        totalWeight: null,
                        avg: null,
                        deltaCoeff: null,
                        status: 'no_marks'
                    });
                    return;
                }

                const F = parsed.weightedSum;
                const G = parsed.totalWeight;
                const avg = F / G;
                // Формула: =(F/G - ZeroMark) * Coeff * G
                const delta = (avg - zeroMark) * subj.coeff * G;
                const roundedDelta = Math.round(delta * 10) / 10;
                sumDeltaCoeff += roundedDelta;

                subjectsDetail.push({
                    name: subj.name,
                    coeff: subj.coeff,
                    weightedSum: F,
                    totalWeight: G,
                    avg: Math.round(avg * 100) / 100,
                    deltaCoeff: roundedDelta,
                    status: roundedDelta > 0 ? 'bonus' : (roundedDelta < 0 ? 'penalty' : 'neutral')
                });
            });

            sumDeltaCoeff = Math.round(sumDeltaCoeff * 10) / 10; // Строка 23
            const rawEarnings = (baseIncome * 0.2) * sumDeltaCoeff;
            const pureEarnings = Math.round(rawEarnings); // Строка 24
            const totalPayout = Math.max(0, Math.round(baseIncome + pureEarnings)); // Строка 25

            return {
                baseIncome,
                sumDeltaCoeff,
                pureEarnings,
                totalPayout,
                subjectsDetail,
                zeroMark,
                age: preset.age,
                inflationCoeff: preset.inflationCoeff
            };
        }
    }

    // Fast Pay QR
    class MiniQR {
        static generateSVG(text, size = 150) {
            const encoded = encodeURIComponent(text);
            const qrUri = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&margin=2`;
            return `<img src="${qrUri}" width="${size}" height="${size}" alt="QR СБП" style="border-radius: 8px; border: 1px solid #e2e8f0; display: block; margin: 0 auto;" />`;
        }
    }

    // Состояние приложения
    const state = {
        activeChildKey: "Диана",
        activeWeekIndex: 2, // С3 по умолчанию
        isDemoMode: localStorage.getItem(DEMO_STORAGE_KEY) !== "false",
        weeksData: DEMO_WEEKS_JULIANA,
        isOpen: false
    };

    // Определение выбранного ребенка по блоку .selection
    function detectSelectedChild() {
        const selectedEl = document.querySelector('.selection .selected');
        if (selectedEl) {
            const text = selectedEl.textContent.trim();
            for (const key of Object.keys(presets)) {
                if (text.includes(key)) return key;
            }
        }
        return "Диана";
    }

    // Парсер оценок с открытой страницы dnevnik
    function scrapePageGrades() {
        const marksData = {};
        const days = document.querySelectorAll('.dnevnik-day');
        days.forEach(day => {
            day.querySelectorAll('.dnevnik-lesson').forEach(lesson => {
                const subjectElement = lesson.querySelector('.js-rt_licey-dnevnik-subject');
                const subject = subjectElement ? subjectElement.textContent.trim() : 'Неизвестный предмет';

                lesson.querySelectorAll('.dnevnik-mark__value').forEach(mark => {
                    const rawValue = mark.getAttribute('value');
                    if (!rawValue) return;

                    const weightElement = mark.querySelector('.dnevnik-mark__weight');
                    let weight = 1;
                    if (weightElement) {
                        const weightText = weightElement.textContent.trim();
                        const match = weightText.match(/×(\d+(\.\d+)?)/);
                        if (match && match[1]) weight = parseFloat(match[1]);
                    }

                    rawValue.split('/').forEach(mStr => {
                        const val = parseFloat(mStr.trim());
                        if (isNaN(val)) return;
                        if (!marksData[subject]) marksData[subject] = { weightedSum: 0, totalWeight: 0 };
                        marksData[subject].weightedSum += val * weight;
                        marksData[subject].totalWeight += weight;
                    });
                });
            });
        });
        return marksData;
    }

    // Внедрение стилей Native Tab
    function injectStyles() {
        if (document.getElementById('pm-native-styles')) return;
        const style = document.createElement('style');
        style.id = 'pm-native-styles';
        style.textContent = `
            #pm-dashboard-root {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background: #ffffff;
                border-radius: 8px;
                border: 1px solid #e2e8f0;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
                margin: 16px 0;
                width: 100%;
                box-sizing: border-box;
                padding: 24px;
                color: #1e293b;
                display: none;
            }
            .pm-header-bar {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                padding-bottom: 20px;
                border-bottom: 2px solid #e2e8f0;
                margin-bottom: 24px;
            }
            .pm-child-badge {
                font-size: 20px;
                font-weight: 800;
                color: #0f172a;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .pm-toolbar-actions {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 10px;
            }
            .pm-btn {
                padding: 8px 14px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                border: 1px solid #cbd5e1;
                background: white;
                color: #334155;
            }
            .pm-btn:hover { background: #f8fafc; border-color: #94a3b8; }
            .pm-btn-primary { background: #0284c7; color: white; border: none; }
            .pm-btn-primary:hover { background: #0369a1; }
            .pm-btn-success { background: #16a34a; color: white; border: none; }
            .pm-btn-success:hover { background: #15803d; }

            .pm-week-selector {
                display: flex;
                gap: 8px;
                margin-bottom: 20px;
                overflow-x: auto;
            }
            .pm-week-pill {
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                background: #f1f5f9;
                color: #475569;
                border: 1px solid #cbd5e1;
                transition: all 0.2s;
            }
            .pm-week-pill.active { background: #0284c7; color: white; border-color: #0284c7; }
            .pm-week-pill.is-paid { border: 2px solid #22c55e; }

            .pm-grid-layout {
                display: grid;
                grid-template-columns: 1fr 340px;
                gap: 24px;
            }

            .pm-card {
                background: white;
                border-radius: 8px;
                padding: 18px;
                border: 1px solid #e2e8f0;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
            }

            .pm-badge-bonus { background: #dcfce7; color: #15803d; padding: 2px 7px; border-radius: 4px; font-weight: 700; }
            .pm-badge-penalty { background: #fee2e2; color: #b91c1c; padding: 2px 7px; border-radius: 4px; font-weight: 700; }
            .pm-badge-neutral { background: #f1f5f9; color: #64748b; padding: 2px 7px; border-radius: 4px; font-weight: 600; }

            /* Стиль нативной кнопки в синей строке #mainmenu */
            .navigation-main__item.pm-wallet-tab {
                flex-shrink: 0 !important;
                white-space: nowrap !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                font-weight: 700 !important;
                background: rgba(255, 255, 255, 0.18) !important;
                border-radius: 4px !important;
                margin: 0 4px !important;
                padding: 0 14px !important;
                color: #ffffff !important;
                transition: background 0.2s !important;
            }
            .navigation-main__item.pm-wallet-tab:hover {
                background: rgba(255, 255, 255, 0.3) !important;
            }
            .navigation-main__item.pm-wallet-tab.active {
                background: rgba(255, 255, 255, 0.42) !important;
                box-shadow: inset 0 -3px 0 #facc15 !important;
            }

            /* Модалка изменения строки 26 */
            .pm-modal-overlay {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(15, 23, 42, 0.65);
                display: flex; align-items: center; justify-content: center;
                z-index: 1000000;
            }
            .pm-modal {
                background: white; border-radius: 12px; padding: 24px;
                max-width: 440px; width: 90%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.25);
            }
            .pm-modal h3 { margin-top: 0; margin-bottom: 14px; font-size: 18px; color: #0f172a; }
            .pm-input {
                width: 100%; padding: 10px; border-radius: 6px;
                border: 1px solid #cbd5e1; margin-bottom: 14px; font-size: 14px; box-sizing: border-box;
            }
        `;
        document.head.appendChild(style);
    }

    // Рендер экрана Native Tab
    function renderDashboardContent() {
        const root = document.getElementById('pm-dashboard-root');
        if (!root) return;

        state.activeChildKey = detectSelectedChild();
        const child = presets[state.activeChildKey] || presets["Диана"];
        const week = state.weeksData[state.activeWeekIndex] || state.weeksData[0];
        const calc = PocketMoneyEngine.calculate(child, week.marks);

        const record = LedgerStorage.getWeekRecord(state.activeChildKey, week.weekCode);
        const isPaid = record && record.status === 'paid';
        const paidAmount = isPaid ? record.paidAmount : calc.totalPayout;

        const comment = `Карманные деньги ${child.name} за неделю ${week.weekCode}`;
        const sbpText = `СБП: Перевод ${paidAmount} ₽. Получатель: ${child.name}. Назначение: ${comment}`;

        // Расчет копилки (40% в копилку)
        const toSavings = Math.round(paidAmount * 0.4);
        const toWallet = paidAmount - toSavings;
        const goalPercent = Math.min(100, Math.round((child.targetGoal.saved / child.targetGoal.target) * 100));

        root.innerHTML = `
            <!-- Шапка дашборда -->
            <div class="pm-header-bar">
                <div class="pm-child-badge">
                    <span>💰 Карманные деньги: <b>${child.name}</b></span>
                    <span style="font-size: 13px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 4px 10px; border-radius: 12px;">
                        ${child.classNum} класс (${child.age} лет)
                    </span>
                </div>

                <div class="pm-toolbar-actions">
                    <button class="pm-btn" onclick="window.pmToggleDemoMode()">
                        ${state.isDemoMode ? '🧪 Режим: Демо (С1-С3)' : '🎓 Режим: Дневник онлайн'}
                    </button>
                    <button class="pm-btn" onclick="window.pmExportJSON()" title="Скачать резервную копию JSON">📥 Экспорт JSON</button>
                    <button class="pm-btn" onclick="window.pmImportJSON()" title="Восстановить историю из JSON">📤 Импорт JSON</button>
                    <button class="pm-btn" onclick="window.pmCloseTab()" title="Вернуться к дневнику" style="font-weight: 700;">✕ Закрыть</button>
                </div>
            </div>

            <!-- Пилюли недель -->
            <div class="pm-week-selector">
                ${state.weeksData.map((w, idx) => {
                    const rec = LedgerStorage.getWeekRecord(state.activeChildKey, w.weekCode);
                    const paid = rec && rec.status === 'paid';
                    return `
                        <button class="pm-week-pill ${idx === state.activeWeekIndex ? 'active' : ''} ${paid ? 'is-paid' : ''}" onclick="window.pmSelectWeek(${idx})">
                            ${paid ? '✅ ' : ''}Неделя ${w.weekCode}
                        </button>
                    `;
                }).join('')}
            </div>

            <!-- Основная сетка -->
            <div class="pm-grid-layout">
                <!-- Левая зона: Расчет + Оценки + Smart Ledger -->
                <div>
                    <!-- 3 Карточки итогов -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 20px;">
                        <div class="pm-card" style="border-left: 4px solid #0284c7;">
                            <div style="font-size: 12px; color: #64748b; font-weight: 600;">Базовый доход (A25×A26)</div>
                            <div style="font-size: 24px; font-weight: 800; margin-top: 4px;">${calc.baseIncome} ₽</div>
                            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${child.age} лет × ${child.inflationCoeff}</div>
                        </div>

                        <div class="pm-card" style="border-left: 4px solid #16a34a;">
                            <div style="font-size: 12px; color: #64748b; font-weight: 600;">Заработок за оценки (стр. 24)</div>
                            <div style="font-size: 24px; font-weight: 800; margin-top: 4px; color: ${calc.pureEarnings >= 0 ? '#16a34a' : '#dc2626'};">
                                ${calc.pureEarnings >= 0 ? '+' : ''}${calc.pureEarnings} ₽
                            </div>
                            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Коэф недели: ${calc.sumDeltaCoeff}</div>
                        </div>

                        <div class="pm-card" style="border-left: 4px solid #6366f1; background: #f8fafc;">
                            <div style="font-size: 12px; color: #64748b; font-weight: 600;">Итого к выплате (стр. 25)</div>
                            <div style="font-size: 26px; font-weight: 900; color: #0284c7; margin-top: 4px;">${calc.totalPayout} ₽</div>
                            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Целевой балл: ${child.zeroMark}</div>
                        </div>
                    </div>

                    <!-- Таблица предметов недели -->
                    <div class="pm-card" style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div style="font-weight: 700; font-size: 15px;">📚 Оценки и дельта недели (${week.weekCode})</div>
                            <span style="font-size: 12px; color: #64748b;">Формула: (Балл - 3.7) × Вес × Коэф</span>
                        </div>
                        <div style="max-height: 380px; overflow-y: auto;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <thead>
                                    <tr style="border-bottom: 2px solid #e2e8f0; color: #64748b; text-align: left;">
                                        <th style="padding: 8px;">Предмет</th>
                                        <th style="padding: 8px; text-align: center;">Коэф (A)</th>
                                        <th style="padding: 8px; text-align: center;">Ср. балл</th>
                                        <th style="padding: 8px; text-align: center;">Вес (G)</th>
                                        <th style="padding: 8px; text-align: right;">Дельта (H)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${calc.subjectsDetail.map(s => `
                                        <tr style="border-bottom: 1px solid #f1f5f9;">
                                            <td style="padding: 8px; font-weight: 600;">${s.name}</td>
                                            <td style="padding: 8px; text-align: center; color: #64748b;">${s.coeff}</td>
                                            <td style="padding: 8px; text-align: center;">${s.avg !== null ? s.avg : '—'}</td>
                                            <td style="padding: 8px; text-align: center; color: #64748b;">${s.totalWeight !== null ? s.totalWeight : '—'}</td>
                                            <td style="padding: 8px; text-align: right;">
                                                ${s.deltaCoeff !== null ? `
                                                    <span class="${s.deltaCoeff > 0 ? 'pm-badge-bonus' : (s.deltaCoeff < 0 ? 'pm-badge-penalty' : 'pm-badge-neutral')}">
                                                        ${s.deltaCoeff > 0 ? '+' : ''}${s.deltaCoeff}
                                                    </span>
                                                ` : '<span style="color: #cbd5e1;">—</span>'}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Smart Ledger: Факт выплаты (строка 26) -->
                    <div class="pm-card" style="background: #f8fafc;">
                        <div style="font-weight: 700; font-size: 14px; margin-bottom: 10px;">📋 Журнал выплат (Строка 26)</div>
                        ${isPaid ? `
                            <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 14px; display: flex; align-items: center; justify-content: space-between;">
                                <div>
                                    <div style="color: #166534; font-weight: 800; font-size: 16px;">✅ Выплачено: ${paidAmount} ₽</div>
                                    <div style="color: #64748b; font-size: 12px; margin-top: 2px;">
                                        Дата перевода: ${record.paidAt || 'Зафиксировано'} • Примечание: <i>${record.note || 'Выплачено'}</i>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button class="pm-btn" onclick="window.pmOpenEditModal('${week.weekCode}', ${calc.totalPayout}, ${paidAmount})">✏️ Изменить</button>
                                    <button class="pm-btn" style="color: #dc2626;" onclick="window.pmCancelPaid('${week.weekCode}')">Сбросить</button>
                                </div>
                            </div>
                        ` : `
                            <div style="display: flex; gap: 12px; align-items: center;">
                                <button class="pm-btn pm-btn-success" onclick="window.pmMarkPaid('${week.weekCode}', ${calc.totalPayout})" style="flex: 1; padding: 12px; font-size: 15px; font-weight: 700;">
                                    ✅ Подтвердить выплату (${calc.totalPayout} ₽)
                                </button>
                                <button class="pm-btn" onclick="window.pmOpenEditModal('${week.weekCode}', ${calc.totalPayout}, ${calc.totalPayout})" title="Ввести другую сумму вручную (например при дне рождения)">
                                    ✏️ Ручная сумма
                                </button>
                            </div>
                        `}
                    </div>
                </div>

                <!-- Правая зона: Fast Pay QR + Kid Motivation Mode -->
                <div style="display: flex; flex-direction: column; gap: 18px;">
                    <!-- Fast Pay QR -->
                    <div class="pm-card" style="text-align: center;">
                        <div style="font-size: 12px; font-weight: 800; color: #64748b; text-transform: uppercase;">🚀 Оплата по СБП (Fast Pay)</div>
                        <div style="font-size: 32px; font-weight: 900; color: #16a34a; margin: 8px 0;">${paidAmount} ₽</div>
                        <div style="margin-bottom: 14px;">
                            ${MiniQR.generateSVG(sbpText, 150)}
                        </div>
                        <div style="display: flex; gap: 8px; justify-content: center;">
                            <button class="pm-btn pm-btn-primary" onclick="window.pmCopyText('${paidAmount}')" style="font-size: 13px;">📋 Сумму</button>
                            <button class="pm-btn" onclick="window.pmCopyText('${comment}')" style="font-size: 13px;">💬 Назначение</button>
                        </div>
                    </div>

                    <!-- Kid Motivation Mode: Целевая копилка -->
                    <div class="pm-card" style="background: #f0fdf4; border: 1px solid #a7f3d0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 11px; font-weight: 800; color: #047857; text-transform: uppercase;">🎯 Мечта и копилка</div>
                                <div style="font-size: 16px; font-weight: 800; color: #065f46; margin: 2px 0;">${child.targetGoal.title}</div>
                                <div style="font-size: 12px; color: #047857;">Собрано: ${child.targetGoal.saved} ₽ из ${child.targetGoal.target} ₽ (${goalPercent}%)</div>
                            </div>
                            <span style="font-size: 32px;">🐷</span>
                        </div>
                        <div style="margin-top: 10px; height: 10px; background: #d1fae5; border-radius: 5px; overflow: hidden;">
                            <div style="width: ${goalPercent}%; height: 100%; background: #10b981;"></div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; text-align: center; font-size: 12px;">
                            <div style="background: white; padding: 6px; border-radius: 6px; border: 1px solid #a7f3d0;">
                                <span style="color: #64748b;">В копилку (40%):</span><br/><b>+${toSavings} ₽</b>
                            </div>
                            <div style="background: white; padding: 6px; border-radius: 6px; border: 1px solid #a7f3d0;">
                                <span style="color: #64748b;">На карманные:</span><br/><b>${toWallet} ₽</b>
                            </div>
                        </div>
                    </div>

                    <!-- Kid Motivation Mode: Лидеры недели -->
                    <div class="pm-card">
                        <div style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">🌟 Достижения недели</div>
                        <div style="background: #f0fdf4; border-radius: 6px; padding: 8px; margin-bottom: 8px; font-size: 12px;">
                            <span style="font-weight: 700; color: #166534;">🏆 Лидеры по баллам:</span><br/>
                            ${calc.subjectsDetail.filter(s => s.deltaCoeff > 0).slice(0, 3).map(s => `• ${s.name} (+${s.deltaCoeff})`).join('<br/>') || 'Пока нет оценок выше 3.7'}
                        </div>
                        <div style="background: #fffbeb; border-radius: 6px; padding: 8px; font-size: 12px;">
                            <span style="font-weight: 700; color: #b45309;">🎯 Точки роста:</span><br/>
                            ${calc.subjectsDetail.filter(s => s.deltaCoeff < 0).slice(0, 2).map(s => `• ${s.name} (${s.deltaCoeff})`).join('<br/>') || 'Все предметы выше норматива 3.7! 🎉'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Показ нативной страницы дашборда
    function showNativeDashboard() {
        state.isOpen = true;
        let root = document.getElementById('pm-dashboard-root');

        if (!root) {
            root = document.createElement('div');
            root.id = 'pm-dashboard-root';

            // Монтируем строго под полосу выбора детей .selection
            const selectionBar = document.querySelector('.selection');
            if (selectionBar && selectionBar.parentElement) {
                selectionBar.parentElement.insertBefore(root, selectionBar.nextSibling);
            } else {
                const dnevnik = document.querySelector('.dnevnik');
                if (dnevnik && dnevnik.parentElement) {
                    dnevnik.parentElement.insertBefore(root, dnevnik);
                } else {
                    document.body.appendChild(root);
                }
            }
        }

        renderDashboardContent();
        root.style.display = 'block';

        // Скрываем фиолетовый баннер Сферума и дневник
        const hideTargets = document.querySelectorAll('.dnevnik, [class*="banner"], [class*="sferum"], .dnevnik-container, .navigation-tabs');
        hideTargets.forEach(el => {
            if (el !== root && !root.contains(el)) {
                el.setAttribute('data-pm-hidden', 'true');
                el.style.display = 'none';
            }
        });

        // Подсвечиваем нашу вкладку
        const tab = document.getElementById('pm-native-tab');
        if (tab) tab.classList.add('active');

        // Снимаем подсветку со штатных пунктов синего меню
        const mainNav = document.getElementById('mainmenu') || document.querySelector('.navigation-main');
        if (mainNav) {
            mainNav.querySelectorAll('.navigation-main__item').forEach(item => {
                if (item.id !== 'pm-native-tab') {
                    item.classList.remove('active');
                }
            });
        }
    }

    // Скрытие нативной страницы дашборда
    function hideNativeDashboard() {
        state.isOpen = false;
        const root = document.getElementById('pm-dashboard-root');
        if (root) root.style.display = 'none';

        // Восстанавливаем скрытые блоки
        document.querySelectorAll('[data-pm-hidden="true"]').forEach(el => {
            el.style.display = '';
            el.removeAttribute('data-pm-hidden');
        });

        const tab = document.getElementById('pm-native-tab');
        if (tab) tab.classList.remove('active');

        // Возвращаем подсветку Дневнику
        const mainNav = document.getElementById('mainmenu') || document.querySelector('.navigation-main');
        if (mainNav) {
            const dnevnikItem = Array.from(mainNav.querySelectorAll('.navigation-main__item')).find(el => el.textContent.includes('Дневник'));
            if (dnevnikItem) dnevnikItem.classList.add('active');
        }
    }

    // Внедрение вкладки в видимую синюю панель #mainmenu строго рядом с «Дневником»
    function injectNativeMenuTab() {
        if (document.getElementById('pm-native-tab')) return;

        const mainNav = document.getElementById('mainmenu') || document.querySelector('.navigation-main');
        if (!mainNav) return;

        const tabBtn = document.createElement('a');
        tabBtn.href = 'javascript:void(0)';
        tabBtn.id = 'pm-native-tab';
        tabBtn.rel = 'nofollow';
        tabBtn.className = 'navigation-main__item pm-wallet-tab';
        tabBtn.innerHTML = '<i class="fas fa-wallet" style="color: #facc15; margin-right: 6px; font-size: 14px;"></i>💰 Карманные деньги';

        tabBtn.onclick = (e) => {
            e.preventDefault();
            if (state.isOpen) {
                hideNativeDashboard();
            } else {
                showNativeDashboard();
            }
        };

        // Вставляем строго рядом с пунктом «Дневник» в синей навигации
        const dnevnikItem = Array.from(mainNav.querySelectorAll('.navigation-main__item')).find(el => el.textContent.includes('Дневник'));
        if (dnevnikItem) {
            dnevnikItem.after(tabBtn);
        } else {
            mainNav.appendChild(tabBtn);
        }

        // Вешаем слушатель на клики по остальным пунктам синего меню
        mainNav.querySelectorAll('.navigation-main__item, .navigation-main__home').forEach(item => {
            if (item.id === 'pm-native-tab' || item.hasAttribute('data-pm-listener')) return;
            item.setAttribute('data-pm-listener', 'true');
            item.addEventListener('click', () => {
                if (state.isOpen) hideNativeDashboard();
            });
        });
    }

    // Отслеживание переключения детей в блоке .selection
    function attachChildSelectionObserver() {
        const selectionBar = document.querySelector('.selection');
        if (!selectionBar || selectionBar.hasAttribute('data-pm-attached')) return;
        selectionBar.setAttribute('data-pm-attached', 'true');

        selectionBar.addEventListener('click', () => {
            setTimeout(() => {
                state.activeChildKey = detectSelectedChild();
                if (state.isOpen) {
                    renderDashboardContent();
                }
            }, 100);
        });
    }

    // ----------------------------------------------------
    // ГЛОБАЛЬНЫЕ МЕТОДЫ ДЛЯ КНОПОК
    // ----------------------------------------------------
    window.pmCloseTab = function() {
        hideNativeDashboard();
    };

    window.pmSelectWeek = function(idx) {
        state.activeWeekIndex = idx;
        renderDashboardContent();
    };

    window.pmToggleDemoMode = function() {
        state.isDemoMode = !state.isDemoMode;
        localStorage.setItem(DEMO_STORAGE_KEY, state.isDemoMode ? "true" : "false");
        if (state.isDemoMode) {
            state.weeksData = DEMO_WEEKS_JULIANA;
        } else {
            const liveMarks = scrapePageGrades();
            state.weeksData = [{
                weekCode: "Текущая",
                dateRange: "Дневник онлайн",
                marks: liveMarks
            }];
            state.activeWeekIndex = 0;
        }
        renderDashboardContent();
    };

    window.pmMarkPaid = function(weekCode, calculatedAmount) {
        LedgerStorage.setWeekPaid(state.activeChildKey, weekCode, calculatedAmount, calculatedAmount, "Выплачено");
        renderDashboardContent();
    };

    window.pmCancelPaid = function(weekCode) {
        if (confirm(`Сбросить отметку о выплате за неделю ${weekCode}?`)) {
            LedgerStorage.unmarkWeekPaid(state.activeChildKey, weekCode);
            renderDashboardContent();
        }
    };

    window.pmOpenEditModal = function(weekCode, calculated, currentPaid) {
        const modal = document.createElement('div');
        modal.className = 'pm-modal-overlay';
        modal.innerHTML = `
            <div class="pm-modal">
                <h3>Фиксация выплаты: Неделя ${weekCode}</h3>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 12px;">
                    Расчётная сумма по оценкам (строка 25): <b>${calculated} ₽</b>
                </div>
                <label style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px;">Фактически выплаченная сумма (строка 26):</label>
                <input id="pm-modal-amount" type="number" class="pm-input" value="${currentPaid}" />
                <label style="font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px;">Примечание (перерасчет на день рождения и т.д.):</label>
                <input id="pm-modal-note" type="text" class="pm-input" placeholder="Перерасчет" value="Выплачено" />
                <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px;">
                    <button class="pm-btn" onclick="this.closest('.pm-modal-overlay').remove()">Отмена</button>
                    <button class="pm-btn pm-btn-success" id="pm-modal-save">Сохранить</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#pm-modal-save').onclick = () => {
            const amount = modal.querySelector('#pm-modal-amount').value;
            const note = modal.querySelector('#pm-modal-note').value;
            LedgerStorage.setWeekPaid(state.activeChildKey, weekCode, calculated, amount, note);
            modal.remove();
            renderDashboardContent();
        };
    };

    window.pmCopyText = function(text) {
        navigator.clipboard.writeText(text).then(() => {
            alert(`Скопировано в буфер: ${text}`);
        }).catch(() => {
            prompt("Скопируйте вручную:", text);
        });
    };

    window.pmExportJSON = function() {
        LedgerStorage.exportBackup();
    };

    window.pmImportJSON = function() {
        LedgerStorage.importBackup(() => {
            renderDashboardContent();
        });
    };

    // ----------------------------------------------------
    // ИНИЦИАЛИЗАЦИЯ
    // ----------------------------------------------------
    function init() {
        injectStyles();
        injectNativeMenuTab();
        attachChildSelectionObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Наблюдатель за SPA-переходами сайта
    const observer = new MutationObserver(() => {
        if (!document.getElementById('pm-native-tab')) {
            injectNativeMenuTab();
        }
        attachChildSelectionObserver();
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
