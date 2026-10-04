// ==UserScript==
// @name         Google AI Studio: Full-Text Search & Folders
// @namespace    https://github.com/vibe-coding/aistudio-enhancer
// @version      1.8.8
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

  const SCRIPT_VERSION = '1.8.8';
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
      const items = AISParser.parsePromptList(data);
      for (const item of items) {
        if (item.title === SYNC_PROMPT_TITLE) continue;
        this.knownPrompts.set(item.id, item);
        const existing = await db.getPrompt(item.id);
        if (existing) {
          existing.title = item.title;
          existing.updatedAt = item.updatedAt;
          await db.savePrompt(existing);
        } else {
          await db.savePrompt({
            id: item.id,
            title: item.title,
            folderId: null,
            updatedAt: item.updatedAt,
            messages: [],
            indexedAt: 0,
          });
        }
      }
      return items;
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

    static findSyncPayload(node) {
      if (!node) return null;
      if (typeof node === 'string' && node.startsWith('AIS_SYNC_PAYLOAD::')) {
        return node;
      }
      if (Array.isArray(node)) {
        for (const item of node) {
          const res = AISParser.findSyncPayload(item);
          if (res) return res;
        }
      }
      return null;
    }

    static findAndReplaceSyncPayload(node, newText) {
      if (!node) return false;
      // 1. Try to find and replace existing AIS_SYNC_PAYLOAD
      function replaceExisting(n) {
        if (!n || !Array.isArray(n)) return false;
        for (let i = 0; i < n.length; i++) {
          if (typeof n[i] === 'string' && n[i].startsWith('AIS_SYNC_PAYLOAD::')) {
            n[i] = newText;
            return true;
          }
          if (Array.isArray(n[i]) && replaceExisting(n[i])) return true;
        }
        return false;
      }
      if (replaceExisting(node)) return true;

      // 2. If not found, find first turn in history and inject
      const history = AISParser.findHistoryRecursive(node);
      if (history && Array.isArray(history) && history.length > 0) {
        for (const turn of history) {
          if (Array.isArray(turn)) {
            for (let i = 0; i < turn.length; i++) {
              if (Array.isArray(turn[i])) {
                for (let j = 0; j < turn[i].length; j++) {
                  if (typeof turn[i][j] === 'string' && !['user', 'model', 'function'].includes(turn[i][j])) {
                    turn[i][j] = newText;
                    return true;
                  }
                }
              }
            }
          }
        }
      }

      // 3. Fallback: search for any candidate text string in node
      function replaceAnyCandidate(n) {
        if (!n || !Array.isArray(n)) return false;
        for (let i = 0; i < n.length; i++) {
          if (typeof n[i] === 'string' && n[i].length > 10 && !n[i].startsWith('http') && !n[i].startsWith('prompts/') && !n[i].startsWith('models/')) {
            n[i] = newText;
            return true;
          }
          if (Array.isArray(n[i]) && replaceAnyCandidate(n[i])) return true;
        }
        return false;
      }
      return replaceAnyCandidate(node);
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
        if (!id || id === 'new_chat') continue;
        try {
          samplePrompt = await apiClient.fetchRawPrompt(id);
          if (samplePrompt && Array.isArray(samplePrompt)) break;
        } catch (e) {}
      }

      if (!samplePrompt) {
        const allStored = await db.getAllPrompts();
        for (const p of allStored) {
          if (p.id && p.id !== 'new_chat' && p.title !== SYNC_PROMPT_TITLE) {
            try {
              samplePrompt = await apiClient.fetchRawPrompt(p.id);
              if (samplePrompt && Array.isArray(samplePrompt)) break;
            } catch (e) {}
          }
        }
      }

      let root;
      if (samplePrompt) {
        root = JSON.parse(JSON.stringify(samplePrompt));
        if (Array.isArray(root) && root.length === 1 && Array.isArray(root[0])) {
          root = root[0];
        }
        root[0] = null; // Unset ID for CreatePrompt
        if (Array.isArray(root[4])) {
          root[4][0] = SYNC_PROMPT_TITLE;
        }
        AISParser.findAndReplaceSyncPayload(root, payloadString);
      } else {
        root = [
          null,
          null,
          null,
          [1, null, "models/gemini-2.5-flash"],
          [SYNC_PROMPT_TITLE]
        ];
        AISParser.findAndReplaceSyncPayload(root, payloadString);
      }

      const res = await apiClient.executeRpc('CreatePrompt', [root]);

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

      AISParser.findAndReplaceSyncPayload(root, payloadString);

      await apiClient.executeRpc('UpdatePrompt', [root]);
    }

    // High-Level: Push local database to Google Drive
    async pushToDrive(onStatus = null, isManual = false) {
      if (this.isSyncing && this.activePushPromise) {
        if (onStatus) onStatus('Ожидание завершения текущей синхронизации...');
        return await this.activePushPromise;
      }
      this.isSyncing = true;
      this.lastSyncStatus = 'syncing';
      uiManager.updateCloudStatus('☁️ Сохранение в Google Диск...', 'syncing');

      this.activePushPromise = (async () => {
        try {
          if (onStatus) onStatus('Сбор локальных данных (папки, привязка диалогов)...');
          if (uiManager.syncPromptsFromDom) {
            await uiManager.syncPromptsFromDom();
          }
          let folders = await db.getAllFolders();
          let prompts = await db.getAllPrompts();

          // Auto-discovery fallback if db is empty
          if (prompts.length === 0 && apiClient.capturedHeaders) {
            try {
              if (onStatus) onStatus('Запрос списка диалогов из Google AI Studio...');
              await apiClient.fetchPromptList();
              prompts = await db.getAllPrompts();
            } catch (e) {
              console.warn('[AIS Enhancer] Failed to fetch prompt list during push:', e);
            }
          }

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
          uiManager.updateCloudStatus('Все изменения сохранены в облаке', 'saved');

          return {
            promptCount: promptMetas.length,
            assignedCount: Object.keys(promptFolders).length,
            folderCount: folders.length,
            syncId,
          };
        } catch (err) {
          this.lastSyncStatus = 'error';
          this.lastSyncMessage = err.message;
          const msg = err.message || '';
          if (msg.includes('401') || msg.includes('авторизация') || msg.includes('сессионные заголовки') || msg.includes('CREDENTIALS_MISSING')) {
            uiManager.updateCloudStatus('Откройте любой диалог для инициализации синхронизации', 'idle');
          } else {
            uiManager.updateCloudStatus('Ошибка синхронизации', 'error');
          }
          console.warn('[AIS Enhancer] Drive sync error:', err.message);
          if (isManual) {
            throw err;
          }
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

          const turnText = AISParser.findSyncPayload(root) || AISParser.extractTextFromTurn(root[2]?.[0] || []);
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
    :root, body.ais-theme-light, .ais-theme-light {
      --ais-primary: #1f1f1f;
      --ais-primary-hover: #3c4043;
      --ais-bg: #ffffff;
      --ais-surface: #f8f9fa;
      --ais-border: #dadce0;
      --ais-border-subtle: #e8eaed;
      --ais-border-active: #dadce0;
      --ais-text: #202124;
      --ais-text-primary: #202124;
      --ais-text-secondary: #5f6368;
      --ais-text-disabled: #80868b;
      --ais-bg-hover: rgba(60, 64, 67, 0.08);
      --ais-bg-active: #e8eaed;
      --ais-accent: #202124;
      --ais-pill-bg: #ffffff;
      --ais-pill-hover-bg: rgba(0, 0, 0, 0.04);
      --ais-pill-active-bg: #ffffff;
      --ais-pill-active-color: #1b1b1e;
      --ais-card-bg: #ffffff;
      --ais-card-shadow: 0 2px 8px rgba(60, 64, 67, 0.2);
      --ais-dot-bg: #80868b;
      --ais-badge-user: #f1f3f4;
      --ais-badge-user-text: #202124;
      --ais-badge-model: #e8eaed;
      --ais-badge-model-text: #202124;
      --ais-badge-thought: #f1f3f4;
      --ais-badge-thought-text: #5f6368;
      --ais-badge-title: #e8eaed;
      --ais-badge-title-text: #202124;
      --ais-cloud: #5f6368;
      --ais-cloud-bg: #f1f3f4;
      --ais-success: #1e8e3e;
    }

    body.dark-theme, html.dark-theme, body[data-theme='dark'], html[data-theme='dark'], body.ais-theme-dark, .ais-theme-dark {
      --ais-primary: #e3e3e3;
      --ais-primary-hover: #ffffff;
      --ais-bg: #202124;
      --ais-surface: #2d2e30;
      --ais-border: #3c4043;
      --ais-border-subtle: rgba(255, 255, 255, 0.06);
      --ais-border-active: rgba(255, 255, 255, 0.25);
      --ais-text: #e8eaed;
      --ais-text-primary: #e8eaed;
      --ais-text-secondary: #9aa0a6;
      --ais-text-disabled: #70757a;
      --ais-bg-hover: rgba(255, 255, 255, 0.08);
      --ais-bg-active: rgba(255, 255, 255, 0.12);
      --ais-accent: #e8eaed;
      --ais-pill-bg: #1e1f20;
      --ais-pill-hover-bg: #28292a;
      --ais-pill-active-bg: #3c4043;
      --ais-pill-active-color: #ffffff;
      --ais-card-bg: #28292c;
      --ais-card-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      --ais-dot-bg: #5f6368;
      --ais-badge-user: #2d2f31;
      --ais-badge-user-text: #e8eaed;
      --ais-badge-model: #3c4043;
      --ais-badge-model-text: #e8eaed;
      --ais-badge-thought: #28292a;
      --ais-badge-thought-text: #9aa0a6;
      --ais-badge-title: #3c4043;
      --ais-badge-title-text: #e8eaed;
      --ais-cloud: #9aa0a6;
      --ais-cloud-bg: #2d2f31;
      --ais-success: #81c995;
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
      color: var(--ais-bg);
      padding: 10px 16px;
      border-radius: 28px;
      border: 1px solid var(--ais-border);
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
      border-radius: 8px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--ais-text-secondary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .ais-tab:hover {
      background: rgba(128,128,128,0.08);
      color: var(--ais-text);
    }
    .ais-tab.active {
      background: #e8eaed;
      border-color: #dadce0;
      color: #1f1f1f;
      font-weight: 600;
    }
    body.dark-theme .ais-tab.active,
    .ais-theme-dark .ais-tab.active {
      background: #3c4043;
      border-color: #5f6368;
      color: #e8eaed;
      font-weight: 600;
    }

    .ais-settings-sync-footer {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: space-between !important;
      border-top: 1px solid var(--ais-border);
      padding-top: 14px;
      margin-top: 4px;
      gap: 16px;
    }
    .ais-sync-status-group {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 5px;
    }
    .ais-sync-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 7px;
      padding: 4px 11px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
      width: fit-content;
      line-height: 1;
      transition: all 0.2s ease;
    }
    .ais-sync-badge.saved {
      background: rgba(30, 142, 62, 0.08);
      border: 1px solid rgba(30, 142, 62, 0.25);
      color: #137333;
    }
    .ais-sync-badge.syncing {
      background: rgba(26, 115, 232, 0.08);
      border: 1px solid rgba(26, 115, 232, 0.25);
      color: #1a73e8;
    }
    .ais-sync-badge.idle {
      background: rgba(128, 128, 128, 0.08);
      border: 1px solid var(--ais-border);
      color: var(--ais-text-secondary);
    }
    .ais-sync-badge.error {
      background: rgba(217, 48, 37, 0.08);
      border: 1px solid rgba(217, 48, 37, 0.25);
      color: #d93025;
    }
    .ais-sync-badge-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .ais-sync-badge.saved .ais-sync-badge-dot { background: #1e8e3e; }
    .ais-sync-badge.syncing .ais-sync-badge-dot {
      background: #1a73e8;
      animation: ais-pulse-dot 1.2s infinite ease-in-out;
    }
    .ais-sync-badge.idle .ais-sync-badge-dot { background: #80868b; }
    .ais-sync-badge.error .ais-sync-badge-dot { background: #d93025; }

    @keyframes ais-pulse-dot {
      0% { transform: scale(0.9); opacity: 0.6; }
      50% { transform: scale(1.25); opacity: 1; }
      100% { transform: scale(0.9); opacity: 0.6; }
    }

    body.dark-theme .ais-sync-badge.saved,
    .ais-theme-dark .ais-sync-badge.saved {
      background: rgba(52, 168, 83, 0.15);
      border-color: rgba(52, 168, 83, 0.3);
      color: #81c995;
    }
    body.dark-theme .ais-sync-badge.saved .ais-sync-badge-dot,
    .ais-theme-dark .ais-sync-badge.saved .ais-sync-badge-dot { background: #34a853; }

    body.dark-theme .ais-sync-badge.syncing,
    .ais-theme-dark .ais-sync-badge.syncing {
      background: rgba(138, 180, 248, 0.15);
      border-color: rgba(138, 180, 248, 0.3);
      color: #8ab4f8;
    }
    body.dark-theme .ais-sync-badge.syncing .ais-sync-badge-dot,
    .ais-theme-dark .ais-sync-badge.syncing .ais-sync-badge-dot { background: #8ab4f8; }

    body.dark-theme .ais-sync-badge.error,
    .ais-theme-dark .ais-sync-badge.error {
      background: rgba(242, 139, 130, 0.15);
      border-color: rgba(242, 139, 130, 0.3);
      color: #f28b82;
    }
    body.dark-theme .ais-sync-badge.error .ais-sync-badge-dot,
    .ais-theme-dark .ais-sync-badge.error .ais-sync-badge-dot { background: #f28b82; }

    .ais-sync-time-label {
      font-size: 11px;
      color: var(--ais-text-secondary);
      padding-left: 4px;
    }

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
    /* SIDEBAR FOLDER TREE (UNDER "History" in EXPLORE)                       */
    /* --------------------------------------------------------------------- */
    .ais-sidebar-folder-tree {
      margin: 4px 0 12px 0;
      padding: 4px 6px;
      box-sizing: border-box;
      user-select: none;
      font-family: inherit;
    }
    .ais-sb-header {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 6px;
      padding: 0 4px;
      position: relative;
    }
    .ais-sb-filter-wrapper {
      position: relative;
      flex: 1;
      display: flex;
      align-items: center;
    }
    .ais-sb-filter-input {
      width: 100%;
      height: 24px;
      background: var(--ais-pill-bg);
      border: 1px solid var(--ais-border);
      border-radius: 12px;
      padding: 0 20px 0 8px;
      font-size: 11px;
      color: var(--ais-text-primary);
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.15s, background 0.15s;
    }
    .ais-sb-filter-input:focus {
      border-color: var(--ais-text-primary);
    }
    .ais-sb-filter-input::placeholder {
      color: var(--ais-text-disabled);
    }
    .ais-sb-clear-btn {
      position: absolute;
      right: 5px;
      top: 50%;
      transform: translateY(-50%);
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--ais-text-disabled);
      font-size: 10px;
      line-height: 1;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
    }
    .ais-sb-clear-btn:hover {
      color: var(--ais-text-primary);
      background: var(--ais-bg-hover);
    }
    .ais-sb-icon-btn {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--ais-pill-bg);
      border: 1px solid var(--ais-border);
      border-radius: 50%;
      color: var(--ais-text-secondary);
      cursor: pointer;
      font-size: 11px;
      padding: 0;
      line-height: 1;
      transition: all 0.15s;
      flex-shrink: 0;
    }
    .ais-sb-icon-btn:hover {
      background: var(--ais-bg-hover);
      color: var(--ais-text-primary);
      border-color: var(--ais-text-secondary);
    }
    .ais-sb-list-wrap {
      display: flex;
      flex-direction: column;
      gap: 1px;
      max-height: calc(100vh - 260px);
      min-height: 80px;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 2px;
      transition: max-height 0.2s ease;
    }
    .ais-sb-list-wrap::-webkit-scrollbar {
      width: 3px;
    }
    .ais-sb-list-wrap::-webkit-scrollbar-thumb {
      background: var(--ais-border);
      border-radius: 2px;
    }
    .ais-sb-node {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 8px;
      border-radius: 14px;
      font-size: 12px;
      color: var(--ais-text-secondary);
      cursor: pointer;
      box-sizing: border-box;
      transition: background 0.12s, color 0.12s;
      position: relative;
      user-select: none;
    }
    .ais-sb-node:hover {
      background: var(--ais-bg-hover);
      color: var(--ais-text-primary);
    }
    .ais-sb-node.active {
      background: var(--ais-bg-active);
      color: var(--ais-text-primary);
      font-weight: 500;
    }
    .ais-sb-chevron {
      width: 12px;
      height: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      color: var(--ais-text-disabled);
      cursor: pointer;
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    .ais-sb-chevron.expanded {
      transform: rotate(90deg);
    }
    .ais-sb-chevron-spacer {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
    }
    .ais-sb-icon {
      font-size: 12px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      opacity: 0.85;
    }
    .ais-sb-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ais-sb-count {
      font-size: 10px;
      color: var(--ais-text-disabled);
      margin-left: 4px;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .ais-sb-node.active .ais-sb-count {
      color: var(--ais-text-primary);
      font-weight: 600;
    }

    /* --------------------------------------------------------------------- */
    /* CONTEXT MENU (RIGHT CLICK / ПКМ НА ПАПКЕ)                             */
    /* --------------------------------------------------------------------- */
    .ais-folder-context-menu {
      position: fixed;
      z-index: 9999999;
      background: var(--ais-card-bg);
      border: 1px solid var(--ais-border);
      border-radius: 8px;
      box-shadow: var(--ais-card-shadow);
      padding: 4px 0;
      min-width: 175px;
      font-family: inherit;
      animation: aisPopIn 0.12s ease-out;
      user-select: none;
    }
    .ais-context-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      font-size: 12px;
      color: var(--ais-text-primary);
      cursor: pointer;
      transition: background 0.12s;
    }
    .ais-context-item:hover {
      background: var(--ais-bg-hover);
      color: var(--ais-text-primary);
    }
    .ais-context-item.danger:hover {
      background: rgba(234, 67, 53, 0.12);
      color: #ea4335;
    }
    .ais-context-icon {
      font-size: 13px;
      width: 16px;
      text-align: center;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
    }
    .ais-context-divider {
      height: 1px;
      background: var(--ais-border-subtle);
      margin: 3px 0;
    }

    @keyframes aisPopIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    /* --------------------------------------------------------------------- */
    /* NATIVE SETTINGS MENU INTEGRATION (.mat-mdc-menu-panel)                */
    /* --------------------------------------------------------------------- */
    .ais-native-menu-header {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--ais-text-disabled);
      padding: 8px 16px 4px 16px;
      user-select: none;
    }
    .ais-native-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 0 16px;
      min-height: 38px;
      border: none;
      background: transparent;
      color: var(--ais-text-primary);
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      box-sizing: border-box;
      text-decoration: none;
      transition: background 0.12s;
      user-select: none;
    }
    .ais-native-menu-item:hover {
      background: var(--ais-bg-hover);
      color: var(--ais-text-primary);
    }
    .ais-native-menu-icon {
      font-size: 15px;
      width: 18px;
      text-align: center;
      line-height: 1;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
    }
    .ais-native-menu-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 7px 16px;
      box-sizing: border-box;
      font-size: 12px;
      color: var(--ais-text-primary);
      cursor: pointer;
      user-select: none;
      transition: background 0.12s;
    }
    .ais-native-menu-toggle:hover {
      background: var(--ais-bg-hover);
    }
    .ais-native-menu-toggle input {
      cursor: pointer;
      margin-left: 8px;
    }
    .ais-native-menu-divider {
      height: 1px;
      background: var(--ais-border-subtle);
      margin: 4px 0;
    }

    /* --------------------------------------------------------------------- */
    /* LIBRARY TOP BAR & SCOPE STRIP (CLEAN & FULL WIDTH)                     */
    /* --------------------------------------------------------------------- */
    .ais-lib-top-bar {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      padding: 6px 0 8px 0;
      margin-bottom: 8px;
      border-bottom: 1px solid var(--ais-border-subtle);
      box-sizing: border-box;
      user-select: none;
    }
    .ais-breadcrumbs-line {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 13px;
      color: var(--ais-text-secondary);
    }
    .ais-breadcrumb-item {
      cursor: pointer;
      color: var(--ais-text-secondary);
      transition: color 0.15s;
    }
    .ais-breadcrumb-item:hover {
      color: var(--ais-text-primary);
      text-decoration: underline;
    }
    .ais-breadcrumb-item.current {
      cursor: default;
      color: var(--ais-text-primary);
      font-weight: 600;
      text-decoration: none;
    }
    .ais-breadcrumb-sep {
      color: var(--ais-text-disabled);
      font-size: 11px;
    }

    /* --------------------------------------------------------------------- */
    /* SEARCH WRAPPER & MINIMALIST DOT INDICATOR SCOPE FILTERS (VARIANT 3)   */
    /* --------------------------------------------------------------------- */
    .ais-search-wrapper {
      position: relative;
      display: inline-flex;
      flex-direction: column;
      align-items: flex-end;
      margin-left: auto;
      flex-shrink: 0;
      box-sizing: border-box;
    }
    .ais-scope-dots-row {
      position: absolute;
      top: calc(100% + 3px);
      right: 0;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      user-select: none;
      font-family: inherit;
      white-space: nowrap;
      z-index: 5;
    }
    .ais-scope-dots-label {
      font-size: 8.5px;
      color: var(--ais-text-disabled, #80868b);
      font-weight: 400;
      white-space: nowrap;
      margin-right: -2px;
    }
    .ais-scope-dot-btn {
      background: transparent;
      border: none;
      padding: 1px 2px;
      font-size: 9px;
      font-family: inherit;
      font-weight: 400;
      color: var(--ais-text-disabled, #80868b);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3.5px;
      line-height: 12px;
      transition: all 0.15s ease;
      white-space: nowrap;
      outline: none;
      border-radius: 4px;
    }
    .ais-scope-dot-btn:hover {
      color: var(--ais-text-primary, #1b1b1e);
      background: var(--ais-bg-hover, rgba(0, 0, 0, 0.04));
    }
    .ais-scope-indicator-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background-color: var(--ais-border, #dadce0);
      transition: background-color 0.15s ease, transform 0.15s ease;
      flex-shrink: 0;
      display: inline-block;
    }
    .ais-scope-dot-btn.active {
      color: var(--ais-text-primary, #1f1f1f);
      font-weight: 500;
    }
    .ais-scope-dot-btn.active .ais-scope-indicator-dot {
      background-color: var(--ais-text-primary, #1f1f1f);
      transform: scale(1.15);
    }

    /* Dark theme overrides for Variant 3 */
    body.dark-theme .ais-scope-dots-label,
    .ais-theme-dark .ais-scope-dots-label {
      color: #70757a;
    }
    body.dark-theme .ais-scope-dot-btn,
    .ais-theme-dark .ais-scope-dot-btn {
      color: #70757a;
    }
    body.dark-theme .ais-scope-dot-btn:hover,
    .ais-theme-dark .ais-scope-dot-btn:hover {
      color: #e8eaed;
      background: rgba(255, 255, 255, 0.06);
    }
    body.dark-theme .ais-scope-indicator-dot,
    .ais-theme-dark .ais-scope-indicator-dot {
      background-color: #5f6368;
    }
    body.dark-theme .ais-scope-dot-btn.active,
    .ais-theme-dark .ais-scope-dot-btn.active {
      color: #e8eaed;
      font-weight: 500;
    }
    body.dark-theme .ais-scope-dot-btn.active .ais-scope-indicator-dot,
    .ais-theme-dark .ais-scope-dot-btn.active .ais-scope-indicator-dot {
      background-color: #e8eaed;
      transform: scale(1.15);
    }

    /* Cloud Drive Status Dot (Mounted directly beside native Google Drive icon) */
    .ais-cloud-drive-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #34a853;
      display: inline-block;
      flex-shrink: 0;
      margin-left: 4px;
      margin-right: 8px;
      box-shadow: 0 0 3px rgba(52, 168, 83, 0.6);
      cursor: pointer;
      vertical-align: middle;
      align-self: center;
      transition: background 0.2s, transform 0.2s;
    }
    .ais-cloud-drive-dot.syncing {
      background: #fbbc04;
      box-shadow: 0 0 5px rgba(251, 188, 4, 0.8);
      animation: aisDrivePulse 1s infinite alternate;
    }
    .ais-cloud-drive-dot.error {
      background: #ea4335;
      box-shadow: 0 0 5px rgba(234, 67, 53, 0.8);
    }
    @keyframes aisDrivePulse {
      from { opacity: 0.4; transform: scale(0.85); }
      to { opacity: 1; transform: scale(1.15); }
    }

    /* Table row enhancements */
    td.cdk-column-name {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      min-height: 48px;
      box-sizing: border-box;
      gap: 16px;
    }
    .ais-row-meta-right {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .ais-row-folder-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--ais-pill-bg, rgba(0, 0, 0, 0.04));
      color: var(--ais-text-secondary, #5f6368);
      border: 1px solid var(--ais-border, rgba(215, 216, 218, 0.5));
      border-radius: 6px;
      padding: 1px 7px;
      font-size: 11px;
      font-weight: 400;
      cursor: pointer;
      transition: all 0.15s;
      vertical-align: middle;
      user-select: none;
      flex-shrink: 0;
      white-space: nowrap;
      line-height: 1.3;
    }
    .ais-row-folder-badge:hover {
      background: var(--ais-pill-hover-bg);
      border-color: var(--ais-border-active);
      color: var(--ais-text-primary);
    }
    .ais-row-folder-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.7;
    }
    .ais-row-folder-name {
      line-height: 1.2;
    }
    .ais-row-match-chip {
      font-size: 12px;
      color: var(--ais-text-secondary);
      background: var(--ais-bg-hover);
      padding: 3px 8px;
      border-radius: 0 4px 4px 0;
      margin-top: 4px;
      line-height: 1.4;
      border-left: 2px solid var(--ais-text-secondary);
      max-width: 750px;
    }
    .ais-row-match-chip mark {
      background: rgba(255, 235, 59, 0.35);
      color: inherit;
      border-radius: 2px;
      padding: 0 2px;
      font-weight: 600;
    }
    .ais-row-match-tag {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--ais-text-primary);
      margin-right: 6px;
      letter-spacing: 0.3px;
    }
    .ais-lib-search-badge {
      font-size: 12px;
      color: var(--ais-text-primary);
      background: var(--ais-pill-bg);
      border: 1px solid var(--ais-border);
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

      // Sidebar & Navigation Integration
      this.showBuildManage = GM_getValue('ais_show_build_manage', false);
      this.showFolderTags = GM_getValue('ais_show_folder_tags', true);
      this.sidebarFolderFilterQuery = '';

      // Library Integration State (https://aistudio.google.com/library)
      this.libSelectedFolderId = 'all';
      this.libSearchQuery = '';
      this.libSearchTimeout = null;
      this.libSearchResults = null;
      this.isFilteringLibraryTable = false;
      this.searchScopes = {
        searchTitle: GM_getValue('ais_scope_title', true),
        searchUser: GM_getValue('ais_scope_user', true),
        searchModel: GM_getValue('ais_scope_model', true),
        searchThinking: GM_getValue('ais_scope_thinking', true),
      };
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
      this.detectAiStudioTheme();
      this.createLauncher();
      this.createModal();
      this.registerShortcuts();
      this.observeChatNavigation();
      this.observeNavigation();
      this.checkCloudSyncOnLoad();
    }

    injectStyles() {
      if (document.getElementById('ais-enhanced-styles')) return;
      const style = document.createElement('style');
      style.id = 'ais-enhanced-styles';
      style.textContent = UI_STYLES;
      document.head.appendChild(style);
    }

    detectAiStudioTheme() {
      const checkAndApply = () => {
        const doc = document.documentElement;
        const body = document.body;
        let isDark = false;

        if (doc.classList.contains('dark-theme') || body?.classList.contains('dark-theme') ||
            doc.classList.contains('theme-dark') || body?.classList.contains('theme-dark') ||
            doc.classList.contains('dark') || body?.classList.contains('dark')) {
          isDark = true;
        } else if (doc.getAttribute('data-theme') === 'dark' || body?.getAttribute('data-theme') === 'dark' ||
                   doc.getAttribute('color-scheme') === 'dark' || body?.getAttribute('color-scheme') === 'dark') {
          isDark = true;
        } else {
          const candidates = [
            document.querySelector('ms-library-page'),
            document.querySelector('.mat-drawer-content'),
            document.querySelector('.mat-drawer-container'),
            document.querySelector('ms-app'),
            document.querySelector('main'),
            body,
            doc
          ];
          for (const el of candidates) {
            if (!el) continue;
            const bg = window.getComputedStyle(el).backgroundColor;
            if (!bg || bg === 'transparent' || bg.includes('rgba(0, 0, 0, 0)')) continue;
            const rgb = bg.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
              const brightness = (Number(rgb[0]) * 299 + Number(rgb[1]) * 587 + Number(rgb[2]) * 114) / 1000;
              isDark = brightness < 128;
              break;
            }
          }
        }

        if (body) {
          body.classList.toggle('ais-theme-dark', isDark);
          body.classList.toggle('ais-theme-light', !isDark);
        }
        if (this.modalBackdrop) {
          this.modalBackdrop.classList.toggle('ais-theme-dark', isDark);
          this.modalBackdrop.classList.toggle('ais-theme-light', !isDark);
        }
      };

      checkAndApply();
      if (!this._themeObserver) {
        this._themeObserver = new MutationObserver(() => checkAndApply());
        this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style', 'color-scheme'] });
        if (document.body) {
          this._themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style', 'color-scheme'] });
        }
      }
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
            <button class="ais-close-btn" title="Закрыть (Esc)">✕</button>
          </div>
          <div class="ais-modal-body" id="ais-modal-content"></div>
        </div>
      `;

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeModal();
      });

      backdrop.querySelector('.ais-close-btn').addEventListener('click', () => this.closeModal());

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
      this.detectAiStudioTheme();
    }

    async syncPromptsFromDom() {
      try {
        const links = document.querySelectorAll('a.name-link, a[href*="/prompts/"]');
        let added = 0;
        for (const link of links) {
          const href = link.getAttribute('href') || link.href || '';
          const match = href.match(/\/prompts\/([a-zA-Z0-9_-]+)/);
          if (!match) continue;
          const pId = match[1];
          if (pId === 'new_chat') continue;

          const title = (link.getAttribute('title') || link.textContent || '').trim() || 'Без названия';
          if (title === SYNC_PROMPT_TITLE || title.includes('AI Studio Enhancer Sync')) continue;

          apiClient.knownPrompts.set(pId, { id: pId, title, updatedAt: Date.now() });
          const existing = await db.getPrompt(pId);
          if (!existing) {
            await db.savePrompt({
              id: pId,
              title,
              folderId: null,
              updatedAt: Date.now(),
              messages: [],
              indexedAt: 0,
            });
            added++;
          }
        }

        if (apiClient.knownPrompts.size === 0) {
          const allStored = await db.getAllPrompts();
          for (const p of allStored) {
            if (p.title !== SYNC_PROMPT_TITLE) {
              apiClient.knownPrompts.set(p.id, { id: p.id, title: p.title, updatedAt: p.updatedAt });
            }
          }
        }
        return added;
      } catch (e) {
        console.warn('[AIS Enhancer] DOM prompt discovery error:', e);
        return 0;
      }
    }

    async openModal() {
      this.detectAiStudioTheme();
      await this.syncPromptsFromDom();
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
      const cleanText = text.replace(/^☁️\s*/, '');
      const txt = document.getElementById('ais-settings-sync-status-text');
      const badge = document.getElementById('ais-settings-sync-badge');
      const dot = document.getElementById('ais-settings-sync-dot');
      if (txt) txt.innerText = cleanText;
      const normalizedState = (state === 'error' ? 'error' : state === 'syncing' ? 'syncing' : state === 'idle' ? 'idle' : 'saved');
      if (badge) {
        badge.className = 'ais-sync-badge ' + normalizedState;
      }
      if (dot) {
        dot.className = 'ais-sync-dot ' + normalizedState;
      }

      if (state === 'saved') {
        const timeEl = document.getElementById('ais-settings-last-sync-time');
        const lastSync = GM_getValue('ais_last_sync_timestamp', null);
        if (timeEl) {
          timeEl.innerText = lastSync ? `Последняя синхронизация: ${new Date(lastSync).toLocaleString()}` : 'Последняя синхронизация: Еще не выполнялась';
        }
      }

      const driveDot = document.getElementById('ais-cloud-drive-dot');
      if (driveDot) {
        driveDot.className = 'ais-cloud-drive-dot ' + normalizedState;
        driveDot.title = `Google Drive: ${cleanText} (кликните для настроек)`;
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
      await this.syncPromptsFromDom();

      const allPrompts = (await db.getAllPrompts()).filter((p) => p.title !== SYNC_PROMPT_TITLE);
      const folders = await db.getAllFolders();
      const lastSync = GM_getValue('ais_last_sync_timestamp', null);
      const lastSyncStr = lastSync ? `Последняя синхронизация: ${new Date(lastSync).toLocaleString()}` : 'Последняя синхронизация: Еще не выполнялась';
      const statusTitle = driveSync.lastSyncStatus === 'saved' ? 'Все изменения сохранены в облаке' :
                          driveSync.lastSyncStatus === 'syncing' ? 'Идет синхронизация...' :
                          driveSync.lastSyncStatus === 'error' ? 'Ошибка синхронизации' :
                          (lastSync ? 'Все изменения сохранены в облаке' : 'Синхронизация готова к первому запуску');
      const statusState = driveSync.lastSyncStatus === 'syncing' ? 'syncing' :
                          driveSync.lastSyncStatus === 'error' ? 'error' :
                          lastSync ? 'saved' : 'idle';
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

            <div class="ais-settings-sync-footer">
              <div class="ais-sync-status-group">
                <div class="ais-sync-badge ${statusState}" id="ais-settings-sync-badge">
                  <span class="ais-sync-badge-dot"></span>
                  <span id="ais-settings-sync-status-text">${statusTitle}</span>
                </div>
                <div class="ais-sync-time-label" id="ais-settings-last-sync-time">${lastSyncStr}</div>
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

          <!-- CARD 4: SIDEBAR NAVIGATION & SERVICES -->
          <div class="ais-settings-card">
            <div class="ais-settings-card-title">
              <span>🧭 Боковая панель навигации (Sidebar)</span>
            </div>
            <div class="ais-settings-row">
              <div class="ais-settings-row-info">
                <span class="ais-settings-label">Отображать служебные разделы BUILD и MANAGE</span>
                <span class="ais-settings-desc">По умолчанию разделы BUILD и MANAGE скрыты из бокового меню для компактности и перенесены в выпадающее меню шестерёнки ⚙️ внизу сайдбара.</span>
              </div>
              <input type="checkbox" id="ais-set-show-build-manage" ${this.showBuildManage ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--ais-primary);" />
            </div>
            <div class="ais-settings-row">
              <div class="ais-settings-row-info">
                <span class="ais-settings-label">Отображать теги папок в списке диалогов</span>
                <span class="ais-settings-desc">Показывает компактный бейдж папки в правой части строки в общем списке «Все диалоги» (внутри конкретной папки тег скрывается).</span>
              </div>
              <input type="checkbox" id="ais-set-show-folder-tags" ${this.showFolderTags ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--ais-primary);" />
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

      container.querySelector('#ais-set-show-build-manage')?.addEventListener('change', (e) => {
        this.showBuildManage = e.target.checked;
        GM_setValue('ais_show_build_manage', this.showBuildManage);
        const navContainer = document.querySelector('ms-nav-items-main-v2, nav .flat-left-nav, nav');
        if (navContainer) this.applyBuildManageVisibility(navContainer);
      });

      container.querySelector('#ais-set-show-folder-tags')?.addEventListener('change', (e) => {
        this.showFolderTags = e.target.checked;
        GM_setValue('ais_show_folder_tags', this.showFolderTags);
        const table = document.querySelector('table');
        if (table) this.applyLibraryFilter(table);
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
      this.renderSidebarTreeContent();
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
        this.updateCloudStatus('Сохранение на Google Диск...', 'syncing');

        const res = await driveSync.pushToDrive((status) => {
          this.updateCloudStatus(status, 'syncing');
        }, true);

        const folderCount = res?.folderCount ?? 0;
        const promptCount = res?.promptCount ?? 0;
        const assignedCount = res?.assignedCount ?? 0;

        let details = `Папок: ${folderCount}\nДиалогов в базе: ${promptCount}`;
        if (folderCount > 0) {
          details += ` (привязано к папкам: ${assignedCount})`;
        } else {
          details += ` (все диалоги в общем списке, папки еще не созданы)`;
        }

        this.updateCloudStatus('Все изменения сохранены в облаке', 'saved');
        if (this.currentTab === 'settings') this.renderTabContent();

        alert(`✅ Успешно сохранено на Google Диск!\n\n${details}\n\nФайл синхронизации сохранен в папке Google AI Studio на вашем Google Диске.`);
      } catch (err) {
        console.error('[AIS Enhancer] Drive push error:', err);
        alert(`❌ Ошибка сохранения на Google Диск: ${err.message}`);
        this.updateCloudStatus('Ошибка синхронизации', 'error');
      }
    }

    async handleDrivePull() {
      try {
        this.updateCloudStatus('Загрузка с Google Диска...', 'syncing');

        const res = await driveSync.pullFromDrive((status) => {
          this.updateCloudStatus(status, 'syncing');
        });

        const folderCount = res?.folderCount ?? 0;
        const promptCount = res?.promptCount ?? 0;
        alert(`✅ Успешно загружено с Google Диска!\n\nИмпортировано папок: ${folderCount}\nИмпортировано диалогов: ${promptCount}\n\nБаза данных и поиск полностью обновлены.`);
        this.updateCloudStatus('Все изменения сохранены в облаке', 'saved');
        this.renderTabContent();
      } catch (err) {
        console.error('[AIS Enhancer] Drive pull error:', err);
        alert(`❌ Ошибка загрузки с Google Диска: ${err.message}`);
        this.updateCloudStatus('Ошибка синхронизации', 'error');
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

          const turnText = AISParser.findSyncPayload(root) || AISParser.extractTextFromTurn(root[2]?.[0] || []);
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
    // SIDEBAR & LIBRARY INTEGRATION
    // -----------------------------------------------------------------------
    observeNavigation() {
      setInterval(() => {
        // 1. Sidebar integration (applicable on all pages where left nav exists)
        this.ensureSidebarIntegration();

        // 2. Native settings menu integration
        this.observeNativeSettingsMenu();

        // 3. Library page specific integration
        const isLibrary = window.location.pathname.includes('/library') || window.location.pathname.endsWith('/prompts');
        const launcher = document.getElementById('ais-launcher-btn');
        if (isLibrary) {
          // Hide floating launcher on Library page to keep UI clean and uncluttered
          if (launcher) launcher.style.display = 'none';
          this.refreshLibraryIntegration();
        } else {
          if (launcher) launcher.style.display = '';
          const topBar = document.getElementById('ais-lib-top-bar');
          if (topBar) topBar.remove();
          const searchWrapper = document.getElementById('ais-search-wrapper');
          if (searchWrapper) {
            const sb = searchWrapper.querySelector('ms-library-search-bar');
            if (sb && searchWrapper.parentElement) {
              searchWrapper.parentElement.insertBefore(sb, searchWrapper);
            }
            searchWrapper.remove();
          }
          const driveDot = document.getElementById('ais-cloud-drive-dot');
          if (driveDot) driveDot.style.display = 'none';
          const oldWidget = document.getElementById('ais-cloud-drive-widget');
          if (oldWidget) oldWidget.remove();
        }
      }, 800);
    }

    ensureSidebarIntegration() {
      const navContainer = document.querySelector('ms-nav-items-main-v2, nav .flat-left-nav, nav');
      if (!navContainer) return;

      // 1. Apply visibility of BUILD and MANAGE
      this.applyBuildManageVisibility(navContainer);

      // 2. Mount folder tree under History in EXPLORE
      this.ensureSidebarFolderTree(navContainer);

      // Clean up legacy gear entry if present
      const oldGear = document.getElementById('ais-sidebar-gear-entry');
      if (oldGear) oldGear.remove();
    }

    applyBuildManageVisibility(navContainer) {
      const headers = navContainer.querySelectorAll('.section-header, div[role="heading"]');
      headers.forEach((header) => {
        const text = header.textContent.trim().toUpperCase();
        if (text === 'BUILD' || text === 'MANAGE') {
          const shouldHide = !this.showBuildManage;
          header.style.display = shouldHide ? 'none' : '';

          let sibling = header.nextElementSibling;
          while (sibling && !sibling.classList.contains('section-header') && sibling.id !== 'ais-sidebar-folder-tree') {
            sibling.style.display = shouldHide ? 'none' : '';
            sibling = sibling.nextElementSibling;
          }
        }
      });
    }

    observeNativeSettingsMenu() {
      if (this._nativeMenuObserved) return;
      this._nativeMenuObserved = true;

      const injectIntoMenu = (menuPanel) => {
        if (!menuPanel || menuPanel.classList.contains('ais-native-menu-injected')) return;
        const content = menuPanel.querySelector('.mat-mdc-menu-content, div[role="menu"]');
        if (!content) return;

        menuPanel.classList.add('ais-native-menu-injected');

        const closeNativeMenu = () => {
          const backdrop = document.querySelector('.cdk-overlay-backdrop');
          if (backdrop) backdrop.click();
        };

        const container = document.createElement('div');
        container.className = 'ais-native-menu-section';
        container.innerHTML = `
          <div class="ais-native-menu-divider" role="separator"></div>
          <div class="ais-native-menu-header">AI Studio Enhancer v${SCRIPT_VERSION}</div>
          <div class="ais-native-menu-item" id="ais-native-opt-search">
            <span class="ais-native-menu-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </span>
            <span>Полнотекстовый поиск</span>
          </div>
          <div class="ais-native-menu-item" id="ais-native-opt-folders">
            <span class="ais-native-menu-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
            </span>
            <span>Управление папками</span>
          </div>
          <div class="ais-native-menu-item" id="ais-native-opt-settings">
            <span class="ais-native-menu-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z"/></svg>
            </span>
            <span>Google Drive и Синхронизация</span>
          </div>
          <label class="ais-native-menu-toggle">
            <span>Показать BUILD/MANAGE в меню</span>
            <input type="checkbox" id="ais-native-toggle-bm" ${this.showBuildManage ? 'checked' : ''} />
          </label>
          <label class="ais-native-menu-toggle">
            <span>Показать теги папок в списке</span>
            <input type="checkbox" id="ais-native-toggle-folder-tags" ${this.showFolderTags ? 'checked' : ''} />
          </label>
          <div class="ais-native-menu-divider" role="separator"></div>
          <a class="ais-native-menu-item" href="https://aistudio.google.com/apikey" id="ais-native-opt-apikey">
            <span class="ais-native-menu-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
            </span>
            <span>Get API key</span>
          </a>
          <a class="ais-native-menu-item" href="https://aistudio.google.com/tune" id="ais-native-opt-tune">
            <span class="ais-native-menu-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
            </span>
            <span>Model Tuning</span>
          </a>
        `;

        content.appendChild(container);

        container.querySelector('#ais-native-opt-search')?.addEventListener('click', () => {
          closeNativeMenu();
          this.currentTab = 'search';
          this.openModal();
        });
        container.querySelector('#ais-native-opt-folders')?.addEventListener('click', () => {
          closeNativeMenu();
          this.currentTab = 'folders';
          this.openModal();
        });
        container.querySelector('#ais-native-opt-settings')?.addEventListener('click', () => {
          closeNativeMenu();
          this.currentTab = 'settings';
          this.openModal();
        });
        container.querySelector('#ais-native-toggle-bm')?.addEventListener('change', (e) => {
          this.showBuildManage = e.target.checked;
          GM_setValue('ais_show_build_manage', this.showBuildManage);
          const nav = document.querySelector('ms-nav-items-main-v2, nav .flat-left-nav, nav');
          if (nav) this.applyBuildManageVisibility(nav);
        });
        container.querySelector('#ais-native-toggle-folder-tags')?.addEventListener('change', (e) => {
          this.showFolderTags = e.target.checked;
          GM_setValue('ais_show_folder_tags', this.showFolderTags);
          const table = document.querySelector('table.library-table, table[role="table"]');
          if (table) this.applyLibraryFilter(table);
        });
      };

      const observer = new MutationObserver(() => {
        const panels = document.querySelectorAll('.cdk-overlay-container .mat-mdc-menu-panel:not(.ais-native-menu-injected)');
        panels.forEach((p) => {
          const settingsBtn = document.querySelector('button[aria-label="Settings"], button.trigger-button');
          const isSettingsOpen = settingsBtn && (settingsBtn.getAttribute('aria-expanded') === 'true' || settingsBtn.classList.contains('cdk-focused'));
          const text = p.textContent.toLowerCase();
          if (isSettingsOpen || text.includes('theme') || text.includes('тема') || text.includes('keyboard') || text.includes('shortcuts')) {
            injectIntoMenu(p);
          }
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }

    async ensureSidebarFolderTree(navContainer) {
      let treeContainer = document.getElementById('ais-sidebar-folder-tree');

      // Find History item specifically in EXPLORE section, avoiding Playground (/prompts/new_chat)
      let historyItem = null;
      const links = navContainer.querySelectorAll('a, .flat-left-nav a, ms-button-borderless');
      for (const el of links) {
        const text = el.textContent.trim();
        const href = el.getAttribute('href') || '';
        if (el.classList.contains('playground-link') || href.includes('new_chat')) continue;
        if (text === 'History' || text === 'История' || href.endsWith('/library') || href.endsWith('/prompts')) {
          historyItem = el.closest('a') || el;
          break;
        }
      }

      if (!historyItem) {
        const headers = navContainer.querySelectorAll('.section-header');
        for (const h of headers) {
          if (h.textContent.trim().toUpperCase() === 'EXPLORE') {
            let sib = h.nextElementSibling;
            while (sib && !sib.classList.contains('section-header')) {
              const txt = sib.textContent.trim();
              if (txt.includes('History') || txt.includes('История')) {
                historyItem = sib;
                break;
              }
              sib = sib.nextElementSibling;
            }
            break;
          }
        }
      }

      if (!historyItem) return;

      if (!treeContainer) {
        treeContainer = document.createElement('div');
        treeContainer.id = 'ais-sidebar-folder-tree';
        treeContainer.className = 'ais-sidebar-folder-tree';
        treeContainer.innerHTML = `
          <div class="ais-sb-header">
            <div class="ais-sb-filter-wrapper">
              <input type="text" id="ais-sb-filter-input" class="ais-sb-filter-input" placeholder="Поиск папок..." />
              <button id="ais-sb-filter-clear" class="ais-sb-clear-btn" title="Очистить поиск">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
            <button id="ais-sb-btn-add" class="ais-sb-icon-btn" title="Создать новую папку (или ПКМ)">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
          </div>
          <div id="ais-sb-tree-content" class="ais-sb-list-wrap"></div>
        `;

        historyItem.insertAdjacentElement('afterend', treeContainer);

        const filterInput = treeContainer.querySelector('#ais-sb-filter-input');
        const filterClear = treeContainer.querySelector('#ais-sb-filter-clear');
        if (filterInput) {
          filterInput.addEventListener('input', (e) => {
            this.sidebarFolderFilterQuery = e.target.value.toLowerCase().trim();
            if (filterClear) {
              filterClear.style.display = this.sidebarFolderFilterQuery ? 'flex' : 'none';
            }
            this.renderSidebarTreeContent();
          });
          filterInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              filterInput.value = '';
              this.sidebarFolderFilterQuery = '';
              if (filterClear) filterClear.style.display = 'none';
              this.renderSidebarTreeContent();
            }
          });
        }

        if (filterClear) {
          filterClear.addEventListener('click', () => {
            if (filterInput) {
              filterInput.value = '';
              filterInput.focus();
            }
            this.sidebarFolderFilterQuery = '';
            filterClear.style.display = 'none';
            this.renderSidebarTreeContent();
          });
        }

        const btnAdd = treeContainer.querySelector('#ais-sb-btn-add');
        if (btnAdd) {
          btnAdd.addEventListener('click', async (e) => {
            e.stopPropagation();
            const name = prompt('Введите название новой корневой папки:');
            if (name && name.trim()) {
              const newFolder = await AISFolderManager.createFolder(name.trim(), '#1a73e8', null);
              driveSync.triggerAutoSync();
              await this.onFolderSelected(newFolder.id);
            }
          });
        }

        // F2 key to rename selected folder
        if (!this._f2Bound) {
          this._f2Bound = true;
          document.addEventListener('keydown', async (e) => {
            if (e.key === 'F2') {
              const activeNode = document.querySelector('.ais-sb-node.active');
              const folderId = activeNode?.getAttribute('data-tree-id');
              if (folderId && folderId !== 'all' && folderId !== 'unassigned') {
                e.preventDefault();
                const folders = await db.getAllFolders();
                const current = folders.find((f) => f.id === folderId);
                if (current) {
                  const newName = prompt('Новое название папки:', current.name);
                  if (newName && newName.trim() && newName.trim() !== current.name) {
                    await AISFolderManager.renameFolder(folderId, newName.trim());
                    driveSync.triggerAutoSync();
                    await this.renderSidebarTreeContent();
                    await this.renderBreadcrumbs();
                  }
                }
              }
            }
          });
        }

        window.addEventListener('resize', () => this.adjustTreeElasticHeight());

        await this.renderSidebarTreeContent();
      } else {
        // Ensure treeContainer is always placed directly after historyItem
        if (treeContainer.previousElementSibling !== historyItem) {
          historyItem.insertAdjacentElement('afterend', treeContainer);
        }
        const content = treeContainer.querySelector('#ais-sb-tree-content');
        if (content && content.children.length === 0) {
          await this.renderSidebarTreeContent();
        }
      }

      this.adjustTreeElasticHeight();
    }

    adjustTreeElasticHeight() {
      const content = document.getElementById('ais-sb-tree-content');
      if (!content) return;
      const rect = content.getBoundingClientRect();
      const bottomBar = document.querySelector('ms-account-switcher, .account-switcher-button, nav ms-nav-footer, .nav-footer');
      let bottomLimit = window.innerHeight - 20;
      if (bottomBar) {
        const bRect = bottomBar.getBoundingClientRect();
        if (bRect.top > rect.top + 60) {
          bottomLimit = bRect.top - 12;
        }
      }
      const calculatedHeight = Math.max(100, Math.floor(bottomLimit - rect.top));
      content.style.maxHeight = `${calculatedHeight}px`;
    }

    async renderSidebarTreeContent() {
      const content = document.getElementById('ais-sb-tree-content');
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
        <div class="ais-sb-node ${isAllActive ? 'active' : ''}" data-tree-id="all">
          <span class="ais-sb-chevron-spacer"></span>
          <span class="ais-sb-icon">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          </span>
          <span class="ais-sb-name">Все диалоги</span>
          <span class="ais-sb-count">${totalCount}</span>
        </div>
      `;

      // 2. Unassigned
      const isUnassignedActive = this.libSelectedFolderId === 'unassigned';
      html += `
        <div class="ais-sb-node ${isUnassignedActive ? 'active' : ''}" data-tree-id="unassigned">
          <span class="ais-sb-chevron-spacer"></span>
          <span class="ais-sb-icon">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          </span>
          <span class="ais-sb-name">Без папки</span>
          <span class="ais-sb-count">${unassignedCount}</span>
        </div>
      `;

      // 3. Recursive folder tree: Clean typography, NO dots, NO hover buttons
      const renderNodes = (nodes, depth = 0) => {
        for (const node of nodes) {
          const matchesQuery = !this.sidebarFolderFilterQuery || node.name.toLowerCase().includes(this.sidebarFolderFilterQuery);
          const hasChildren = node.children && node.children.length > 0;
          const isExpanded = this.expandedFolderIds.has(node.id) || !!this.sidebarFolderFilterQuery;
          const isActive = this.libSelectedFolderId === node.id;
          const indentPx = depth * 12 + 6;

          if (matchesQuery) {
            html += `
              <div class="ais-sb-node ${isActive ? 'active' : ''}" data-tree-id="${node.id}" style="padding-left: ${indentPx}px;">
                ${hasChildren ? `
                  <span class="ais-sb-chevron ${isExpanded ? 'expanded' : ''}" data-chevron-id="${node.id}">▶</span>
                ` : `
                  <span class="ais-sb-chevron-spacer"></span>
                `}
                <span class="ais-sb-name">${node.name}</span>
                <span class="ais-sb-count">${node.totalCount}</span>
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

      // Event handlers: node click
      content.querySelectorAll('.ais-sb-node[data-tree-id]').forEach((nodeEl) => {
        nodeEl.addEventListener('click', (e) => {
          if (e.target.closest('.ais-sb-chevron')) return;
          const fId = nodeEl.getAttribute('data-tree-id');
          this.onFolderSelected(fId);
        });
      });

      // Chevron click
      content.querySelectorAll('.ais-sb-chevron[data-chevron-id]').forEach((chEl) => {
        chEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const fId = chEl.getAttribute('data-chevron-id');
          if (this.expandedFolderIds.has(fId)) {
            this.expandedFolderIds.delete(fId);
          } else {
            this.expandedFolderIds.add(fId);
          }
          this.renderSidebarTreeContent();
        });
      });

      // Context menu on Right Click (ПКМ)
      content.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nodeEl = e.target.closest('.ais-sb-node');
        const folderId = nodeEl ? nodeEl.getAttribute('data-tree-id') : null;
        this.openFolderContextMenu(e.clientX, e.clientY, folderId, folders);
      };

      this.adjustTreeElasticHeight();
    }

    openFolderContextMenu(x, y, folderId, folders) {
      const oldMenu = document.getElementById('ais-folder-context-menu');
      if (oldMenu) oldMenu.remove();

      const current = folders.find((f) => f.id === folderId);
      const isCustomFolder = !!current;

      const menu = document.createElement('div');
      menu.id = 'ais-folder-context-menu';
      menu.className = 'ais-folder-context-menu';

      if (isCustomFolder) {
        menu.innerHTML = `
          <div class="ais-context-item" id="ais-ctx-add-sub">
            <span class="ais-context-icon">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </span>
            <span>Создать подпапку</span>
          </div>
          <div class="ais-context-item" id="ais-ctx-rename">
            <span class="ais-context-icon">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </span>
            <span>Переименовать (F2)</span>
          </div>
          <div class="ais-context-item" id="ais-ctx-color">
            <span class="ais-context-icon">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.31 19.57 10.6 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-1.12 0-2.16-.32-3.05-.87l2.34-2.34c.39-.39.39-1.02 0-1.41s-1.02-.39-1.41 0l-2.34 2.34C6.98 14.83 6.66 13.79 6.66 12.67c0-2.94 2.39-5.33 5.34-5.33s5.33 2.39 5.33 5.33-2.39 5.33-5.33 5.33z"/></svg>
            </span>
            <span>Изменить цвет</span>
          </div>
          <div class="ais-context-divider"></div>
          <div class="ais-context-item danger" id="ais-ctx-delete">
            <span class="ais-context-icon">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </span>
            <span>Удалить папку</span>
          </div>
        `;
      } else {
        menu.innerHTML = `
          <div class="ais-context-item" id="ais-ctx-new-folder">
            <span class="ais-context-icon">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </span>
            <span>Новая папка</span>
          </div>
          <div class="ais-context-item" id="ais-ctx-refresh">
            <span class="ais-context-icon">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </span>
            <span>Обновить дерево</span>
          </div>
          <div class="ais-context-divider"></div>
          <div class="ais-context-item" id="ais-ctx-open-search">
            <span class="ais-context-icon">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </span>
            <span>Поиск диалогов</span>
          </div>
        `;
      }

      document.body.appendChild(menu);

      const rect = menu.getBoundingClientRect();
      const posX = Math.min(x, window.innerWidth - rect.width - 10);
      const posY = Math.min(y, window.innerHeight - rect.height - 10);
      menu.style.left = `${posX}px`;
      menu.style.top = `${posY}px`;

      const closeMenu = () => {
        menu.remove();
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKeyDown);
      };

      const onDocClick = (e) => {
        if (!menu.contains(e.target)) closeMenu();
      };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') closeMenu();
      };

      setTimeout(() => {
        document.addEventListener('click', onDocClick);
        document.addEventListener('keydown', onKeyDown);
      }, 50);

      menu.querySelector('#ais-ctx-add-sub')?.addEventListener('click', async () => {
        closeMenu();
        const subName = prompt(`Создать подпапку внутри "${current.name}":`);
        if (subName && subName.trim()) {
          const newSub = await AISFolderManager.createFolder(subName.trim(), current.color || '#1a73e8', current.id);
          this.expandedFolderIds.add(current.id);
          driveSync.triggerAutoSync();
          await this.onFolderSelected(newSub.id);
        }
      });

      menu.querySelector('#ais-ctx-rename')?.addEventListener('click', async () => {
        closeMenu();
        const newName = prompt('Новое название папки:', current.name);
        if (newName && newName.trim() && newName.trim() !== current.name) {
          await AISFolderManager.renameFolder(current.id, newName.trim());
          driveSync.triggerAutoSync();
          await this.renderSidebarTreeContent();
          await this.renderBreadcrumbs();
        }
      });

      menu.querySelector('#ais-ctx-color')?.addEventListener('click', async () => {
        closeMenu();
        const newColor = prompt('Цвет папки (HEX, например #1a73e8, #ea4335, #34a853, #fbbc04):', current.color || '#1a73e8');
        if (newColor && newColor.trim()) {
          await AISFolderManager.setFolderColor(current.id, newColor.trim());
          driveSync.triggerAutoSync();
          await this.renderSidebarTreeContent();
        }
      });

      menu.querySelector('#ais-ctx-delete')?.addEventListener('click', async () => {
        closeMenu();
        if (confirm(`Удалить папку "${current.name}"? Диалоги из нее останутся, но потеряют привязку.`)) {
          await AISFolderManager.deleteFolder(current.id);
          if (this.libSelectedFolderId === current.id) {
            this.libSelectedFolderId = 'all';
          }
          driveSync.triggerAutoSync();
          await this.onFolderSelected(this.libSelectedFolderId);
        }
      });

      menu.querySelector('#ais-ctx-new-folder')?.addEventListener('click', async () => {
        closeMenu();
        const name = prompt('Введите название новой корневой папки:');
        if (name && name.trim()) {
          const newFolder = await AISFolderManager.createFolder(name.trim(), '#1a73e8', null);
          driveSync.triggerAutoSync();
          await this.onFolderSelected(newFolder.id);
        }
      });

      menu.querySelector('#ais-ctx-refresh')?.addEventListener('click', async () => {
        closeMenu();
        await this.renderSidebarTreeContent();
      });

      menu.querySelector('#ais-ctx-open-search')?.addEventListener('click', () => {
        closeMenu();
        this.currentTab = 'search';
        this.openModal();
      });
    }

    async onFolderSelected(folderId) {
      this.libSelectedFolderId = folderId;
      await this.renderSidebarTreeContent();

      const isLibrary = window.location.pathname.includes('/library') || window.location.pathname.endsWith('/prompts');
      if (isLibrary) {
        const table = document.querySelector('table.library-table, table[role="table"]');
        await this.renderBreadcrumbs();
        if (table) {
          await this.applyLibraryFilter(table);
        }
      } else {
        window.location.href = '/library';
      }
    }



    async refreshLibraryIntegration() {
      const isLibrary = window.location.pathname.includes('/library') || window.location.pathname.endsWith('/prompts');
      if (!isLibrary) return;

      const table = document.querySelector('table.library-table, table[role="table"]');
      if (!table) return;

      // Clean up any legacy two-pane container or explorer if lingering
      const legacyTwoPane = document.getElementById('ais-lib-two-pane-container');
      if (legacyTwoPane) {
        if (legacyTwoPane.parentElement && table.parentElement === document.getElementById('ais-lib-table-mount')) {
          legacyTwoPane.parentElement.insertBefore(table, legacyTwoPane);
        }
        legacyTwoPane.remove();
      }
      const legacyExp = document.getElementById('ais-lib-explorer');
      if (legacyExp) legacyExp.remove();
      const legacySidebar = document.getElementById('ais-lib-sidebar');
      if (legacySidebar) legacySidebar.remove();
      const legacySwitcher = document.getElementById('ais-lib-mode-switcher');
      if (legacySwitcher) legacySwitcher.remove();

      // 1. Ensure Cloud Status Pill in the top toolbar
      this.ensureCloudStatusWidget();

      // 2. Ensure native search hook is active on the search input
      this.ensureNativeSearchHook();

      // 3. Ensure Library Top Bar (Breadcrumbs & Scope Strip) above table
      this.ensureLibraryTopBar(table);

      // 4. Apply current filters
      await this.applyLibraryFilter(table);
    }

    ensureCloudStatusWidget() {
      const oldPill = document.getElementById('ais-cloud-status-widget');
      if (oldPill) oldPill.remove();

      const oldDriveWidget = document.getElementById('ais-cloud-drive-widget');
      if (oldDriveWidget) oldDriveWidget.remove();

      // Locate ms-library-search-bar (the top-level search component in toolbar)
      const searchBar = document.querySelector('ms-library-search-bar') ||
                        document.querySelector('ms-input-field')?.closest('ms-library-search-bar') ||
                        document.querySelector('div.input-container')?.closest('ms-library-search-bar');

      const toolbarRow = searchBar?.parentElement || document.querySelector('.toggle-group')?.parentElement;

      // Locate the native Google Drive icon element
      let nativeDriveBtn = null;
      if (searchBar && searchBar.previousElementSibling) {
        let prev = searchBar.previousElementSibling;
        while (prev && prev.id === 'ais-cloud-drive-dot') {
          prev = prev.previousElementSibling;
        }
        if (prev && !prev.classList?.contains('toggle-group')) {
          nativeDriveBtn = prev;
        }
      }

      if (!nativeDriveBtn && toolbarRow) {
        nativeDriveBtn = toolbarRow.querySelector(
          'button[aria-label*="Drive" i], button[aria-label*="диск" i], button[title*="Drive" i], button[title*="диск" i], a[aria-label*="Drive" i]'
        );
      }

      let driveDot = document.getElementById('ais-cloud-drive-dot');
      if (!driveDot) {
        driveDot = document.createElement('span');
        driveDot.id = 'ais-cloud-drive-dot';
        driveDot.className = 'ais-cloud-drive-dot saved';
        driveDot.title = 'Google Drive: Синхронизировано (кликните для настроек)';
        driveDot.addEventListener('click', (e) => {
          e.stopPropagation();
          this.currentTab = 'settings';
          this.openModal();
        });
      }

      // Ensure parent toolbar row does NOT wrap items to a second row
      if (toolbarRow) {
        toolbarRow.style.flexWrap = 'nowrap';
        toolbarRow.style.alignItems = 'center';
        toolbarRow.style.overflow = 'visible';
      }

      // Position the dot and mount scope filters directly under searchBar
      if (searchBar) {
        let searchWrapper = document.getElementById('ais-search-wrapper');
        if (!searchWrapper) {
          searchWrapper = document.createElement('div');
          searchWrapper.id = 'ais-search-wrapper';
          searchWrapper.className = 'ais-search-wrapper';
          searchBar.parentElement.insertBefore(searchWrapper, searchBar);
          searchWrapper.appendChild(searchBar);
        } else if (searchBar.parentElement !== searchWrapper) {
          searchWrapper.insertBefore(searchBar, searchWrapper.firstChild);
        }

        let scopeRow = document.getElementById('ais-lib-scope-strip');
        if (!scopeRow) {
          scopeRow = document.createElement('div');
          scopeRow.id = 'ais-lib-scope-strip';
          scopeRow.className = 'ais-scope-dots-row';
          scopeRow.innerHTML = `
            <span class="ais-scope-dots-label">Искать в:</span>
            <button type="button" class="ais-scope-dot-btn ${this.searchScopes.searchTitle ? 'active' : ''}" data-scope="searchTitle" title="Искать в заголовках диалогов">
              <span class="ais-scope-indicator-dot"></span>
              <span>Заголовок</span>
            </button>
            <button type="button" class="ais-scope-dot-btn ${this.searchScopes.searchUser ? 'active' : ''}" data-scope="searchUser" title="Искать в сообщениях пользователя">
              <span class="ais-scope-indicator-dot"></span>
              <span>Промпты</span>
            </button>
            <button type="button" class="ais-scope-dot-btn ${this.searchScopes.searchModel ? 'active' : ''}" data-scope="searchModel" title="Искать в ответах Gemini">
              <span class="ais-scope-indicator-dot"></span>
              <span>Ответы Gemini</span>
            </button>
            <button type="button" class="ais-scope-dot-btn ${this.searchScopes.searchThinking ? 'active' : ''}" data-scope="searchThinking" title="Искать в блоках размышлений">
              <span class="ais-scope-indicator-dot"></span>
              <span>Размышления</span>
            </button>
          `;
          searchWrapper.appendChild(scopeRow);
          const table = document.querySelector('table.library-table, table[role="table"]');
          this.setupScopeStripEvents(scopeRow, table);
        } else if (scopeRow.parentElement !== searchWrapper) {
          searchWrapper.appendChild(scopeRow);
        }

        const targetBefore = searchWrapper;
        if (driveDot.nextElementSibling !== targetBefore) {
          targetBefore.insertAdjacentElement('beforebegin', driveDot);
        }
      } else if (toolbarRow && !driveDot.parentElement) {
        toolbarRow.appendChild(driveDot);
      }
    }

    ensureLibraryTopBar(table) {
      let topBar = document.getElementById('ais-lib-top-bar');
      if (!topBar) {
        topBar = document.createElement('div');
        topBar.id = 'ais-lib-top-bar';
        topBar.className = 'ais-lib-top-bar';
        topBar.innerHTML = `
          <div class="ais-breadcrumbs-line" id="ais-lib-breadcrumbs-line"></div>
        `;
        if (table.parentElement) {
          table.parentElement.insertBefore(topBar, table);
        }
      }
      this.renderBreadcrumbs();
    }

    setupScopeStripEvents(scopeStrip, table) {
      if (!scopeStrip) return;
      const buttons = scopeStrip.querySelectorAll('.ais-scope-dot-btn');
      buttons.forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const scopeKey = btn.getAttribute('data-scope');
          if (!scopeKey) return;
          this.searchScopes[scopeKey] = !this.searchScopes[scopeKey];
          btn.classList.toggle('active', this.searchScopes[scopeKey]);
          GM_setValue(`ais_scope_${scopeKey}`, this.searchScopes[scopeKey]);

          const targetTable = table || document.querySelector('table.library-table, table[role="table"]');
          const searchInput = document.querySelector('div.input-container input') || document.querySelector('input[aria-label="Search"]');
          const query = (searchInput?.value || this.libSearchQuery || '').trim();
          if (query && targetTable) {
            await this.triggerDeepSearch(query, targetTable);
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

    async renderBreadcrumbs() {
      const line = document.getElementById('ais-lib-breadcrumbs-line');
      if (!line) return;

      const folders = await db.getAllFolders();
      let html = `<span class="ais-breadcrumb-item ${this.libSelectedFolderId === 'all' ? 'current' : ''}" data-crumb-id="all">Все диалоги</span>`;

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
          const fId = c.getAttribute('data-crumb-id');
          await this.onFolderSelected(fId);
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
        if (this.libSelectedFolderId !== 'all' && this.libSelectedFolderId !== 'unassigned') {
          allowedFolderIds = AISFolderManager.getDescendantFolderIds(this.libSelectedFolderId, folders);
          allowedFolderIds.add(this.libSelectedFolderId);
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
          if (this.libSelectedFolderId === 'unassigned') {
            matchesFolder = !pFolderId;
          } else if (allowedFolderIds) {
            matchesFolder = pFolderId && allowedFolderIds.has(pFolderId);
          }

          if (matchesSearch && matchesFolder) {
            row.style.removeProperty('display');

            // Search snippet chip
            let snippetEl = row.querySelector('.ais-row-match-chip');
            if (searchMatchItem && searchMatchItem.snippet) {
              if (!snippetEl) {
                snippetEl = document.createElement('div');
                snippetEl.className = 'ais-row-match-chip';
                const titleWrap = row.querySelector('.ais-row-title-wrap');
                if (titleWrap) {
                  titleWrap.appendChild(snippetEl);
                } else {
                  link.parentElement?.appendChild(snippetEl);
                }
              }
              const tagLabel = searchMatchItem.badge ? searchMatchItem.badge.replace(/^\[|\]$/g, '') : 'Match';
              snippetEl.innerHTML = `<span class="ais-row-match-tag">${tagLabel}</span>${AISSearchEngine.highlightSnippet(searchMatchItem.snippet, this.libSearchQuery)}`;
            } else if (snippetEl) {
              snippetEl.remove();
            }

            // Folder Badge in Row (Only in "All chats" view; hidden when inside a specific folder)
            if (this.libSelectedFolderId === 'all') {
              this.ensureRowFolderBadge(row, pId, pFolderId, folders, table);
            } else {
              this.removeRowFolderBadge(row);
            }
          } else {
            row.style.setProperty('display', 'none', 'important');
          }
        }
      } finally {
        this.isFilteringLibraryTable = false;
      }
    }

    removeRowFolderBadge(row) {
      const badge = row.querySelector('.ais-row-folder-badge');
      if (badge) badge.remove();
    }

    ensureRowFolderBadge(row, promptId, folderId, folders, table) {
      let badge = row.querySelector('.ais-row-folder-badge');
      let metaRight = row.querySelector('.ais-row-meta-right');

      if (!this.showFolderTags || this.libSelectedFolderId !== 'all') {
        if (badge) badge.remove();
        return;
      }

      const folder = folders.find((f) => f.id === folderId);
      if (!folder) {
        if (badge) badge.remove();
        return;
      }

      const nameCell = row.querySelector('td.cdk-column-name, td.mat-column-name');
      if (!nameCell) return;

      // Clean up legacy wrapper if lingering from older versions
      const oldTitleWrap = nameCell.querySelector('.ais-row-title-wrap');
      if (oldTitleWrap) {
        while (oldTitleWrap.firstChild) {
          nameCell.insertBefore(oldTitleWrap.firstChild, oldTitleWrap);
        }
        oldTitleWrap.remove();
      }

      // Locate native "Created by you" (div.sub-text.subtitle-line)
      const subText = nameCell.querySelector('.sub-text, .subtitle-line');

      // Create or ensure right metadata group
      if (!metaRight) {
        metaRight = document.createElement('div');
        metaRight.className = 'ais-row-meta-right';
        if (subText) {
          subText.parentElement.insertBefore(metaRight, subText);
          metaRight.appendChild(subText);
        } else {
          nameCell.appendChild(metaRight);
        }
      } else if (subText && subText.parentElement !== metaRight) {
        metaRight.appendChild(subText);
      }

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ais-row-folder-badge';
        if (subText) {
          metaRight.insertBefore(badge, subText);
        } else {
          metaRight.appendChild(badge);
        }
      } else if (badge.parentElement !== metaRight) {
        if (subText) {
          metaRight.insertBefore(badge, subText);
        } else {
          metaRight.appendChild(badge);
        }
      }

      const name = folder.name;

      badge.title = `Папка: ${name} (кликните, чтобы переместить)`;
      badge.innerHTML = `
        <span class="ais-row-folder-icon">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
        </span>
        <span class="ais-row-folder-name">${name}</span>
      `;

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
      await this.renderSidebarTreeContent();
      await this.renderBreadcrumbs();
      if (table) {
        await this.applyLibraryFilter(table);
      }
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
