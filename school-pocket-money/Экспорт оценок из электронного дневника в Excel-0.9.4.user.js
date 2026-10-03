// ==UserScript==
// @name         Экспорт оценок из электронного дневника в Excel
// @namespace    http://tampermonkey.net/
// @version      0.9.4
// @description  Автоматический сбор оценок за диапазон недель и экспорт в Excel по пресетам Юлианы, Артёма и Дианы с умным поиском активного ребенка.
// @author       You
// @match        https://cop.admhmao.ru/journal-app/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.16.9/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';

    // Конфигурация пресетов для детей
    const presets = {
        "Юлиана": {
            name: "Басимова Юлиана",
            zeroMark: 3.7,
            age: 14,
            inflationCoeff: 12.5,
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
            inflationCoeff: 12.5,
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
        "Диана": {
            name: "Басимова Диана",
            zeroMark: 3.7,
            age: 8,
            inflationCoeff: 12.5,
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
        }
    };

    // Умное определение выбранного ребенка на странице
    function getSelectedStudentName() {
        const childrenKeys = ["Диана", "Артём", "Юлиана", "Таисия"];
        const elements = document.querySelectorAll('a, span, button, div, li');

        // 1. Поиск по явным классам активности
        for (const el of elements) {
            const text = el.textContent.trim();
            const hasName = childrenKeys.some(name => text.includes(name));
            if (hasName) {
                if (el.classList.contains('selected') ||
                    el.classList.contains('active') ||
                    el.classList.contains('selected-student') ||
                    el.getAttribute('aria-selected') === 'true') {
                    return text;
                }
            }
        }

        // 2. Поиск по тегу span в блоке выбора (активный элемент часто перестает быть ссылкой a)
        const selectionSpans = document.querySelectorAll('.selection span, div.selection span, [class*="selection"] span');
        for (const el of selectionSpans) {
            const text = el.textContent.trim();
            if (childrenKeys.some(name => text.includes(name))) {
                return text;
            }
        }

        // 3. Поиск по цвету заливки (синяя кнопка на скриншоте)
        for (const el of elements) {
            const text = el.textContent.trim();
            if (childrenKeys.some(name => text.includes(name))) {
                const style = window.getComputedStyle(el);
                if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
                    if (!style.backgroundColor.includes('255, 255, 255')) { // Исключаем белый фон
                        return text;
                    }
                }
            }
        }

        // Резервный селектор
        const fallback = document.querySelector('.selection .selected') ||
                         document.querySelector('.selection .active') ||
                         document.querySelector('.selected');
        if (fallback) return fallback.textContent.trim();

        return 'Неизвестный ученик';
    }

    function colIndexToName(index) {
        let name = "";
        let temp = index;
        while (temp >= 0) {
            name = String.fromCharCode((temp % 26) + 65) + name;
            temp = Math.floor(temp / 26) - 1;
        }
        return name;
    }

    function normalizeString(str) {
        return str.toLowerCase().replace(/[^a-zа-яё0-9]/g, '');
    }

    function getRelativeWeekDates(offsetWeeks) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const day = today.getDay();
        const diffToMonday = (day === 0 ? -6 : 1 - day);

        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMonday + (offsetWeeks * 7));

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        return { start: monday, end: sunday };
    }

    function resolveRelativeDateStr(dateStr) {
        if (!dateStr) return null;
        const norm = dateStr.trim().toLowerCase();
        if (norm === "текущая неделя") {
            return getRelativeWeekDates(0);
        } else if (norm === "предыдущая неделя") {
            return getRelativeWeekDates(-1);
        } else if (norm === "следующая неделя") {
            return getRelativeWeekDates(1);
        }
        return null;
    }

    function getWeekCode(dateStr) {
        if (!dateStr) return "Неделя";
        const cleanStr = dateStr.toLowerCase().replace(/\s+/g, ' ');

        const relative = resolveRelativeDateStr(cleanStr);
        let day, month;

        if (relative) {
            day = relative.start.getDate();
            month = relative.start.getMonth() + 1;
        } else {
            let match = cleanStr.match(/(\d{1,2})\.(\d{1,2})/);
            if (match) {
                day = parseInt(match[1], 10);
                month = parseInt(match[2], 10);
            } else {
                const monthsRu = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
                match = cleanStr.match(/(\d{1,2})\s+([а-яё]+)/);
                if (match) {
                    day = parseInt(match[1], 10);
                    const monthWord = match[2];
                    month = monthsRu.findIndex(m => monthWord.startsWith(m)) + 1;
                }
            }
        }

        if (isNaN(day) || isNaN(month) || month < 1 || month > 12) {
            return "Неделя";
        }

        const monthLetters = {
            1: "Я", 2: "Ф", 3: "М", 4: "А", 5: "Май", 6: "Июн",
            7: "Июл", 8: "Авг", 9: "С", 10: "О", 11: "Н", 12: "Д"
        };

        const letter = monthLetters[month] || "Н";
        const weekNum = Math.ceil(day / 7);
        return `${letter}${weekNum}`;
    }

    function parseWeekDates(dateStr) {
        const relative = resolveRelativeDateStr(dateStr);
        if (relative) return relative;

        const cleanStr = dateStr.toLowerCase().replace(/\s+/g, ' ');
        const monthsRu = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
        const currentYear = new Date().getFullYear();

        let startDate = null;
        let endDate = null;

        let match = cleanStr.match(/(\d{2})\.(\d{2})\.(\d{4})/g);
        if (match && match.length >= 2) {
            startDate = parseDmy(match[0]);
            endDate = parseDmy(match[1]);
        } else {
            const parts = cleanStr.split(/[–-]/);
            if (parts.length >= 2) {
                startDate = parseWordDate(parts[0], monthsRu, currentYear);
                endDate = parseWordDate(parts[1], monthsRu, currentYear);

                if (startDate && endDate && startDate.getMonth() === 11 && endDate.getMonth() === 0) {
                    startDate.setFullYear(currentYear - 1);
                }
            }
        }
        return { start: startDate, end: endDate };
    }

    function parseDmy(str) {
        const parts = str.split('.');
        return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }

    function parseWordDate(str, monthsRu, defaultYear) {
        const clean = str.trim();
        const match = clean.match(/(\d{1,2})\s+([а-яё]+)/);
        if (match) {
            const day = parseInt(match[1], 10);
            const monthWord = match[2];
            const monthIdx = monthsRu.findIndex(m => monthWord.startsWith(m));
            if (monthIdx !== -1) {
                const yearMatch = clean.match(/\d{4}/);
                const year = yearMatch ? parseInt(yearMatch[0], 10) : defaultYear;
                return new Date(year, monthIdx, day);
            }
        }
        return null;
    }

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
                        const weightMatch = weightText.match(/×(\d+(\.\d+)?)/);
                        if (weightMatch && weightMatch[1]) {
                            weight = parseFloat(weightMatch[1]);
                        }
                    }

                    const individualMarkStrings = rawValue.split('/');
                    individualMarkStrings.forEach(markString => {
                        const value = parseFloat(markString.trim());
                        if (isNaN(value)) return;

                        if (!marksData[subject]) {
                            marksData[subject] = { weightedSum: 0, totalWeight: 0 };
                        }
                        marksData[subject].weightedSum += value * weight;
                        marksData[subject].totalWeight += weight;
                    });
                });
            });
        });
        return marksData;
    }

    function startCollection() {
        const start = confirm("Начать сбор данных с этой недели до текущей?");
        if (!start) return;

        sessionStorage.setItem('export_grades_active', 'true');
        sessionStorage.setItem('export_grades_data', JSON.stringify([]));
        processCurrentWeek();
    }

    function clearSession() {
        sessionStorage.removeItem('export_grades_active');
        sessionStorage.removeItem('export_grades_data');
    }

    function processCurrentWeek() {
        const studentName = getSelectedStudentName();

        const dateElement = document.querySelector('.navigation-tabs__period .navigation-tabs-label');
        const dateRange = dateElement ? dateElement.textContent.trim() : 'Неизвестный период';

        const weekCode = getWeekCode(dateRange);
        const marksData = scrapePageGrades();

        const weeks = JSON.parse(sessionStorage.getItem('export_grades_data') || '[]');
        weeks.push({
            weekCode: weekCode,
            marks: marksData,
            dateRange: dateRange
        });
        sessionStorage.setItem('export_grades_data', JSON.stringify(weeks));

        let activePreset = null;
        for (const key in presets) {
            if (studentName.includes(key)) {
                activePreset = presets[key];
                break;
            }
        }

        if (!activePreset) {
            const allSubjects = new Set();
            weeks.forEach(w => {
                Object.keys(w.marks).forEach(sub => allSubjects.add(sub));
            });
            const sortedSubjects = Array.from(allSubjects).sort((a, b) => a.localeCompare(b, 'ru'));

            activePreset = {
                name: studentName,
                zeroMark: 3.7,
                age: 12,
                inflationCoeff: 12.5,
                subjects: sortedSubjects.map(sub => ({ name: sub, coeff: 1.0 }))
            };
        }

        const parsed = parseWeekDates(dateRange);
        const today = new Date();
        today.setHours(0,0,0,0);

        let isFuture = false;
        let isCurrent = false;
        if (parsed) {
            if (parsed.start > today) {
                isFuture = true;
            } else if (today >= parsed.start && today <= parsed.end) {
                isCurrent = true;
            }
        }

        const nextLink = document.querySelector('.navigation-tabs__period .fa-chevron-right')?.closest('a');
        const shouldStop = isFuture || isCurrent || !nextLink;

        if (shouldStop) {
            generateExcel(activePreset, studentName);
            clearSession();
            addButton();
        } else {
            window.location.href = nextLink.href;
        }
    }

    function generateExcel(activePreset, studentName) {
        const weeks = JSON.parse(sessionStorage.getItem('export_grades_data') || '[]');
        if (weeks.length === 0) return;

        const numWeeks = weeks.length;
        const excelData = [];
        const lastSubjectRow = activePreset.subjects.length + 1;
        const zeroMarkRow = lastSubjectRow + 2;

        // Строка 1: Коды недель
        const row1 = ["", ""];
        for (let w = 0; w < numWeeks; w++) {
            row1.push(weeks[w].weekCode, "", "");
        }
        excelData.push(row1);

        // Строки предметов (со 2 строки)
        activePreset.subjects.forEach((subj, index) => {
            const rowIndex = index + 2;
            const excelRow = [subj.coeff, subj.name];

            for (let w = 0; w < numWeeks; w++) {
                const weekData = weeks[w];
                let parsed = weekData.marks[subj.name];

                if (!parsed) {
                    const normSubjName = normalizeString(subj.name);
                    const matchedKey = Object.keys(weekData.marks).find(k => normalizeString(k) === normSubjName);
                    if (matchedKey) {
                        parsed = weekData.marks[matchedKey];
                    }
                }

                const weightedSum = parsed ? Math.round(parsed.weightedSum * 100) / 100 : "";
                const totalWeight = parsed ? Math.round(parsed.totalWeight * 100) / 100 : "";

                const colSumLetter = colIndexToName(2 + w * 3);
                const colWeightLetter = colIndexToName(3 + w * 3);

                const formulaObj = {
                    f: `IF(${colSumLetter}${rowIndex}="","",(${colSumLetter}${rowIndex}/${colWeightLetter}${rowIndex}-$A$${zeroMarkRow})*$A${rowIndex}*${colWeightLetter}${rowIndex})`
                };

                excelRow.push(weightedSum, totalWeight, formulaObj);
            }
            excelData.push(excelRow);
        });

        excelData.push(["", ""]);

        const earningSumRanges = [];
        for (let w = 0; w < numWeeks; w++) {
            const colLetter = colIndexToName(4 + w * 3);
            earningSumRanges.push(`${colLetter}2:${colLetter}${lastSubjectRow}`);
        }
        const formulaSumEarnings = `SUM(${earningSumRanges.join(",")})*A${lastSubjectRow + 3}*A${lastSubjectRow + 4}`;

        excelData.push([activePreset.zeroMark, { f: formulaSumEarnings }]);
        excelData.push([activePreset.age, "Лет"]);
        excelData.push([activePreset.inflationCoeff, "Коэф"]);

        const worksheet = XLSX.utils.aoa_to_sheet(excelData);

        const merges = [];
        for (let w = 0; w < numWeeks; w++) {
            merges.push({
                s: { r: 0, c: 2 + w * 3 },
                e: { r: 0, c: 4 + w * 3 }
            });
        }
        worksheet['!merges'] = merges;

        const totalCols = 2 + numWeeks * 3;
        const colWidths = [
            { wch: 6 },
            { wch: 30 }
        ];
        for (let c = 2; c < totalCols; c++) {
            colWidths.push({ wch: 4 });
        }
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Оценки');

        const cleanStudentName = studentName.replace(/[^\w\sа-яА-Я]/g, '').replace(/\s+/g, '_');
        const fileName = `Оценки_${cleanStudentName}_Сбор.xlsx`;

        XLSX.writeFile(workbook, fileName);
    }

    function addButton() {
        if (document.getElementById('export-grades-button')) return;

        const exportButton = document.createElement('button');
        exportButton.id = 'export-grades-button';
        exportButton.textContent = 'Сохранить в Excel';
        exportButton.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 1000; padding: 10px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;';
        document.body.appendChild(exportButton);
        exportButton.onclick = startCollection;
    }

    function init() {
        if (sessionStorage.getItem('export_grades_active') === 'true') {
            let attempts = 0;
            const checkInterval = setInterval(() => {
                const dayElements = document.querySelectorAll('.dnevnik-day');
                if (dayElements.length > 0) {
                    clearInterval(checkInterval);
                    processCurrentWeek();
                } else {
                    attempts++;
                    if (attempts > 15) {
                        clearInterval(checkInterval);
                        alert("Не удалось загрузить данные дневника. Сбор данных прерван.");
                        clearSession();
                        addButton();
                    }
                }
            }, 500);
        } else {
            addButton();
        }
    }

    const observer = new MutationObserver(() => {
        if (document.getElementById('dnevnikDays') || document.querySelector('.dnevnik-day') || document.querySelector('.navigation-tabs__period')) {
            observer.disconnect();
            init();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();