// ==UserScript==
// @name         Hugging Face Model Notes
// @namespace    https://github.com/tampermonkey-hf-notes
// @version      1.0.1
// @description  Добавляет текстовые Markdown-заметки к моделям на Hugging Face (в каталоге и на страницах моделей)
// @author       Antigravity
// @match        https://huggingface.co/*
// @icon         https://huggingface.co/front/assets/huggingface_logo-noborder.svg
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const __version__ = "1.0.1";
    const STORAGE_PREFIX = "hf_note:";

    // Список зарезервированных путей верхнего уровня, которые не являются моделями
    const RESERVED_ROOT_PATHS = new Set([
        'models', 'datasets', 'spaces', 'docs', 'blog', 'pricing', 'login', 'join',
        'settings', 'organizations', 'collections', 'posts', 'discussions', 'papers',
        'tasks', 'inference-endpoints', 'chat', 'search', 'welcome', 'terms-of-service',
        'privacy', 'security', 'api', 'front', 'new', 'logout'
    ]);

    /* ==========================================================================
       1. Модуль хранилища (StorageManager)
       ========================================================================== */
    const StorageManager = {
        getKey(modelId) {
            return `${STORAGE_PREFIX}${modelId}`;
        },

        getNote(modelId) {
            const raw = GM_getValue(this.getKey(modelId), null);
            if (!raw) return null;
            try {
                if (typeof raw === 'object') return raw;
                return JSON.parse(raw);
            } catch (e) {
                return { text: String(raw), updatedAt: Date.now() };
            }
        },

        saveNote(modelId, text) {
            const trimmed = (text || '').trim();
            if (!trimmed) {
                this.deleteNote(modelId);
                return null;
            }
            const data = {
                modelId: modelId,
                text: trimmed,
                updatedAt: Date.now()
            };
            GM_setValue(this.getKey(modelId), JSON.stringify(data));
            return data;
        },

        deleteNote(modelId) {
            GM_deleteValue(this.getKey(modelId));
        },

        hasNote(modelId) {
            return GM_getValue(this.getKey(modelId), null) !== null;
        },

        getAllNotes() {
            const keys = GM_listValues();
            const notes = {};
            for (const key of keys) {
                if (key.startsWith(STORAGE_PREFIX)) {
                    const modelId = key.slice(STORAGE_PREFIX.length);
                    notes[modelId] = this.getNote(modelId);
                }
            }
            return notes;
        },

        exportNotes() {
            const notes = this.getAllNotes();
            const count = Object.keys(notes).length;
            if (count === 0) {
                alert("У вас пока нет сохраненных заметок к моделям.");
                return;
            }
            const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hf_model_notes_backup_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        importNotes() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        let importedCount = 0;
                        for (const [modelId, noteData] of Object.entries(data)) {
                            if (noteData && typeof noteData === 'object' && noteData.text) {
                                StorageManager.saveNote(modelId, noteData.text);
                                importedCount++;
                            } else if (typeof noteData === 'string') {
                                StorageManager.saveNote(modelId, noteData);
                                importedCount++;
                            }
                        }
                        alert(`Успешно импортировано заметок: ${importedCount}`);
                        UIController.refreshAllBadges();
                    } catch (err) {
                        alert("Ошибка при чтении файла JSON: " + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }
    };

    /* ==========================================================================
       2. Markdown движок (MarkdownEngine)
       ========================================================================== */
    const MarkdownEngine = {
        init() {
            if (typeof marked !== 'undefined') {
                // Официальный плагин marked.use для строгого соблюдения канона GFM:
                // Зачеркивание только через двойную тильду (~~текст~~),
                // а одинарная тильда (~1.58, ~54 ГБ) остается обычным текстом.
                marked.use({
                    tokenizer: {
                        del(src) {
                            const doubleMatch = /^(~~)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/.exec(src);
                            if (doubleMatch) {
                                return {
                                    type: 'del',
                                    raw: doubleMatch[0],
                                    text: doubleMatch[2],
                                    tokens: this.lexer.inlineTokens(doubleMatch[2])
                                };
                            }
                            if (/^~(?=[^\s~])/.test(src)) {
                                return {
                                    type: 'text',
                                    raw: '~',
                                    text: '~'
                                };
                            }
                            return false;
                        }
                    }
                });

                marked.setOptions({
                    breaks: true,
                    gfm: true
                });
            }
        },

        render(markdownText) {
            if (!markdownText) return '<p class="hf-note-empty">Заметка пуста.</p>';
            if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
                try {
                    let html = marked.parse(markdownText);
                    // Добавляем target="_blank" ко всем внешним ссылкам
                    return html.replace(/<a\s+href=/gi, '<a target="_blank" rel="noopener noreferrer" href=');
                } catch (e) {
                    console.error("[HF Notes] Marked error:", e);
                }
            }
            // Запасной минималистичный рендер, если marked недоступен
            return this.fallbackRender(markdownText);
        },

        fallbackRender(text) {
            const escapeHtml = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            let safe = escapeHtml(text);
            safe = safe.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
            safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
            safe = safe.replace(/^### (.*$)/gim, '<h3>$1</h3>');
            safe = safe.replace(/^## (.*$)/gim, '<h2>$1</h2>');
            safe = safe.replace(/^# (.*$)/gim, '<h1>$1</h1>');
            safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
            safe = safe.replace(/\n\n+/g, '</p><p>');
            return `<p>${safe}</p>`.replace(/<p><\/p>/g, '');
        }
    };

    /* ==========================================================================
       3. Стили интерфейса (Styles)
       ========================================================================== */
    const STYLES = `
        /* Бейдж на карточке модели в каталоге */
        .hf-note-badge {
            position: absolute;
            top: 8px;
            right: 8px;
            z-index: 20;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 26px;
            height: 26px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
            background: rgba(255, 255, 255, 0.85);
            border: 1px solid rgba(0, 0, 0, 0.12);
            color: #64748b;
            font-size: 13px;
            user-select: none;
            backdrop-filter: blur(4px);
        }

        .dark .hf-note-badge {
            background: rgba(30, 41, 59, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #94a3b8;
        }

        .hf-note-badge:hover {
            transform: scale(1.1);
            color: #2563eb;
            border-color: #3b82f6;
            box-shadow: 0 2px 6px rgba(0,0,0,0.12);
        }

        .dark .hf-note-badge:hover {
            color: #60a5fa;
            border-color: #60a5fa;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        }

        /* Бейдж с существующей заметкой */
        .hf-note-badge.has-note {
            background: #eff6ff;
            border-color: #3b82f6;
            color: #2563eb;
            box-shadow: 0 1px 3px rgba(59, 130, 246, 0.25);
        }

        .dark .hf-note-badge.has-note {
            background: #1e293b;
            border-color: #3b82f6;
            color: #60a5fa;
            box-shadow: 0 1px 4px rgba(59, 130, 246, 0.35);
        }

        /* Кнопка в шапке страницы модели */
        .hf-note-header-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            color: #334155;
            user-select: none;
            margin-left: 8px;
        }

        .dark .hf-note-header-btn {
            background: #1e293b;
            border: 1px solid #334155;
            color: #cbd5e1;
        }

        .hf-note-header-btn:hover {
            background: #e2e8f0;
            border-color: #94a3b8;
        }

        .dark .hf-note-header-btn:hover {
            background: #334155;
            border-color: #475569;
        }

        .hf-note-header-btn.has-note {
            background: #eff6ff;
            border-color: #3b82f6;
            color: #1d4ed8;
        }

        .dark .hf-note-header-btn.has-note {
            background: #1e293b;
            border-color: #3b82f6;
            color: #60a5fa;
        }

        /* Модальное окно */
        .hf-note-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(2px);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
            animation: hfNoteFadeIn 0.15s ease-out;
        }

        @keyframes hfNoteFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .hf-note-modal-container {
            background: #ffffff;
            color: #0f172a;
            width: 100%;
            max-width: 720px;
            max-height: 85vh;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid #e2e8f0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        .dark .hf-note-modal-container {
            background: #0f172a;
            color: #f8fafc;
            border-color: #334155;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
        }

        .hf-note-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 18px;
            border-bottom: 1px solid #e2e8f0;
            background: #f8fafc;
        }

        .dark .hf-note-modal-header {
            background: #1e293b;
            border-color: #334155;
        }

        .hf-note-modal-title {
            font-size: 15px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .hf-note-modal-title span.model-name {
            color: #2563eb;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 13px;
        }

        .dark .hf-note-modal-title span.model-name {
            color: #60a5fa;
        }

        .hf-note-close-btn {
            background: transparent;
            border: none;
            font-size: 20px;
            color: #64748b;
            cursor: pointer;
            padding: 0 4px;
            line-height: 1;
            border-radius: 4px;
        }

        .hf-note-close-btn:hover {
            color: #0f172a;
        }

        .dark .hf-note-close-btn:hover {
            color: #f8fafc;
        }

        /* Навигация вкладок */
        .hf-note-nav {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 18px;
            border-bottom: 1px solid #e2e8f0;
            background: #ffffff;
        }

        .dark .hf-note-nav {
            background: #0f172a;
            border-color: #334155;
        }

        .hf-note-tabs {
            display: flex;
            gap: 6px;
        }

        .hf-note-tab-btn {
            background: transparent;
            border: none;
            padding: 6px 12px;
            font-size: 13px;
            font-weight: 500;
            color: #64748b;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.15s;
        }

        .dark .hf-note-tab-btn {
            color: #94a3b8;
        }

        .hf-note-tab-btn.active {
            background: #eff6ff;
            color: #2563eb;
        }

        .dark .hf-note-tab-btn.active {
            background: #1e293b;
            color: #60a5fa;
        }

        .hf-note-updated-time {
            font-size: 12px;
            color: #94a3b8;
        }

        /* Тело модального окна */
        .hf-note-modal-body {
            padding: 18px;
            overflow-y: auto;
            flex: 1;
            min-height: 200px;
            max-height: 55vh;
        }

        /* Редактор Markdown */
        .hf-note-editor-wrapper {
            display: flex;
            flex-direction: column;
            gap: 8px;
            height: 100%;
        }

        .hf-note-toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }

        .hf-note-tool-btn {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            color: #334155;
            padding: 2px 8px;
            font-size: 12px;
            border-radius: 4px;
            cursor: pointer;
            font-family: inherit;
        }

        .dark .hf-note-tool-btn {
            background: #1e293b;
            border-color: #334155;
            color: #cbd5e1;
        }

        .hf-note-tool-btn:hover {
            background: #e2e8f0;
        }

        .dark .hf-note-tool-btn:hover {
            background: #334155;
        }

        .hf-note-textarea {
            width: 100%;
            height: 240px;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #0f172a;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 13px;
            line-height: 1.5;
            resize: vertical;
            box-sizing: border-box;
            outline: none;
        }

        .dark .hf-note-textarea {
            background: #1e293b;
            border-color: #334155;
            color: #f8fafc;
        }

        .hf-note-textarea:focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }

        /* Просмотр Markdown: использует нативный .prose от HF + небольшие коррекции */
        .hf-note-preview {
            font-size: 14px;
            word-wrap: break-word;
        }

        .hf-note-empty {
            color: #94a3b8;
            font-style: italic;
            text-align: center;
            padding: 30px 0;
        }

        /* Футер модального окна */
        .hf-note-modal-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 18px;
            border-top: 1px solid #e2e8f0;
            background: #f8fafc;
        }

        .dark .hf-note-modal-footer {
            background: #1e293b;
            border-color: #334155;
        }

        .hf-note-footer-left, .hf-note-footer-right {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .hf-note-btn {
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.15s;
        }

        .hf-note-btn-primary {
            background: #2563eb;
            color: #ffffff;
        }
        .hf-note-btn-primary:hover {
            background: #1d4ed8;
        }

        .hf-note-btn-secondary {
            background: #f1f5f9;
            color: #334155;
            border-color: #cbd5e1;
        }
        .dark .hf-note-btn-secondary {
            background: #334155;
            color: #f1f5f9;
            border-color: #475569;
        }
        .hf-note-btn-secondary:hover {
            background: #e2e8f0;
        }
        .dark .hf-note-btn-secondary:hover {
            background: #475569;
        }

        .hf-note-btn-danger {
            background: transparent;
            color: #ef4444;
            border-color: transparent;
        }
        .hf-note-btn-danger:hover {
            background: rgba(239, 68, 68, 0.1);
            border-color: rgba(239, 68, 68, 0.2);
        }
    `;

    /* ==========================================================================
       4. Контроллер UI и модальных окон (UIController)
       ========================================================================== */
    const UIController = {
        activeModal: null,
        currentModelId: null,
        currentMode: 'preview', // 'preview' | 'edit'
        currentDraftText: '',

        init() {
            if (typeof GM_addStyle === 'function') {
                GM_addStyle(STYLES);
            } else {
                const styleEl = document.createElement('style');
                styleEl.textContent = STYLES;
                document.head.appendChild(styleEl);
            }

            // Закрытие модального окна по Esc
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.activeModal) {
                    this.closeModal();
                }
            });
        },

        // Обновление всех бейджей на странице (после сохранения/удаления/импорта)
        refreshAllBadges() {
            // Карточки в каталоге
            document.querySelectorAll('.hf-note-badge').forEach((badge) => {
                const modelId = badge.dataset.modelId;
                if (!modelId) return;
                const has = StorageManager.hasNote(modelId);
                badge.classList.toggle('has-note', has);
                badge.innerHTML = has ? '📝' : '✏️';
                badge.title = has ? `Заметка к ${modelId} (нажмите для просмотра)` : `Создать заметку к ${modelId}`;
            });

            // Кнопка в шапке страницы модели
            const headerBtn = document.querySelector('.hf-note-header-btn');
            if (headerBtn) {
                const modelId = headerBtn.dataset.modelId;
                if (modelId) {
                    const has = StorageManager.hasNote(modelId);
                    headerBtn.classList.toggle('has-note', has);
                    headerBtn.innerHTML = has ? '📝 Заметка (есть)' : '📝 Заметка';
                    headerBtn.title = has ? `Открыть заметку к ${modelId}` : `Создать заметку к ${modelId}`;
                }
            }
        },

        // Открытие модального окна для конкретной модели
        openModal(modelId, initialMode = null) {
            this.closeModal();
            this.currentModelId = modelId;

            const existingNote = StorageManager.getNote(modelId);
            this.currentDraftText = existingNote?.text || '';

            // Если заметка уже есть — открываем в режиме просмотра, иначе — сразу в режиме редактирования
            this.currentMode = initialMode || (existingNote ? 'preview' : 'edit');

            const overlay = document.createElement('div');
            overlay.className = 'hf-note-modal-overlay';
            overlay.onclick = (e) => {
                if (e.target === overlay) this.closeModal();
            };

            const container = document.createElement('div');
            container.className = 'hf-note-modal-container';
            container.onclick = (e) => e.stopPropagation();

            // 1. Шапка модального окна
            const header = document.createElement('div');
            header.className = 'hf-note-modal-header';
            header.innerHTML = `
                <div class="hf-note-modal-title">
                    <span>📝 Заметка:</span>
                    <span class="model-name" title="${modelId}">${modelId}</span>
                </div>
                <button class="hf-note-close-btn" title="Закрыть (Esc)">&times;</button>
            `;
            header.querySelector('.hf-note-close-btn').onclick = () => this.closeModal();
            container.appendChild(header);

            // 2. Панель переключения вкладок
            const nav = document.createElement('div');
            nav.className = 'hf-note-nav';
            nav.innerHTML = `
                <div class="hf-note-tabs">
                    <button class="hf-note-tab-btn ${this.currentMode === 'preview' ? 'active' : ''}" data-tab="preview">👁️ Просмотр</button>
                    <button class="hf-note-tab-btn ${this.currentMode === 'edit' ? 'active' : ''}" data-tab="edit">✏️ Редактировать</button>
                </div>
                <div class="hf-note-updated-time">${this.formatUpdatedTime(existingNote?.updatedAt)}</div>
            `;

            const previewTabBtn = nav.querySelector('[data-tab="preview"]');
            const editTabBtn = nav.querySelector('[data-tab="edit"]');

            previewTabBtn.onclick = () => this.switchMode('preview', container);
            editTabBtn.onclick = () => this.switchMode('edit', container);
            container.appendChild(nav);

            // 3. Тело модального окна
            const body = document.createElement('div');
            body.className = 'hf-note-modal-body';
            container.appendChild(body);

            // 4. Футер с динамическими кнопками
            const footer = document.createElement('div');
            footer.className = 'hf-note-modal-footer';
            container.appendChild(footer);

            overlay.appendChild(container);
            document.body.appendChild(overlay);

            this.activeModal = overlay;
            this.renderContent(container);
        },

        // Переключение между вкладками «Просмотр» и «Редактировать»
        switchMode(mode, container) {
            // Сохраняем черновик при уходе из режима редактирования
            if (this.currentMode === 'edit') {
                const textarea = container.querySelector('.hf-note-textarea');
                if (textarea) {
                    this.currentDraftText = textarea.value;
                }
            }

            this.currentMode = mode;

            const previewTabBtn = container.querySelector('[data-tab="preview"]');
            const editTabBtn = container.querySelector('[data-tab="edit"]');

            if (previewTabBtn && editTabBtn) {
                previewTabBtn.classList.toggle('active', mode === 'preview');
                editTabBtn.classList.toggle('active', mode === 'edit');
            }

            this.renderContent(container);
        },

        // Рендеринг тела и футера модального окна в зависимости от текущего режима
        renderContent(container) {
            const body = container.querySelector('.hf-note-modal-body');
            const footer = container.querySelector('.hf-note-modal-footer');
            if (!body || !footer) return;

            const modelId = this.currentModelId;
            const existingNote = StorageManager.getNote(modelId);

            if (this.currentMode === 'preview') {
                // Режим просмотра: нативный класс .prose от HF гарантирует правильные маркеры списков и типографику
                body.innerHTML = `
                    <div class="hf-note-preview prose dark:prose-invert max-w-none">
                        ${MarkdownEngine.render(this.currentDraftText)}
                    </div>
                `;

                // В режиме просмотра: кнопки «Редактировать» и «Закрыть» (кнопки «Сохранить» нет, случайно стереть невозможно!)
                footer.innerHTML = `
                    <div class="hf-note-footer-left">
                        ${existingNote ? '<button class="hf-note-btn hf-note-btn-danger">🗑️ Удалить</button>' : ''}
                    </div>
                    <div class="hf-note-footer-right">
                        <button class="hf-note-btn hf-note-btn-secondary">Закрыть</button>
                        <button class="hf-note-btn hf-note-btn-primary">✏️ Редактировать</button>
                    </div>
                `;

                const deleteBtn = footer.querySelector('.hf-note-btn-danger');
                if (deleteBtn) {
                    deleteBtn.onclick = () => this.handleDelete(modelId);
                }

                footer.querySelector('.hf-note-btn-secondary').onclick = () => this.closeModal();
                footer.querySelector('.hf-note-btn-primary').onclick = () => this.switchMode('edit', container);

            } else {
                // Режим редактирования
                body.innerHTML = `
                    <div class="hf-note-editor-wrapper">
                        <div class="hf-note-toolbar">
                            <button type="button" class="hf-note-tool-btn" data-action="h1"># H1</button>
                            <button type="button" class="hf-note-tool-btn" data-action="h2">## H2</button>
                            <button type="button" class="hf-note-tool-btn" data-action="bold"><b>B</b></button>
                            <button type="button" class="hf-note-tool-btn" data-action="italic"><i>I</i></button>
                            <button type="button" class="hf-note-tool-btn" data-action="list">- Список</button>
                            <button type="button" class="hf-note-tool-btn" data-action="code">&lt;/&gt; Код</button>
                            <button type="button" class="hf-note-tool-btn" data-action="link">🔗 Ссылка</button>
                        </div>
                        <textarea class="hf-note-textarea" placeholder="Напишите пару абзацев о модели в формате Markdown... (Ctrl+Enter для сохранения)">${this.escapeForTextarea(this.currentDraftText)}</textarea>
                    </div>
                `;

                const textarea = body.querySelector('.hf-note-textarea');
                textarea.focus();

                // Горячая клавиша Ctrl+Enter для сохранения
                textarea.addEventListener('keydown', (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        this.handleSave(container);
                    }
                });

                // Тулбар быстрого форматирования
                body.querySelectorAll('.hf-note-tool-btn').forEach(btn => {
                    btn.onclick = () => {
                        this.insertMarkdownHelper(textarea, btn.dataset.action);
                    };
                });

                // В режиме редактирования: кнопки «Отмена» и «💾 Сохранить»
                footer.innerHTML = `
                    <div class="hf-note-footer-left">
                        ${existingNote ? '<button class="hf-note-btn hf-note-btn-danger">🗑️ Удалить</button>' : ''}
                    </div>
                    <div class="hf-note-footer-right">
                        <button class="hf-note-btn hf-note-btn-secondary">${existingNote ? 'Отмена' : 'Закрыть'}</button>
                        <button class="hf-note-btn hf-note-btn-primary">💾 Сохранить</button>
                    </div>
                `;

                const deleteBtn = footer.querySelector('.hf-note-btn-danger');
                if (deleteBtn) {
                    deleteBtn.onclick = () => this.handleDelete(modelId);
                }

                footer.querySelector('.hf-note-btn-secondary').onclick = () => {
                    if (existingNote) {
                        this.currentDraftText = existingNote.text;
                        this.switchMode('preview', container);
                    } else {
                        this.closeModal();
                    }
                };

                footer.querySelector('.hf-note-btn-primary').onclick = () => this.handleSave(container);
            }
        },

        // Сохранение заметки
        handleSave(container) {
            const textarea = container.querySelector('.hf-note-textarea');
            const text = textarea ? textarea.value : this.currentDraftText;
            const modelId = this.currentModelId;

            if (!text.trim()) {
                if (StorageManager.hasNote(modelId)) {
                    if (confirm(`Текст пуст. Удалить заметку к модели "${modelId}"?`)) {
                        StorageManager.deleteNote(modelId);
                        this.refreshAllBadges();
                        this.closeModal();
                    }
                } else {
                    this.closeModal();
                }
                return;
            }

            const saved = StorageManager.saveNote(modelId, text);
            this.currentDraftText = saved ? saved.text : '';

            // Обновляем время в навигации
            const timeEl = container.querySelector('.hf-note-updated-time');
            if (timeEl && saved) {
                timeEl.textContent = this.formatUpdatedTime(saved.updatedAt);
            }

            this.refreshAllBadges();
            this.switchMode('preview', container);
        },

        // Удаление заметки
        handleDelete(modelId) {
            if (confirm(`Удалить заметку к модели "${modelId}"?`)) {
                StorageManager.deleteNote(modelId);
                this.refreshAllBadges();
                this.closeModal();
            }
        },

        insertMarkdownHelper(textarea, action) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const sel = textarea.value.substring(start, end);
            let replacement = "";

            switch (action) {
                case 'h1':
                    replacement = `# ${sel || 'Заголовок'}`;
                    break;
                case 'h2':
                    replacement = `## ${sel || 'Подзаголовок'}`;
                    break;
                case 'bold':
                    replacement = `**${sel || 'жирный текст'}**`;
                    break;
                case 'italic':
                    replacement = `*${sel || 'курсив'}*`;
                    break;
                case 'list':
                    replacement = `\n- ${sel || 'пункт списка'}`;
                    break;
                case 'code':
                    replacement = sel.includes('\n') ? `\`\`\`\n${sel || 'code'}\n\`\`\`` : `\`${sel || 'code'}\``;
                    break;
                case 'link':
                    replacement = `[${sel || 'название ссылки'}](https://)`;
                    break;
            }

            textarea.setRangeText(replacement, start, end, 'end');
            textarea.focus();
        },

        formatUpdatedTime(timestamp) {
            if (!timestamp) return '';
            const d = new Date(timestamp);
            return `Обновлено: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        },

        escapeForTextarea(str) {
            if (!str) return '';
            return str;
        },

        closeModal() {
            if (this.activeModal) {
                this.activeModal.remove();
                this.activeModal = null;
                this.currentModelId = null;
                this.currentDraftText = '';
            }
        }
    };

    /* ==========================================================================
       5. Сканирование DOM и интеграция (PageScanner & Observer)
       ========================================================================== */
    const PageScanner = {
        // Проверка пути на принадлежность к модели
        parseModelId(pathname) {
            if (!pathname) return null;
            const cleanPath = pathname.replace(/^\/+|\/+$/g, '');
            const parts = cleanPath.split('/');

            // Должно быть как минимум 2 сегмента: author/model_name
            if (parts.length >= 2) {
                const author = parts[0];
                const modelName = parts[1];

                // Проверяем, что первый сегмент не системный
                if (!RESERVED_ROOT_PATHS.has(author)) {
                    return `${author}/${modelName}`;
                }
            }
            return null;
        },

        // Обработка карточек на странице каталога моделей (/models или главной)
        scanCards() {
            const links = document.querySelectorAll('article a[href], a.group[href], div[data-target="model-card"] a[href], a[href*="/"]');

            links.forEach(link => {
                const href = link.getAttribute('href');
                if (!href || href.startsWith('http') || href.startsWith('#')) return;

                const modelId = PageScanner.parseModelId(href);
                if (!modelId) return;

                const card = link.closest('article') || (link.classList.contains('group') ? link : null);
                if (!card) return;

                if (card.dataset.hfNoteBound === 'true') {
                    return;
                }
                card.dataset.hfNoteBound = 'true';

                const computedStyle = window.getComputedStyle(card);
                if (computedStyle.position === 'static') {
                    card.style.position = 'relative';
                }

                const hasNote = StorageManager.hasNote(modelId);
                const badge = document.createElement('div');
                badge.className = `hf-note-badge ${hasNote ? 'has-note' : ''}`;
                badge.dataset.modelId = modelId;
                badge.innerHTML = hasNote ? '📝' : '✏️';
                badge.title = hasNote ? `Заметка к ${modelId} (нажмите для просмотра)` : `Создать заметку к ${modelId}`;

                badge.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    UIController.openModal(modelId);
                };

                card.appendChild(badge);
            });
        },

        // Обработка детальной страницы модели (https://huggingface.co/author/model)
        scanModelPageHeader() {
            const currentPath = window.location.pathname;
            const modelId = PageScanner.parseModelId(currentPath);
            if (!modelId) return;

            if (document.querySelector(`.hf-note-header-btn[data-model-id="${modelId}"]`)) {
                return;
            }

            const headerContainer = document.querySelector('header .flex.items-center') ||
                                    document.querySelector('header') ||
                                    document.querySelector('h1')?.parentElement;

            if (!headerContainer) return;

            const hasNote = StorageManager.hasNote(modelId);
            const headerBtn = document.createElement('button');
            headerBtn.className = `hf-note-header-btn ${hasNote ? 'has-note' : ''}`;
            headerBtn.dataset.modelId = modelId;
            headerBtn.innerHTML = hasNote ? '📝 Заметка (есть)' : '📝 Заметка';
            headerBtn.title = hasNote ? `Открыть заметку к ${modelId}` : `Создать заметку к ${modelId}`;

            headerBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                UIController.openModal(modelId);
            };

            const h1 = headerContainer.querySelector('h1') || document.querySelector('h1');
            if (h1 && h1.parentElement) {
                h1.parentElement.appendChild(headerBtn);
            } else {
                headerContainer.appendChild(headerBtn);
            }
        },

        run() {
            this.scanCards();
            this.scanModelPageHeader();
        }
    };

    /* ==========================================================================
       6. Отслеживание SPA-навигации и инициализация
       ========================================================================== */
    function init() {
        MarkdownEngine.init();
        UIController.init();

        // Меню Tampermonkey для резервного копирования
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand("📥 Экспорт всех заметок (JSON)", () => StorageManager.exportNotes());
            GM_registerMenuCommand("📤 Импорт заметок (JSON)", () => StorageManager.importNotes());
        }

        // Первичный запуск сканирования
        PageScanner.run();

        // Наблюдатель за динамическими изменениями DOM (Hugging Face SPA, бесконечная прокрутка, фильтрация)
        let debounceTimer = null;
        const observer = new MutationObserver(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                PageScanner.run();
            }, 150);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Отслеживание перехода по страницам через History API (SPA navigation)
        const originalPushState = history.pushState;
        history.pushState = function () {
            originalPushState.apply(this, arguments);
            setTimeout(() => PageScanner.run(), 100);
        };

        const originalReplaceState = history.replaceState;
        history.replaceState = function () {
            originalReplaceState.apply(this, arguments);
            setTimeout(() => PageScanner.run(), 100);
        };

        window.addEventListener('popstate', () => {
            setTimeout(() => PageScanner.run(), 100);
        });

        console.log(`[HF Notes v${__version__}] Инициализирован.`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
