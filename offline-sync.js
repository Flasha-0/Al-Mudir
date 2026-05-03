/* ============================================================
   المدير — Offline Sync Engine v2.0.0
   محرك المزامنة الغير متصل:
   - IndexedDB للتخزين الدائم
   - Background Sync API
   - Conflict Resolution
   - Queue Management
   ============================================================ */

'use strict';

/* ============================================================
   1. INDEXED DB MANAGER
   ============================================================ */
class IndexedDBManager {
  #db       = null;
  #dbName   = 'AlMudirDB';
  #version  = 1;
  #stores   = {
    tasks:     { keyPath: 'id', indexes: ['status', 'priority', 'updatedAt'] },
    notes:     { keyPath: 'id', indexes: ['folder', 'updatedAt'] },
    reminders: { keyPath: 'id', indexes: ['date', 'type'] },
    queue:     { keyPath: 'id', indexes: ['timestamp', 'type'] },
    meta:      { keyPath: 'key' },
  };

  /* ============================================================
     OPEN DATABASE
  ============================================================ */
  async open() {
    if (this.#db) return this.#db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.#dbName, this.#version);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        for (const [storeName, config] of Object.entries(this.#stores)) {
          if (db.objectStoreNames.contains(storeName)) continue;

          const store = db.createObjectStore(storeName, {
            keyPath: config.keyPath,
          });

          for (const idx of (config.indexes ?? [])) {
            store.createIndex(idx, idx, { unique: false });
          }
        }

        console.log('[IndexedDB] ✅ Schema created/upgraded');
      };

      request.onsuccess = (e) => {
        this.#db = e.target.result;

        this.#db.onerror = (err) => {
          console.error('[IndexedDB] Database error:', err);
        };

        console.log('[IndexedDB] ✅ Database opened');
        resolve(this.#db);
      };

      request.onerror = (e) => {
        console.error('[IndexedDB] Open failed:', e.target.error);
        reject(e.target.error);
      };

      request.onblocked = () => {
        console.warn('[IndexedDB] Database blocked — close other tabs');
      };
    });
  }

  /* ============================================================
     TRANSACTION HELPER
  ============================================================ */
  async #transaction(storeName, mode, operation) {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx    = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      tx.onerror   = (e) => reject(e.target.error);
      tx.onabort   = (e) => reject(e.target.error);

      try {
        const req = operation(store);

        if (req && req.onsuccess !== undefined) {
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror   = (e) => reject(e.target.error);
        } else {
          tx.oncomplete = () => resolve(req);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /* ============================================================
     CRUD OPERATIONS
  ============================================================ */
  async get(storeName, key) {
    return this.#transaction(storeName, 'readonly', (store) =>
      store.get(key)
    );
  }

  async getAll(storeName, indexName = null, query = null) {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx    = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const target = indexName ? store.index(indexName) : store;
      const req    = query ? target.getAll(query) : target.getAll();

      req.onsuccess = (e) => resolve(e.target.result ?? []);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  async put(storeName, item) {
    return this.#transaction(storeName, 'readwrite', (store) =>
      store.put({ ...item, _savedAt: Date.now() })
    );
  }

  async putAll(storeName, items) {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx    = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      let   count = 0;

      for (const item of items) {
        store.put({ ...item, _savedAt: Date.now() });
        count++;
      }

      tx.oncomplete = () => resolve(count);
      tx.onerror    = (e) => reject(e.target.error);
    });
  }

  async delete(storeName, key) {
    return this.#transaction(storeName, 'readwrite', (store) =>
      store.delete(key)
    );
  }

  async clear(storeName) {
    return this.#transaction(storeName, 'readwrite', (store) =>
      store.clear()
    );
  }

  async count(storeName) {
    return this.#transaction(storeName, 'readonly', (store) =>
      store.count()
    );
  }

  /* ============================================================
     META OPERATIONS
  ============================================================ */
  async getMeta(key) {
    const record = await this.get('meta', key);
    return record?.value ?? null;
  }

  async setMeta(key, value) {
    return this.put('meta', { key, value, updatedAt: Date.now() });
  }

  /* ============================================================
     SEARCH (cursor-based)
  ============================================================ */
  async search(storeName, predicate) {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx      = db.transaction(storeName, 'readonly');
      const store   = tx.objectStore(storeName);
      const cursor  = store.openCursor();
      const results = [];

      cursor.onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          if (predicate(c.value)) results.push(c.value);
          c.continue();
        } else {
          resolve(results);
        }
      };

      cursor.onerror = (e) => reject(e.target.error);
    });
  }

  /* ============================================================
     DATABASE SIZE
  ============================================================ */
  async getSize() {
    if (!navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    return {
      used:    estimate.usage ?? 0,
      quota:   estimate.quota ?? 0,
      percent: estimate.quota
        ? Math.round((estimate.usage / estimate.quota) * 100)
        : 0,
    };
  }

  /* ============================================================
     CLOSE
  ============================================================ */
  close() {
    this.#db?.close();
    this.#db = null;
  }
}

/* ============================================================
   2. CONFLICT RESOLVER
   ============================================================ */
class ConflictResolver {

  /* Strategy: Last Write Wins (with server priority) */
  resolve(local, server, strategy = 'server-wins') {
    if (!local)  return server;
    if (!server) return local;

    switch (strategy) {
      case 'server-wins':
        return {
          ...local,
          ...server,
          _resolvedAt: Date.now(),
          _strategy:   'server-wins',
        };

      case 'client-wins':
        return {
          ...server,
          ...local,
          _resolvedAt: Date.now(),
          _strategy:   'client-wins',
        };

      case 'latest-wins': {
        const localTime  = new Date(local.updatedAt  ?? 0).getTime();
        const serverTime = new Date(server.updatedAt ?? 0).getTime();
        const winner     = localTime > serverTime ? local : server;
        return {
          ...winner,
          _resolvedAt: Date.now(),
          _strategy:   'latest-wins',
          _winner:     localTime > serverTime ? 'local' : 'server',
        };
      }

      case 'merge': {
        /* Deep merge for notes content */
        return {
          ...server,
          ...local,
          content: this.#mergeContent(local.content, server.content),
          tags:    [...new Set([...(local.tags ?? []), ...(server.tags ?? [])])],
          _resolvedAt: Date.now(),
          _strategy:   'merge',
        };
      }

      default:
        return server;
    }
  }

  /* Simple content merge (append diverging sections) */
  #mergeContent(local = '', server = '') {
    if (local === server)   return local;
    if (!local)             return server;
    if (!server)            return local;

    /* Find common prefix */
    let i = 0;
    while (i < local.length && i < server.length && local[i] === server[i]) {
      i++;
    }

    const common      = local.slice(0, i);
    const localExtra  = local.slice(i).trim();
    const serverExtra = server.slice(i).trim();

    if (!localExtra)  return server;
    if (!serverExtra) return local;

    return `${common}\n\n<!-- تعارض: نسخة الخادم -->\n${serverExtra}\n\n<!-- تعارض: نسختك المحلية -->\n${localExtra}`;
  }
}

/* ============================================================
   3. SYNC QUEUE MANAGER
   ============================================================ */
class SyncQueueManager {
  #idb;
  #resolver;

  constructor(idb, resolver) {
    this.#idb      = idb;
    this.#resolver = resolver;
  }

  /* ============================================================
     ENQUEUE OPERATION
  ============================================================ */
  async enqueue(operation) {
    const item = {
      id:         StringUtils.uid('op'),
      type:       operation.type,
      endpoint:   operation.endpoint,
      method:     operation.method,
      payload:    operation.payload ?? null,
      entityId:   operation.entityId ?? null,
      timestamp:  new Date().toISOString(),
      retries:    0,
      maxRetries: 3,
      status:     'pending',
    };

    /* Save to IndexedDB */
    await this.#idb.put('queue', item);

    /* Also update state */
    Actions.offlineQueue.enqueue(item);

    console.log(`[SyncQueue] ➕ Enqueued: ${item.type} (${item.id})`);
    return item;
  }

  /* ============================================================
     GET ALL PENDING
  ============================================================ */
  async getPending() {
    return (await this.#idb.getAll('queue'))
      .filter(op => op.status === 'pending')
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /* ============================================================
     MARK AS DONE
  ============================================================ */
  async markDone(opId) {
    await this.#idb.delete('queue', opId);
    Actions.offlineQueue.dequeue(opId);
  }

  /* ============================================================
     MARK AS FAILED
  ============================================================ */
  async markFailed(opId) {
    const op = await this.#idb.get('queue', opId);
    if (!op) return;

    op.retries++;
    op.status = op.retries >= op.maxRetries ? 'dead' : 'pending';
    op.lastError = new Date().toISOString();

    await this.#idb.put('queue', op);
    Actions.offlineQueue.incrementRetry(opId);

    if (op.status === 'dead') {
      await this.#idb.delete('queue', opId);
      Actions.offlineQueue.dequeue(opId);
      console.warn(`[SyncQueue] ☠️ Dead letter: ${op.type} (${op.id})`);
    }
  }

  /* ============================================================
     PROCESS QUEUE
  ============================================================ */
  async processAll() {
    const pending = await this.getPending();
    if (!pending.length) return { synced: 0, failed: 0 };

    const results = { synced: 0, failed: 0, errors: [] };

    console.log(`[SyncQueue] 🔄 Processing ${pending.length} operations...`);

    for (const op of pending) {
      try {
        await this.#executeOperation(op);
        await this.markDone(op.id);
        results.synced++;
        console.log(`[SyncQueue] ✅ Synced: ${op.type}`);
      } catch (err) {
        await this.markFailed(op.id);
        results.failed++;
        results.errors.push({ op, error: err.message });
        console.error(`[SyncQueue] ❌ Failed: ${op.type}`, err.message);
      }
    }

    return results;
  }

  /* ============================================================
     EXECUTE SINGLE OPERATION
  ============================================================ */
  async #executeOperation(op) {
    const { method, endpoint, payload } = op;

    let response;

    switch (method) {
      case 'POST':
        response = await Http.post(endpoint, payload, { cache: false });
        break;
      case 'PUT':
        response = await Http.put(endpoint, payload, { cache: false });
        break;
      case 'DELETE':
        response = await Http.delete(endpoint, { cache: false });
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }

    return response;
  }

  /* ============================================================
     CLEAR ALL
  ============================================================ */
  async clearAll() {
    await this.#idb.clear('queue');
    Actions.offlineQueue.clear();
  }

  /* ============================================================
     STATS
  ============================================================ */
  async getStats() {
    const all  = await this.#idb.getAll('queue');
    return {
      total:   all.length,
      pending: all.filter(o => o.status === 'pending').length,
      dead:    all.filter(o => o.status === 'dead').length,
    };
  }
}

/* ============================================================
   4. DATA CACHE MANAGER (IndexedDB-backed)
   ============================================================ */
class DataCacheManager {
  #idb;

  constructor(idb) {
    this.#idb = idb;
  }

  /* ============================================================
     SAVE FULL DATASET
  ============================================================ */
  async saveTasks(tasks) {
    await this.#idb.clear('tasks');
    await this.#idb.putAll('tasks', tasks);
    await this.#idb.setMeta('tasks_lastSync', Date.now());
    console.log(`[DataCache] 💾 Saved ${tasks.length} tasks`);
  }

  async saveNotes(notes) {
    await this.#idb.clear('notes');
    await this.#idb.putAll('notes', notes);
    await this.#idb.setMeta('notes_lastSync', Date.now());
    console.log(`[DataCache] 💾 Saved ${notes.length} notes`);
  }

  async saveReminders(reminders) {
    await this.#idb.clear('reminders');
    await this.#idb.putAll('reminders', reminders);
    await this.#idb.setMeta('reminders_lastSync', Date.now());
    console.log(`[DataCache] 💾 Saved ${reminders.length} reminders`);
  }

  /* ============================================================
     LOAD FROM CACHE
  ============================================================ */
  async loadTasks()     { return this.#idb.getAll('tasks'); }
  async loadNotes()     { return this.#idb.getAll('notes'); }
  async loadReminders() { return this.#idb.getAll('reminders'); }

  /* ============================================================
     GET LAST SYNC TIME
  ============================================================ */
  async getLastSync(entity) {
    return this.#idb.getMeta(`${entity}_lastSync`);
  }

  /* ============================================================
     SEARCH OFFLINE
  ============================================================ */
  async searchTasks(query) {
    const q = query.toLowerCase();
    return this.#idb.search('tasks', (task) =>
      task.title?.toLowerCase().includes(q) ||
      task.description?.toLowerCase().includes(q)
    );
  }

  async searchNotes(query) {
    const normalized = StringUtils.normalizeArabic(query).toLowerCase();
    return this.#idb.search('notes', (note) =>
      StringUtils.normalizeArabic(note.title   ?? '').toLowerCase().includes(normalized) ||
      StringUtils.normalizeArabic(note.content ?? '').toLowerCase().includes(normalized)
    );
  }

  /* ============================================================
     SINGLE ITEM UPSERT
  ============================================================ */
  async upsertTask(task)         { return this.#idb.put('tasks',     task); }
  async upsertNote(note)         { return this.#idb.put('notes',     note); }
  async upsertReminder(reminder) { return this.#idb.put('reminders', reminder); }

  async deleteTask(id)     { return this.#idb.delete('tasks',     id); }
  async deleteNote(id)     { return this.#idb.delete('notes',     id); }
  async deleteReminder(id) { return this.#idb.delete('reminders', id); }

  /* ============================================================
     STATS
  ============================================================ */
  async getStats() {
    const [tasks, notes, reminders] = await Promise.all([
      this.#idb.count('tasks'),
      this.#idb.count('notes'),
      this.#idb.count('reminders'),
    ]);
    return { tasks, notes, reminders };
  }
}

/* ============================================================
   5. OFFLINE SYNC ENGINE (Main)
   ============================================================ */
class OfflineSyncEngine {

  #idb;
  #queue;
  #cache;
  #resolver;
  #syncTimer       = null;
  #isInitialized   = false;
  #isSyncing       = false;
  #SYNC_INTERVAL   = 30 * 1000;
  #RETRY_BACKOFF   = [5, 15, 30, 60]; // seconds

  constructor() {
    this.#idb      = new IndexedDBManager();
    this.#resolver = new ConflictResolver();
    this.#queue    = new SyncQueueManager(this.#idb, this.#resolver);
    this.#cache    = new DataCacheManager(this.#idb);
  }

  /* ============================================================
     INITIALIZE
  ============================================================ */
  async init() {
    try {
      await this.#idb.open();
      await this.#loadCachedDataToState();
      this.#setupNetworkListeners();
      this.#setupPeriodicSync();
      this.#setupBackgroundSync();
      this.#setupStoragePersistence();

      this.#isInitialized = true;

      console.log('[OfflineSync] ✅ Engine initialized');

      /* Sync immediately if online */
      if (navigator.onLine) {
        Perf.idle(() => this.sync());
      }

    } catch (err) {
      console.error('[OfflineSync] Init failed:', err);
    }
  }

  /* ============================================================
     LOAD CACHED DATA TO STATE
  ============================================================ */
  async #loadCachedDataToState() {
    try {
      const [tasks, notes, reminders] = await Promise.all([
        this.#cache.loadTasks(),
        this.#cache.loadNotes(),
        this.#cache.loadReminders(),
      ]);

      if (tasks.length) {
        Actions.tasks.setAll(tasks);
        console.log(`[OfflineSync] 📂 Loaded ${tasks.length} cached tasks`);
      }

      if (notes.length) {
        Actions.notes.setAll(notes);
        console.log(`[OfflineSync] 📂 Loaded ${notes.length} cached notes`);
      }

      if (reminders.length) {
        Actions.calendar.setReminders(reminders);
        console.log(`[OfflineSync] 📂 Loaded ${reminders.length} cached reminders`);
      }

    } catch (err) {
      console.warn('[OfflineSync] Failed to load cache:', err);
    }
  }

  /* ============================================================
     SYNC (Full sync with server)
  ============================================================ */
  async sync() {
    if (!navigator.onLine || this.#isSyncing) return;

    this.#isSyncing = true;
    Actions.offlineQueue.setSyncing(true);
    Actions.offlineQueue.setLastAttempt();

    console.log('[OfflineSync] 🔄 Starting sync...');

    try {
      /* 1. Process pending queue first */
      const queueResult = await this.#queue.processAll();

      /* 2. Fetch fresh data from server */
      if (navigator.onLine) {
        await this.#fetchAndCache();
      }

      /* 3. Update sync metadata */
      await this.#idb.setMeta('lastFullSync', Date.now());

      Actions.autosave.setSaved();

      const total = queueResult.synced + queueResult.failed;
      if (total > 0) {
        Bus.emit('sync:complete', queueResult);
      }

      console.log(
        `[OfflineSync] ✅ Sync complete: ${queueResult.synced} synced, ${queueResult.failed} failed`
      );

    } catch (err) {
      console.error('[OfflineSync] Sync failed:', err);
      Actions.autosave.setError();
    } finally {
      this.#isSyncing = false;
      Actions.offlineQueue.setSyncing(false);
    }
  }

  /* ============================================================
     FETCH AND CACHE FROM SERVER
  ============================================================ */
  async #fetchAndCache() {
    const [tasksRes, notesRes, remindersRes] = await Promise.allSettled([
      Http.get('/tasks',     {}, { cache: false }),
      Http.get('/notes',     {}, { cache: false }),
      Http.get('/reminders', {}, { cache: false }),
    ]);

    if (tasksRes.status === 'fulfilled') {
      const tasks = (Array.isArray(tasksRes.value)
        ? tasksRes.value
        : tasksRes.value?.tasks ?? []);
      await this.#cache.saveTasks(tasks);
      Actions.tasks.setAll(tasks);
    }

    if (notesRes.status === 'fulfilled') {
      const notes = (Array.isArray(notesRes.value)
        ? notesRes.value
        : notesRes.value?.notes ?? []);
      await this.#cache.saveNotes(notes);
      Actions.notes.setAll(notes);
    }

    if (remindersRes.status === 'fulfilled') {
      const reminders = (Array.isArray(remindersRes.value)
        ? remindersRes.value
        : remindersRes.value?.reminders ?? []);
      await this.#cache.saveReminders(reminders);
      Actions.calendar.setReminders(reminders);
    }
  }

  /* ============================================================
     QUEUE OPERATIONS (Offline-aware API wrapper)
  ============================================================ */
  async queueOperation(operation) {
    const item = await this.#queue.enqueue(operation);
    Actions.autosave.setSaving();
    return item;
  }

  /* ============================================================
     INTERCEPTED MUTATIONS (called from API layer)
  ============================================================ */
  async onTaskCreated(task) {
    await this.#cache.upsertTask(task);
  }

  async onTaskUpdated(task) {
    await this.#cache.upsertTask(task);
  }

  async onTaskDeleted(taskId) {
    await this.#cache.deleteTask(taskId);
  }

  async onNoteCreated(note) {
    await this.#cache.upsertNote(note);
  }

  async onNoteSaved(note) {
    await this.#cache.upsertNote(note);
  }

  async onNoteDeleted(noteId) {
    await this.#cache.deleteNote(noteId);
  }

  /* ============================================================
     NETWORK LISTENERS
  ============================================================ */
  #setupNetworkListeners() {
    window.addEventListener('online', async () => {
      console.log('[OfflineSync] 🌐 Network restored');
      Actions.app.setOnline(true);

      /* Retry with backoff */
      for (const delay of this.#RETRY_BACKOFF) {
        await new Promise(r => setTimeout(r, delay * 1000));
        if (navigator.onLine) {
          await this.sync();
          break;
        }
      }
    });

    window.addEventListener('offline', () => {
      console.log('[OfflineSync] 📴 Network lost');
      Actions.app.setOnline(false);

      Toast.warning(
        '📴 انقطع الاتصال',
        'ستُحفظ تغييراتك محلياً وتُزامَن عند عودة الإنترنت',
        { duration: 5000 }
      );
    });
  }

  /* ============================================================
     PERIODIC SYNC
  ============================================================ */
  #setupPeriodicSync() {
    this.#syncTimer = setInterval(async () => {
      if (!navigator.onLine) return;

      const queueStats = await this.#queue.getStats();
      if (queueStats.pending > 0) {
        await this.sync();
      } else {
        /* Light sync: just refresh stats */
        Http.cache.invalidate('/stats');
        await API.getStats().catch(() => {});
      }
    }, this.#SYNC_INTERVAL);

    console.log(
      `[OfflineSync] ⏱️ Periodic sync every ${this.#SYNC_INTERVAL / 1000}s`
    );
  }

  /* ============================================================
     BACKGROUND SYNC (Service Worker)
  ============================================================ */
  #setupBackgroundSync() {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;

    navigator.serviceWorker.ready.then((registration) => {
      /* Register background sync tag */
      return registration.sync.register('almudir-sync');
    }).then(() => {
      console.log('[OfflineSync] 🔔 Background Sync registered');
    }).catch((err) => {
      console.warn('[OfflineSync] Background Sync not available:', err.message);
    });

    /* Listen for sync messages from SW */
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_TRIGGER') {
        console.log('[OfflineSync] 📨 SW triggered sync');
        this.sync();
      }
      if (event.data?.type === 'CACHE_UPDATED') {
        console.log('[OfflineSync] 📦 SW cache updated');
      }
    });
  }

  /* ============================================================
     STORAGE PERSISTENCE (ask browser not to evict data)
  ============================================================ */
  async #setupStoragePersistence() {
    if (!navigator.storage?.persist) return;

    try {
      const granted = await navigator.storage.persist();
      if (granted) {
        console.log('[OfflineSync] 🔒 Storage persistence granted');
      } else {
        console.warn('[OfflineSync] ⚠️ Storage persistence not granted');
      }
    } catch (err) {
      console.warn('[OfflineSync] Storage persist error:', err);
    }
  }

  /* ============================================================
     BUS EVENT BINDINGS
  ============================================================ */
  bindBusEvents() {
    Bus.on('task:created', ({ data }) => {
      if (data) this.onTaskCreated(data);
    });

    Bus.on('task:updated', ({ data }) => {
      if (data) this.onTaskUpdated(data);
    });

    Bus.on('task:deleted', ({ taskId }) => {
      if (taskId) this.onTaskDeleted(taskId);
    });

    Bus.on('note:created', (data) => {
      if (data) this.onNoteCreated(data);
    });

    Bus.on('note:saved', ({ data }) => {
      if (data) this.onNoteSaved(data);
    });

    Bus.on('note:deleted', ({ noteId }) => {
      if (noteId) this.onNoteDeleted(noteId);
    });

    Bus.on('sync:start', () => this.sync());

    Bus.on('online:restored', () => this.sync());
  }

  /* ============================================================
     GETTERS
  ============================================================ */
  get cache()          { return this.#cache; }
  get queue()          { return this.#queue; }
  get idb()            { return this.#idb; }
  get isInitialized()  { return this.#isInitialized; }
  get isSyncing()      { return this.#isSyncing; }

  /* ============================================================
     DIAGNOSTICS
  ============================================================ */
  async getDiagnostics() {
    const [queueStats, cacheStats, dbSize, lastSync] = await Promise.all([
      this.#queue.getStats(),
      this.#cache.getStats(),
      this.#idb.getSize(),
      this.#idb.getMeta('lastFullSync'),
    ]);

    return {
      isOnline:    navigator.onLine,
      isSyncing:   this.#isSyncing,
      lastSync:    lastSync ? new Date(lastSync).toISOString() : null,
      queue:       queueStats,
      cache:       cacheStats,
      storage:     dbSize,
      swActive:    !!navigator.serviceWorker?.controller,
    };
  }

  /* ============================================================
     DESTROY
  ============================================================ */
  destroy() {
    if (this.#syncTimer) clearInterval(this.#syncTimer);
    this.#idb.close();
  }
}

/* ============================================================
   6. INITIALIZE & EXPORT
   ============================================================ */
const OfflineSync = new OfflineSyncEngine();

/* Auto-init */
(async () => {
  await OfflineSync.init();
  OfflineSync.bindBusEvents();

  /* Dev diagnostics */
  if (window.location.hostname === 'localhost') {
    window.__ALMUDIR_SYNC__ = {
      diagnostics: () => OfflineSync.getDiagnostics(),
      sync:        () => OfflineSync.sync(),
      idb:         () => OfflineSync.idb,
      queue:       () => OfflineSync.queue.getStats(),
      cache:       () => OfflineSync.cache.getStats(),
    };
  }
})();

window.OfflineSync = OfflineSync;

console.log(
  '%c[المدير] 💾 Offline Sync Engine Ready',
  'color:#feca57;font-weight:900;font-size:14px;'
);