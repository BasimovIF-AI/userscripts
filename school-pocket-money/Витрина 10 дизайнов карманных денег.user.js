// ==UserScript==
// @name         Витрина 10 дизайнов карманных денег
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Интерактивная витрина для наглядного выбора одного из 10 вариантов дизайна прямо на сайте cop.admhmao.ru
// @author       Senior Software Engineer
// @match        https://cop.admhmao.ru/journal-app/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let currentMode = 'tabs'; // 'tabs' или 'all'
    let currentDesign = 1;

    // Внедрение стилей
    function injectStyles() {
        if (document.getElementById('pm-showcase-styles')) return;
        const style = document.createElement('style');
        style.id = 'pm-showcase-styles';
        style.textContent = `
            #pm-floating-trigger {
                position: fixed;
                top: 16px;
                right: 16px;
                z-index: 999999;
                background: linear-gradient(135deg, #0284c7, #0369a1);
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px;
                font-weight: 700;
                padding: 10px 18px;
                border-radius: 30px;
                border: 2px solid white;
                cursor: pointer;
                box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
                display: flex;
                align-items: center;
                gap: 8px;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            #pm-floating-trigger:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
            }
            #pm-showcase-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(15, 23, 42, 0.75);
                backdrop-filter: blur(4px);
                z-index: 1000000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #1e293b;
            }
            .pm-modal-window {
                background: #f8fafc;
                width: 95%;
                max-width: 1160px;
                max-height: 92vh;
                border-radius: 16px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .pm-modal-header {
                background: white;
                padding: 16px 24px;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
            }
            .pm-nav-bar {
                background: #ffffff;
                padding: 10px 24px;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
                flex-shrink: 0;
            }
            .pm-nav-btn {
                padding: 7px 12px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 700;
                background: #f1f5f9;
                color: #475569;
                border: 1px solid #cbd5e1;
                cursor: pointer;
                transition: all 0.15s;
            }
            .pm-nav-btn:hover {
                background: #e0f2fe;
                color: #0284c7;
                border-color: #7dd3fc;
            }
            .pm-nav-btn.active {
                background: #0284c7;
                color: white;
                border-color: #0284c7;
            }
            .pm-modal-body {
                padding: 24px;
                overflow-y: auto;
                flex: 1;
            }
            .pm-card-wrapper {
                background: white;
                border-radius: 12px;
                padding: 20px;
                border: 1px solid #e2e8f0;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
                margin-bottom: 24px;
            }
            .pm-badge-title {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 14px;
                background: #e0f2fe;
                color: #0369a1;
                font-size: 12px;
                font-weight: 800;
                text-transform: uppercase;
                margin-bottom: 12px;
            }
            .pm-card {
                background: white;
                border-radius: 8px;
                padding: 14px;
                border: 1px solid #e2e8f0;
                box-shadow: 0 1px 3px rgba(0,0,0,0.03);
            }
            .pm-btn {
                padding: 7px 14px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                border: 1px solid #cbd5e1;
                background: white;
                color: #334155;
            }
            .pm-btn-primary { background: #0284c7; color: white; border: none; }
            .pm-btn-success { background: #16a34a; color: white; border: none; }
            .pm-badge-bonus { background: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
            .pm-badge-penalty { background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
            .pm-choose-btn {
                background: #f0fdf4;
                color: #166534;
                border: 1px solid #86efac;
                padding: 10px 16px;
                font-weight: 700;
                border-radius: 8px;
                width: 100%;
                margin-top: 16px;
                cursor: pointer;
                font-size: 14px;
                text-align: center;
                transition: all 0.2s;
            }
            .pm-choose-btn:hover {
                background: #dcfce7;
                border-color: #22c55e;
            }
        `;
        document.head.appendChild(style);
    }

    // Генерация HTML для всех 10 дизайнов
    function getDesignsHTML() {
        return `
            <!-- ДИЗАЙН 1 -->
            <div id="pm-sc-1" class="pm-card-wrapper">
                <div class="pm-badge-title">Вариант 1: Семейный штаб (Executive Split)</div>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
                    Слева: финансовые карточки недели и таблица предметов. Справа: QR-код быстрой оплаты СБП и блок лидеров недели.
                </div>
                <div style="display: grid; grid-template-columns: 1fr 310px; gap: 16px;">
                    <div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px;">
                            <div class="pm-card" style="border-left: 4px solid #0284c7;">
                                <div style="color: #64748b; font-size: 11px;">Базовый доход</div>
                                <div style="font-size: 20px; font-weight: 800; margin-top: 2px;">174.79 ₽</div>
                                <div style="font-size: 11px; color: #94a3b8;">14 лет × 12.485</div>
                            </div>
                            <div class="pm-card" style="border-left: 4px solid #16a34a;">
                                <div style="color: #64748b; font-size: 11px;">Премия за оценки</div>
                                <div style="font-size: 20px; font-weight: 800; color: #16a34a; margin-top: 2px;">+65 ₽</div>
                                <div style="font-size: 11px; color: #94a3b8;">Коэф недели: +1.9</div>
                            </div>
                            <div class="pm-card" style="border-left: 4px solid #6366f1; background: #f8fafc;">
                                <div style="color: #64748b; font-size: 11px;">Итого к выплате</div>
                                <div style="font-size: 22px; font-weight: 900; color: #0284c7; margin-top: 2px;">239 ₽</div>
                                <div style="font-size: 11px; color: #64748b;">Норматив: 3.7</div>
                            </div>
                        </div>

                        <div class="pm-card" style="margin-bottom: 14px;">
                            <div style="font-weight: 700; font-size: 14px; margin-bottom: 8px;">📚 Оценки недели (С3)</div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                                <thead>
                                    <tr style="border-bottom: 1px solid #cbd5e1; color: #64748b; text-align: left;">
                                        <th style="padding: 4px;">Предмет</th>
                                        <th style="padding: 4px; text-align: center;">Вес</th>
                                        <th style="padding: 4px; text-align: center;">Балл</th>
                                        <th style="padding: 4px; text-align: right;">Вклад</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 5px; font-weight: 600;">Алгебра</td><td style="padding: 5px; text-align: center;">2.0</td><td style="padding: 5px; text-align: center;">5.0</td><td style="padding: 5px; text-align: right;"><span class="pm-badge-bonus">+2.6</span></td></tr>
                                    <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 5px; font-weight: 600;">Химия</td><td style="padding: 5px; text-align: center;">1.0</td><td style="padding: 5px; text-align: center;">4.0</td><td style="padding: 5px; text-align: right;"><span class="pm-badge-bonus">+0.3</span></td></tr>
                                    <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 5px; font-weight: 600;">Русский язык</td><td style="padding: 5px; text-align: center;">2.0</td><td style="padding: 5px; text-align: center;">2.5</td><td style="padding: 5px; text-align: right;"><span class="pm-badge-penalty">-4.8</span></td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div>
                        <div class="pm-card" style="text-align: center; margin-bottom: 12px;">
                            <div style="font-size: 11px; font-weight: 700; color: #64748b;">БЫСТРЫЙ ПЕРЕВОД (FAST PAY)</div>
                            <div style="font-size: 24px; font-weight: 800; color: #16a34a; margin: 4px 0;">230 ₽</div>
                            <div style="width: 120px; height: 120px; background: #e2e8f0; margin: 0 auto 8px auto; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #64748b;">[QR СБП]</div>
                            <button class="pm-btn pm-btn-primary" style="width: 100%; font-size: 12px;">📋 Скопировать 230 ₽</button>
                        </div>
                    </div>
                </div>
                <button class="pm-choose-btn" onclick="window.pmSelectAndCopy(1)">👉 Выбрать Вариант 1 (Семейный штаб)</button>
            </div>

            <!-- ДИЗАЙН 2 -->
            <div id="pm-sc-2" class="pm-card-wrapper">
                <div class="pm-badge-title">Вариант 2: Финтех-Банк (Neobank Junior)</div>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
                    Стиль современных мобильных банков (Т-Банк / Сбер Джуниор): темная карта, крупные акценты баланса и прямой перевод по СБП.
                </div>
                <div style="max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #0284c7, #0f172a); border-radius: 14px; padding: 22px; color: white; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-size: 12px; color: #bae6fd;">Баланс за неделю С3</div>
                                <div style="font-size: 34px; font-weight: 900; margin: 4px 0;">239 ₽</div>
                                <div style="font-size: 12px; color: #e0f2fe;">Юлиана • Junior Card</div>
                            </div>
                            <span style="background: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">+65 ₽ премия</span>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
                        <div class="pm-card" style="text-align: center;"><div style="font-size: 11px; color: #64748b;">БАЗА</div><div style="font-size: 20px; font-weight: 700;">174.79 ₽</div></div>
                        <div class="pm-card" style="text-align: center;"><div style="font-size: 11px; color: #64748b;">ОЦЕНКИ</div><div style="font-size: 20px; font-weight: 700; color: #16a34a;">+65 ₽</div></div>
                    </div>
                    <div class="pm-card" style="text-align: center;">
                        <div style="font-size: 12px; color: #64748b; font-weight: 700;">QR СБП НА ОПЛАТУ</div>
                        <div style="font-size: 24px; font-weight: 800; color: #16a34a; margin: 6px 0;">230 ₽</div>
                        <div style="width: 130px; height: 130px; background: #e2e8f0; margin: 0 auto 10px auto; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #64748b;">[QR СБП]</div>
                        <button class="pm-btn pm-btn-success" style="padding: 9px 18px; font-weight: 700;">✅ Выплачено 230 ₽</button>
                    </div>
                </div>
                <button class="pm-choose-btn" onclick="window.pmSelectAndCopy(2)">👉 Выбрать Вариант 2 (Финтех-Банк)</button>
            </div>

            <!-- ДИЗАЙН 3 -->
            <div id="pm-sc-3" class="pm-card-wrapper">
                <div class="pm-badge-title">Вариант 3: RPG Профиль Героя (Hero Sheet & XP)</div>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
                    Геймифицированный детский стиль: аватар персонажа, уровень, шкала опыта за баллы выше 3.7, боевые ачивки и награда в золотых монетах.
                </div>
                <div style="background: #1e1e2f; color: #f8fafc; border-radius: 12px; padding: 18px;">
                    <div style="display: flex; gap: 14px; align-items: center; margin-bottom: 16px;">
                        <div style="width: 60px; height: 60px; border-radius: 50%; background: #6366f1; display: flex; align-items: center; justify-content: center; font-size: 30px; border: 2px solid #a855f7;">🧙‍♀️</div>
                        <div>
                            <div style="font-size: 20px; font-weight: 800; color: #fbbf24;">Герой: Юлиана</div>
                            <div style="font-size: 12px; color: #94a3b8;">Уровень 14 • Маг Знаний (Неделя С3)</div>
                            <div style="margin-top: 6px; width: 180px; height: 7px; background: #334155; border-radius: 4px; overflow: hidden;"><div style="width: 85%; height: 100%; background: #10b981;"></div></div>
                        </div>
                        <div style="margin-left: auto; text-align: right;">
                            <div style="font-size: 11px; color: #94a3b8;">Награда:</div>
                            <div style="font-size: 24px; font-weight: 900; color: #4ade80;">💰 239 ₽</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                        <div style="background: #27273f; padding: 10px; border-radius: 6px;"><div style="font-size: 12px;">⚔️ Сила недели</div><div style="color: #38bdf8; font-weight: 700;">+1.9 Коэф</div></div>
                        <div style="background: #27273f; padding: 10px; border-radius: 6px;"><div style="font-size: 12px;">🛡️ Стойкость</div><div style="color: #f59e0b; font-weight: 700;">174.79 База</div></div>
                        <div style="background: #27273f; padding: 10px; border-radius: 6px;"><div style="font-size: 12px;">🏆 Трофей</div><div style="color: #ec4899; font-weight: 700;">Алгебра (+2.6 XP)</div></div>
                    </div>
                </div>
                <button class="pm-choose-btn" onclick="window.pmSelectAndCopy(3)">👉 Выбрать Вариант 3 (RPG Герой)</button>
            </div>

            <!-- ДИЗАЙН 4 -->
            <div id="pm-sc-4" class="pm-card-wrapper">
                <div class="pm-badge-title">Вариант 4: Академический журнал (Data Grid Classic)</div>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
                    Строгая ведомость в стиле школьных таблиц со всеми формульными столбцами (A, B, F, G, H) и строками итогов 23–25.
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #cbd5e1;">
                    <thead style="background: #f1f5f9;">
                        <tr><th style="border: 1px solid #cbd5e1; padding: 5px;">Коэф (A)</th><th style="border: 1px solid #cbd5e1; padding: 5px; text-align: left;">Предмет (B)</th><th style="border: 1px solid #cbd5e1; padding: 5px;">Баллы (F)</th><th style="border: 1px solid #cbd5e1; padding: 5px;">Вес (G)</th><th style="border: 1px solid #cbd5e1; padding: 5px;">Дельта (H)</th></tr>
                    </thead>
                    <tbody>
                        <tr><td style="border: 1px solid #e2e8f0; padding: 5px; text-align: center;">2.0</td><td style="border: 1px solid #e2e8f0; padding: 5px; font-weight: 600;">Алгебра</td><td style="border: 1px solid #e2e8f0; padding: 5px; text-align: center;">5.0</td><td style="border: 1px solid #e2e8f0; padding: 5px; text-align: center;">1.0</td><td style="border: 1px solid #e2e8f0; padding: 5px; text-align: center; color: #16a34a; font-weight: 700;">+2.6</td></tr>
                        <tr><td style="border: 1px solid #e2e8f0; padding: 5px; text-align: center;">1.0</td><td style="border: 1px solid #e2e8f0; padding: 5px; font-weight: 600;">Химия</td><td style="border: 1px solid #e2e8f0; padding: 5px; text-align: center;">4.0</td><td style="border: 1px solid #e2e8f0; padding: 5px; text-align: center;">1.0</td><td style="border: 1px solid #e2e8f0; padding: 5px; text-align: center; color: #16a34a; font-weight: 700;">+0.3</td></tr>
                        <tr style="background: #f8fafc; font-weight: 700;"><td colspan="4" style="border: 1px solid #cbd5e1; padding: 5px; text-align: right;">Сумма коэффициентов (строка 23):</td><td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center; color: #0284c7;">1.9</td></tr>
                        <tr style="background: #f8fafc; font-weight: 700;"><td colspan="4" style="border: 1px solid #cbd5e1; padding: 5px; text-align: right;">Чистый заработок за оценки (строка 24):</td><td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center;">65 ₽</td></tr>
                        <tr style="background: #e0f2fe; font-weight: 800; font-size: 13px;"><td colspan="4" style="border: 1px solid #cbd5e1; padding: 7px; text-align: right;">ИТОГО К ВЫПЛАТЕ (строка 25):</td><td style="border: 1px solid #cbd5e1; padding: 7px; text-align: center; color: #0369a1;">239 ₽</td></tr>
                    </tbody>
                </table>
                <button class="pm-choose-btn" onclick="window.pmSelectAndCopy(4)">👉 Выбрать Вариант 4 (Академический журнал)</button>
            </div>

            <!-- ДИЗАЙН 5 -->
            <div id="pm-sc-5" class="pm-card-wrapper">
                <div class="pm-badge-title">Вариант 5: Канбан выплат (Kanban Pipeline)</div>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
                    Управление процессом выплат по колонкам: «В расчете» $\rightarrow$ «К выплате» $\rightarrow$ «Выплачено».
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                    <div style="background: #f1f5f9; border-radius: 8px; padding: 12px;">
                        <div style="font-weight: 700; font-size: 12px; margin-bottom: 8px;">🟡 Текущая неделя</div>
                        <div class="pm-card"><div style="font-weight: 700; font-size: 13px;">Неделя С4</div><div style="font-size: 18px; font-weight: 800; color: #0284c7;">239 ₽</div></div>
                    </div>
                    <div style="background: #fef3c7; border-radius: 8px; padding: 12px;">
                        <div style="font-weight: 700; font-size: 12px; margin-bottom: 8px; color: #b45309;">⏳ К выплате</div>
                        <div class="pm-card" style="border-left: 3px solid #f59e0b;"><div style="font-weight: 700; font-size: 13px;">Неделя С3</div><div style="font-size: 18px; font-weight: 800;">239 ₽</div><button class="pm-btn pm-btn-success" style="width: 100%; font-size: 11px; margin-top: 4px;">Выплатить</button></div>
                    </div>
                    <div style="background: #dcfce7; border-radius: 8px; padding: 12px;">
                        <div style="font-weight: 700; font-size: 12px; margin-bottom: 8px; color: #166534;">✅ Выплачено</div>
                        <div class="pm-card" style="border-left: 3px solid #22c55e;"><div style="font-weight: 700; font-size: 13px;">Неделя С2</div><div style="font-size: 18px; font-weight: 800; color: #166534;">198 ₽</div></div>
                    </div>
                </div>
                <button class="pm-choose-btn" onclick="window.pmSelectAndCopy(5)">👉 Выбрать Вариант 5 (Канбан выплат)</button>
            </div>

            <!-- ДИЗАЙН 6 -->
            <div id="pm-sc-6" class="pm-card-wrapper">
                <div class="pm-badge-title">Вариант 6: Недельные Истории (Stories & Highlights)</div>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
                    Формат компактных интерактивных «сторис» с акцентом на главных достижениях ребёнка.
                </div>
                <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0;">
                    <div style="background: linear-gradient(180deg, #0284c7, #0369a1); padding: 20px; color: white; text-align: center;">
                        <div style="font-size: 11px; text-transform: uppercase; opacity: 0.85;">ИТОГИ НЕДЕЛИ С3</div>
                        <div style="font-size: 34px; font-weight: 900; margin: 6px 0;">+239 ₽</div>
                        <div style="font-size: 13px;">Успехи Юлианы за 15–21 сен</div>
                    </div>
                    <div style="padding: 16px;">
                        <div style="display: flex; gap: 10px; background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                            <span style="font-size: 20px;">🚀</span><div><div style="font-weight: 700; font-size: 13px;">Прорыв недели</div><div style="font-size: 11px; color: #64748b;">Алгебра и Химия дали рекордный плюс!</div></div>
                        </div>
                        <button class="pm-btn pm-btn-primary" style="width: 100%; padding: 8px;">Открыть QR на оплату</button>
                    </div>
                </div>
                <button class="pm-choose-btn" onclick="window.pmSelectAndCopy(6)">👉 Выбрать Вариант 6 (Недельные Истории)</button>
            </div>

            <!-- ДИЗАЙН 7 -->
            <div id="pm-sc-7" class="pm-card-wrapper">
                <div class="pm-badge-title">Вариант 7: Целевая копилка (Goal & Piggy Bank)</div>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
                    Финансовая грамотность: разделение выплаты — 40% на большую мечту (планшет), 60% на свободные карманные расходы.
                </div>
                <div style="max-width: 580px; margin: 0 auto;">
                    <div class="pm-card" style="background: #f0fdf4; border: 1px solid #a7f3d0; margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 11px; font-weight: 700; color: #047857;">🎯 МЕЧТА ЮЛИАНЫ</div>
                                <div style="font-size: 18px; font-weight: 800; color: #065f46; margin: 2px 0;">Новый планшет и стилус</div>
                                <div style="font-size: 12px; color: #047857;">Собрано: 4 200 ₽ из 15 000 ₽ (28%)</div>
                            </div>
                            <span style="font-size: 32px;">🐷</span>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div class="pm-card" style="border-left: 3px solid #10b981; text-align: center;"><div style="font-size: 11px; color: #64748b;">В КОПИЛКУ (40%)</div><div style="font-size: 20px; font-weight: 800; color: #16a34a;">+96 ₽</div></div>
                        <div class="pm-card" style="border-left: 3px solid #0284c7; text-align: center;"><div style="font-size: 11px; color: #64748b;">НА КАРМАННЫЕ (60%)</div><div style="font-size: 20px; font-weight: 800; color: #0284c7;">143 ₽</div></div>
                    </div>
                </div>
                <button class="pm-choose-btn" onclick="window.pmSelectAndCopy(7)">👉 Выбрать Вариант 7 (Целевая копилка)</button>
            </div>

            <!-- ДИЗАЙН 8 -->
            <div id="pm-sc-8" class="pm-card-wrapper">
                <div class="pm-badge-title">Вариант 8: Интерактивный Таймлайн (Timeline Ledger)</div>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
                    Хронологическая лента недель с паспортом каждого периода и статусом закрытия выплат.
                </div>
                <div style="position: relative; padding-left: 20px; border-left: 2px solid #cbd5e1; max-width: 520px; margin: 0 auto;">
                    <div style="margin-bottom: 12px; position: relative;">
                        <div style="position: absolute; left: -27px; top: 0; width: 12px; height: 12px; border-radius: 50%; background: #0284c7; border: 2px solid white;"></div>
                        <div class="pm-card" style="background: #f0f9ff; border: 1px solid #bae6fd;"><div style="font-weight: 700; font-size: 13px;">Неделя С3: 239 ₽ (Ожидает)</div></div>
                    </div>
                    <div style="position: relative;">
                        <div style="position: absolute; left: -27px; top: 0; width: 12px; height: 12px; border-radius: 50%; background: #22c55e; border: 2px solid white;"></div>
                        <div class="pm-card"><div style="font-weight: 700; font-size: 13px;">Неделя С2: 198 ₽ (Выплачено 15 сен)</div></div>
                    </div>
                </div>
                <button class="pm-choose-btn" onclick="window.pmSelectAndCopy(8)">👉 Выбрать Вариант 8 (Интерактивный Таймлайн)</button>
            </div>

            <!-- ДИЗАЙН 9 -->
            <div id="pm-sc-9" class="pm-card-wrapper">
                <div class="pm-badge-title">Вариант 9: Семейная матрица (Все дети сразу)</div>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
                    Все дети семьи рядом на одном экране: Юлиана, Артём и Диана, общий недельный бюджет и раздельные выплаты.
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                    <div class="pm-card" style="border-top: 3px solid #0284c7;">
                        <div style="font-weight: 800; font-size: 14px;">Юлиана (14 лет)</div>
                        <div style="font-size: 22px; font-weight: 900; color: #0284c7; margin: 4px 0;">239 ₽</div>
                        <button class="pm-btn pm-btn-success" style="width: 100%; font-size: 11px;">Перевести 239 ₽</button>
                    </div>
                    <div class="pm-card" style="border-top: 3px solid #6366f1;">
                        <div style="font-weight: 800; font-size: 14px;">Артём (12 лет)</div>
                        <div style="font-size: 22px; font-weight: 900; color: #6366f1; margin: 4px 0;">185 ₽</div>
                        <button class="pm-btn pm-btn-success" style="width: 100%; font-size: 11px;">Перевести 185 ₽</button>
                    </div>
                    <div class="pm-card" style="border-top: 3px solid #ec4899;">
                        <div style="font-weight: 800; font-size: 14px;">Диана (8 лет)</div>
                        <div style="font-size: 22px; font-weight: 900; color: #ec4899; margin: 4px 0;">130 ₽</div>
                        <button class="pm-btn pm-btn-success" style="width: 100%; font-size: 11px;">Перевести 130 ₽</button>
                    </div>
                </div>
                <button class="pm-choose-btn" onclick="window.pmSelectAndCopy(9)">👉 Выбрать Вариант 9 (Семейная матрица)</button>
            </div>

            <!-- ДИЗАЙН 10 -->
            <div id="pm-sc-10" class="pm-card-wrapper">
                <div class="pm-badge-title">Вариант 10: Компактный информер (Compact Minimalist)</div>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
                    Ультралаконичный однострочный информер, не закрывающий страницу дневника.
                </div>
                <div class="pm-card" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                    <div style="font-size: 14px; font-weight: 800;">Юлиана • Неделя С3</div>
                    <div style="display: flex; gap: 16px;">
                        <div><span style="font-size: 11px; color: #64748b;">База:</span> <b>174.79 ₽</b></div>
                        <div><span style="font-size: 11px; color: #64748b;">Оценки:</span> <b style="color: #16a34a;">+65 ₽</b></div>
                        <div><span style="font-size: 11px; color: #64748b;">Итого:</span> <b style="color: #0284c7; font-size: 16px;">239 ₽</b></div>
                    </div>
                    <button class="pm-btn pm-btn-primary">Скопировать 239 ₽</button>
                </div>
                <button class="pm-choose-btn" onclick="window.pmSelectAndCopy(10)">👉 Выбрать Вариант 10 (Компактный информер)</button>
            </div>
        `;
    }

    // Показ конкретного варианта в режиме вкладок
    function showDesignTab(num) {
        currentDesign = num;
        if (currentMode === 'all') return;

        for (let i = 1; i <= 10; i++) {
            const el = document.getElementById(`pm-sc-${i}`);
            if (el) el.style.display = (i === num) ? 'block' : 'none';
        }

        document.querySelectorAll('.pm-nav-btn').forEach((b, idx) => {
            if (idx + 1 === num) b.classList.add('active');
            else b.classList.remove('active');
        });
    }

    // Переключение режима: вкладки или все разом
    function setDisplayMode(mode) {
        currentMode = mode;
        const navBar = document.getElementById('pm-nav-tabs-bar');
        const btnAll = document.getElementById('pm-btn-toggle-all');

        if (mode === 'all') {
            btnAll.textContent = '📑 Переключить на вкладки';
            btnAll.style.background = '#0284c7';
            btnAll.style.color = 'white';
            if (navBar) navBar.style.display = 'none';
            for (let i = 1; i <= 10; i++) {
                const el = document.getElementById(`pm-sc-${i}`);
                if (el) el.style.display = 'block';
            }
        } else {
            btnAll.textContent = '📜 Показать все 10 разом (лента)';
            btnAll.style.background = 'white';
            btnAll.style.color = '#334155';
            if (navBar) navBar.style.display = 'flex';
            showDesignTab(currentDesign);
        }
    }

    // Создание модального окна витрины
    function createShowcaseModal() {
        if (document.getElementById('pm-showcase-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'pm-showcase-overlay';
        overlay.innerHTML = `
            <div class="pm-modal-window">
                <div class="pm-modal-header">
                    <div>
                        <h2 style="font-size: 18px; margin: 0; color: #0f172a;">🎨 Витрина 10 вариантов дизайна</h2>
                        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Нажимайте кнопки для просмотра каждого дизайна или включите ленту</div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button id="pm-btn-toggle-all" class="pm-btn" style="font-weight: 700;">📜 Показать все 10 разом (лента)</button>
                        <button class="pm-btn" style="font-size: 16px; padding: 4px 10px;" onclick="window.pmCloseShowcase()">✕</button>
                    </div>
                </div>

                <div id="pm-nav-tabs-bar" class="pm-nav-bar">
                    <button class="pm-nav-btn active" onclick="window.pmShowDesign(1)">1. 👔 Штаб</button>
                    <button class="pm-nav-btn" onclick="window.pmShowDesign(2)">2. 💳 Банк</button>
                    <button class="pm-nav-btn" onclick="window.pmShowDesign(3)">3. ⚔️ RPG</button>
                    <button class="pm-nav-btn" onclick="window.pmShowDesign(4)">4. 📊 Журнал</button>
                    <button class="pm-nav-btn" onclick="window.pmShowDesign(5)">5. 📋 Канбан</button>
                    <button class="pm-nav-btn" onclick="window.pmShowDesign(6)">6. 📱 Истории</button>
                    <button class="pm-nav-btn" onclick="window.pmShowDesign(7)">7. 🎯 Копилка</button>
                    <button class="pm-nav-btn" onclick="window.pmShowDesign(8)">8. ⏳ Таймлайн</button>
                    <button class="pm-nav-btn" onclick="window.pmShowDesign(9)">9. 👨‍👩‍👧‍👦 Все дети</button>
                    <button class="pm-nav-btn" onclick="window.pmShowDesign(10)">10. ⚡ Компакт</button>
                </div>

                <div class="pm-modal-body">
                    ${getDesignsHTML()}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('pm-btn-toggle-all').onclick = () => {
            setDisplayMode(currentMode === 'tabs' ? 'all' : 'tabs');
        };

        showDesignTab(1);
    }

    // Создание плавающей кнопки запуска витрины
    function createFloatingTrigger() {
        if (document.getElementById('pm-floating-trigger')) return;

        const btn = document.createElement('button');
        btn.id = 'pm-floating-trigger';
        btn.innerHTML = '<span>🎨 Витрина 10 дизайнов</span>';
        btn.onclick = () => {
            createShowcaseModal();
        };

        document.body.appendChild(btn);
    }

    // Глобальные методы для кнопок
    window.pmShowDesign = function(num) {
        showDesignTab(num);
    };

    window.pmCloseShowcase = function() {
        const overlay = document.getElementById('pm-showcase-overlay');
        if (overlay) overlay.remove();
    };

    window.pmSelectAndCopy = function(num) {
        const names = [
            "Семейный штаб", "Финтех-Банк (Junior)", "RPG Профиль Героя",
            "Академический журнал", "Канбан выплат", "Недельные Истории",
            "Целевая копилка", "Интерактивный Таймлайн", "Семейная матрица", "Компактный информер"
        ];
        const chosen = `Вариант ${num} (${names[num - 1]})`;
        alert(`Вы выбрали: ${chosen}!\n\nНапишите в чат агенту: "Выбираю Вариант ${num}", и я внедрю именно его.`);
    };

    // Инициализация
    function init() {
        injectStyles();
        createFloatingTrigger();
        // Автоматически открываем витрину при первой загрузке страницы
        createShowcaseModal();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
