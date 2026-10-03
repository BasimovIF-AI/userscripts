// ==UserScript==
// @name         Google AI Studio: Full-Text Search & Folders
// @namespace    https://github.com/vibe-coding/aistudio-enhancer
// @version      1.6.1
// @description  Полнотекстовый поиск по всем сообщениям (пользователь, ИИ, размышления), иерархические папки диалогов и автоматическая облачная синхронизация в реальном времени через Google Диск
// @author       Senior Software Engineer
// @match        https://aistudio.google.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '1.6.1';
  const DB_NAME = 'AIStudioEnhancedDB';
  const DB_VERSION = 1;
  const RPC_BASE_URL = 'https://alkalimakersuite-pa.clients6.google.com/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService';
  const SYNC_PROMPT_TITLE = '[AI Studio Enhancer Sync]';

  // Access the real window object across sandbox boundaries
  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // =========================================================================
  // 1. STORAGE & INDEXEDDB ENGINE
  // =========================================================================

  class AISDatabase {
    constructor() {
      this.db = null;
    }

    async init() {
      if (this.db) return this.db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('prompts')) {
            const promptStore = db.createObjectStore('prompts', { keyPath: 'id' });
            promptStore.createIndex('folderId', 'folderId', { unique: false });
            promptStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            promptStore.createIndex('indexedAt', 'indexedAt', { unique: false });
          }
          if (!db.objectStoreNames.contains('folders')) {
            db.createObjectStore('folders', { keyPath: 'id' });
          }
        };
        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        req.onerror = (e) => {
          console.error('[AIS Enhancer] IndexedDB open error:', e);
          reject(e);
        };
      });
    }

    async getAllPrompts() {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('prompts', 'readonly');
        const store = tx.objectStore('prompts');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    async getPrompt(id) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('prompts', 'readonly');
        const store = tx.objectStore('prompts');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    async savePrompt(promptData) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('prompts', 'readwrite');
        const store = tx.objectStore('prompts');
        const getReq = store.get(promptData.id);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (existing && existing.folderId && !promptData.folderId) {
            promptData.folderId = existing.folderId;
          }
          // Preserve indexedAt timestamp if present
          if (existing && existing.indexedAt && !promptData.indexedAt) {
            promptData.indexedAt = existing.indexedAt;
          }
          const putReq = store.put(promptData);
          putReq.onsuccess = () => resolve(promptData);
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
    }

    async updatePromptFolder(promptId, folderId) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('prompts', 'readwrite');
        const store = tx.objectStore('prompts');
        const getReq = store.get(promptId);
        getReq.onsuccess = () => {
          const data = getReq.result;
          if (data) {
            data.folderId = folderId;
            const putReq = store.put(data);
            putReq.onsuccess = () => resolve(true);
            putReq.onerror = () => reject(putReq.error);
          } else {
            store.put({
              id: promptId,
              folderId: folderId,
              title: 'Загрузка...',
              messages: [],
              updatedAt: Date.now(),
              indexedAt: 0,
            });
            resolve(true);
          }
        };
        getReq.onerror = () => reject(getReq.error);
      });
    }

    async getAllFolders() {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('folders', 'readonly');
        const store = tx.objectStore('folders');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    async saveFolder(folder) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('folders', 'readwrite');
        const store = tx.objectStore('folders');
        const req = store.put(folder);
        req.onsuccess = () => resolve(folder);
        req.onerror = () => reject(req.error);
      });
    }

    async deleteFolder(folderId) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['folders', 'prompts'], 'readwrite');
        const fStore = tx.objectStore('folders');
        const pStore = tx.objectStore('prompts');

        fStore.delete(folderId);

        const pReq = pStore.getAll();
        pReq.onsuccess = () => {
          const prompts = pReq.result || [];
          for (const p of prompts) {
            if (p.folderId === folderId) {
              p.folderId = null;
              pStore.put(p);
            }
          }
          resolve(true);
        };
        tx.onerror = () => reject(tx.error);
      });
    }

    async clearAllData() {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['prompts', 'folders'], 'readwrite');
        tx.objectStore('prompts').clear();
        tx.objectStore('folders').clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  const db = new AISDatabase();

  // =========================================================================
  // 2. NETWORK INTERCEPTOR & API CLIENT
  // =========================================================================

  class AISApiClient {
    constructor() {
      this.capturedHeaders = null;
      this.knownPrompts = new Map();
      this.isIndexing = false;
      this.stopRequested = false;
      this.loadCachedHeaders();
    }

    loadCachedHeaders() {
      try {
        const cached = localStorage.getItem('AIS_CAPTURED_HEADERS');
        if (cached) {
          this.capturedHeaders = JSON.parse(cached);
        }
      } catch (e) {
        console.warn('[AIS Enhancer] Failed to load cached headers', e);
      }
    }

    saveHeaders(headers) {
      this.capturedHeaders = headers;
      try {
        localStorage.setItem('AIS_CAPTURED_HEADERS', JSON.stringify(headers));
      } catch (e) {}
    }

    learnHeaders(url, headersObj) {
      if (!url.includes('alkalimakersuite-pa.clients6.google.com')) return;

      const KEEP_KEYS = [
        'authorization',
        'x-goog-api-key',
        'x-goog-authuser',
        'x-aistudio-visit-id',
        'x-browser-channel',
        'x-browser-copyright',
        'x-browser-validation',
        'x-browser-year',
        'x-client-data',
        'x-goog-ext-519733851-bin',
        'x-user-agent',
      ];

      const kept = this.capturedHeaders ? { ...this.capturedHeaders } : {};
      for (const [k, v] of Object.entries(headersObj)) {
        const lk = k.toLowerCase();
        if (KEEP_KEYS.includes(lk) && v) {
          kept[lk] = v;
        }
      }

      if (Object.keys(kept).length > 0) {
        this.saveHeaders(kept);
      }
    }

    async executeRpc(method, body) {
      if (!this.capturedHeaders) {
        throw new Error('Сессионные заголовки Google AI Studio еще не захвачены. Пожалуйста, откройте любой диалог или обновите страницу.');
      }

      const url = `${RPC_BASE_URL}/${method}`;
      const headers = {
        'content-type': 'application/json+protobuf',
        'accept': '*/*',
        ...this.capturedHeaders,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        credentials: 'include',
        mode: 'cors',
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error(`[AIS Enhancer] RPC ${method} failed with HTTP ${res.status}:`, errorText);
        throw new Error(`RPC ${method} error: HTTP ${res.status} - ${errorText.slice(0, 150)}`);
      }

      const text = await res.text();
      const clean = text.replace(/^\)\]\}'/, '').trim();
      return JSON.parse(clean);
    }

    async fetchRawPrompt(promptId) {
      return await this.executeRpc('ResolveDriveResource', [promptId]);
    }

    async fetchPromptDetails(promptId) {
      const data = await this.fetchRawPrompt(promptId);
      return AISParser.parseConversation(data);
    }

    async fetchPromptList() {
      const data = await this.executeRpc('ListPrompts', []);
      return AISParser.parsePromptList(data);
    }

    async indexAllPrompts(onProgress) {
      if (this.isIndexing) return;
      this.isIndexing = true;
      this.stopRequested = false;

      try {
        const list = Array.from(this.knownPrompts.values());
        if (list.length === 0) {
          try {
            const fetchedList = await this.fetchPromptList();
            for (const item of fetchedList) {
              if (item.title !== SYNC_PROMPT_TITLE) {
                this.knownPrompts.set(item.id, item);
              }
            }
          } catch (e) {
            console.warn('[AIS Enhancer] Could not fetch prompt list directly:', e);
          }
        }

        const promptsToIndex = Array.from(this.knownPrompts.values()).filter((p) => p.title !== SYNC_PROMPT_TITLE);
        const total = promptsToIndex.length;
        let completed = 0;

        for (const p of promptsToIndex) {
          if (this.stopRequested) break;

          const existing = await db.getPrompt(p.id);

          // Fixed check: if already indexed and prompt hasn't changed, skip!
          if (existing && existing.indexedAt && existing.indexedAt >= (p.updatedAt || 0)) {
            completed++;
            if (onProgress) onProgress({ current: completed, total, currentTitle: p.title });
            continue;
          }

          try {
            const parsed = await this.fetchPromptDetails(p.id);
            if (parsed) {
              if (existing && existing.folderId) {
                parsed.folderId = existing.folderId;
              }
              parsed.indexedAt = Date.now();
              // Check if prompt is empty or structured/non-chat
              if (!parsed.messages || parsed.messages.length === 0) {
                parsed.isNonChat = true;
              }
              await db.savePrompt(parsed);
            } else {
              // Mark empty stub as processed
              await db.savePrompt({
                id: p.id,
                title: p.title,
                folderId: existing?.folderId || null,
                updatedAt: p.updatedAt || Date.now(),
                messages: [],
                indexedAt: Date.now(),
                isNonChat: true,
              });
            }
          } catch (err) {
            console.warn(`[AIS Enhancer] Failed to index prompt ${p.id}:`, err);
            // Even on error, mark indexedAt to prevent endless loop on bad prompts
            await db.savePrompt({
              id: p.id,
              title: p.title,
              folderId: existing?.folderId || null,
              updatedAt: p.updatedAt || Date.now(),
              messages: existing?.messages || [],
              indexedAt: Date.now(),
              error: err.message,
            });
          }

          completed++;
          if (onProgress) onProgress({ current: completed, total, currentTitle: p.title });

          // Polite throttle delay to avoid HTTP 429
          await new Promise((r) => setTimeout(r, 240));
        }

        // Trigger debounced cloud auto-sync if enabled
        driveSync.triggerAutoSync();
      } finally {
        this.isIndexing = false;
        this.stopRequested = false;
      }
    }

    stopIndexing() {
      this.stopRequested = true;
    }
  }

  const apiClient = new AISApiClient();

  // =========================================================================
  // 3. PARSER ENGINE
  // =========================================================================

  class AISParser {
    static isTurn(arr) {
      if (!Array.isArray(arr)) return false;
      return arr.includes('user') || arr.includes('model');
    }

    static findHistoryRecursive(node, depth = 0) {
      if (depth > 5 || !Array.isArray(node)) return null;

      const firstFew = node.slice(0, 5);
      const childrenAreTurns = firstFew.some((c) => Array.isArray(c) && AISParser.isTurn(c));
      if (childrenAreTurns) return node;

      for (const child of node) {
        if (Array.isArray(child)) {
          const res = AISParser.findHistoryRecursive(child, depth + 1);
          if (res) return res;
        }
      }
      return null;
    }

    static extractTextFromTurn(turn) {
      const candidates = [];
      function scan(item, d = 0) {
        if (d > 4) return;
        if (typeof item === 'string' && item.length > 0) {
          if (!['user', 'model', 'function'].includes(item)) {
            candidates.push(item);
          }
        } else if (Array.isArray(item)) {
          item.forEach((sub) => scan(sub, d + 1));
        }
      }
      scan(turn.slice(0, 4));
      return candidates.sort((a, b) => b.length - a.length)[0] || '';
    }

    static isThinkingTurn(turn) {
      return Array.isArray(turn) && turn.length > 19 && turn[19] === 1;
    }

    static isResponseTurn(turn) {
      return Array.isArray(turn) && turn.length > 16 && turn[16] === 1;
    }

    static parseConversation(json) {
      try {
        let root = json;
        if (Array.isArray(json) && json.length > 0 && Array.isArray(json[0]) && typeof json[0][0] === 'string' && json[0][0].startsWith('prompts/')) {
          root = json[0];
        } else if (Array.isArray(json) && typeof json[0] === 'string' && json[0].startsWith('prompts/')) {
          root = json;
        }

        if (!Array.isArray(root) || typeof root[0] !== 'string') return null;

        const id = root[0].split('/').pop() || '';
        let title = 'Без названия';
        let updatedAt = Date.now();

        const meta = root[4];
        if (Array.isArray(meta)) {
          if (typeof meta[0] === 'string' && meta[0].trim()) {
            title = meta[0].trim();
          }
          if (Array.isArray(meta[4]) && meta[4][0]) {
            const ts = parseInt(meta[4][0][0], 10);
            if (!isNaN(ts) && ts > 0) updatedAt = ts < 1e11 ? ts * 1000 : ts;
          }
        }

        const historyArray = AISParser.findHistoryRecursive(root);
        const messages = [];

        if (historyArray) {
          for (const turn of historyArray) {
            if (!Array.isArray(turn)) continue;

            const isUser = turn.includes('user');
            const isModel = turn.includes('model');
            const text = AISParser.extractTextFromTurn(turn);

            if (!text || !text.trim()) continue;

            if (isUser) {
              messages.push({
                role: 'user',
                type: 'user',
                text: text.trim(),
              });
            } else if (isModel) {
              const thinking = AISParser.isThinkingTurn(turn);
              const response = AISParser.isResponseTurn(turn);

              let type = 'model';
              if (thinking && !response) {
                type = 'thought';
              }

              messages.push({
                role: 'model',
                type,
                text: text.trim(),
              });
            }
          }
        }

        return {
          id,
          title,
          updatedAt,
          messages,
          indexedAt: Date.now(),
          isNonChat: messages.length === 0,
        };
      } catch (e) {
        console.error('[AIS Enhancer] Error parsing conversation JSON:', e);
        return null;
      }
    }

    static parsePromptList(json) {
      const items = [];
      try {
        let rawList = json;
        if (Array.isArray(json) && Array.isArray(json[0])) {
          rawList = json[0];
        }

        if (!Array.isArray(rawList)) return items;

        for (const item of rawList) {
          if (!Array.isArray(item) || typeof item[0] !== 'string') continue;
          const id = item[0].split('/').pop();
          if (!id) continue;

          let title = 'Без названия';
          let updatedAt = Date.now();

          if (item[4] && Array.isArray(item[4])) {
            if (typeof item[4][0] === 'string' && item[4][0].trim()) {
              title = item[4][0].trim();
            }
            if (Array.isArray(item[4][4]) && item[4][4][0]) {
              const ts = parseInt(item[4][4][0], 10);
              if (!isNaN(ts) && ts > 0) updatedAt = ts < 1e11 ? ts * 1000 : ts;
            }
          }

          items.push({ id, title, updatedAt });
        }
      } catch (e) {
        console.error('[AIS Enhancer] Error parsing prompt list:', e);
      }
      return items;
    }
  }

  // =========================================================================
  // 4. GOOGLE DRIVE SYNC ENGINE (NATIVE MAKER SUITE RPC)
  // =========================================================================

  class AISDriveSync {
    constructor() {
      this.syncPromptId = null;
      this.autoSyncTimer = null;
      this.isSyncing = false;
      this.activePushPromise = null;
      this.activePullPromise = null;
      this.lastSyncStatus = 'idle'; // 'idle' | 'syncing' | 'saved' | 'error'
      this.lastSyncMessage = '';
    }

    async findSyncPromptId() {
      if (this.syncPromptId) return this.syncPromptId;

      const cachedId = GM_getValue('ais_sync_prompt_id', null);
      if (cachedId) {
        this.syncPromptId = cachedId;
        return cachedId;
      }

      // 1. Check known prompts in memory
      for (const [id, p] of apiClient.knownPrompts.entries()) {
        if (p.title && (p.title === SYNC_PROMPT_TITLE || p.title.includes('AI Studio Enhancer Sync'))) {
          this.syncPromptId = id;
          GM_setValue('ais_sync_prompt_id', id);
          return id;
        }
      }

      // 2. Fetch list from API
      try {
        const list = await apiClient.fetchPromptList();
        for (const item of list) {
          if (item.title && (item.title === SYNC_PROMPT_TITLE || item.title.includes('AI Studio Enhancer Sync'))) {
            this.syncPromptId = item.id;
            GM_setValue('ais_sync_prompt_id', item.id);
            return item.id;
          }
        }
      } catch (e) {
        console.warn('[AIS Enhancer] Error finding sync prompt:', e);
      }

      return null;
    }

    async createSyncPrompt(payloadString) {
      console.log('[AIS Enhancer] Creating new sync prompt on Google Drive...');

      // Find any existing prompt to clone its envelope structure
      let samplePrompt = null;
      for (const [id] of apiClient.knownPrompts.entries()) {
        try {
          samplePrompt = await apiClient.fetchRawPrompt(id);
          if (samplePrompt) break;
        } catch (e) {}
      }

      let root;
      if (samplePrompt) {
        root = JSON.parse(JSON.stringify(samplePrompt));
        if (Array.isArray(root) && root.length === 1 && Array.isArray(root[0])) {
          root = root[0];
        }
        // Retain only valid input fields 0..4 (omit server-generated read-only output fields)
        root = root.slice(0, 5);
        root[0] = null; // Unset ID for CreatePrompt
        root[4] = [SYNC_PROMPT_TITLE]; // Strip Drive metadata array to prevent HTTP 400

        const turns = [["user", [payloadString]]];
        // Preserve chunk envelope structure
        root[2] = Array.isArray(root[2]) && Array.isArray(root[2][0]) ? [[turns[0]]] : [turns];
      } else {
        root = [
          null,
          null,
          [[["user", [payloadString]]]],
          [null, null, "models/gemini-2.5-flash"],
          [SYNC_PROMPT_TITLE]
        ];
      }

      let res = null;
      let lastErr = null;
      const variations = [
        [root],
        [[root]],
        ["", root]
      ];

      for (const payload of variations) {
        try {
          res = await apiClient.executeRpc('CreatePrompt', payload);
          if (res) break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!res && lastErr) {
        throw lastErr;
      }

      let newId = null;
      if (Array.isArray(res) && typeof res[0] === 'string') {
        newId = res[0].split('/').pop();
      } else if (Array.isArray(res) && Array.isArray(res[0]) && typeof res[0][0] === 'string') {
        newId = res[0][0].split('/').pop();
      }

      if (!newId) {
        throw new Error('Не удалось создать файл синхронизации на Google Диске.');
      }

      this.syncPromptId = newId;
      GM_setValue('ais_sync_prompt_id', newId);
      apiClient.knownPrompts.set(newId, { id: newId, title: SYNC_PROMPT_TITLE, updatedAt: Date.now() });
      return newId;
    }

    async updateSyncPrompt(promptId, payloadString) {
      console.log('[AIS Enhancer] Updating sync prompt on Google Drive, ID:', promptId);
      const rawData = await apiClient.fetchRawPrompt(promptId);
      let root = rawData;
      if (Array.isArray(root) && root.length === 1 && Array.isArray(root[0])) {
        root = root[0];
      }

      if (Array.isArray(root[4])) {
        root[4][0] = SYNC_PROMPT_TITLE;
      }
      root[2] = [["user", [payloadString]]];

      await apiClient.executeRpc('UpdatePrompt', [root]);
    }

    // High-Level: Push local database to Google Drive
    async pushToDrive(onStatus) {
      if (this.isSyncing && this.activePushPromise) {
        if (onStatus) onStatus('Ожидание завершения текущей синхронизации...');
        return await this.activePushPromise;
      }
      this.isSyncing = true;
      this.lastSyncStatus = 'syncing';
      uiManager.updateCloudStatus('☁️ Сохранение в Google Диск...');

      this.activePushPromise = (async () => {
        try {
          if (onStatus) onStatus('Сбор локальных данных (папки, привязка диалогов)...');
          const folders = await db.getAllFolders();
          const prompts = await db.getAllPrompts();

          const promptFolders = {};
          const promptMetas = [];
          for (const p of prompts) {
            if (p.title === SYNC_PROMPT_TITLE) continue;
            if (p.folderId) {
              promptFolders[p.id] = p.folderId;
            }
            promptMetas.push({
              id: p.id,
              title: p.title || 'Без названия',
              folderId: p.folderId || null,
              updatedAt: p.updatedAt || 0,
            });
          }

          const payload = {
            app: 'AIStudioEnhancedSync',
            version: SCRIPT_VERSION,
            syncTimestamp: Date.now(),
            folders,
            promptFolders,
            prompts: promptMetas,
          };

          const jsonStr = JSON.stringify(payload);
          const encodedData = 'AIS_SYNC_PAYLOAD::' + encodeURIComponent(jsonStr);

          if (onStatus) onStatus('Поиск файла синхронизации на Google Диске...');
          let syncId = await this.findSyncPromptId();

          if (syncId) {
            if (onStatus) onStatus('Обновление файла на Google Диске...');
            await this.updateSyncPrompt(syncId, encodedData);
          } else {
            if (onStatus) onStatus('Создание файла на Google Диске...');
            syncId = await this.createSyncPrompt(encodedData);
          }

          GM_setValue('ais_last_sync_timestamp', payload.syncTimestamp);
          this.lastSyncStatus = 'saved';
          this.lastSyncMessage = `Синхронизировано: ${new Date().toLocaleTimeString()}`;
          uiManager.updateCloudStatus('☁️ Все изменения сохранены в облаке', 'saved');

          return {
            promptCount: Object.keys(promptFolders).length || prompts.length,
            folderCount: folders.length,
            syncId,
          };
        } catch (err) {
          this.lastSyncStatus = 'idle';
          this.lastSyncMessage = err.message;
          const msg = err.message || '';
          if (msg.includes('401') || msg.includes('авторизация') || msg.includes('сессионные заголовки') || msg.includes('CREDENTIALS_MISSING')) {
            uiManager.updateCloudStatus('☁️ Откройте любой диалог для инициализации синхронизации', 'idle');
          } else {
            uiManager.updateCloudStatus('☁️ Синхронизация отложена (повтор при открытии диалога)', 'idle');
          }
          console.warn('[AIS Enhancer] Drive sync deferred:', err.message);
        } finally {
          this.isSyncing = false;
          this.activePushPromise = null;
        }
      })();

      return await this.activePushPromise;
    }

    // High-Level: Pull data from Google Drive
    async pullFromDrive(onStatus) {
      if (this.isSyncing && this.activePullPromise) {
        if (onStatus) onStatus('Ожидание завершения текущей загрузки...');
        return await this.activePullPromise;
      }
      this.isSyncing = true;
      uiManager.updateCloudStatus('☁️ Загрузка из Google Диска...');

      this.activePullPromise = (async () => {
        try {
          if (onStatus) onStatus('Поиск файла синхронизации на Google Диске...');
          const syncId = await this.findSyncPromptId();
          if (!syncId) {
            throw new Error(`Файл синхронизации '${SYNC_PROMPT_TITLE}' не найден на Google Диске. Сначала сохраните данные на первом ПК.`);
          }

          if (onStatus) onStatus('Скачивание данных с Google Диска...');
          const rawData = await apiClient.fetchRawPrompt(syncId);
          let root = rawData;
          if (Array.isArray(root) && root.length === 1 && Array.isArray(root[0])) {
            root = root[0];
          }

          const turnText = AISParser.extractTextFromTurn(root[2]?.[0] || []);
          if (!turnText || !turnText.startsWith('AIS_SYNC_PAYLOAD::')) {
            throw new Error('Файл на Google Диске не содержит корректных данных синхронизации.');
          }

          const jsonStr = decodeURIComponent(turnText.replace('AIS_SYNC_PAYLOAD::', ''));
          const data = JSON.parse(jsonStr);

          if (data.app !== 'AIStudioEnhancedSync' || !data.folders) {
            throw new Error('Некорректная структура файла синхронизации Google Диска.');
          }

          if (onStatus) onStatus('Импорт папок...');
          for (const f of data.folders) {
            await db.saveFolder({
              ...f,
              parentId: f.parentId || null,
            });
          }

          if (onStatus) onStatus('Привязка диалогов к папкам...');
          if (data.promptFolders) {
            for (const [pId, fId] of Object.entries(data.promptFolders)) {
              await db.updatePromptFolder(pId, fId);
            }
          }

          if (Array.isArray(data.prompts)) {
            for (const p of data.prompts) {
              const existing = await db.getPrompt(p.id);
              if (existing) {
                if (p.folderId) existing.folderId = p.folderId;
                await db.savePrompt(existing);
              }
              apiClient.knownPrompts.set(p.id, { id: p.id, title: p.title, updatedAt: p.updatedAt });
            }
          }

          GM_setValue('ais_last_sync_timestamp', data.syncTimestamp || Date.now());
          this.lastSyncStatus = 'saved';
          this.lastSyncMessage = `Синхронизировано: ${new Date().toLocaleTimeString()}`;
          uiManager.updateCloudStatus('☁️ Все изменения сохранены в облаке', 'saved');
          uiManager.refreshDialogHeader();
          uiManager.refreshFolderCounts();

          return {
            promptCount: Object.keys(data.promptFolders || {}).length || data.prompts?.length || 0,
            folderCount: data.folders?.length || 0,
            syncTimestamp: data.syncTimestamp,
          };
        } catch (err) {
          this.lastSyncStatus = 'error';
          this.lastSyncMessage = err.message;
          uiManager.updateCloudStatus('☁️ Ошибка синхронизации', 'error');
          throw err;
        } finally {
          this.isSyncing = false;
          this.activePullPromise = null;
        }
      })();

      return await this.activePullPromise;
    }

    // Schedule debounced auto-sync (Google Sheets mode)
    triggerAutoSync(delayMs = 5000) {
      const autoSyncEnabled = GM_getValue('ais_autosync_cloud', true);
      if (!autoSyncEnabled) return;

      clearTimeout(this.autoSyncTimer);
      uiManager.updateCloudStatus('☁️ Ожидание автосохранения...');

      this.autoSyncTimer = setTimeout(async () => {
        try {
          console.log('[AIS Enhancer] Auto-saving changes to Google Drive...');
          await this.pushToDrive();
        } catch (e) {
          console.warn('[AIS Enhancer] Auto-sync failed:', e);
        }
      }, delayMs);
    }
  }

  const driveSync = new AISDriveSync();

  // =========================================================================
  // 5. NETWORK PROXY & LIVE INCREMENTAL INDEXING
  // =========================================================================

  function setupNetworkInterception() {
    const originalFetch = win.fetch;
    win.fetch = async function (...args) {
      const [resource, config] = args;
      const url = typeof resource === 'string' ? resource : resource?.url || '';

      if (url.includes('alkalimakersuite-pa.clients6.google.com')) {
        const headers = config?.headers || {};
        const normalizedHeaders = {};
        if (headers instanceof Headers) {
          headers.forEach((v, k) => { normalizedHeaders[k] = v; });
        } else if (Array.isArray(headers)) {
          headers.forEach(([k, v]) => { normalizedHeaders[k] = v; });
        } else if (typeof headers === 'object') {
          Object.assign(normalizedHeaders, headers);
        }
        apiClient.learnHeaders(url, normalizedHeaders);

        if (config?.body && typeof config.body === 'string' && (url.includes('CreatePrompt') || url.includes('UpdatePrompt'))) {
          try {
            localStorage.setItem('AIS_LAST_RPC_BODY', config.body);
          } catch (e) {}
        }

        // If sync was waiting for session auth, trigger it now
        if (driveSync && driveSync.lastSyncStatus === 'idle') {
          driveSync.triggerAutoSync();
        }
      }

      const response = await originalFetch.apply(this, args);

      if (url.includes('alkalimakersuite-pa.clients6.google.com')) {
        try {
          const clone = response.clone();
          clone.text().then((text) => {
            handleApiResponse(url, text);
          }).catch(() => {});
        } catch (e) {}
      }

      return response;
    };

    const originalOpen = win.XMLHttpRequest.prototype.open;
    const originalSetRequestHeader = win.XMLHttpRequest.prototype.setRequestHeader;
    const originalSend = win.XMLHttpRequest.prototype.send;

    win.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._ais_url = typeof url === 'string' ? url : '';
      this._ais_headers = {};
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    win.XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
      if (this._ais_headers) {
        this._ais_headers[header] = value;
      }
      return originalSetRequestHeader.apply(this, [header, value]);
    };

    win.XMLHttpRequest.prototype.send = function (body) {
      if (this._ais_url && this._ais_url.includes('alkalimakersuite-pa.clients6.google.com')) {
        if (this._ais_headers) {
          apiClient.learnHeaders(this._ais_url, this._ais_headers);
        }
        this.addEventListener('load', () => {
          try {
            if (this.responseText) {
              handleApiResponse(this._ais_url, this.responseText);
            }
          } catch (e) {}
        });
      }
      return originalSend.apply(this, [body]);
    };
  }

  async function handleApiResponse(url, rawText) {
    try {
      const cleanText = rawText.replace(/^\)\]\}'/, '').trim();
      const json = JSON.parse(cleanText);

      if (url.includes('ListPrompts')) {
        const prompts = AISParser.parsePromptList(json);
        for (const p of prompts) {
          if (p.title === SYNC_PROMPT_TITLE) {
            driveSync.syncPromptId = p.id;
            continue; // Do not add sync prompt to user's chat list
          }
          apiClient.knownPrompts.set(p.id, p);
          const existing = await db.getPrompt(p.id);
          if (existing) {
            existing.title = p.title;
            existing.updatedAt = p.updatedAt;
            await db.savePrompt(existing);
          } else {
            await db.savePrompt({
              id: p.id,
              title: p.title,
              folderId: null,
              updatedAt: p.updatedAt,
              messages: [],
              indexedAt: 0,
            });
          }
        }
        uiManager.refreshDialogHeader();
        uiManager.refreshFolderCounts();
      } else if (url.includes('ResolveDriveResource') || url.includes('UpdatePrompt') || url.includes('CreatePrompt')) {
        const parsed = AISParser.parseConversation(json);
        if (parsed && parsed.id) {
          if (parsed.title === SYNC_PROMPT_TITLE) {
            driveSync.syncPromptId = parsed.id;
            return;
          }

          apiClient.knownPrompts.set(parsed.id, {
            id: parsed.id,
            title: parsed.title,
            updatedAt: parsed.updatedAt,
          });

          // Live auto-indexing of active chat
          await db.savePrompt(parsed);
          uiManager.refreshDialogHeader();
          uiManager.refreshFolderCounts();

          // Debounced auto-sync to Google Drive (Google Sheets style)
          driveSync.triggerAutoSync(6000);
        }
      }
    } catch (e) {}
  }

  // =========================================================================
  // 6. FULL-TEXT SEARCH ENGINE
  // =========================================================================

  class AISSearchEngine {
    static escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    static highlightSnippet(text, query, maxSnippetLen = 140) {
      if (!text || !query) return '';
      const lowerText = text.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const idx = lowerText.indexOf(lowerQuery);

      if (idx === -1) {
        return text.length > maxSnippetLen ? text.slice(0, maxSnippetLen) + '...' : text;
      }

      const start = Math.max(0, idx - 45);
      const end = Math.min(text.length, idx + query.length + 95);
      let snippet = text.slice(start, end);

      if (start > 0) snippet = '...' + snippet;
      if (end < text.length) snippet = snippet + '...';

      const regex = new RegExp(`(${AISSearchEngine.escapeRegExp(query)})`, 'gi');
      return snippet.replace(regex, '<mark class="ais-highlight">$1</mark>');
    }

    static async searchIndexed(query, options = {}) {
      return AISSearchEngine.search(query, options);
    }

    static async search(query, options = {}) {
      const searchUser = options.searchUser !== undefined ? options.searchUser : true;
      const searchModel = options.searchModel !== undefined ? options.searchModel : true;
      const searchThought = options.searchThinking !== undefined ? options.searchThinking : (options.searchThought !== undefined ? options.searchThought : true);
      const searchTitle = options.searchTitle !== undefined ? options.searchTitle : true;
      const folderId = options.folderId || null;

      const trimmed = query.trim().toLowerCase();
      if (!trimmed) return [];

      const allPrompts = await db.getAllPrompts();
      const results = [];

      for (const prompt of allPrompts) {
        if (prompt.title === SYNC_PROMPT_TITLE) continue;
        if (folderId && prompt.folderId !== folderId) continue;

        const matches = [];
        let hasTitleMatch = false;

        // 1. Title match
        if (searchTitle && prompt.title) {
          if (prompt.title.toLowerCase().includes(trimmed)) {
            hasTitleMatch = true;
            matches.push({
              type: 'title',
              label: 'Заголовок',
              snippet: AISSearchEngine.highlightSnippet(prompt.title, trimmed),
            });
          }
        }

        // 2. Messages match
        if (Array.isArray(prompt.messages)) {
          for (const msg of prompt.messages) {
            let matchesType = false;
            let label = '';

            if (msg.type === 'user' && searchUser) {
              matchesType = true;
              label = 'Пользователь';
            } else if (msg.type === 'model' && searchModel) {
              matchesType = true;
              label = 'Ответ ИИ';
            } else if (msg.type === 'thought' && searchThought) {
              matchesType = true;
              label = 'Размышления ИИ';
            }

            if (matchesType && msg.text && msg.text.toLowerCase().includes(trimmed)) {
              matches.push({
                type: msg.type,
                label,
                snippet: AISSearchEngine.highlightSnippet(msg.text, trimmed),
              });
            }
          }
        }

        if (matches.length > 0) {
          const primary = matches[0];
          let badge = 'Match';
          if (primary.type === 'thought') badge = 'Thinking';
          else if (primary.type === 'model') badge = 'Model Response';
          else if (primary.type === 'user') badge = 'User Prompt';
          else if (primary.type === 'title') badge = 'Chat Title';

          results.push({
            id: prompt.id,
            title: prompt.title || 'Без названия',
            updatedAt: prompt.updatedAt || 0,
            folderId: prompt.folderId,
            matchCount: matches.length,
            hasTitleMatch,
            badge,
            snippet: primary.snippet,
            matches: matches.slice(0, 15),
          });
        }
      }

      results.sort((a, b) => {
        if (a.hasTitleMatch && !b.hasTitleMatch) return -1;
        if (!a.hasTitleMatch && b.hasTitleMatch) return 1;
        if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      return results;
    }
  }

  // =========================================================================
  // 7. FOLDER MANAGER ENGINE
  // =========================================================================

  class AISFolderManager {
    static async createFolder(name, color = '#1a73e8', parentId = null) {
      const id = 'folder_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const folder = {
        id,
        name: name.trim() || 'Новая папка',
        color,
        parentId: parentId || null,
        createdAt: Date.now(),
        order: Date.now(),
      };
      await db.saveFolder(folder);
      driveSync.triggerAutoSync();
      return folder;
    }

    static async renameFolder(folderId, newName) {
      const folders = await db.getAllFolders();
      const target = folders.find((f) => f.id === folderId);
      if (target) {
        target.name = newName.trim();
        await db.saveFolder(target);
        driveSync.triggerAutoSync();
      }
    }

    static getDescendantFolderIds(folderId, folders) {
      const descendants = new Set();
      function collect(pId) {
        for (const f of folders) {
          if (f.parentId === pId && !descendants.has(f.id)) {
            descendants.add(f.id);
            collect(f.id);
          }
        }
      }
      collect(folderId);
      return descendants;
    }

    static async deleteFolder(folderId) {
      const folders = await db.getAllFolders();
      const descendantIds = this.getDescendantFolderIds(folderId, folders);
      const allToDelete = [folderId, ...Array.from(descendantIds)];

      for (const id of allToDelete) {
        await db.deleteFolder(id);
      }
      driveSync.triggerAutoSync();
    }

    static async assignPromptToFolder(promptId, folderId) {
      await db.updatePromptFolder(promptId, folderId);
      driveSync.triggerAutoSync();
    }

    static buildFolderTree(folders, prompts = []) {
      const map = new Map();
      const roots = [];

      // Calculate direct prompt counts per folder
      const directCounts = new Map();
      for (const p of prompts) {
        if (p.folderId) {
          directCounts.set(p.folderId, (directCounts.get(p.folderId) || 0) + 1);
        }
      }

      for (const f of folders) {
        const dCount = directCounts.get(f.id) || 0;
        map.set(f.id, {
          ...f,
          parentId: f.parentId || null,
          children: [],
          directCount: dCount,
          totalCount: dCount,
        });
      }

      for (const node of map.values()) {
        if (node.parentId && map.has(node.parentId)) {
          map.get(node.parentId).children.push(node);
        } else {
          roots.push(node);
        }
      }

      // Calculate recursive total counts including all descendants
      function calculateSubtreeTotal(node) {
        let sum = node.directCount;
        for (const child of node.children) {
          sum += calculateSubtreeTotal(child);
        }
        node.totalCount = sum;
        return sum;
      }

      for (const r of roots) {
        calculateSubtreeTotal(r);
      }

      function sortNodes(nodes) {
        nodes.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
        for (const n of nodes) {
          if (n.children.length > 0) sortNodes(n.children);
        }
      }
      sortNodes(roots);
      return roots;
    }

    static getFlattenedTree(folders) {
      const roots = this.buildFolderTree(folders);
      const result = [];
      function traverse(node, depth = 0) {
        result.push({ ...node, depth });
        for (const child of node.children) {
          traverse(child, depth + 1);
        }
      }
      for (const r of roots) {
        traverse(r, 0);
      }
      return result;
    }

    static getFolderPath(folderId, folders) {
      if (!folderId) return [];
      const map = new Map(folders.map((f) => [f.id, f]));
      const path = [];
      let currentId = folderId;
      const visited = new Set();
      while (currentId && map.has(currentId) && !visited.has(currentId)) {
        visited.add(currentId);
        const f = map.get(currentId);
        path.unshift(f);
        currentId = f.parentId || null;
      }
      return path;
    }

    static async exportStructure() {
      const folders = await db.getAllFolders();
      const prompts = await db.getAllPrompts();
      const promptFolders = {};
      for (const p of prompts) {
        if (p.folderId) {
          promptFolders[p.id] = p.folderId;
        }
      }

      const backup = {
        version: SCRIPT_VERSION,
        exportedAt: new Date().toISOString(),
        folders: folders.map((f) => ({ ...f, parentId: f.parentId || null })),
        promptFolders,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aistudio_folders_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    static async importStructure(jsonFile) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const data = JSON.parse(e.target.result);
            if (!data.folders) throw new Error('Некорректный формат файла резервной копии');

            for (const f of data.folders) {
              await db.saveFolder({
                ...f,
                parentId: f.parentId || null,
              });
            }
            if (data.promptFolders) {
              for (const [pId, fId] of Object.entries(data.promptFolders)) {
                await db.updatePromptFolder(pId, fId);
              }
            }
            driveSync.triggerAutoSync();
            resolve(true);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(jsonFile);
      });
    }
  }

  // =========================================================================
  // 8. USER INTERFACE & STYLING
  // =========================================================================

  const UI_STYLES = `
    :root {
      --ais-primary: #1a73e8;
      --ais-primary-hover: #1557b0;
      --ais-bg: #ffffff;
      --ais-surface: #f8f9fa;
      --ais-border: #dadce0;
      --ais-text: #202124;
      --ais-text-secondary: #5f6368;
      --ais-badge-user: #e8f0fe;
      --ais-badge-user-text: #1967d2;
      --ais-badge-model: #e6f4ea;
      --ais-badge-model-text: #137333;
      --ais-badge-thought: #fef7e0;
      --ais-badge-thought-text: #b06000;
      --ais-badge-title: #fce8e6;
      --ais-badge-title-text: #c5221f;
      --ais-cloud: #0b57d0;
      --ais-cloud-bg: #edf2fa;
      --ais-success: #1e8e3e;
      --ais-card-bg: #ffffff;
    }

    @media (prefers-color-scheme: dark) {
      body.dark-theme, body[data-theme='dark'], :root {
        --ais-primary: #8ab4f8;
        --ais-primary-hover: #aecbfa;
        --ais-bg: #202124;
        --ais-surface: #2d2e30;
        --ais-border: #3c4043;
        --ais-text: #e8eaed;
        --ais-text-secondary: #9aa0a6;
        --ais-badge-user: #174ea6;
        --ais-badge-user-text: #d2e3fc;
        --ais-badge-model: #0d652d;
        --ais-badge-model-text: #ceead6;
        --ais-badge-thought: #7c4a03;
        --ais-badge-thought-text: #feefc3;
        --ais-badge-title: #a50e0e;
        --ais-badge-title-text: #fad2cf;
        --ais-cloud: #a8c7fa;
        --ais-cloud-bg: #0842a0;
        --ais-success: #81c995;
        --ais-card-bg: #28292c;
      }
    }

    #ais-launcher-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--ais-primary);
      color: #ffffff;
      padding: 10px 16px;
      border-radius: 28px;
      border: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      cursor: pointer;
      font-family: 'Google Sans', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      transition: transform 0.2s, background-color 0.2s, box-shadow 0.2s;
    }
    #ais-launcher-btn:hover {
      background: var(--ais-primary-hover);
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0,0,0,0.35);
    }
    #ais-launcher-btn svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }

    #ais-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(2px);
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }
    #ais-modal-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    #ais-modal {
      width: 960px;
      max-width: 95vw;
      height: 86vh;
      background: var(--ais-bg);
      color: var(--ais-text);
      border-radius: 12px;
      border: 1px solid var(--ais-border);
      box-shadow: 0 12px 36px rgba(0,0,0,0.35);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: 'Google Sans', Roboto, sans-serif;
    }

    .ais-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      border-bottom: 1px solid var(--ais-border);
      background: var(--ais-surface);
    }
    .ais-tabs {
      display: flex;
      gap: 8px;
    }
    .ais-tab {
      padding: 8px 14px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: var(--ais-text-secondary);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .ais-tab:hover {
      background: rgba(128,128,128,0.1);
      color: var(--ais-text);
    }
    .ais-tab.active {
      background: var(--ais-primary);
      color: #ffffff;
    }

    .ais-header-sync {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .ais-sync-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 500;
      color: var(--ais-text-secondary);
      cursor: pointer;
    }
    .ais-sync-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #fbbc04;
    }
    .ais-sync-dot.saved { background: var(--ais-success); }
    .ais-sync-dot.error { background: #d93025; }

    .ais-close-btn {
      background: transparent;
      border: none;
      color: var(--ais-text-secondary);
      font-size: 20px;
      cursor: pointer;
      padding: 6px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ais-close-btn:hover {
      background: rgba(128,128,128,0.15);
      color: var(--ais-text);
    }

    .ais-modal-body {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    /* SEARCH VIEW */
    .ais-search-view {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 20px;
      overflow: hidden;
    }
    .ais-search-box {
      display: flex;
      align-items: center;
      background: var(--ais-surface);
      border: 1px solid var(--ais-border);
      border-radius: 8px;
      padding: 10px 14px;
      gap: 10px;
    }
    .ais-search-box input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--ais-text);
      font-size: 16px;
      outline: none;
    }

    .ais-filters-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
      margin: 14px 0 10px 0;
      padding: 10px 14px;
      background: var(--ais-surface);
      border-radius: 8px;
      border: 1px solid var(--ais-border);
    }
    .ais-filter-title {
      font-size: 13px;
      font-weight: bold;
      color: var(--ais-text-secondary);
      margin-right: 4px;
    }
    .ais-checkbox-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--ais-text);
      cursor: pointer;
      user-select: none;
    }
    .ais-checkbox-label input {
      cursor: pointer;
      accent-color: var(--ais-primary);
      width: 16px;
      height: 16px;
    }

    .ais-index-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--ais-text-secondary);
    }
    .ais-index-actions {
      display: flex;
      gap: 8px;
    }
    .ais-btn-action {
      background: transparent;
      border: 1px solid var(--ais-border);
      color: var(--ais-primary);
      padding: 5px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: background 0.15s;
    }
    .ais-btn-action:hover {
      background: rgba(26,115,232,0.08);
    }

    .ais-results-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-right: 6px;
    }
    .ais-result-card {
      background: var(--ais-surface);
      border: 1px solid var(--ais-border);
      border-radius: 8px;
      padding: 14px 16px;
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .ais-result-card:hover {
      border-color: var(--ais-primary);
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .ais-result-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .ais-result-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--ais-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ais-result-time {
      font-size: 12px;
      color: var(--ais-text-secondary);
    }
    .ais-snippets {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ais-snippet-item {
      font-size: 13px;
      line-height: 1.5;
      color: var(--ais-text);
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .ais-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 12px;
      white-space: nowrap;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .ais-badge-user { background: var(--ais-badge-user); color: var(--ais-badge-user-text); }
    .ais-badge-model { background: var(--ais-badge-model); color: var(--ais-badge-model-text); }
    .ais-badge-thought { background: var(--ais-badge-thought); color: var(--ais-badge-thought-text); }
    .ais-badge-title { background: var(--ais-badge-title); color: var(--ais-badge-title-text); }

    .ais-highlight {
      background: #fff3a8;
      color: #202124;
      font-weight: bold;
      border-radius: 2px;
      padding: 0 2px;
    }

    /* FOLDERS VIEW */
    .ais-folders-view {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    .ais-folder-sidebar {
      width: 280px;
      border-right: 1px solid var(--ais-border);
      background: var(--ais-surface);
      display: flex;
      flex-direction: column;
      padding: 14px;
      gap: 10px;
    }
    .ais-folder-actions {
      display: flex;
      gap: 8px;
    }
    .ais-folder-actions button {
      flex: 1;
      padding: 8px 10px;
      background: var(--ais-primary);
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .ais-folder-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ais-folder-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      color: var(--ais-text);
      font-size: 13px;
      transition: background 0.15s;
    }
    .ais-folder-item:hover {
      background: rgba(128,128,128,0.1);
    }
    .ais-folder-item.active {
      background: rgba(26,115,232,0.15);
      color: var(--ais-primary);
      font-weight: 500;
    }
    .ais-folder-toggle {
      background: transparent;
      border: none;
      color: var(--ais-text-secondary);
      cursor: pointer;
      font-size: 9px;
      width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-right: 2px;
      padding: 0;
      transition: color 0.15s;
    }
    .ais-folder-toggle:hover {
      color: var(--ais-primary);
    }
    .ais-folder-item-actions {
      display: none;
      align-items: center;
      gap: 2px;
    }
    .ais-folder-item:hover .ais-folder-item-actions {
      display: flex;
    }
    .ais-folder-action-btn {
      background: transparent;
      border: none;
      color: var(--ais-text-secondary);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background 0.15s, color 0.15s;
    }
    .ais-folder-action-btn:hover {
      background: rgba(128,128,128,0.2);
      color: var(--ais-primary);
    }
    .ais-folder-action-btn.delete:hover {
      color: #d93025;
    }
    .ais-folder-count {
      font-size: 11px;
      color: var(--ais-text-secondary);
      background: rgba(128,128,128,0.12);
      padding: 1px 6px;
      border-radius: 10px;
    }

    .ais-breadcrumbs {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--ais-text-secondary);
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--ais-border);
      flex-wrap: wrap;
    }
    .ais-breadcrumb-item {
      cursor: pointer;
      color: var(--ais-text-secondary);
      transition: color 0.15s;
    }
    .ais-breadcrumb-item:hover {
      color: var(--ais-primary);
      text-decoration: underline;
    }
    .ais-breadcrumb-item.active {
      color: var(--ais-primary);
      font-weight: 600;
      cursor: default;
      text-decoration: none;
    }
    .ais-subfolder-chips {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .ais-subfolder-chip {
      background: var(--ais-surface);
      border: 1px solid var(--ais-border);
      color: var(--ais-text);
      padding: 4px 10px;
      border-radius: 16px;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }
    .ais-subfolder-chip:hover {
      border-color: var(--ais-primary);
      color: var(--ais-primary);
      background: rgba(26,115,232,0.06);
    }
    .ais-subfolder-add-chip {
      background: transparent;
      border: 1px dashed var(--ais-border);
      color: var(--ais-primary);
      padding: 4px 10px;
      border-radius: 16px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ais-subfolder-add-chip:hover {
      border-color: var(--ais-primary);
      background: rgba(26,115,232,0.08);
    }
    .ais-header-parent-select {
      background: var(--ais-bg);
      border: 1px solid var(--ais-border);
      border-radius: 12px;
      color: var(--ais-text);
      font-size: 12px;
      padding: 2px 6px;
      outline: none;
      max-width: 140px;
    }

    .ais-folder-content {
      flex: 1;
      padding: 20px;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      gap: 10px;
    }
    .ais-folder-prompt-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--ais-surface);
      border: 1px solid var(--ais-border);
      border-radius: 6px;
    }
    .ais-folder-prompt-name {
      font-size: 14px;
      color: var(--ais-text);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ais-folder-prompt-name:hover {
      color: var(--ais-primary);
      text-decoration: underline;
    }
    .ais-folder-select {
      background: var(--ais-bg);
      color: var(--ais-text);
      border: 1px solid var(--ais-border);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      outline: none;
    }

    /* SETTINGS & CLOUD SYNC VIEW */
    .ais-settings-view {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .ais-settings-card {
      background: var(--ais-surface);
      border: 1px solid var(--ais-border);
      border-radius: 8px;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ais-settings-card-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--ais-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ais-settings-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 6px 0;
    }
    .ais-settings-row-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .ais-settings-label {
      font-size: 14px;
      font-weight: 500;
      color: var(--ais-text);
    }
    .ais-settings-desc {
      font-size: 12px;
      color: var(--ais-text-secondary);
    }
    .ais-btn-group {
      display: flex;
      gap: 10px;
      margin-top: 6px;
    }

    /* ACTIVE CHAT HEADER FOLDER BAR */
    #ais-active-chat-folder-bar {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 14px;
      padding: 3px 10px;
      background: rgba(128, 128, 128, 0.12);
      border: 1px solid var(--ais-border);
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      color: var(--ais-text);
      vertical-align: middle;
      user-select: none;
      transition: border-color 0.2s, background 0.2s;
    }
    #ais-active-chat-folder-bar:hover {
      border-color: var(--ais-primary);
    }
    .ais-header-folder-subgroup {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    #ais-header-folder-select {
      background: transparent;
      color: var(--ais-text);
      border: none;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      outline: none;
      padding: 2px 2px;
      max-width: 170px;
    }
    #ais-header-folder-select option {
      background: var(--ais-bg);
      color: var(--ais-text);
    }
    .ais-header-btn-icon {
      background: transparent;
      border: none;
      color: var(--ais-text-secondary);
      cursor: pointer;
      font-size: 13px;
      border-radius: 50%;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s, transform 0.15s;
    }
    .ais-header-btn-icon:hover {
      background: rgba(128, 128, 128, 0.2);
      color: var(--ais-primary);
      transform: scale(1.15);
    }
    .ais-header-folder-input {
      background: var(--ais-bg);
      border: 1px solid var(--ais-primary);
      border-radius: 12px;
      color: var(--ais-text);
      font-size: 12px;
      padding: 2px 8px;
      outline: none;
      width: 130px;
    }
    .ais-header-btn-sm {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }
    .ais-header-btn-sm.confirm {
      color: var(--ais-success);
    }
    .ais-header-btn-sm.confirm:hover {
      background: rgba(30, 142, 62, 0.2);
    }
    .ais-header-btn-sm.cancel {
      color: #d93025;
    }
    .ais-header-btn-sm.cancel:hover {
      background: rgba(217, 48, 37, 0.2);
    }
    .ais-header-folder-status {
      font-size: 11px;
      color: var(--ais-success);
      font-weight: bold;
      padding-left: 4px;
      animation: aisFadeIn 0.2s ease-in;
    }
    @keyframes aisFadeIn {
      from { opacity: 0; transform: translateY(-2px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Hide Sync Prompt from native Google AI Studio sidebar */
    ms-nav-item:has([title*="AI Studio Enhancer Sync"]),
    a:has([title*="AI Studio Enhancer Sync"]),
    .prompt-list-item:has([title*="AI Studio Enhancer Sync"]) {
      display: none !important;
    }

    /* --------------------------------------------------------------------- */
    /* LIGHT ENTERPRISE TWO-PANE INTEGRATION (https://aistudio.google.com/library) */
    /* --------------------------------------------------------------------- */

    /* Header Controls: Segmented Mode Switcher & Sidebar Collapse */
    .ais-lib-mode-segmented {
      display: inline-flex;
      align-items: center;
      background: #1e1f20;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 2px;
      margin-left: 12px;
      gap: 2px;
      vertical-align: middle;
      user-select: none;
    }
    .ais-seg-btn {
      background: transparent;
      border: none;
      color: #9aa0a6;
      padding: 4px 10px;
      border-radius: 16px;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      outline: none;
    }
    .ais-seg-btn:hover {
      color: #e3e3e3;
      background: rgba(255, 255, 255, 0.05);
    }
    .ais-seg-btn.active {
      background: #28292a;
      color: #8ab4f8;
      font-weight: 500;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }
    .ais-seg-btn.ais-sidebar-toggle {
      font-size: 14px;
      padding: 4px 8px;
    }
    .ais-seg-info {
      font-size: 12px;
      color: #70757a;
      padding: 4px 6px;
    }

    /* Header Controls: Cloud Status Pill Widget */
    .ais-cloud-pill-widget {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #1e1f20;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 4px 10px;
      font-size: 12px;
      color: #9aa0a6;
      cursor: pointer;
      transition: all 0.15s ease;
      margin-left: auto;
      user-select: none;
    }
    .ais-cloud-pill-widget:hover {
      background: #28292a;
      color: #e3e3e3;
    }
    .ais-cloud-pill-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #34a853;
      display: inline-block;
    }
    .ais-cloud-pill-dot.syncing {
      background: #fbbc04;
      animation: aisPillPulse 1s infinite alternate;
    }
    .ais-cloud-pill-dot.error {
      background: #ea4335;
    }
    @keyframes aisPillPulse {
      from { opacity: 0.3; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1.1); }
    }

    /* Two-Pane Layout Container */
    .ais-lib-two-pane-container {
      display: flex;
      flex-direction: row;
      width: 100%;
      min-height: calc(100vh - 120px);
      box-sizing: border-box;
      gap: 0;
      position: relative;
    }
    .ais-lib-two-pane-container.ais-native-mode {
      display: block;
    }

    /* Left Panel: Folder Tree (Airy & Minimalist) */
    .ais-lib-tree-panel {
      width: 260px;
      min-width: 260px;
      max-width: 260px;
      background: #131314;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      padding: 8px 6px 14px 6px;
      flex-shrink: 0;
      user-select: none;
      transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.2s, max-width 0.2s, padding 0.2s, opacity 0.2s;
    }
    .ais-lib-tree-panel.collapsed {
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      padding: 0 !important;
      border-right: none !important;
      overflow: hidden !important;
      opacity: 0;
      pointer-events: none;
    }
    .ais-tree-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 8px 8px 8px;
    }
    .ais-tree-panel-title {
      font-size: 11px;
      font-weight: 600;
      color: #80868b;
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }
    .ais-tree-header-btn {
      background: transparent;
      border: none;
      color: #80868b;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
      transition: all 0.15s;
    }
    .ais-tree-header-btn:hover {
      color: #8ab4f8;
      background: rgba(255, 255, 255, 0.06);
    }
    .ais-tree-filter-wrapper {
      position: relative;
      margin-bottom: 8px;
      padding: 0 4px;
    }
    .ais-tree-filter-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #70757a;
      font-size: 12px;
      pointer-events: none;
    }
    .ais-tree-filter-input {
      width: 100%;
      box-sizing: border-box;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 6px;
      padding: 5px 8px 5px 26px;
      font-size: 12px;
      color: #e3e3e3;
      outline: none;
      transition: border-color 0.15s, background 0.15s;
    }
    .ais-tree-filter-input:focus {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(138, 180, 248, 0.5);
    }
    .ais-tree-list-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 2px;
    }
    .ais-tree-list-content::-webkit-scrollbar {
      width: 4px;
    }
    .ais-tree-list-content::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.12);
      border-radius: 2px;
    }
    .ais-tree-node {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      height: 30px;
      box-sizing: border-box;
      border-radius: 6px;
      cursor: pointer;
      color: #c4c7c5;
      font-size: 13px;
      transition: background 0.12s, color 0.12s;
      margin-bottom: 1px;
      position: relative;
    }
    .ais-tree-node:hover {
      background: rgba(255, 255, 255, 0.04);
      color: #e3e3e3;
    }
    .ais-tree-node.active {
      background: rgba(138, 180, 248, 0.09);
      color: #8ab4f8;
      font-weight: 500;
    }
    .ais-tree-chevron {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: #70757a;
      cursor: pointer;
      transition: transform 0.15s ease;
      user-select: none;
      flex-shrink: 0;
    }
    .ais-tree-chevron.expanded {
      transform: rotate(90deg);
    }
    .ais-tree-icon {
      font-size: 13px;
      line-height: 1;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
    }
    .ais-tree-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ais-tree-count {
      font-size: 11px;
      color: #70757a;
      margin-left: 6px;
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }
    .ais-tree-node.active .ais-tree-count {
      color: #8ab4f8;
    }
    .ais-tree-node-actions {
      display: none;
      align-items: center;
      gap: 2px;
      margin-left: 4px;
    }
    .ais-tree-node:hover .ais-tree-node-actions {
      display: inline-flex;
    }
    .ais-tree-action-btn {
      background: none;
      border: none;
      color: #80868b;
      cursor: pointer;
      padding: 1px 3px;
      font-size: 11px;
      line-height: 1;
      border-radius: 4px;
      transition: all 0.12s;
    }
    .ais-tree-action-btn:hover {
      color: #e3e3e3;
      background: rgba(255, 255, 255, 0.08);
    }
    .ais-tree-panel-footer {
      padding: 8px 4px 2px 4px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      margin-top: auto;
    }
    .ais-tree-btn-ghost {
      width: 100%;
      background: transparent;
      border: 1px dashed rgba(255, 255, 255, 0.12);
      color: #8ab4f8;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      outline: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .ais-tree-btn-ghost:hover {
      background: rgba(138, 180, 248, 0.06);
      border-color: rgba(138, 180, 248, 0.3);
    }

    /* Right Main Panel */
    .ais-lib-main-panel {
      flex: 1;
      min-width: 0;
      padding: 0 16px 24px 20px;
      box-sizing: border-box;
      overflow-y: auto;
    }
    .ais-native-mode .ais-lib-main-panel {
      padding: 0;
    }

    /* Breadcrumbs Navigation & Scope Strip (Light & Flat) */
    .ais-breadcrumbs-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px 0 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      margin-bottom: 10px;
    }
    .ais-breadcrumbs-line {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 13px;
      color: #80868b;
      user-select: none;
    }
    .ais-breadcrumb-item {
      cursor: pointer;
      color: #8ab4f8;
      transition: color 0.15s;
    }
    .ais-breadcrumb-item:hover {
      text-decoration: underline;
    }
    .ais-breadcrumb-item.current {
      cursor: default;
      color: #e3e3e3;
      font-weight: 500;
      text-decoration: none;
    }
    .ais-breadcrumb-sep {
      color: #5f6368;
      font-size: 11px;
    }

    /* Minimalist Scope Strip (Under Breadcrumbs) */
    .ais-scope-strip {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      user-select: none;
    }
    .ais-scope-label {
      font-size: 11px;
      color: #70757a;
      margin-right: 2px;
      font-weight: 500;
    }
    .ais-scope-pill {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #80868b;
      border-radius: 12px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.12s ease;
      outline: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      line-height: 1.3;
    }
    .ais-scope-pill:hover {
      color: #e3e3e3;
      border-color: rgba(255, 255, 255, 0.18);
    }
    .ais-scope-pill.active {
      background: rgba(138, 180, 248, 0.08);
      border-color: rgba(138, 180, 248, 0.35);
      color: #8ab4f8;
    }
    .ais-scope-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #5f6368;
      display: inline-block;
      transition: background 0.12s;
    }
    .ais-scope-pill.active .ais-scope-dot {
      background: #8ab4f8;
    }

    /* Table Mount & Row Enhancements */
    .ais-lib-table-mount {
      width: 100%;
      overflow-x: auto;
    }
    .ais-row-folder-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(255, 255, 255, 0.04);
      color: #9aa0a6;
      border-radius: 10px;
      padding: 2px 7px;
      font-size: 11px;
      font-weight: 400;
      margin-left: 8px;
      cursor: pointer;
      transition: all 0.15s;
      vertical-align: middle;
      user-select: none;
    }
    .ais-row-folder-badge:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #e3e3e3;
    }
    .ais-row-folder-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .ais-row-match-chip {
      font-size: 12px;
      color: #bdc1c6;
      background: rgba(138, 180, 248, 0.04);
      padding: 3px 8px;
      border-radius: 0 4px 4px 0;
      margin-top: 4px;
      line-height: 1.4;
      border-left: 2px solid #8ab4f8;
      max-width: 750px;
    }
    .ais-row-match-chip mark {
      background: rgba(138, 180, 248, 0.35);
      color: #ffffff;
      border-radius: 2px;
      padding: 0 2px;
      font-weight: 600;
    }
    .ais-row-match-tag {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: #8ab4f8;
      margin-right: 6px;
      letter-spacing: 0.3px;
    }
    .ais-lib-search-badge {
      font-size: 12px;
      color: #8ab4f8;
      background: #1e1f20;
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 2px 8px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 8px;
      vertical-align: middle;
    }
  `;

  class AISUIManager {
    constructor() {
      this.modalBackdrop = null;
      this.currentTab = 'search'; // 'search' | 'folders' | 'settings'
      this.selectedFolderId = 'all';
      this.expandedFolderIds = new Set();
      this.currentHeaderPromptId = null;
      this.isCreatingHeaderFolder = false;
      this.filterOptions = {
        searchUser: GM_getValue('ais_search_user', true),
        searchModel: GM_getValue('ais_search_model', true),
        searchThought: GM_getValue('ais_search_thought', true),
        searchTitle: GM_getValue('ais_search_title', true),
      };
      this.debounceTimer = null;

      // Library Integration State (https://aistudio.google.com/library)
      this.libViewMode = GM_getValue('ais_lib_view_mode', 'folders'); // 'folders' | 'native'
      this.libSelectedFolderId = 'all';
      this.libSearchQuery = '';
      this.libSearchTimeout = null;
      this.libSearchResults = null;
      this.isFilteringLibraryTable = false;
      this.treeFolderFilterQuery = '';
      this.searchScopes = {
        searchTitle: GM_getValue('ais_scope_title', true),
        searchUser: GM_getValue('ais_scope_user', true),
        searchModel: GM_getValue('ais_scope_model', true),
        searchThinking: GM_getValue('ais_scope_thinking', true),
      };
      this.isSidebarCollapsed = GM_getValue('ais_sidebar_collapsed', false);
    }

    static buildFolderSelectOptions(folders, selectedFolderId = null, includeNew = false) {
      const flattened = AISFolderManager.getFlattenedTree(folders);
      let options = `<option value="">(Без папки)</option>`;
      for (const item of flattened) {
        const indent = item.depth > 0 ? '&nbsp;&nbsp;'.repeat(item.depth) + '└&nbsp;' : '';
        const sel = selectedFolderId === item.id ? 'selected' : '';
        options += `<option value="${item.id}" ${sel}>${indent}📁 ${item.name}</option>`;
      }
      if (includeNew) {
        options += `<option value="__NEW_FOLDER__">➕ Новая папка...</option>`;
      }
      return options;
    }

    init() {
      this.injectStyles();
      this.createLauncher();
      this.createModal();
      this.registerShortcuts();
      this.observeChatNavigation();
      this.observeLibraryNavigation();
      this.checkCloudSyncOnLoad();
    }

    injectStyles() {
      if (document.getElementById('ais-enhanced-styles')) return;
      const style = document.createElement('style');
      style.id = 'ais-enhanced-styles';
      style.textContent = UI_STYLES;
      document.head.appendChild(style);
    }

    createLauncher() {
      if (document.getElementById('ais-launcher-btn')) return;
      const btn = document.createElement('button');
      btn.id = 'ais-launcher-btn';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 11.99 14 9.5 14z"/></svg>
        <span>Поиск и Папки</span>
      `;
      btn.title = 'Открыть поиск и папки (Ctrl + Shift + F)';
      btn.addEventListener('click', () => this.openModal());
      document.body.appendChild(btn);

      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('🔍 Полнотекстовый поиск', () => {
          this.currentTab = 'search';
          this.openModal();
        });
        GM_registerMenuCommand('📁 Папки диалогов', () => {
          this.currentTab = 'folders';
          this.openModal();
        });
        GM_registerMenuCommand('⚙️ Настройки и Синхронизация', () => {
          this.currentTab = 'settings';
          this.openModal();
        });
      }
    }

    createModal() {
      if (document.getElementById('ais-modal-backdrop')) return;

      const backdrop = document.createElement('div');
      backdrop.id = 'ais-modal-backdrop';
      backdrop.innerHTML = `
        <div id="ais-modal">
          <div class="ais-modal-header">
            <div class="ais-tabs">
              <button class="ais-tab ${this.currentTab === 'search' ? 'active' : ''}" data-tab="search">
                🔍 Полнотекстовый поиск
              </button>
              <button class="ais-tab ${this.currentTab === 'folders' ? 'active' : ''}" data-tab="folders">
                📁 Папки и диалоги
              </button>
              <button class="ais-tab ${this.currentTab === 'settings' ? 'active' : ''}" data-tab="settings">
                ⚙️ Настройки и Синхронизация
              </button>
            </div>
            <div class="ais-header-sync">
              <span class="ais-sync-indicator" id="ais-header-sync-status" title="Статус облачной синхронизации">
                <span class="ais-sync-dot saved" id="ais-sync-dot"></span>
                <span id="ais-sync-text">Облако готово</span>
              </span>
              <button class="ais-close-btn" title="Закрыть (Esc)">✕</button>
            </div>
          </div>
          <div class="ais-modal-body" id="ais-modal-content"></div>
        </div>
      `;

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeModal();
      });

      backdrop.querySelector('.ais-close-btn').addEventListener('click', () => this.closeModal());
      backdrop.querySelector('#ais-header-sync-status').addEventListener('click', () => {
        this.currentTab = 'settings';
        this.renderTabContent();
        const tabs = backdrop.querySelectorAll('.ais-tab');
        tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === 'settings'));
      });

      const tabs = backdrop.querySelectorAll('.ais-tab');
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
          this.currentTab = tab.dataset.tab;
          this.renderTabContent();
        });
      });

      document.body.appendChild(backdrop);
      this.modalBackdrop = backdrop;
    }

    openModal() {
      this.modalBackdrop.classList.add('open');
      const tabs = this.modalBackdrop.querySelectorAll('.ais-tab');
      tabs.forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === this.currentTab);
      });
      this.renderTabContent();
    }

    closeModal() {
      this.modalBackdrop.classList.remove('open');
    }

    registerShortcuts() {
      window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'А')) {
          e.preventDefault();
          this.currentTab = 'search';
          this.openModal();
        } else if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'З')) {
          e.preventDefault();
          this.currentTab = 'folders';
          this.openModal();
        } else if (e.key === 'Escape' && this.modalBackdrop?.classList.contains('open')) {
          this.closeModal();
        }
      });
    }

    updateCloudStatus(text, state = 'saved') {
      const txt = document.getElementById('ais-sync-text');
      const dot = document.getElementById('ais-sync-dot');
      if (txt) txt.innerText = text;
      if (dot) {
        dot.className = 'ais-sync-dot ' + (state === 'error' ? 'error' : state === 'syncing' ? '' : 'saved');
      }

      const pillWidget = document.getElementById('ais-cloud-status-widget');
      if (pillWidget) {
        const pillText = pillWidget.querySelector('.ais-cloud-pill-text');
        const pillDot = pillWidget.querySelector('.ais-cloud-pill-dot');
        if (pillText) {
          pillText.textContent = text.replace(/^☁️\s*/, '');
        }
        if (pillDot) {
          pillDot.className = 'ais-cloud-pill-dot ' + (state === 'error' ? 'error' : state === 'syncing' ? 'syncing' : 'saved');
        }
      }
    }

    renderTabContent() {
      const container = document.getElementById('ais-modal-content');
      if (!container) return;

      if (this.currentTab === 'search') {
        this.renderSearchView(container);
      } else if (this.currentTab === 'folders') {
        this.renderFoldersView(container);
      } else {
        this.renderSettingsView(container);
      }
    }

    // -----------------------------------------------------------------------
    // UI: SEARCH TAB
    // -----------------------------------------------------------------------
    async renderSearchView(container) {
      const allPrompts = (await db.getAllPrompts()).filter((p) => p.title !== SYNC_PROMPT_TITLE);
      const totalCount = Math.max(allPrompts.length, apiClient.knownPrompts.size);

      // Accurate index count based on indexedAt
      const indexedPrompts = allPrompts.filter((p) => p.indexedAt > 0);
      const withMessages = indexedPrompts.filter((p) => p.messages && p.messages.length > 0).length;
      const nonChatCount = indexedPrompts.length - withMessages;

      container.innerHTML = `
        <div class="ais-search-view">
          <div class="ais-search-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 11.99 14 9.5 14z"/></svg>
            <input type="text" id="ais-search-input" placeholder="Поиск по сообщениям, ответам и размышлениям..." autofocus />
          </div>

          <div class="ais-filters-row">
            <span class="ais-filter-title">Искать по:</span>
            <label class="ais-checkbox-label">
              <input type="checkbox" id="ais-chk-user" ${this.filterOptions.searchUser ? 'checked' : ''} />
              <span>👤 Сообщения пользователя</span>
            </label>
            <label class="ais-checkbox-label">
              <input type="checkbox" id="ais-chk-model" ${this.filterOptions.searchModel ? 'checked' : ''} />
              <span>🤖 Ответы ИИ</span>
            </label>
            <label class="ais-checkbox-label">
              <input type="checkbox" id="ais-chk-thought" ${this.filterOptions.searchThought ? 'checked' : ''} />
              <span>🧠 "Размышления" (Thinking)</span>
            </label>
            <label class="ais-checkbox-label">
              <input type="checkbox" id="ais-chk-title" ${this.filterOptions.searchTitle ? 'checked' : ''} />
              <span>🏷️ Заголовки</span>
            </label>
          </div>

          <div class="ais-index-bar">
            <span id="ais-index-status" title="${nonChatCount > 0 ? `(${withMessages} с сообщениями, ${nonChatCount} пустых/системных)` : ''}">
              Проиндексировано: ${indexedPrompts.length} из ${totalCount} диалогов ${nonChatCount > 0 ? `(${withMessages} с перепиской)` : ''}
            </span>
            <div class="ais-index-actions">
              <button class="ais-btn-action" id="ais-index-all-btn">
                🔄 Индексировать все
              </button>
            </div>
          </div>

          <div class="ais-results-list" id="ais-results-container">
            <div style="text-align: center; color: var(--ais-text-secondary); margin-top: 60px;">
              Введите поисковый запрос выше для мгновенного поиска по диалогам
            </div>
          </div>
        </div>
      `;

      const input = container.querySelector('#ais-search-input');
      const chkUser = container.querySelector('#ais-chk-user');
      const chkModel = container.querySelector('#ais-chk-model');
      const chkThought = container.querySelector('#ais-chk-thought');
      const chkTitle = container.querySelector('#ais-chk-title');
      const indexBtn = container.querySelector('#ais-index-all-btn');

      const triggerSearch = () => {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.executeSearch(input.value);
        }, 200);
      };

      input.addEventListener('input', triggerSearch);

      const updateFilter = (key, val) => {
        this.filterOptions[key] = val;
        GM_setValue(`ais_${key}`, val);
        triggerSearch();
      };

      chkUser.addEventListener('change', (e) => updateFilter('searchUser', e.target.checked));
      chkModel.addEventListener('change', (e) => updateFilter('searchModel', e.target.checked));
      chkThought.addEventListener('change', (e) => updateFilter('searchThought', e.target.checked));
      chkTitle.addEventListener('change', (e) => updateFilter('searchTitle', e.target.checked));

      indexBtn.addEventListener('click', () => this.handleStartIndexing(indexBtn));
    }

    async executeSearch(query) {
      const container = document.getElementById('ais-results-container');
      if (!container) return;

      if (!query.trim()) {
        container.innerHTML = `
          <div style="text-align: center; color: var(--ais-text-secondary); margin-top: 60px;">
            Введите поисковый запрос выше для мгновенного поиска по диалогам
          </div>
        `;
        return;
      }

      container.innerHTML = `<div style="text-align: center; color: var(--ais-text-secondary); margin-top: 30px;">Поиск...</div>`;

      const results = await AISSearchEngine.search(query, this.filterOptions);

      if (results.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; color: var(--ais-text-secondary); margin-top: 40px;">
            Ничего не найдено по запросу "<b>${AISSearchEngine.escapeRegExp(query)}</b>" с выбранными фильтрами.
          </div>
        `;
        return;
      }

      const allFolders = await db.getAllFolders();
      container.innerHTML = '';
      for (const res of results) {
        const card = document.createElement('div');
        card.className = 'ais-result-card';

        const dateStr = res.updatedAt ? new Date(res.updatedAt).toLocaleDateString() : '';

        let folderBadge = '';
        if (res.folderId) {
          const path = AISFolderManager.getFolderPath(res.folderId, allFolders);
          if (path.length > 0) {
            folderBadge = `<span style="font-size: 11px; background: rgba(26,115,232,0.12); color: var(--ais-primary); padding: 1px 6px; border-radius: 10px;">📁 ${path.map((f) => f.name).join(' / ')}</span>`;
          }
        }

        let snippetsHtml = '';
        for (const m of res.matches) {
          let badgeClass = 'ais-badge-model';
          if (m.type === 'user') badgeClass = 'ais-badge-user';
          if (m.type === 'thought') badgeClass = 'ais-badge-thought';
          if (m.type === 'title') badgeClass = 'ais-badge-title';

          snippetsHtml += `
            <div class="ais-snippet-item">
              <span class="ais-badge ${badgeClass}">${m.label}</span>
              <span>${m.snippet}</span>
            </div>
          `;
        }

        card.innerHTML = `
          <div class="ais-result-header">
            <div class="ais-result-title">
              <span>💬 ${res.title}</span>
              ${folderBadge}
              <span style="font-size: 11px; background: rgba(128,128,128,0.15); padding: 1px 6px; border-radius: 10px; color: var(--ais-text-secondary)">
                ${res.matchCount} совп.
              </span>
            </div>
            <div class="ais-result-time">${dateStr}</div>
          </div>
          <div class="ais-snippets">${snippetsHtml}</div>
        `;

        card.addEventListener('click', () => {
          this.closeModal();
          this.navigateToPrompt(res.id);
        });

        container.appendChild(card);
      }
    }

    async handleStartIndexing(buttonEl) {
      if (apiClient.isIndexing) {
        apiClient.stopIndexing();
        buttonEl.innerText = 'Остановка...';
        return;
      }

      const statusEl = document.getElementById('ais-index-status');
      buttonEl.innerText = '⏹️ Остановить индексацию';

      await apiClient.indexAllPrompts((progress) => {
        if (statusEl) {
          statusEl.innerText = `Индексация: ${progress.current} из ${progress.total} (${progress.currentTitle})`;
        }
      });

      buttonEl.innerText = '🔄 Индексировать все';
      const allPrompts = (await db.getAllPrompts()).filter((p) => p.title !== SYNC_PROMPT_TITLE);
      const indexedPrompts = allPrompts.filter((p) => p.indexedAt > 0);
      const withMessages = indexedPrompts.filter((p) => p.messages && p.messages.length > 0).length;
      const nonChatCount = indexedPrompts.length - withMessages;

      if (statusEl) {
        statusEl.innerText = `Проиндексировано: ${indexedPrompts.length} из ${allPrompts.length} диалогов ${nonChatCount > 0 ? `(${withMessages} с перепиской)` : ''}`;
      }
    }

    // -----------------------------------------------------------------------
    // UI: FOLDERS TAB
    // -----------------------------------------------------------------------
    async renderFoldersView(container) {
      const folders = await db.getAllFolders();
      const prompts = (await db.getAllPrompts()).filter((p) => p.title !== SYNC_PROMPT_TITLE);

      for (const [id, kp] of apiClient.knownPrompts.entries()) {
        if (kp.title === SYNC_PROMPT_TITLE) continue;
        if (!prompts.some((p) => p.id === id)) {
          prompts.push({ id, title: kp.title, folderId: null, updatedAt: kp.updatedAt });
        }
      }

      container.innerHTML = `
        <div class="ais-folders-view">
          <div class="ais-folder-sidebar">
            <div class="ais-folder-actions">
              <button id="ais-create-folder-btn">➕ Новая папка (в корень)</button>
            </div>

            <div class="ais-folder-list" id="ais-folders-tree">
              <!-- Folder items rendered dynamically -->
            </div>
          </div>

          <div class="ais-folder-content" id="ais-folder-prompts">
            <!-- Prompts belonging to selected folder -->
          </div>
        </div>
      `;

      this.renderFolderList(folders, prompts);
      this.renderFolderPrompts(prompts, folders);

      container.querySelector('#ais-create-folder-btn').addEventListener('click', async () => {
        const name = prompt('Введите имя новой папки (в корневой каталог):');
        if (name && name.trim()) {
          const newF = await AISFolderManager.createFolder(name.trim(), '#1a73e8', null);
          this.selectedFolderId = newF.id;
          this.renderTabContent();
        }
      });
    }

    renderFolderList(folders, prompts) {
      const tree = document.getElementById('ais-folders-tree');
      if (!tree) return;

      const totalCount = prompts.length;
      const uncategorizedCount = prompts.filter((p) => !p.folderId).length;

      let html = `
        <div class="ais-folder-item ${this.selectedFolderId === 'all' ? 'active' : ''}" data-fid="all">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="width:16px;"></span>
            <span>📁 Все диалоги</span>
          </div>
          <span class="ais-folder-count">${totalCount}</span>
        </div>
        <div class="ais-folder-item ${this.selectedFolderId === 'unassigned' ? 'active' : ''}" data-fid="unassigned">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="width:16px;"></span>
            <span>📂 Без папки</span>
          </div>
          <span class="ais-folder-count">${uncategorizedCount}</span>
        </div>
        <hr style="border: none; border-top: 1px solid var(--ais-border); margin: 6px 0;" />
      `;

      const treeRoots = AISFolderManager.buildFolderTree(folders);

      const renderTreeNode = (node, depth = 0) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = this.expandedFolderIds.has(node.id);
        const directCount = prompts.filter((p) => p.folderId === node.id).length;
        const paddingLeft = depth * 14 + 6;

        let nodeHtml = `
          <div class="ais-folder-item ${this.selectedFolderId === node.id ? 'active' : ''}" data-fid="${node.id}" style="padding-left: ${paddingLeft}px;">
            <div style="display:flex; align-items:center; gap:4px; overflow:hidden;">
              ${
                hasChildren
                  ? `<button class="ais-folder-toggle" data-toggleid="${node.id}" title="${isExpanded ? 'Свернуть' : 'Развернуть'}">${isExpanded ? '▼' : '▶'}</button>`
                  : `<span style="width:16px; display:inline-block;"></span>`
              }
              <span style="color:${node.color || '#1a73e8'}; flex-shrink:0;">📁</span>
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${node.name}">${node.name}</span>
            </div>
            <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
              <span class="ais-folder-count">${directCount}</span>
              <div class="ais-folder-item-actions">
                <button class="ais-folder-action-btn ais-add-sub-btn" data-parentid="${node.id}" title="Создать подпапку">➕</button>
                <button class="ais-folder-action-btn ais-rename-btn" data-renameid="${node.id}" title="Переименовать">✏️</button>
                <button class="ais-folder-action-btn delete ais-folder-del-btn" data-delid="${node.id}" title="Удалить">✕</button>
              </div>
            </div>
          </div>
        `;

        if (hasChildren && isExpanded) {
          for (const child of node.children) {
            nodeHtml += renderTreeNode(child, depth + 1);
          }
        }
        return nodeHtml;
      };

      for (const root of treeRoots) {
        html += renderTreeNode(root, 0);
      }

      tree.innerHTML = html;

      // Event handlers
      tree.querySelectorAll('.ais-folder-toggle').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const fid = btn.dataset.toggleid;
          if (this.expandedFolderIds.has(fid)) {
            this.expandedFolderIds.delete(fid);
          } else {
            this.expandedFolderIds.add(fid);
          }
          this.renderFolderList(folders, prompts);
        });
      });

      tree.querySelectorAll('.ais-folder-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.ais-folder-toggle') || e.target.closest('.ais-folder-action-btn')) return;
          this.selectedFolderId = item.dataset.fid;
          this.renderFolderList(folders, prompts);
          this.renderFolderPrompts(prompts, folders);
        });
      });

      tree.querySelectorAll('.ais-add-sub-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const pId = btn.dataset.parentid;
          const parentFolder = folders.find((f) => f.id === pId);
          const name = prompt(`Создать подпапку внутри "${parentFolder?.name || ''}":`);
          if (name && name.trim()) {
            const newF = await AISFolderManager.createFolder(name.trim(), '#1a73e8', pId);
            this.expandedFolderIds.add(pId);
            this.selectedFolderId = newF.id;
            this.renderTabContent();
          }
        });
      });

      tree.querySelectorAll('.ais-rename-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const fid = btn.dataset.renameid;
          const target = folders.find((f) => f.id === fid);
          if (!target) return;
          const newName = prompt(`Переименовать папку "${target.name}":`, target.name);
          if (newName && newName.trim() && newName.trim() !== target.name) {
            await AISFolderManager.renameFolder(fid, newName.trim());
            this.renderTabContent();
          }
        });
      });

      tree.querySelectorAll('.ais-folder-del-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const fid = btn.dataset.delid;
          const target = folders.find((f) => f.id === fid);
          if (confirm(`Удалить папку "${target?.name || ''}" и все её подпапки?\n\n(Все диалоги сохранятся и будут перемещены в категорию "Без папки")`)) {
            await AISFolderManager.deleteFolder(fid);
            if (this.selectedFolderId === fid) this.selectedFolderId = 'all';
            this.renderTabContent();
          }
        });
      });
    }

    renderFolderPrompts(prompts, folders) {
      const content = document.getElementById('ais-folder-prompts');
      if (!content) return;

      // 1. Breadcrumbs
      let breadcrumbsHtml = '<div class="ais-breadcrumbs">';
      if (this.selectedFolderId === 'all') {
        breadcrumbsHtml += `<span class="ais-breadcrumb-item active">📁 Все диалоги</span>`;
      } else if (this.selectedFolderId === 'unassigned') {
        breadcrumbsHtml += `<span class="ais-breadcrumb-item active">📂 Без папки</span>`;
      } else {
        breadcrumbsHtml += `<span class="ais-breadcrumb-item" data-fid="all">📁 Все диалоги</span> <span>/</span> `;
        const path = AISFolderManager.getFolderPath(this.selectedFolderId, folders);
        path.forEach((f, idx) => {
          const isLast = idx === path.length - 1;
          if (isLast) {
            breadcrumbsHtml += `<span class="ais-breadcrumb-item active">📁 ${f.name}</span>`;
          } else {
            breadcrumbsHtml += `<span class="ais-breadcrumb-item" data-fid="${f.id}">📁 ${f.name}</span> <span>/</span> `;
          }
        });
      }
      breadcrumbsHtml += '</div>';

      // 2. Direct subfolder chips if folder has children
      let chipsHtml = '';
      if (this.selectedFolderId !== 'all' && this.selectedFolderId !== 'unassigned') {
        const subfolders = folders.filter((f) => f.parentId === this.selectedFolderId);
        chipsHtml += `<div class="ais-subfolder-chips">`;
        if (subfolders.length > 0) {
          for (const sf of subfolders) {
            const count = prompts.filter((p) => p.folderId === sf.id).length;
            chipsHtml += `
              <button class="ais-subfolder-chip" data-fid="${sf.id}">
                📁 ${sf.name} <span class="ais-folder-count">${count}</span>
              </button>
            `;
          }
        }
        chipsHtml += `
          <button class="ais-subfolder-add-chip" data-parentid="${this.selectedFolderId}">➕ Создать подпапку</button>
        </div>`;
      }

      // 3. Filtered prompts
      let filtered = prompts;
      if (this.selectedFolderId === 'unassigned') {
        filtered = prompts.filter((p) => !p.folderId);
      } else if (this.selectedFolderId !== 'all') {
        filtered = prompts.filter((p) => p.folderId === this.selectedFolderId);
      }

      let promptsHtml = '';
      if (filtered.length === 0) {
        promptsHtml = `
          <div style="text-align: center; color: var(--ais-text-secondary); margin-top: 40px;">
            В этой категории пока нет диалогов. Назначьте папку диалогу с помощью выпадающего списка ниже или из шапки чата.
          </div>
        `;
      } else {
        for (const p of filtered) {
          const folderOptions = AISUIManager.buildFolderSelectOptions(folders, p.folderId);
          promptsHtml += `
            <div class="ais-folder-prompt-row">
              <span class="ais-folder-prompt-name" data-pid="${p.id}">
                💬 ${p.title || 'Без названия'}
              </span>
              <div style="display:flex; align-items:center; gap:8px;">
                <select class="ais-folder-select" data-pid="${p.id}">
                  ${folderOptions}
                </select>
              </div>
            </div>
          `;
        }
      }

      content.innerHTML = breadcrumbsHtml + chipsHtml + promptsHtml;

      // Event handlers for breadcrumbs and chips
      content.querySelectorAll('.ais-breadcrumb-item[data-fid], .ais-subfolder-chip[data-fid]').forEach((el) => {
        el.addEventListener('click', () => {
          this.selectedFolderId = el.dataset.fid;
          this.renderFolderList(folders, prompts);
          this.renderFolderPrompts(prompts, folders);
        });
      });

      content.querySelectorAll('.ais-subfolder-add-chip').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const pId = btn.dataset.parentid;
          const parentFolder = folders.find((f) => f.id === pId);
          const name = prompt(`Создать подпапку внутри "${parentFolder?.name || ''}":`);
          if (name && name.trim()) {
            const newF = await AISFolderManager.createFolder(name.trim(), '#1a73e8', pId);
            this.expandedFolderIds.add(pId);
            this.selectedFolderId = newF.id;
            this.renderTabContent();
          }
        });
      });

      content.querySelectorAll('.ais-folder-prompt-name').forEach((el) => {
        el.addEventListener('click', () => {
          this.closeModal();
          this.navigateToPrompt(el.dataset.pid);
        });
      });

      content.querySelectorAll('.ais-folder-select').forEach((sel) => {
        sel.addEventListener('change', async (e) => {
          const pid = sel.dataset.pid;
          const fid = e.target.value || null;
          await AISFolderManager.assignPromptToFolder(pid, fid);
          this.refreshFolderCounts();
          this.refreshDialogHeader();
        });
      });
    }

    // -----------------------------------------------------------------------
    // UI: SETTINGS & CLOUD SYNC TAB
    // -----------------------------------------------------------------------
    async renderSettingsView(container) {
      const allPrompts = (await db.getAllPrompts()).filter((p) => p.title !== SYNC_PROMPT_TITLE);
      const folders = await db.getAllFolders();
      const lastSync = GM_getValue('ais_last_sync_timestamp', null);
      const lastSyncStr = lastSync ? new Date(lastSync).toLocaleString() : 'Еще не выполнялась';
      const autoSyncCloud = GM_getValue('ais_autosync_cloud', true);
      const autoPullOnStart = GM_getValue('ais_autopull_start', true);

      container.innerHTML = `
        <div class="ais-settings-view">
          <!-- CARD 1: GOOGLE DRIVE CLOUD SYNC -->
          <div class="ais-settings-card">
            <div class="ais-settings-card-title">
              <span>☁️ Синхронизация через Google Диск (Режим Google Sheets)</span>
            </div>

            <div class="ais-settings-row">
              <div class="ais-settings-row-info">
                <span class="ais-settings-label">Автосохранение в реальном времени</span>
                <span class="ais-settings-desc">При каждом новом сообщении в диалоге или изменении папок индекс автоматически сохраняется на ваш Google Диск без лишних действий.</span>
              </div>
              <input type="checkbox" id="ais-set-autosync-cloud" ${autoSyncCloud ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--ais-primary);" />
            </div>

            <div class="ais-settings-row">
              <div class="ais-settings-row-info">
                <span class="ais-settings-label">Автозагрузка обновлений при открытии страницы</span>
                <span class="ais-settings-desc">При открытии AI Studio на новом ПК скрипт автоматически проверит Google Диск и загрузит свежую базу без необходимости повторной индексации.</span>
              </div>
              <input type="checkbox" id="ais-set-autopull-start" ${autoPullOnStart ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--ais-primary);" />
            </div>

            <div class="ais-settings-row" style="border-top:1px solid var(--ais-border); padding-top:10px;">
              <div class="ais-settings-row-info">
                <span class="ais-settings-label">Последняя синхронизация:</span>
                <span class="ais-settings-desc" id="ais-settings-last-sync-time">${lastSyncStr}</span>
              </div>
              <div class="ais-btn-group">
                <button class="ais-btn-action" id="ais-btn-manual-push">☁️ Выгрузить на Диск (Push)</button>
                <button class="ais-btn-action" id="ais-btn-manual-pull">⬇️ Загрузить с Диска (Pull)</button>
              </div>
            </div>
          </div>

          <!-- CARD 2: LOCAL INDEX STATS -->
          <div class="ais-settings-card">
            <div class="ais-settings-card-title">
              <span>📊 Состояние локальной базы IndexedDB</span>
            </div>
            <div class="ais-settings-desc">
              Всего чатов в памяти: <b>${allPrompts.length}</b> &nbsp;|&nbsp; 
              Создано папок: <b>${folders.length}</b> &nbsp;|&nbsp; 
              Размер базы не ограничен лимитами localStorage.
            </div>
            <div class="ais-btn-group">
              <button class="ais-btn-action" id="ais-btn-reindex-all" style="color:var(--ais-primary);">
                🔄 Переиндексировать диалоги
              </button>
              <button class="ais-btn-action" id="ais-btn-clear-db" style="color:#d93025; border-color:#d93025;">
                🗑️ Очистить локальную базу
              </button>
            </div>
          </div>

          <!-- CARD 3: LOCAL BACKUP / RESTORE -->
          <div class="ais-settings-card">
            <div class="ais-settings-card-title">
              <span>💾 Локальное резервное копирование (Файл JSON)</span>
            </div>
            <div class="ais-settings-desc">
              Экспорт структуры папок и связей диалогов в локальный файл на диск для автономного резервного копирования.
            </div>
            <div class="ais-btn-group">
              <button class="ais-btn-action" id="ais-btn-file-export">💾 Экспорт файла</button>
              <button class="ais-btn-action" id="ais-btn-file-import">📂 Импорт файла</button>
              <input type="file" id="ais-settings-file-input" accept=".json" style="display:none;" />
            </div>
          </div>
        </div>
      `;

      // Event handlers
      container.querySelector('#ais-set-autosync-cloud').addEventListener('change', (e) => {
        GM_setValue('ais_autosync_cloud', e.target.checked);
      });

      container.querySelector('#ais-set-autopull-start').addEventListener('change', (e) => {
        GM_setValue('ais_autopull_start', e.target.checked);
      });

      container.querySelector('#ais-btn-manual-push').addEventListener('click', () => this.handleDrivePush());
      container.querySelector('#ais-btn-manual-pull').addEventListener('click', () => this.handleDrivePull());

      container.querySelector('#ais-btn-reindex-all').addEventListener('click', async () => {
        this.currentTab = 'search';
        this.renderTabContent();
        const tabs = this.modalBackdrop.querySelectorAll('.ais-tab');
        tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === 'search'));
        const indexBtn = document.getElementById('ais-index-all-btn');
        if (indexBtn) this.handleStartIndexing(indexBtn);
      });

      container.querySelector('#ais-btn-clear-db').addEventListener('click', async () => {
        if (confirm('Очистить локальную базу данных IndexedDB? Все папки и поисковый индекс будут удалены (их можно будет восстановить из облака Google Диска).')) {
          await db.clearAllData();
          alert('Локальная база очищена.');
          this.renderTabContent();
        }
      });

      container.querySelector('#ais-btn-file-export').addEventListener('click', () => {
        AISFolderManager.exportStructure();
      });

      const fileInput = container.querySelector('#ais-settings-file-input');
      container.querySelector('#ais-btn-file-import').addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
          try {
            await AISFolderManager.importStructure(e.target.files[0]);
            alert('Структура успешно импортирована из файла!');
            this.renderTabContent();
          } catch (err) {
            alert('Ошибка импорта: ' + err.message);
          }
        }
      });
    }

    async refreshFolderCounts() {
      if (this.currentTab === 'folders' && this.modalBackdrop?.classList.contains('open')) {
        const folders = await db.getAllFolders();
        const prompts = (await db.getAllPrompts()).filter((p) => p.title !== SYNC_PROMPT_TITLE);
        this.renderFolderList(folders, prompts);
      }
    }

    navigateToPrompt(id) {
      if (!id) return;
      const targetUrl = `https://aistudio.google.com/prompts/${id}`;
      if (window.location.href !== targetUrl) {
        window.location.href = targetUrl;
      }
    }

    // -----------------------------------------------------------------------
    // CLOUD SYNC ACTIONS & DIALOGS
    // -----------------------------------------------------------------------
    async handleDrivePush() {
      try {
        this.updateCloudStatus('☁️ Сохранение...', 'syncing');

        const res = await driveSync.pushToDrive((status) => {
          this.updateCloudStatus(`☁️ ${status}`, 'syncing');
        });

        const folderCount = res?.folderCount ?? 0;
        const promptCount = res?.promptCount ?? 0;
        alert(`✅ Успешно сохранено на Google Диск!\n\nПапок: ${folderCount}\nДиалогов: ${promptCount}\n\nФайл синхронизации сохранен в папке Google AI Studio на вашем Google Диске.`);
        this.updateCloudStatus('☁️ Все изменения сохранены в облаке', 'saved');
        if (this.currentTab === 'settings') this.renderTabContent();
      } catch (err) {
        console.error('[AIS Enhancer] Drive push error:', err);
        alert(`❌ Ошибка сохранения на Google Диск: ${err.message}`);
        this.updateCloudStatus('☁️ Ошибка синхронизации', 'error');
      }
    }

    async handleDrivePull() {
      try {
        this.updateCloudStatus('☁️ Скачивание...', 'syncing');

        const res = await driveSync.pullFromDrive((status) => {
          this.updateCloudStatus(`☁️ ${status}`, 'syncing');
        });

        const folderCount = res?.folderCount ?? 0;
        const promptCount = res?.promptCount ?? 0;
        alert(`✅ Успешно загружено с Google Диска!\n\nИмпортировано папок: ${folderCount}\nИмпортировано диалогов: ${promptCount}\n\nБаза данных и поиск полностью обновлены.`);
        this.updateCloudStatus('☁️ Все изменения сохранены в облаке', 'saved');
        this.renderTabContent();
      } catch (err) {
        console.error('[AIS Enhancer] Drive pull error:', err);
        alert(`❌ Ошибка загрузки с Google Диска: ${err.message}`);
        this.updateCloudStatus('☁️ Ошибка синхронизации', 'error');
      }
    }

    async checkCloudSyncOnLoad() {
      const autoPull = GM_getValue('ais_autopull_start', true);
      if (!autoPull) return;

      setTimeout(async () => {
        try {
          const syncId = await driveSync.findSyncPromptId();
          if (!syncId) return;

          const rawData = await apiClient.fetchRawPrompt(syncId);
          let root = rawData;
          if (Array.isArray(root) && root.length === 1 && Array.isArray(root[0])) {
            root = root[0];
          }

          const turnText = AISParser.extractTextFromTurn(root[2]?.[0] || []);
          if (turnText && turnText.startsWith('AIS_SYNC_PAYLOAD::')) {
            const jsonStr = decodeURIComponent(turnText.replace('AIS_SYNC_PAYLOAD::', ''));
            const data = JSON.parse(jsonStr);

            const localTimestamp = GM_getValue('ais_last_sync_timestamp', 0);
            if (data.syncTimestamp && data.syncTimestamp > localTimestamp + 30000) {
              console.log('[AIS Enhancer] Newer cloud sync found on Google Drive. Auto-applying...');
              this.updateCloudStatus('☁️ Синхронизация с облаком...', 'syncing');
              await driveSync.pullFromDrive();
              console.log('[AIS Enhancer] Cloud sync auto-applied successfully.');
            }
          }
        } catch (e) {
          console.warn('[AIS Enhancer] Background cloud sync check error:', e);
        }
      }, 4000);
    }

    // -----------------------------------------------------------------------
    // NATIVE LIBRARY INTEGRATION (https://aistudio.google.com/library)
    // -----------------------------------------------------------------------
    observeLibraryNavigation() {
      setInterval(() => {
        const isLibrary = window.location.pathname.includes('/library') || window.location.pathname.endsWith('/prompts');
        const launcher = document.getElementById('ais-launcher-btn');
        if (isLibrary) {
          // Hide floating launcher on Library page to keep UI clean and uncluttered!
          if (launcher) launcher.style.display = 'none';
          this.refreshLibraryIntegration();
        } else {
          if (launcher) launcher.style.display = '';
          const twoPane = document.getElementById('ais-lib-two-pane-container');
          if (twoPane) twoPane.style.display = 'none';
          const switcher = document.getElementById('ais-lib-mode-switcher');
          if (switcher) switcher.style.display = 'none';
          const cloudPill = document.getElementById('ais-cloud-status-widget');
          if (cloudPill) cloudPill.style.display = 'none';
        }
      }, 1000);
    }

    async refreshLibraryIntegration() {
      const isLibrary = window.location.pathname.includes('/library') || window.location.pathname.endsWith('/prompts');
      if (!isLibrary) return;

      const table = document.querySelector('table.library-table, table[role="table"]');
      if (!table) return;

      // Clean up any legacy explorer or sidebar if leftover
      const legacyExp = document.getElementById('ais-lib-explorer');
      if (legacyExp) legacyExp.remove();
      const legacySidebar = document.getElementById('ais-lib-sidebar');
      if (legacySidebar) legacySidebar.remove();

      // 1. Ensure clean header controls (Mode Switcher and Cloud Pill)
      this.ensureLibraryHeaderControls();

      // 2. Ensure native search hook is active on the search input
      this.ensureNativeSearchHook();

      // 3. Mount two-pane layout or update mode
      await this.ensureLibraryTwoPaneLayout(table);

      // 4. Apply current filters
      if (this.libViewMode === 'native' && !this.libSearchQuery) {
        this.showAllLibraryRows(table);
      } else {
        await this.applyLibraryFilter(table);
      }
    }

    ensureLibraryHeaderControls() {
      // 1. Mode Switcher Segmented Control
      let switcher = document.getElementById('ais-lib-mode-switcher');
      const headerTitle = document.querySelector('h2.header, .header');

      if (!switcher && headerTitle) {
        switcher = document.createElement('div');
        switcher.id = 'ais-lib-mode-switcher';
        switcher.className = 'ais-lib-mode-segmented';
        switcher.innerHTML = `
          <button id="ais-btn-sidebar-toggle" class="ais-sidebar-toggle ${this.isSidebarCollapsed ? '' : 'active'}" title="Скрыть/показать дерево папок" style="${this.libViewMode === 'folders' ? '' : 'display:none;'}">
            ◧
          </button>
          <button id="ais-seg-native" class="ais-seg-btn ${this.libViewMode === 'native' ? 'active' : ''}" title="Обычный плоский список (Google AI Studio)">
            ☰
          </button>
          <button id="ais-seg-folders" class="ais-seg-btn ${this.libViewMode === 'folders' ? 'active' : ''}" title="Двухпанельный режим с папками и глубоким поиском">
            🗂️
          </button>
          <button id="ais-seg-info" class="ais-seg-btn ais-seg-info" title="Справка по режимам">
            ⓘ
          </button>
        `;
        if (headerTitle.parentElement) {
          headerTitle.parentElement.insertBefore(switcher, headerTitle.nextSibling);
        }

        switcher.querySelector('#ais-btn-sidebar-toggle')?.addEventListener('click', () => {
          this.toggleSidebarCollapse();
        });
        switcher.querySelector('#ais-seg-native')?.addEventListener('click', () => {
          this.setLibraryViewMode('native');
        });
        switcher.querySelector('#ais-seg-folders')?.addEventListener('click', () => {
          this.setLibraryViewMode('folders');
        });
        switcher.querySelector('#ais-seg-info')?.addEventListener('click', () => {
          alert('Режимы отображения библиотеки:\n\n☰ Обычный — стандартный полноразмерный плоский список Google AI Studio.\n\n🗂️ Папки — компактный двухпанельный режим в стиле Linear / Material Design:\n• Слева — складное дерево папок с поиском и быстрым созданием (кнопка ◧ сворачивает/разворачивает панель);\n• Сверху — цепочка навигации (Breadcrumbs) и переключатели области глубокого поиска;\n• Основной поиск Google AI Studio мгновенно ищет по всей базе промптов, мыслей модели и ответов.');
        });
      } else if (switcher) {
        switcher.style.display = '';
        const toggleBtn = switcher.querySelector('#ais-btn-sidebar-toggle');
        if (toggleBtn) {
          toggleBtn.style.display = this.libViewMode === 'folders' ? 'inline-flex' : 'none';
          toggleBtn.classList.toggle('active', !this.isSidebarCollapsed);
        }
      }

      // 2. Cloud Status Pill in the top toolbar
      let cloudPill = document.getElementById('ais-cloud-status-widget');
      const inputContainer = document.querySelector('div.input-container, .input-container');
      const toolbarRow = inputContainer?.parentElement || headerTitle?.parentElement;

      if (!cloudPill && toolbarRow) {
        cloudPill = document.createElement('div');
        cloudPill.id = 'ais-cloud-status-widget';
        cloudPill.className = 'ais-cloud-pill-widget';
        cloudPill.title = 'Статус синхронизации с Google Диском (кликните для настроек)';
        cloudPill.innerHTML = `
          <span class="ais-cloud-pill-dot saved"></span>
          <span class="ais-cloud-pill-text">Синхронизировано</span>
        `;
        toolbarRow.appendChild(cloudPill);

        cloudPill.addEventListener('click', () => {
          this.currentTab = 'settings';
          this.openModal();
        });
      } else if (cloudPill) {
        cloudPill.style.display = '';
      }
    }

    toggleSidebarCollapse() {
      this.isSidebarCollapsed = !this.isSidebarCollapsed;
      GM_setValue('ais_sidebar_collapsed', this.isSidebarCollapsed);

      const toggleBtn = document.getElementById('ais-btn-sidebar-toggle');
      if (toggleBtn) {
        toggleBtn.classList.toggle('active', !this.isSidebarCollapsed);
      }

      const treePanel = document.getElementById('ais-lib-tree-panel');
      if (treePanel) {
        treePanel.classList.toggle('collapsed', this.isSidebarCollapsed);
      }
    }

    setLibraryViewMode(mode) {
      this.libViewMode = mode;
      GM_setValue('ais_lib_view_mode', mode);

      const segNative = document.getElementById('ais-seg-native');
      const segFolders = document.getElementById('ais-seg-folders');
      const toggleBtn = document.getElementById('ais-btn-sidebar-toggle');
      if (segNative && segFolders) {
        segNative.classList.toggle('active', mode === 'native');
        segFolders.classList.toggle('active', mode === 'folders');
      }
      if (toggleBtn) {
        toggleBtn.style.display = mode === 'folders' ? 'inline-flex' : 'none';
      }

      const table = document.querySelector('table.library-table, table[role="table"]');
      if (table) {
        this.refreshLibraryIntegration();
      }
    }

    async ensureLibraryTwoPaneLayout(table) {
      let container = document.getElementById('ais-lib-two-pane-container');
      let tableMount = document.getElementById('ais-lib-table-mount');

      // Remove legacy deep search card if lingering
      const oldDeepCard = document.getElementById('ais-deep-search-card');
      if (oldDeepCard) oldDeepCard.remove();

      if (!container) {
        const parent = table.parentElement;
        if (!parent) return;

        container = document.createElement('div');
        container.id = 'ais-lib-two-pane-container';
        container.className = 'ais-lib-two-pane-container';

        // Insert container right before table in DOM
        parent.insertBefore(container, table);

        // 1. Left Tree Panel
        const treePanel = document.createElement('div');
        treePanel.id = 'ais-lib-tree-panel';
        treePanel.className = `ais-lib-tree-panel ${this.isSidebarCollapsed ? 'collapsed' : ''}`;
        treePanel.innerHTML = `
          <div class="ais-tree-panel-header">
            <span class="ais-tree-panel-title">FOLDERS</span>
            <button id="ais-tree-btn-header-add" class="ais-tree-header-btn" title="Создать корневую папку">➕</button>
          </div>
          <div class="ais-tree-filter-wrapper">
            <span class="ais-tree-filter-icon">🔍</span>
            <input type="text" id="ais-tree-filter-input" class="ais-tree-filter-input" placeholder="Поиск по папкам..." />
          </div>
          <div id="ais-tree-list-content" class="ais-tree-list-content"></div>
        `;
        container.appendChild(treePanel);

        // 2. Right Main Panel
        const mainPanel = document.createElement('div');
        mainPanel.id = 'ais-lib-main-panel';
        mainPanel.className = 'ais-lib-main-panel';

        // Breadcrumbs & Scope Bar
        const breadcrumbsBar = document.createElement('div');
        breadcrumbsBar.id = 'ais-lib-breadcrumbs-bar';
        breadcrumbsBar.className = 'ais-breadcrumbs-bar';

        const breadcrumbsLine = document.createElement('div');
        breadcrumbsLine.id = 'ais-lib-breadcrumbs-line';
        breadcrumbsLine.className = 'ais-breadcrumbs-line';
        breadcrumbsBar.appendChild(breadcrumbsLine);

        const scopeStrip = document.createElement('div');
        scopeStrip.id = 'ais-lib-scope-strip';
        scopeStrip.className = 'ais-scope-strip';
        scopeStrip.innerHTML = `
          <span class="ais-scope-strip-label">Поиск:</span>
          <button class="ais-scope-pill ${this.searchScopes.searchTitle ? 'active' : ''}" data-scope="searchTitle">
            <span class="ais-scope-dot"></span>Заголовок
          </button>
          <button class="ais-scope-pill ${this.searchScopes.searchUser ? 'active' : ''}" data-scope="searchUser">
            <span class="ais-scope-dot"></span>Промпты
          </button>
          <button class="ais-scope-pill ${this.searchScopes.searchModel ? 'active' : ''}" data-scope="searchModel">
            <span class="ais-scope-dot"></span>Ответы Gemini
          </button>
          <button class="ais-scope-pill ${this.searchScopes.searchThinking ? 'active' : ''}" data-scope="searchThinking">
            <span class="ais-scope-dot"></span>Размышления
          </button>
        `;
        breadcrumbsBar.appendChild(scopeStrip);
        mainPanel.appendChild(breadcrumbsBar);

        // Table Mount
        tableMount = document.createElement('div');
        tableMount.id = 'ais-lib-table-mount';
        tableMount.className = 'ais-lib-table-mount';
        tableMount.appendChild(table);
        mainPanel.appendChild(tableMount);

        container.appendChild(mainPanel);

        // Event listener for tree filter
        const treeFilterInput = treePanel.querySelector('#ais-tree-filter-input');
        if (treeFilterInput) {
          treeFilterInput.addEventListener('input', (e) => {
            this.treeFolderFilterQuery = e.target.value.toLowerCase().trim();
            this.renderTreePanel(table);
          });
        }

        // Event listener for "➕" header button
        const btnHeaderAdd = treePanel.querySelector('#ais-tree-btn-header-add');
        if (btnHeaderAdd) {
          btnHeaderAdd.addEventListener('click', async () => {
            const name = prompt('Введите название новой корневой папки:');
            if (name && name.trim()) {
              const newFolder = await AISFolderManager.createFolder(name.trim(), '#1a73e8', null);
              this.libSelectedFolderId = newFolder.id;
              driveSync.triggerAutoSync();
              await this.renderTreePanel(table);
              await this.renderBreadcrumbs(table);
              await this.applyLibraryFilter(table);
            }
          });
        }

        // Setup Scope Strip events
        this.setupScopeStripEvents(scopeStrip, table);
      }

      // Ensure table is inside tableMount
      if (tableMount && table.parentElement !== tableMount) {
        tableMount.appendChild(table);
      }

      container.style.display = 'flex';

      const treePanel = document.getElementById('ais-lib-tree-panel');
      const breadcrumbsBar = document.getElementById('ais-lib-breadcrumbs-bar');

      if (this.libViewMode === 'native') {
        container.classList.add('ais-native-mode');
        if (treePanel) treePanel.style.display = 'none';
        if (breadcrumbsBar) breadcrumbsBar.style.display = 'none';
      } else {
        container.classList.remove('ais-native-mode');
        if (treePanel) {
          treePanel.style.display = 'flex';
          treePanel.classList.toggle('collapsed', this.isSidebarCollapsed);
        }
        if (breadcrumbsBar) breadcrumbsBar.style.display = 'flex';
        await this.renderTreePanel(table);
        await this.renderBreadcrumbs(table);
      }
    }

    setupScopeStripEvents(scopeStrip, table) {
      const pills = scopeStrip.querySelectorAll('.ais-scope-pill');
      pills.forEach((pill) => {
        pill.addEventListener('click', async () => {
          const scopeKey = pill.getAttribute('data-scope');
          if (!scopeKey) return;
          this.searchScopes[scopeKey] = !this.searchScopes[scopeKey];
          pill.classList.toggle('active', this.searchScopes[scopeKey]);
          GM_setValue(`ais_scope_${scopeKey}`, this.searchScopes[scopeKey]);

          const searchInput = document.querySelector('div.input-container input') || document.querySelector('input[aria-label="Search"]');
          const query = (searchInput?.value || this.libSearchQuery || '').trim();
          if (query) {
            await this.triggerDeepSearch(query, table);
          }
        });
      });
    }

    ensureNativeSearchHook() {
      const searchInput = document.querySelector('div.input-container input') || document.querySelector('input[aria-label="Search"]');
      if (!searchInput || searchInput._ais_hooked) return;

      searchInput._ais_hooked = true;

      searchInput.addEventListener('input', (e) => {
        e.stopImmediatePropagation();
        clearTimeout(this.libSearchTimeout);
        const query = searchInput.value.trim();

        this.libSearchTimeout = setTimeout(async () => {
          const table = document.querySelector('table.library-table, table[role="table"]');
          await this.triggerDeepSearch(query, table);
        }, 150);
      }, true);

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }

    updateNativeSearchStatusBadge(count, query = '') {
      let badge = document.getElementById('ais-lib-search-status-badge');
      const container = document.querySelector('div.input-container, .input-wrapper');
      if (!container) return;

      if (count === null || !query) {
        if (badge) badge.remove();
        return;
      }

      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'ais-lib-search-status-badge';
        badge.className = 'ais-lib-search-badge';
        container.appendChild(badge);
      }

      badge.innerHTML = `
        <span>Найдено: <b>${count}</b></span>
        <button id="ais-lib-clear-search-btn" title="Сбросить поиск" style="background:none;border:none;color:#9aa0a6;cursor:pointer;font-size:12px;margin-left:4px;padding:0;line-height:1;">✕</button>
      `;

      badge.querySelector('#ais-lib-clear-search-btn')?.addEventListener('click', () => {
        const searchInput = document.querySelector('div.input-container input') || document.querySelector('input[aria-label="Search"]');
        if (searchInput) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }

    async triggerDeepSearch(query, table) {
      this.libSearchQuery = (query || '').trim();

      if (this.libSearchQuery) {
        const results = await AISSearchEngine.searchIndexed(this.libSearchQuery, this.searchScopes);
        this.libSearchResults = new Map(results.map((r) => [r.id, r]));
        this.updateNativeSearchStatusBadge(results.length, this.libSearchQuery);
      } else {
        this.libSearchResults = null;
        this.updateNativeSearchStatusBadge(null);
      }

      if (table) {
        await this.applyLibraryFilter(table);
      }
    }

    async renderTreePanel(table) {
      const content = document.getElementById('ais-tree-list-content');
      if (!content) return;

      const folders = await db.getAllFolders();
      const prompts = (await db.getAllPrompts()).filter((p) => p.title !== SYNC_PROMPT_TITLE);

      const totalCount = prompts.length;
      const unassignedCount = prompts.filter((p) => !p.folderId).length;

      const folderTree = AISFolderManager.buildFolderTree(folders, prompts);

      let html = '';

      // 1. Root: All prompts
      const isAllActive = this.libSelectedFolderId === 'all';
      html += `
        <div class="ais-tree-node ${isAllActive ? 'active' : ''}" data-tree-id="all" title="Все диалоги">
          <span class="ais-tree-chevron" style="visibility:hidden;">▶</span>
          <span class="ais-tree-icon" style="color: #8ab4f8;">📁</span>
          <span class="ais-tree-name">All prompts</span>
          <span class="ais-tree-count">${totalCount}</span>
        </div>
      `;

      // 2. Unassigned
      const isUnassignedActive = this.libSelectedFolderId === 'unassigned';
      html += `
        <div class="ais-tree-node ${isUnassignedActive ? 'active' : ''}" data-tree-id="unassigned" title="Диалоги без папки">
          <span class="ais-tree-chevron" style="visibility:hidden;">▶</span>
          <span class="ais-tree-icon" style="color: #9aa0a6;">📂</span>
          <span class="ais-tree-name">Without Folder</span>
          <span class="ais-tree-count">${unassignedCount}</span>
        </div>
      `;

      // 3. Render folder tree recursively
      const renderNodes = (nodes, depth = 0) => {
        for (const node of nodes) {
          const matchesQuery = !this.treeFolderFilterQuery || node.name.toLowerCase().includes(this.treeFolderFilterQuery);
          const hasChildren = node.children && node.children.length > 0;
          const isExpanded = this.expandedFolderIds.has(node.id) || !!this.treeFolderFilterQuery;
          const isActive = this.libSelectedFolderId === node.id;

          const indentPx = depth * 14 + 6;

          if (matchesQuery) {
            html += `
              <div class="ais-tree-node ${isActive ? 'active' : ''}" data-tree-id="${node.id}" style="padding-left: ${indentPx}px;" title="${node.name}">
                ${hasChildren ? `
                  <span class="ais-tree-chevron ${isExpanded ? 'expanded' : ''}" data-chevron-id="${node.id}">▶</span>
                ` : `
                  <span class="ais-tree-chevron" style="visibility:hidden;">▶</span>
                `}
                <span class="ais-tree-icon" style="color: ${node.color || '#8ab4f8'};">📁</span>
                <span class="ais-tree-name">${node.name}</span>
                <span class="ais-tree-count">${node.totalCount}</span>
                <div class="ais-tree-node-actions">
                  <button class="ais-tree-action-btn" data-act="add-sub" data-folder-id="${node.id}" title="Создать подпапку">➕</button>
                  <button class="ais-tree-action-btn" data-act="rename" data-folder-id="${node.id}" title="Переименовать">✏️</button>
                  <button class="ais-tree-action-btn" data-act="delete" data-folder-id="${node.id}" title="Удалить папку">🗑️</button>
                </div>
              </div>
            `;
          }

          if (hasChildren && (isExpanded || !matchesQuery)) {
            renderNodes(node.children, depth + 1);
          }
        }
      };

      renderNodes(folderTree, 0);

      content.innerHTML = html;

      // Click node selects folder
      content.querySelectorAll('.ais-tree-node[data-tree-id]').forEach((nodeEl) => {
        nodeEl.addEventListener('click', async (e) => {
          if (e.target.closest('.ais-tree-chevron') || e.target.closest('.ais-tree-action-btn')) return;
          const fId = nodeEl.getAttribute('data-tree-id');
          this.libSelectedFolderId = fId;
          await this.renderTreePanel(table);
          await this.renderBreadcrumbs(table);
          await this.applyLibraryFilter(table);
        });
      });

      // Chevron toggle
      content.querySelectorAll('.ais-tree-chevron[data-chevron-id]').forEach((chEl) => {
        chEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const fId = chEl.getAttribute('data-chevron-id');
          if (this.expandedFolderIds.has(fId)) {
            this.expandedFolderIds.delete(fId);
          } else {
            this.expandedFolderIds.add(fId);
          }
          this.renderTreePanel(table);
        });
      });

      // Action buttons
      content.querySelectorAll('.ais-tree-action-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const act = btn.getAttribute('data-act');
          const fId = btn.getAttribute('data-folder-id');
          const current = folders.find((f) => f.id === fId);
          if (!current) return;

          if (act === 'add-sub') {
            const subName = prompt(`Создать подпапку внутри "${current.name}":`);
            if (subName && subName.trim()) {
              const newSub = await AISFolderManager.createFolder(subName.trim(), current.color || '#1a73e8', fId);
              this.expandedFolderIds.add(fId);
              this.libSelectedFolderId = newSub.id;
              driveSync.triggerAutoSync();
              await this.renderTreePanel(table);
              await this.renderBreadcrumbs(table);
              await this.applyLibraryFilter(table);
            }
          } else if (act === 'rename') {
            const newName = prompt('Новое название папки:', current.name);
            if (newName && newName.trim() && newName.trim() !== current.name) {
              await AISFolderManager.renameFolder(fId, newName.trim());
              driveSync.triggerAutoSync();
              await this.renderTreePanel(table);
              await this.renderBreadcrumbs(table);
              await this.applyLibraryFilter(table);
            }
          } else if (act === 'delete') {
            if (confirm(`Удалить папку "${current.name}"? Диалоги из нее останутся, но потеряют привязку.`)) {
              await AISFolderManager.deleteFolder(fId);
              if (this.libSelectedFolderId === fId) {
                this.libSelectedFolderId = 'all';
              }
              driveSync.triggerAutoSync();
              await this.renderTreePanel(table);
              await this.renderBreadcrumbs(table);
              await this.applyLibraryFilter(table);
            }
          }
        });
      });
    }

    async renderBreadcrumbs(table) {
      const line = document.getElementById('ais-lib-breadcrumbs-line');
      if (!line) return;

      const folders = await db.getAllFolders();
      let html = `<span class="ais-breadcrumb-item ${this.libSelectedFolderId === 'all' ? 'current' : ''}" data-crumb-id="all">Все папки</span>`;

      if (this.libSelectedFolderId === 'unassigned') {
        html += ` <span class="ais-breadcrumb-sep">/</span> <span class="ais-breadcrumb-item current">Без папки</span>`;
      } else if (this.libSelectedFolderId !== 'all') {
        const path = AISFolderManager.getFolderPath(this.libSelectedFolderId, folders);
        for (let i = 0; i < path.length; i++) {
          const p = path[i];
          const isLast = i === path.length - 1;
          html += ` <span class="ais-breadcrumb-sep">/</span> `;
          if (isLast) {
            html += `<span class="ais-breadcrumb-item current">${p.name}</span>`;
          } else {
            html += `<span class="ais-breadcrumb-item" data-crumb-id="${p.id}">${p.name}</span>`;
          }
        }
      }

      line.innerHTML = html;

      line.querySelectorAll('.ais-breadcrumb-item[data-crumb-id]').forEach((c) => {
        c.addEventListener('click', async () => {
          this.libSelectedFolderId = c.getAttribute('data-crumb-id');
          await this.renderTreePanel(table);
          await this.renderBreadcrumbs(table);
          await this.applyLibraryFilter(table);
        });
      });
    }

    async applyLibraryFilter(table) {
      if (this.isFilteringLibraryTable) return;
      this.isFilteringLibraryTable = true;

      try {
        const folders = await db.getAllFolders();
        const prompts = await db.getAllPrompts();
        const promptFolderMap = new Map(prompts.map((p) => [p.id, p.folderId]));

        let allowedFolderIds = null;
        if (this.libViewMode === 'folders') {
          if (this.libSelectedFolderId !== 'all' && this.libSelectedFolderId !== 'unassigned') {
            allowedFolderIds = AISFolderManager.getDescendantFolderIds(this.libSelectedFolderId, folders);
            allowedFolderIds.add(this.libSelectedFolderId);
          }
        }

        const rows = table.querySelectorAll('tbody tr, tr.mat-mdc-row');

        for (const row of rows) {
          const link = row.querySelector('a[href*="/prompts/"]');
          if (!link) continue;

          const pId = link.getAttribute('href')?.split('/prompts/')[1]?.split('?')[0];
          if (!pId) continue;

          let matchesSearch = true;
          let searchMatchItem = null;
          if (this.libSearchQuery && this.libSearchResults) {
            searchMatchItem = this.libSearchResults.get(pId);
            matchesSearch = !!searchMatchItem;
          }

          let matchesFolder = true;
          const pFolderId = promptFolderMap.get(pId) || null;
          if (this.libViewMode === 'folders') {
            if (this.libSelectedFolderId === 'unassigned') {
              matchesFolder = !pFolderId;
            } else if (allowedFolderIds) {
              matchesFolder = pFolderId && allowedFolderIds.has(pFolderId);
            }
          }

          if (matchesSearch && matchesFolder) {
            row.style.removeProperty('display');

            // Search snippet chip
            let snippetEl = row.querySelector('.ais-row-match-chip');
            if (searchMatchItem && searchMatchItem.snippet) {
              if (!snippetEl) {
                snippetEl = document.createElement('div');
                snippetEl.className = 'ais-row-match-chip';
                link.parentElement?.appendChild(snippetEl);
              }
              const tagLabel = searchMatchItem.badge ? searchMatchItem.badge.replace(/^\[|\]$/g, '') : 'Match';
              snippetEl.innerHTML = `<span class="ais-row-match-tag">${tagLabel}</span>${AISSearchEngine.highlightSnippet(searchMatchItem.snippet, this.libSearchQuery)}`;
            } else if (snippetEl) {
              snippetEl.remove();
            }

            // Folder Dot Badge in Row
            if (this.libViewMode === 'folders') {
              this.ensureRowFolderBadge(row, pId, pFolderId, folders, table);
            } else {
              const oldBadge = row.querySelector('.ais-row-folder-badge');
              if (oldBadge) oldBadge.remove();
            }
          } else {
            row.style.setProperty('display', 'none', 'important');
          }
        }
      } finally {
        this.isFilteringLibraryTable = false;
      }
    }

    ensureRowFolderBadge(row, promptId, folderId, folders, table) {
      let badge = row.querySelector('.ais-row-folder-badge');
      const folder = folders.find((f) => f.id === folderId);

      if (this.libViewMode === 'native' || !folder) {
        if (badge) badge.remove();
        return;
      }

      const link = row.querySelector('a[href*="/prompts/"]');
      const titleWrapper = link?.parentElement;
      if (!titleWrapper) return;

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ais-row-folder-badge';
        titleWrapper.appendChild(badge);
      }

      const color = folder.color || '#8ab4f8';
      const name = folder.name;

      badge.title = `Папка: ${name} (кликните, чтобы переместить)`;
      badge.innerHTML = `<span class="ais-row-folder-dot" style="background:${color};"></span>${name}`;

      if (!badge._ais_click_attached) {
        badge._ais_click_attached = true;
        badge.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          await this.promptMoveFolder(promptId, folderId, folders, table);
        });
      }
    }

    async promptMoveFolder(promptId, currentFolderId, folders, table) {
      const folderNames = folders.map((f) => f.name).join('\n• ');
      const current = folders.find((f) => f.id === currentFolderId);
      const currentName = current ? current.name : '(Без папки)';

      const chosenName = prompt(
        `Переместить диалог в другую папку:\nТекущая: ${currentName}\n\nДоступные папки:\n• ${folderNames}\n\n(Введите имя существующей папки, имя новой папки или оставьте пустым для открепления):`,
        currentName
      );

      if (chosenName === null) return;

      const trimmed = chosenName.trim();
      if (!trimmed) {
        await db.updatePromptFolder(promptId, null);
      } else {
        let target = folders.find((f) => f.name.toLowerCase() === trimmed.toLowerCase());
        if (!target) {
          target = await AISFolderManager.createFolder(trimmed, '#1a73e8', null);
        }
        await db.updatePromptFolder(promptId, target.id);
      }

      driveSync.triggerAutoSync();
      await this.renderTreePanel(table);
      await this.renderBreadcrumbs(table);
      await this.applyLibraryFilter(table);
    }

    showAllLibraryRows(table) {
      const rows = table.querySelectorAll('tbody tr, tr.mat-mdc-row');
      for (const row of rows) {
        row.style.removeProperty('display');
        const snippetEl = row.querySelector('.ais-row-match-chip, .ais-lib-search-snippet');
        if (snippetEl) snippetEl.remove();
        const badge = row.querySelector('.ais-row-folder-badge, .ais-lib-folder-tag, .ais-lib-folder-pill');
        if (badge) badge.remove();
      }
    }

    // -----------------------------------------------------------------------
    // ACTIVE CHAT HEADER INTEGRATION
    // -----------------------------------------------------------------------
    observeChatNavigation() {
      setInterval(() => {
        this.refreshDialogHeader();
      }, 1500);
    }

    async refreshDialogHeader(force = false) {
      const match = window.location.pathname.match(/\/prompts\/([a-zA-Z0-9_-]+)/);
      if (!match) {
        const existing = document.getElementById('ais-active-chat-folder-bar');
        if (existing) existing.remove();
        this.currentHeaderPromptId = null;
        this.isCreatingHeaderFolder = false;
        return;
      }

      const promptId = match[1];
      if (promptId === 'new_chat') return;

      const titleContainer = document.querySelector('.page-title, .prompt-title-container, ms-prompt-switcher');
      if (!titleContainer) return;

      let folderBar = document.getElementById('ais-active-chat-folder-bar');
      if (!folderBar) {
        folderBar = document.createElement('div');
        folderBar.id = 'ais-active-chat-folder-bar';
        titleContainer.parentElement.appendChild(folderBar);
        force = true;
      }

      // If user is actively creating a folder or typing in the input, do not overwrite!
      if (!force && this.isCreatingHeaderFolder) {
        return;
      }
      const activeInput = document.getElementById('ais-header-folder-input');
      if (!force && activeInput && document.activeElement === activeInput) {
        return;
      }

      const promptData = await db.getPrompt(promptId);
      const folders = await db.getAllFolders();

      // Avoid unnecessary DOM rebuilds if prompt and folder have not changed
      const currentFid = promptData?.folderId || '';
      if (!force && this.currentHeaderPromptId === promptId && folderBar.dataset.folderId === currentFid && folderBar.dataset.folderCount === String(folders.length)) {
        return;
      }

      this.currentHeaderPromptId = promptId;
      folderBar.dataset.folderId = currentFid;
      folderBar.dataset.folderCount = String(folders.length);

      this.renderHeaderFolderBar(folderBar, promptId, promptData, folders);
    }

    renderHeaderFolderBar(folderBar, promptId, promptData, folders) {
      this.isCreatingHeaderFolder = false;

      const options = AISUIManager.buildFolderSelectOptions(folders, promptData?.folderId, true);
      const parentOptions = `<option value="">(В корень)</option>` + AISUIManager.buildFolderSelectOptions(folders, promptData?.folderId || '');

      folderBar.innerHTML = `
        <span style="font-size: 14px;">📁</span>
        <span>Папка:</span>
        <div id="ais-header-folder-view" class="ais-header-folder-subgroup">
          <select id="ais-header-folder-select" title="Выбрать папку для диалога">${options}</select>
          <button id="ais-header-add-folder-btn" class="ais-header-btn-icon" title="Создать новую папку">+</button>
        </div>
        <div id="ais-header-folder-create" class="ais-header-folder-subgroup" style="display: none;">
          <input type="text" id="ais-header-folder-input" class="ais-header-folder-input" placeholder="Имя папки..." maxlength="50" />
          <select id="ais-header-parent-select" class="ais-header-parent-select" title="Родительская папка">
            ${parentOptions}
          </select>
          <button id="ais-header-folder-confirm" class="ais-header-btn-sm confirm" title="Создать и привязать">✓</button>
          <button id="ais-header-folder-cancel" class="ais-header-btn-sm cancel" title="Отмена">✕</button>
        </div>
        <span id="ais-header-folder-status" class="ais-header-folder-status" style="display: none;"></span>
      `;

      const viewGroup = folderBar.querySelector('#ais-header-folder-view');
      const createGroup = folderBar.querySelector('#ais-header-folder-create');
      const select = folderBar.querySelector('#ais-header-folder-select');
      const addBtn = folderBar.querySelector('#ais-header-add-folder-btn');
      const input = folderBar.querySelector('#ais-header-folder-input');
      const parentSelect = folderBar.querySelector('#ais-header-parent-select');
      const confirmBtn = folderBar.querySelector('#ais-header-folder-confirm');
      const cancelBtn = folderBar.querySelector('#ais-header-folder-cancel');
      const statusSpan = folderBar.querySelector('#ais-header-folder-status');

      const showStatus = (text, isSuccess = true) => {
        if (!statusSpan) return;
        statusSpan.textContent = text;
        statusSpan.style.color = isSuccess ? 'var(--ais-success)' : '#d93025';
        statusSpan.style.display = 'inline';
        setTimeout(() => {
          if (statusSpan) statusSpan.style.display = 'none';
        }, 2200);
      };

      const enterCreateMode = () => {
        this.isCreatingHeaderFolder = true;
        viewGroup.style.display = 'none';
        createGroup.style.display = 'inline-flex';
        input.value = '';
        if (parentSelect) parentSelect.value = promptData?.folderId || '';
        input.focus();
      };

      const exitCreateMode = () => {
        this.isCreatingHeaderFolder = false;
        createGroup.style.display = 'none';
        viewGroup.style.display = 'inline-flex';
        select.value = promptData?.folderId || '';
      };

      select.onchange = async (e) => {
        const val = e.target.value;
        if (val === '__NEW_FOLDER__') {
          enterCreateMode();
          return;
        }
        const newFid = val || null;
        await AISFolderManager.assignPromptToFolder(promptId, newFid);
        if (promptData) promptData.folderId = newFid;
        folderBar.dataset.folderId = newFid || '';
        showStatus('✓ Сохранено');
        this.refreshFolderCounts();
      };

      addBtn.onclick = (e) => {
        e.preventDefault();
        enterCreateMode();
      };

      cancelBtn.onclick = (e) => {
        e.preventDefault();
        exitCreateMode();
      };

      const handleConfirm = async () => {
        const name = input.value.trim();
        if (!name) {
          input.style.borderColor = '#d93025';
          setTimeout(() => {
            if (input) input.style.borderColor = 'var(--ais-primary)';
          }, 1200);
          input.focus();
          return;
        }

        try {
          confirmBtn.disabled = true;
          input.disabled = true;
          const parentId = parentSelect?.value || null;
          const newFolder = await AISFolderManager.createFolder(name, '#1a73e8', parentId);
          await AISFolderManager.assignPromptToFolder(promptId, newFolder.id);
          this.refreshFolderCounts();
          await this.refreshDialogHeader(true);
          showStatus('✓ Папка создана!');
        } catch (err) {
          console.error('[AIS Enhancer] Error creating folder from header:', err);
          showStatus('✕ Ошибка', false);
          exitCreateMode();
        }
      };

      confirmBtn.onclick = (e) => {
        e.preventDefault();
        handleConfirm();
      };

      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirm();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          exitCreateMode();
        }
      };
    }
  }

  const uiManager = new AISUIManager();

  // =========================================================================
  // 9. INITIALIZATION
  // =========================================================================

  function init() {
    setupNetworkInterception();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => uiManager.init());
    } else {
      uiManager.init();
    }
  }

  init();
})();
