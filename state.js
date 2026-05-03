/* ============================================================
   المدير — Ultimate Productivity Workspace
   state.js | Central State Management System v2.0.0
   
   نظام إدارة الحالة المركزي المبني على نمط Observer Pattern
   يضمن مزامنة البيانات بين جميع مكونات التطبيق
   ============================================================ */

'use strict';

/* ============================================================
   1. INITIAL STATE SCHEMA
   ============================================================ */
const INITIAL_STATE = {
  /* --- App Meta --- */
  app: {
    version:          '2.0.0',
    initialized:      false,
    activeTab:        'dashboard',
    isOnline:         navigator.onLine,
    lastSyncAt:       null,
    theme:            'dark',
    accentColor:      '#6c63ff',
    fontSize:         16,
    sidebarCollapsed: false,
    sidebarLabels:    true,
    isLoading:        false,
    loadingMsg:       '',
  },

  /* --- Dashboard --- */
  dashboard: {
    stats: {
      totalTasks:       0,
      completedToday:   0,
      totalNotes:       0,
      activeReminders:  0,
      tasksChange:      0,
      notesChange:      0,
      remindersChange:  0,
      completedChange:  0,
    },
    todayTasks:       [],
    recentNotes:      [],
    upcomingReminders:[],
    activityData:     [],
    lastRefreshed:    null,
    greeting:         '',
    quote:            '',
  },

  /* --- Tasks --- */
  tasks: {
    items:            [],
    filtered:         [],
    activeCard:       null,
    searchQuery:      '',
    filterPriority:   '',
    filterStatus:     '',
    sortBy:           'createdAt',
    sortDir:          'desc',
    isLoading:        false,
    lastFetched:      null,
    draggedCard:      null,
  },

  /* --- Notes --- */
  notes: {
    items:            [],
    activeNoteId:     null,
    activeNote:       null,
    searchQuery:      '',
    filterFolder:     '',
    viewMode:         'edit',   // 'edit' | 'split' | 'preview'
    isZenMode:        false,
    tocVisible:       false,
    isLoading:        false,
    isSaving:         false,
    lastFetched:      null,
    unsavedChanges:   false,
    wordCount:        0,
    charCount:        0,
  },

  /* --- Calendar / Reminders --- */
  calendar: {
    events:           [],
    reminders:        [],
    activeView:       'dayGridMonth',
    selectedDate:     null,
    isLoading:        false,
    lastFetched:      null,
  },

  /* --- Chat --- */
  chat: {
    messages:         [],
    isTyping:         false,
    isRecording:      false,
    voiceEnabled:     true,
    inputValue:       '',
    isLoading:        false,
    sessionId:        null,
    totalMessages:    0,
  },

  /* --- Pomodoro --- */
  pomodoro: {
    phase:            'work',    // 'work' | 'shortBreak' | 'longBreak'
    isRunning:        false,
    timeLeft:         25 * 60,   // seconds
    totalTime:        25 * 60,
    sessionsDone:     0,
    settings: {
      workDuration:   25,        // minutes
      shortBreak:     5,
      longBreak:      15,
      sessionsGoal:   4,
      soundEnabled:   true,
      notifyEnabled:  true,
    },
  },

  /* --- Notifications --- */
  notifications: {
    permission:       Notification?.permission ?? 'default',
    browserEnabled:   false,
    soundEnabled:     true,
    scheduled:        [],
    history:          [],
  },

  /* --- Autosave --- */
  autosave: {
    status:           'saved',   // 'saving' | 'saved' | 'error' | 'idle'
    lastSaved:        null,
    pendingChanges:   false,
  },

  /* --- Offline Sync Queue --- */
  offlineQueue: {
    items:            [],
    isSyncing:        false,
    lastAttempt:      null,
  },

  /* --- UI State --- */
  ui: {
    fabOpen:          false,
    cmdPaletteOpen:   false,
    modals: {
      task:           false,
      note:           false,
      reminder:       false,
      taskDetail:     false,
      pomodoroSettings: false,
      shortcuts:      false,
      settings:       false,
      confirm:        false,
    },
    confirm: {
      message:        '',
      onConfirm:      null,
      onCancel:       null,
    },
    settingsTab:      'appearance',
    contextMenu: {
      visible:        false,
      x:              0,
      y:              0,
      items:          [],
      targetId:       null,
    },
    toasts:           [],
    editingTaskId:    null,
    editingNoteId:    null,
  },

  /* --- Settings --- */
  settings: {
    autoSync:         true,
    syncInterval:     30000,     // ms
    autosaveDelay:    2000,      // ms
    dateFormat:       'ar-SA',
    language:         'ar',
    ttsLang:          'ar-EG',
    ttsRate:          1.0,
    ttsPitch:         1.0,
  },
};

/* ============================================================
   2. STATE STORE CLASS
   ============================================================ */
class StateStore {
  #state        = {};
  #listeners    = new Map();
  #history      = [];
  #historyIndex = -1;
  #maxHistory   = 50;
  #batchUpdates = [];
  #isBatching   = false;
  #persistKeys  = [
    'app.theme',
    'app.accentColor',
    'app.fontSize',
    'app.sidebarCollapsed',
    'app.sidebarLabels',
    'app.activeTab',
    'pomodoro.settings',
    'pomodoro.sessionsDone',
    'notes.activeNoteId',
    'notes.viewMode',
    'settings',
    'notifications.browserEnabled',
    'notifications.soundEnabled',
    'offlineQueue.items',
    'chat.messages',
  ];

  constructor(initialState) {
    this.#state = this.#deepClone(initialState);
    this.#loadFromStorage();
    this.#setupDevTools();
    console.log(
      '%c[State] ✅ StateStore initialized',
      'color:#6c63ff;font-weight:700;'
    );
  }

  /* ----------------------------------------------------------
     DEEP CLONE UTILITY
  ---------------------------------------------------------- */
  #deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map(item => this.#deepClone(item));
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, this.#deepClone(v)])
    );
  }

  /* ----------------------------------------------------------
     GET STATE (with dot-notation path support)
  ---------------------------------------------------------- */
  get(path = null) {
    if (!path) return this.#deepClone(this.#state);

    const keys   = path.split('.');
    let   result = this.#state;

    for (const key of keys) {
      if (result === undefined || result === null) return undefined;
      result = result[key];
    }

    return this.#deepClone(result);
  }

  /* ----------------------------------------------------------
     SET STATE (with dot-notation path support)
  ---------------------------------------------------------- */
  set(path, value, options = {}) {
    const {
      silent    = false,
      persist   = true,
      addToHistory = false,
    } = options;

    const oldValue = this.get(path);

    /* Skip if value is identical */
    if (JSON.stringify(oldValue) === JSON.stringify(value)) return this;

    /* Save history snapshot before change */
    if (addToHistory) {
      this.#pushHistory(path, oldValue);
    }

    /* Navigate to parent and set value */
    const keys   = path.split('.');
    const lastKey = keys.pop();
    let   target  = this.#state;

    for (const key of keys) {
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    target[lastKey] = this.#deepClone(value);

    /* Persist to localStorage */
    if (persist && this.#shouldPersist(path)) {
      this.#saveToStorage(path, value);
    }

    /* Notify listeners */
    if (!silent) {
      if (this.#isBatching) {
        this.#batchUpdates.push({ path, value, oldValue });
      } else {
        this.#notify(path, value, oldValue);
      }
    }

    return this;
  }

  /* ----------------------------------------------------------
     UPDATE (merge partial object into existing state)
  ---------------------------------------------------------- */
  update(path, partial, options = {}) {
    const current = this.get(path) ?? {};
    const merged  = { ...current, ...partial };
    return this.set(path, merged, options);
  }

  /* ----------------------------------------------------------
     ARRAY HELPERS
  ---------------------------------------------------------- */
  push(path, item) {
    const arr = this.get(path) ?? [];
    if (!Array.isArray(arr)) throw new Error(`[State] "${path}" is not an array`);
    arr.push(item);
    return this.set(path, arr);
  }

  unshift(path, item) {
    const arr = this.get(path) ?? [];
    if (!Array.isArray(arr)) throw new Error(`[State] "${path}" is not an array`);
    arr.unshift(item);
    return this.set(path, arr);
  }

  removeFromArray(path, predicate) {
    const arr = this.get(path) ?? [];
    if (!Array.isArray(arr)) throw new Error(`[State] "${path}" is not an array`);
    const filtered = arr.filter(item => !predicate(item));
    return this.set(path, filtered);
  }

  updateInArray(path, predicate, updater) {
    const arr = this.get(path) ?? [];
    if (!Array.isArray(arr)) throw new Error(`[State] "${path}" is not an array`);
    const updated = arr.map(item =>
      predicate(item)
        ? { ...item, ...(typeof updater === 'function' ? updater(item) : updater) }
        : item
    );
    return this.set(path, updated);
  }

  findInArray(path, predicate) {
    const arr = this.get(path) ?? [];
    return arr.find(predicate) ?? null;
  }

  /* ----------------------------------------------------------
     SUBSCRIBE / UNSUBSCRIBE
  ---------------------------------------------------------- */
  subscribe(path, callback, options = {}) {
    const { immediate = false, once = false } = options;

    if (!this.#listeners.has(path)) {
      this.#listeners.set(path, new Set());
    }

    const wrappedCallback = once
      ? (...args) => { callback(...args); this.unsubscribe(path, wrappedCallback); }
      : callback;

    this.#listeners.get(path).add(wrappedCallback);

    /* Run immediately with current value */
    if (immediate) {
      callback(this.get(path), undefined);
    }

    /* Return unsubscribe function */
    return () => this.unsubscribe(path, wrappedCallback);
  }

  unsubscribe(path, callback) {
    if (!this.#listeners.has(path)) return;
    this.#listeners.get(path).delete(callback);
    if (this.#listeners.get(path).size === 0) {
      this.#listeners.delete(path);
    }
  }

  /* ----------------------------------------------------------
     BATCH UPDATES (notify once after all changes)
  ---------------------------------------------------------- */
  batch(fn) {
    this.#isBatching = true;
    this.#batchUpdates = [];

    try {
      fn(this);
    } finally {
      this.#isBatching = false;
      const updates = [...this.#batchUpdates];
      this.#batchUpdates = [];

      /* Deduplicate by path and notify */
      const seen = new Set();
      for (const { path, value, oldValue } of updates) {
        if (!seen.has(path)) {
          seen.add(path);
          this.#notify(path, value, oldValue);
        }
      }
    }

    return this;
  }

  /* ----------------------------------------------------------
     NOTIFY LISTENERS
  ---------------------------------------------------------- */
  #notify(changedPath, newValue, oldValue) {
    const parts = changedPath.split('.');

    /* Notify exact path listeners */
    if (this.#listeners.has(changedPath)) {
      for (const cb of this.#listeners.get(changedPath)) {
        try { cb(newValue, oldValue, changedPath); }
        catch (err) { console.error('[State] Listener error:', err); }
      }
    }

    /* Notify parent path listeners (bubble up) */
    for (let i = parts.length - 1; i > 0; i--) {
      const parentPath = parts.slice(0, i).join('.');
      if (this.#listeners.has(parentPath)) {
        const parentVal = this.get(parentPath);
        for (const cb of this.#listeners.get(parentPath)) {
          try { cb(parentVal, undefined, changedPath); }
          catch (err) { console.error('[State] Parent listener error:', err); }
        }
      }
    }

    /* Notify wildcard '*' listeners */
    if (this.#listeners.has('*')) {
      for (const cb of this.#listeners.get('*')) {
        try { cb({ path: changedPath, value: newValue, oldValue }); }
        catch (err) { console.error('[State] Wildcard listener error:', err); }
      }
    }
  }

  /* ----------------------------------------------------------
     HISTORY (Undo / Redo)
  ---------------------------------------------------------- */
  #pushHistory(path, oldValue) {
    /* Remove redo history if we're branching */
    if (this.#historyIndex < this.#history.length - 1) {
      this.#history = this.#history.slice(0, this.#historyIndex + 1);
    }

    this.#history.push({ path, value: oldValue, timestamp: Date.now() });

    if (this.#history.length > this.#maxHistory) {
      this.#history.shift();
    } else {
      this.#historyIndex++;
    }
  }

  undo() {
    if (this.#historyIndex < 0) return false;
    const { path, value } = this.#history[this.#historyIndex];
    this.#historyIndex--;
    this.set(path, value, { addToHistory: false });
    return true;
  }

  redo() {
    if (this.#historyIndex >= this.#history.length - 1) return false;
    this.#historyIndex++;
    const { path, value } = this.#history[this.#historyIndex];
    this.set(path, value, { addToHistory: false });
    return true;
  }

  canUndo() { return this.#historyIndex >= 0; }
  canRedo() { return this.#historyIndex < this.#history.length - 1; }

  /* ----------------------------------------------------------
     LOCALSTORAGE PERSISTENCE
  ---------------------------------------------------------- */
  #shouldPersist(path) {
    return this.#persistKeys.some(
      key => path === key || path.startsWith(key + '.')
    );
  }

  #saveToStorage(path, value) {
    try {
      const storageKey = `almudir_${path.replace(/\./g, '_')}`;
      const serialized = JSON.stringify({
        value,
        savedAt: Date.now(),
        version: this.#state.app?.version ?? '2.0.0',
      });
      localStorage.setItem(storageKey, serialized);
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        console.warn('[State] localStorage quota exceeded, clearing old data...');
        this.#clearOldStorage();
      } else {
        console.error('[State] Storage error:', err);
      }
    }
  }

  #loadFromStorage() {
    for (const path of this.#persistKeys) {
      try {
        const storageKey = `almudir_${path.replace(/\./g, '_')}`;
        const raw        = localStorage.getItem(storageKey);
        if (!raw) continue;

        const { value, version } = JSON.parse(raw);

        /* Version check — skip if major version mismatch */
        const currentMajor = parseInt(this.#state.app?.version ?? '2');
        const storedMajor  = parseInt(version ?? '1');
        if (storedMajor < currentMajor - 1) continue;

        this.set(path, value, { silent: true, persist: false });
      } catch (err) {
        console.warn(`[State] Failed to load "${path}" from storage:`, err);
      }
    }
    console.log('[State] 💾 Loaded persisted state from localStorage');
  }

  #clearOldStorage() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('almudir_'));
    /* Remove keys not in persist list */
    for (const k of keys) {
      const path = k.replace('almudir_', '').replace(/_/g, '.');
      if (!this.#persistKeys.includes(path)) {
        localStorage.removeItem(k);
      }
    }
  }

  /* ----------------------------------------------------------
     EXPORT / IMPORT (Backup & Restore)
  ---------------------------------------------------------- */
  export(sections = ['tasks', 'notes', 'calendar', 'settings']) {
    const exported = {
      exportedAt: new Date().toISOString(),
      version:    this.#state.app.version,
      data:       {},
    };

    for (const section of sections) {
      exported.data[section] = this.get(section);
    }

    return JSON.stringify(exported, null, 2);
  }

  import(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.data || !parsed.version) {
        throw new Error('Invalid backup format');
      }

      this.batch((s) => {
        for (const [section, data] of Object.entries(parsed.data)) {
          if (section in this.#state) {
            s.set(section, data, { persist: true });
          }
        }
      });

      console.log('[State] ✅ Data imported successfully');
      return true;
    } catch (err) {
      console.error('[State] Import failed:', err);
      return false;
    }
  }

  /* ----------------------------------------------------------
     RESET
  ---------------------------------------------------------- */
  reset(path = null) {
    if (path) {
      const keys   = path.split('.');
      let   target = INITIAL_STATE;
      for (const k of keys) {
        if (!(k in target)) return this;
        target = target[k];
      }
      this.set(path, target);
    } else {
      this.#state = this.#deepClone(INITIAL_STATE);
      this.#notify('*', this.#state, undefined);
    }
    return this;
  }

  /* ----------------------------------------------------------
     DEV TOOLS
  ---------------------------------------------------------- */
  #setupDevTools() {
    if (typeof window === 'undefined') return;

    /* Expose state to window for debugging */
    if (window.location.hostname === 'localhost') {
      window.__ALMUDIR_STATE__ = {
        get:         (path) => this.get(path),
        set:         (p, v) => this.set(p, v),
        snapshot:    ()     => JSON.parse(JSON.stringify(this.#state)),
        listeners:   ()     => [...this.#listeners.keys()],
        history:     ()     => this.#history,
        export:      ()     => this.export(),
      };

      /* Log all state changes in dev mode */
      this.subscribe('*', ({ path, value }) => {
        console.groupCollapsed(`%c[State] 📦 ${path}`, 'color:#6c63ff;');
        console.log('New value:', value);
        console.groupEnd();
      });
    }
  }

  /* Getters for convenience */
  get listenerCount() {
    let count = 0;
    for (const set of this.#listeners.values()) count += set.size;
    return count;
  }

  get stateSize() {
    return JSON.stringify(this.#state).length;
  }
}

/* ============================================================
   3. ACTIONS — Typed state mutations
   ============================================================ */
const Actions = {

  /* ----------------------------------------------------------
     APP ACTIONS
  ---------------------------------------------------------- */
  app: {
    setActiveTab(tab) {
      State.set('app.activeTab', tab);
      State.set('app.isLoading', false);
    },

    setOnline(isOnline) {
      State.set('app.isOnline', isOnline);
      State.set('ui.onlineBannerVisible', !isOnline);
    },

    setTheme(theme) {
      State.set('app.theme', theme);
      document.body.setAttribute('data-theme', theme);
      document.querySelector('#themeToggleBtn i')?.classList.toggle(
        'fa-sun', theme === 'dark'
      );
      document.querySelector('#themeToggleBtn i')?.classList.toggle(
        'fa-moon', theme === 'light'
      );
    },

    setAccentColor(color) {
      State.set('app.accentColor', color);
      document.documentElement.style.setProperty('--accent', color);
      /* Auto-generate derived colors */
      document.documentElement.style.setProperty('--accent-light', `${color}26`);
      document.documentElement.style.setProperty('--accent-glow',  `${color}66`);
      document.documentElement.style.setProperty('--text-accent',  color);
    },

    setFontSize(size) {
      State.set('app.fontSize', size);
      document.documentElement.style.fontSize = `${size}px`;
    },

    setSidebarCollapsed(collapsed) {
      State.set('app.sidebarCollapsed', collapsed);
      document.getElementById('sidebar')?.classList.toggle('collapsed', collapsed);
    },

    setLoading(isLoading, msg = '') {
      State.batch((s) => {
        s.set('app.isLoading', isLoading);
        s.set('app.loadingMsg', msg);
      });
    },

    setInitialized() {
      State.set('app.initialized', true);
    },
  },

  /* ----------------------------------------------------------
     TASK ACTIONS
  ---------------------------------------------------------- */
  tasks: {
    setAll(tasks) {
      State.batch((s) => {
        s.set('tasks.items',   tasks);
        s.set('tasks.lastFetched', Date.now());
        s.set('tasks.isLoading', false);
      });
      Actions.tasks.applyFilters();
    },

    add(task) {
      const newTask = {
        id:          task.id ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title:       task.title ?? '',
        description: task.description ?? '',
        status:      task.status ?? 'todo',
        priority:    task.priority ?? 'medium',
        tags:        task.tags ?? [],
        checklist:   task.checklist ?? [],
        dueDate:     task.dueDate ?? null,
        estimate:    task.estimate ?? null,
        color:       task.color ?? 'default',
        createdAt:   task.createdAt ?? new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
        completedAt: null,
      };
      State.unshift('tasks.items', newTask);
      Actions.tasks.applyFilters();
      Actions.dashboard.incrementStat('totalTasks');
      return newTask;
    },

    update(taskId, updates) {
      State.updateInArray(
        'tasks.items',
        t => t.id === taskId,
        { ...updates, updatedAt: new Date().toISOString() }
      );
      Actions.tasks.applyFilters();
    },

    remove(taskId) {
      const task = State.findInArray('tasks.items', t => t.id === taskId);
      State.removeFromArray('tasks.items', t => t.id === taskId);
      Actions.tasks.applyFilters();
      if (task) Actions.dashboard.decrementStat('totalTasks');
    },

    moveCard(taskId, newStatus) {
      const wasCompleted = (() => {
        const t = State.findInArray('tasks.items', t => t.id === taskId);
        return t?.status === 'done';
      })();

      Actions.tasks.update(taskId, {
        status:      newStatus,
        completedAt: newStatus === 'done' ? new Date().toISOString() : null,
      });

      const isNowDone = newStatus === 'done';
      if (isNowDone && !wasCompleted) {
        Actions.dashboard.incrementStat('completedToday');
      } else if (!isNowDone && wasCompleted) {
        Actions.dashboard.decrementStat('completedToday');
      }
    },

    toggleSubtask(taskId, subtaskIndex) {
      const task = State.findInArray('tasks.items', t => t.id === taskId);
      if (!task) return;
      const checklist = [...(task.checklist ?? [])];
      if (checklist[subtaskIndex]) {
        checklist[subtaskIndex] = {
          ...checklist[subtaskIndex],
          done: !checklist[subtaskIndex].done,
        };
        Actions.tasks.update(taskId, { checklist });
      }
    },

    setSearch(query) {
      State.set('tasks.searchQuery', query);
      Actions.tasks.applyFilters();
    },

    setFilter(key, value) {
      State.set(`tasks.${key}`, value);
      Actions.tasks.applyFilters();
    },

    applyFilters() {
      const { items, searchQuery, filterPriority, filterStatus, sortBy, sortDir }
        = State.get('tasks');

      let filtered = [...items];

      /* Search filter */
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(t =>
          t.title?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.tags?.some(tag => tag.toLowerCase().includes(q))
        );
      }

      /* Priority filter */
      if (filterPriority) {
        filtered = filtered.filter(t => t.priority === filterPriority);
      }

      /* Status filter */
      if (filterStatus) {
        filtered = filtered.filter(t => t.status === filterStatus);
      }

      /* Sort */
      filtered.sort((a, b) => {
        let aVal = a[sortBy], bVal = b[sortBy];
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1  : -1;
        return 0;
      });

      State.set('tasks.filtered', filtered, { silent: false });
    },

    getByStatus(status) {
      return State.get('tasks.filtered').filter(t => t.status === status);
    },

    setLoading(val) { State.set('tasks.isLoading', val); },
    setDraggedCard(card) { State.set('tasks.draggedCard', card); },
  },

  /* ----------------------------------------------------------
     NOTE ACTIONS
  ---------------------------------------------------------- */
  notes: {
    setAll(notes) {
      State.batch((s) => {
        s.set('notes.items',      notes);
        s.set('notes.lastFetched', Date.now());
        s.set('notes.isLoading',  false);
      });
    },

    add(note) {
      const newNote = {
        id:         note.id ?? `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title:      note.title ?? 'ملاحظة جديدة',
        content:    note.content ?? '',
        folder:     note.folder ?? 'general',
        tags:       note.tags ?? [],
        links:      note.links ?? [],
        createdAt:  note.createdAt ?? new Date().toISOString(),
        updatedAt:  new Date().toISOString(),
        wordCount:  0,
        charCount:  0,
        readTime:   0,
      };
      State.unshift('notes.items', newNote);
      Actions.dashboard.incrementStat('totalNotes');
      return newNote;
    },

    update(noteId, updates) {
      State.updateInArray(
        'notes.items',
        n => n.id === noteId,
        { ...updates, updatedAt: new Date().toISOString() }
      );
      /* Also update activeNote if it's the same */
      const active = State.get('notes.activeNote');
      if (active?.id === noteId) {
        State.update('notes.activeNote', updates);
      }
    },

    remove(noteId) {
      State.removeFromArray('notes.items', n => n.id === noteId);
      const activeId = State.get('notes.activeNoteId');
      if (activeId === noteId) {
        State.batch((s) => {
          s.set('notes.activeNoteId', null);
          s.set('notes.activeNote',   null);
        });
      }
      Actions.dashboard.decrementStat('totalNotes');
    },

    setActive(noteId) {
      const note = State.findInArray('notes.items', n => n.id === noteId);
      State.batch((s) => {
        s.set('notes.activeNoteId',  noteId);
        s.set('notes.activeNote',    note);
        s.set('notes.unsavedChanges', false);
      });
    },

    setViewMode(mode) {
      State.set('notes.viewMode', mode);
    },

    setZenMode(enabled) {
      State.set('notes.isZenMode', enabled);
      document.getElementById('zenModeOverlay').style.display = enabled ? 'flex' : 'none';
      document.body.classList.toggle('zen-active', enabled);
    },

    setTocVisible(visible) {
      State.set('notes.tocVisible', visible);
    },

    markUnsaved() {
      State.set('notes.unsavedChanges', true);
      Actions.autosave.setSaving();
    },

    markSaved() {
      State.set('notes.unsavedChanges', false);
    },

    setWordCount(count) { State.set('notes.wordCount', count); },
    setCharCount(count) { State.set('notes.charCount', count); },
    setLoading(val)     { State.set('notes.isLoading', val); },
    setSaving(val)      { State.set('notes.isSaving', val); },

    setSearch(query) {
      State.set('notes.searchQuery', query);
    },

    getFiltered() {
      const { items, searchQuery, filterFolder } = State.get('notes');
      let filtered = [...items];

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(n =>
          n.title?.toLowerCase().includes(q) ||
          n.content?.toLowerCase().includes(q) ||
          n.tags?.some(t => t.toLowerCase().includes(q))
        );
      }

      if (filterFolder) {
        filtered = filtered.filter(n => n.folder === filterFolder);
      }

      return filtered.sort((a, b) =>
        new Date(b.updatedAt) - new Date(a.updatedAt)
      );
    },
  },

  /* ----------------------------------------------------------
     CALENDAR ACTIONS
  ---------------------------------------------------------- */
  calendar: {
    setEvents(events) {
      State.batch((s) => {
        s.set('calendar.events',      events);
        s.set('calendar.lastFetched', Date.now());
        s.set('calendar.isLoading',   false);
      });
    },

    setReminders(reminders) {
      State.set('calendar.reminders', reminders);
      State.set(
        'dashboard.stats.activeReminders',
        reminders.filter(r => !r.dismissed).length
      );
    },

    addEvent(event) {
      State.push('calendar.events', {
        id:        event.id ?? `event_${Date.now()}`,
        title:     event.title,
        start:     event.start,
        end:       event.end ?? null,
        type:      event.type ?? 'reminder',
        color:     event.color ?? null,
        allDay:    event.allDay ?? false,
        notes:     event.notes ?? '',
        createdAt: new Date().toISOString(),
      });
    },

    removeEvent(eventId) {
      State.removeFromArray('calendar.events', e => e.id === eventId);
    },

    setView(view) {
      State.set('calendar.activeView', view);
    },

    setLoading(val) { State.set('calendar.isLoading', val); },
  },

  /* ----------------------------------------------------------
     CHAT ACTIONS
  ---------------------------------------------------------- */
  chat: {
    addMessage(role, content, meta = {}) {
      const message = {
        id:        `msg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        role,                             // 'user' | 'assistant' | 'system'
        content,
        timestamp: new Date().toISOString(),
        isSpoken:  false,
        isCopied:  false,
        ...meta,
      };
      State.push('chat.messages', message);
      State.set('chat.totalMessages', State.get('chat.messages').length);
      return message;
    },

    updateLastMessage(updates) {
      const messages = State.get('chat.messages');
      if (!messages.length) return;
      const last = messages[messages.length - 1];
      State.updateInArray(
        'chat.messages',
        m => m.id === last.id,
        updates
      );
    },

    setTyping(isTyping) {
      State.set('chat.isTyping', isTyping);
    },

    setRecording(isRecording) {
      State.set('chat.isRecording', isRecording);
    },

    setVoiceEnabled(enabled) {
      State.set('chat.voiceEnabled', enabled);
    },

    setInput(value) {
      State.set('chat.inputValue', value, { persist: false, silent: true });
    },

    clearMessages() {
      State.batch((s) => {
        s.set('chat.messages',      []);
        s.set('chat.totalMessages', 0);
        s.set('chat.isTyping',      false);
      });
    },

    setSessionId(id) {
      State.set('chat.sessionId', id);
    },

    setLoading(val) { State.set('chat.isLoading', val); },
  },

  /* ----------------------------------------------------------
     POMODORO ACTIONS
  ---------------------------------------------------------- */
  pomodoro: {
    start() {
      State.set('pomodoro.isRunning', true);
    },

    pause() {
      State.set('pomodoro.isRunning', false);
    },

    reset() {
      const phase    = State.get('pomodoro.phase');
      const settings = State.get('pomodoro.settings');
      const totalSec = Actions.pomodoro.getDurationFor(phase, settings) * 60;
      State.batch((s) => {
        s.set('pomodoro.isRunning', false);
        s.set('pomodoro.timeLeft',  totalSec);
        s.set('pomodoro.totalTime', totalSec);
      });
    },

    tick() {
      const timeLeft = State.get('pomodoro.timeLeft');
      if (timeLeft <= 0) {
        Actions.pomodoro.completePhase();
        return;
      }
      State.set('pomodoro.timeLeft', timeLeft - 1, { silent: false });
    },

    completePhase() {
      const phase     = State.get('pomodoro.phase');
      const settings  = State.get('pomodoro.settings');
      let   sessions  = State.get('pomodoro.sessionsDone');
      let   nextPhase = 'work';

      if (phase === 'work') {
        sessions++;
        State.set('pomodoro.sessionsDone', sessions);
        nextPhase = sessions % settings.sessionsGoal === 0
          ? 'longBreak'
          : 'shortBreak';
      }

      const nextDuration = Actions.pomodoro.#getDurationFor(nextPhase, settings) * 60;
      State.batch((s) => {
        s.set('pomodoro.phase',     nextPhase);
        s.set('pomodoro.timeLeft',  nextDuration);
        s.set('pomodoro.totalTime', nextDuration);
        s.set('pomodoro.isRunning', false);
      });
    },

    skip() {
      Actions.pomodoro.completePhase();
    },

    updateSettings(settings) {
      State.update('pomodoro.settings', settings);
      Actions.pomodoro.reset();
    },

    #getDurationFor(phase, settings) {
      switch (phase) {
        case 'work':       return settings.workDuration;
        case 'shortBreak': return settings.shortBreak;
        case 'longBreak':  return settings.longBreak;
        default:           return settings.workDuration;
      }
    },

    getProgress() {
      const { timeLeft, totalTime } = State.get('pomodoro');
      if (!totalTime) return 0;
      return ((totalTime - timeLeft) / totalTime) * 100;
    },

    formatTime() {
      const timeLeft = State.get('pomodoro.timeLeft');
      const mins     = Math.floor(timeLeft / 60).toString().padStart(2, '0');
      const secs     = (timeLeft % 60).toString().padStart(2, '0');
      return `${mins}:${secs}`;
    },
  },

  /* ----------------------------------------------------------
     DASHBOARD ACTIONS
  ---------------------------------------------------------- */
  dashboard: {
    setStats(stats) {
      State.update('dashboard.stats', stats);
    },

    setTodayTasks(tasks) {
      State.set('dashboard.todayTasks', tasks);
    },

    setRecentNotes(notes) {
      State.set('dashboard.recentNotes', notes);
    },

    setUpcomingReminders(reminders) {
      State.set('dashboard.upcomingReminders', reminders);
    },

    setActivityData(data) {
      State.set('dashboard.activityData', data);
    },

    incrementStat(key) {
      const current = State.get(`dashboard.stats.${key}`) ?? 0;
      State.set(`dashboard.stats.${key}`, current + 1);
    },

    decrementStat(key) {
      const current = State.get(`dashboard.stats.${key}`) ?? 0;
      State.set(`dashboard.stats.${key}`, Math.max(0, current - 1));
    },

    setLastRefreshed() {
      State.set('dashboard.lastRefreshed', Date.now());
    },

    setGreeting(msg) { State.set('dashboard.greeting', msg); },
    setQuote(quote)  { State.set('dashboard.quote', quote); },
  },

  /* ----------------------------------------------------------
     AUTOSAVE ACTIONS
  ---------------------------------------------------------- */
  autosave: {
    setSaving() {
      State.batch((s) => {
        s.set('autosave.status',         'saving');
        s.set('autosave.pendingChanges', true);
      });
    },

    setSaved() {
      State.batch((s) => {
        s.set('autosave.status',         'saved');
        s.set('autosave.lastSaved',      Date.now());
        s.set('autosave.pendingChanges', false);
      });
    },

    setError() {
      State.set('autosave.status', 'error');
    },

    setIdle() {
      State.set('autosave.status', 'idle');
    },
  },

  /* ----------------------------------------------------------
     OFFLINE QUEUE ACTIONS
  ---------------------------------------------------------- */
  offlineQueue: {
    enqueue(operation) {
      const item = {
        id:        `op_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        timestamp: new Date().toISOString(),
        retries:   0,
        maxRetries: 3,
        ...operation,
      };
      State.push('offlineQueue.items', item);
      console.log(`[OfflineQueue] ➕ Queued: ${operation.type} ${operation.endpoint}`);
      return item;
    },

    dequeue(opId) {
      State.removeFromArray('offlineQueue.items', op => op.id === opId);
    },

    clear() {
      State.set('offlineQueue.items', []);
    },

    incrementRetry(opId) {
      State.updateInArray(
        'offlineQueue.items',
        op => op.id === opId,
        item => ({ retries: (item.retries ?? 0) + 1 })
      );
    },

    setSyncing(val) {
      State.set('offlineQueue.isSyncing', val);
    },

    setLastAttempt() {
      State.set('offlineQueue.lastAttempt', Date.now());
    },

    getAll() {
      return State.get('offlineQueue.items') ?? [];
    },

    hasItems() {
      return (State.get('offlineQueue.items') ?? []).length > 0;
    },
  },

  /* ----------------------------------------------------------
     UI ACTIONS
  ---------------------------------------------------------- */
  ui: {
    openModal(name) {
      State.set(`ui.modals.${name}`, true);
    },

    closeModal(name) {
      State.set(`ui.modals.${name}`, false);
      /* Clear editing IDs when closing task/note modals */
      if (name === 'task') State.set('ui.editingTaskId', null);
      if (name === 'note') State.set('ui.editingNoteId', null);
    },

    closeAllModals() {
      const modals = State.get('ui.modals');
      const closed = Object.fromEntries(
        Object.keys(modals).map(k => [k, false])
      );
      State.set('ui.modals', closed);
    },

    setFabOpen(open) {
      State.set('ui.fabOpen', open);
    },

    setCmdPaletteOpen(open) {
      State.set('ui.cmdPaletteOpen', open);
    },

    setEditingTask(id) {
      State.set('ui.editingTaskId', id);
    },

    setEditingNote(id) {
      State.set('ui.editingNoteId', id);
    },

    showConfirm(message, onConfirm, onCancel = null) {
      State.set('ui.confirm', { message, onConfirm, onCancel });
      Actions.ui.openModal('confirm');
    },

    hideConfirm() {
      Actions.ui.closeModal('confirm');
      State.set('ui.confirm', { message: '', onConfirm: null, onCancel: null });
    },

    showContextMenu(x, y, items, targetId = null) {
      State.set('ui.contextMenu', { visible: true, x, y, items, targetId });
    },

    hideContextMenu() {
      State.update('ui.contextMenu', { visible: false, items: [], targetId: null });
    },

    setSettingsTab(tab) {
      State.set('ui.settingsTab', tab);
    },

    /* Toast helpers */
    addToast(toast) {
      const newToast = {
        id:       `toast_${Date.now()}`,
        type:     toast.type ?? 'info',
        title:    toast.title ?? '',
        message:  toast.message ?? '',
        duration: toast.duration ?? 4000,
        icon:     toast.icon ?? null,
      };
      State.push('ui.toasts', newToast);
      return newToast.id;
    },

    removeToast(id) {
      State.removeFromArray('ui.toasts', t => t.id === id);
    },
  },

  /* ----------------------------------------------------------
     NOTIFICATIONS ACTIONS
  ---------------------------------------------------------- */
  notifications: {
    setPermission(permission) {
      State.set('notifications.permission', permission);
      State.set('notifications.browserEnabled', permission === 'granted');
    },

    async requestPermission() {
      if (!('Notification' in window)) return 'denied';
      const perm = await Notification.requestPermission();
      Actions.notifications.setPermission(perm);
      return perm;
    },

    schedule(reminder) {
      State.push('notifications.scheduled', {
        id:         reminder.id,
        title:      reminder.title,
        scheduledAt: reminder.date,
        fired:      false,
      });
    },

    markFired(id) {
      State.updateInArray(
        'notifications.scheduled',
        n => n.id === id,
        { fired: true }
      );
    },

    addToHistory(notification) {
      State.push('notifications.history', {
        ...notification,
        receivedAt: new Date().toISOString(),
      });
    },
  },
};

/* ============================================================
   4. SELECTORS — Derived / computed state
   ============================================================ */
const Selectors = {

  /* Tasks */
  getTasksByStatus:    (status) => Actions.tasks.getByStatus(status),
  getAllTasks:          ()       => State.get('tasks.filtered'),
  getTaskById:         (id)     => State.findInArray('tasks.items', t => t.id === id),
  getTasksCount:       ()       => State.get('tasks.items').length,
  getCompletedToday:   ()       => {
    const today = new Date().toDateString();
    return State.get('tasks.items').filter(t =>
      t.status === 'done' &&
      t.completedAt &&
      new Date(t.completedAt).toDateString() === today
    ).length;
  },
  getTodayTasks: () => {
    const today = new Date().toDateString();
    return State.get('tasks.items').filter(t =>
      t.dueDate &&
      new Date(t.dueDate).toDateString() === today
    );
  },

  /* Notes */
  getAllNotes:          ()       => Actions.notes.getFiltered(),
  getNoteById:         (id)     => State.findInArray('notes.items', n => n.id === id),
  getActiveNote:       ()       => State.get('notes.activeNote'),
  getNotesCount:       ()       => State.get('notes.items').length,

  /* Calendar */
  getAllEvents:         ()       => State.get('calendar.events'),
  getUpcomingReminders: ()      => {
    const now = new Date();
    return State.get('calendar.reminders')
      .filter(r => !r.dismissed && new Date(r.date) > now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5);
  },

  /* Chat */
  getAllMessages:       ()       => State.get('chat.messages'),
  getIsTyping:         ()       => State.get('chat.isTyping'),

  /* Pomodoro */
  getPomodoroState:    ()       => State.get('pomodoro'),
  getPomodoroProgress: ()       => Actions.pomodoro.getProgress(),
  getFormattedTime:    ()       => Actions.pomodoro.formatTime(),

  /* Offline */
  getPendingOps:       ()       => Actions.offlineQueue.getAll(),
  hasPendingOps:       ()       => Actions.offlineQueue.hasItems(),
  getQueueCount:       ()       => (Actions.offlineQueue.getAll()).length,

  /* App */
  isOnline:            ()       => State.get('app.isOnline'),
  getActiveTab:        ()       => State.get('app.activeTab'),
  getTheme:            ()       => State.get('app.theme'),
  isInitialized:       ()       => State.get('app.initialized'),

  /* UI */
  isModalOpen:         (name)   => State.get(`ui.modals.${name}`),
  isFabOpen:           ()       => State.get('ui.fabOpen'),
  getConfirmState:     ()       => State.get('ui.confirm'),
  getContextMenu:      ()       => State.get('ui.contextMenu'),
  getToasts:           ()       => State.get('ui.toasts'),
  getAutosaveStatus:   ()       => State.get('autosave.status'),

  /* Dashboard */
  getStats:            ()       => State.get('dashboard.stats'),
  getDashboardData:    ()       => State.get('dashboard'),
};

/* ============================================================
   5. COMPUTED STATE (Auto-updating derived values)
   ============================================================ */
class ComputedState {
  #computations = new Map();

  register(name, deps, computeFn) {
    const compute = () => {
      const value = computeFn();
      State.set(`computed.${name}`, value, { persist: false });
      return value;
    };

    /* Subscribe to all dependencies */
    const unsubscribers = deps.map(dep =>
      State.subscribe(dep, () => compute())
    );

    /* Initial compute */
    compute();

    this.#computations.set(name, { compute, unsubscribers });
    return this;
  }

  unregister(name) {
    const comp = this.#computations.get(name);
    if (comp) {
      comp.unsubscribers.forEach(unsub => unsub());
      this.#computations.delete(name);
    }
  }

  get(name) {
    return State.get(`computed.${name}`);
  }
}

/* ============================================================
   6. MIDDLEWARE SYSTEM
   ============================================================ */
class MiddlewareSystem {
  #middlewares = [];

  use(fn) {
    this.#middlewares.push(fn);
    return this;
  }

  async run(action, payload) {
    let index = 0;
    const next = async (modifiedPayload) => {
      if (index < this.#middlewares.length) {
        const mw = this.#middlewares[index++];
        return await mw(action, modifiedPayload ?? payload, next);
      }
    };
    return await next(payload);
  }
}

/* ============================================================
   7. EVENT BUS (Cross-component communication)
   ============================================================ */
class EventBus {
  #handlers = new Map();

  on(event, handler) {
    if (!this.#handlers.has(event)) {
      this.#handlers.set(event, new Set());
    }
    this.#handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this.#handlers.get(event)?.delete(handler);
  }

  emit(event, data) {
    if (this.#handlers.has(event)) {
      for (const handler of this.#handlers.get(event)) {
        try { handler(data); }
        catch (err) { console.error(`[EventBus] Error in "${event}" handler:`, err); }
      }
    }
  }

  once(event, handler) {
    const wrapper = (data) => {
      handler(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
}

/* ============================================================
   8. INITIALIZE & EXPORT
   ============================================================ */

/* Create singleton instances */
const State       = new StateStore(INITIAL_STATE);
const Computed    = new ComputedState();
const Middleware  = new MiddlewareSystem();
const Bus         = new EventBus();

/* ----------------------------------------------------------
   Register Built-in Computed Values
---------------------------------------------------------- */
Computed
  .register(
    'tasksByStatus',
    ['tasks.items', 'tasks.filtered'],
    () => ({
      todo:       Actions.tasks.getByStatus('todo'),
      inprogress: Actions.tasks.getByStatus('inprogress'),
      review:     Actions.tasks.getByStatus('review'),
      done:       Actions.tasks.getByStatus('done'),
    })
  )
  .register(
    'overdueTasks',
    ['tasks.items'],
    () => {
      const now = new Date();
      return State.get('tasks.items').filter(t =>
        t.dueDate &&
        t.status !== 'done' &&
        new Date(t.dueDate) < now
      );
    }
  )
  .register(
    'completionRate',
    ['tasks.items'],
    () => {
      const items = State.get('tasks.items');
      if (!items.length) return 0;
      const done = items.filter(t => t.status === 'done').length;
      return Math.round((done / items.length) * 100);
    }
  )
  .register(
    'notesByFolder',
    ['notes.items'],
    () => {
      const notes = State.get('notes.items');
      return notes.reduce((acc, note) => {
        const folder = note.folder ?? 'general';
        acc[folder] = (acc[folder] ?? []);
        acc[folder].push(note);
        return acc;
      }, {});
    }
  );

/* ----------------------------------------------------------
   Register Built-in Middleware
---------------------------------------------------------- */
Middleware
  /* Logging middleware (dev only) */
  .use(async (action, payload, next) => {
    if (window.location.hostname === 'localhost') {
      console.log(`%c[Middleware] → ${action}`, 'color:#48dbfb;', payload);
    }
    const result = await next(payload);
    return result;
  })
  /* Autosave trigger middleware */
  .use(async (action, payload, next) => {
    const result = await next(payload);
    if (['saveNote', 'saveTask'].includes(action)) {
      Actions.autosave.setSaving();
    }
    return result;
  });

/* ----------------------------------------------------------
   Register Built-in Event Bus Events
---------------------------------------------------------- */
Bus.on('tab:change', (tab) => {
  Actions.app.setActiveTab(tab);
});

Bus.on('note:save', ({ noteId, content, title }) => {
  Actions.notes.update(noteId, { content, title });
  Actions.autosave.setSaved();
});

Bus.on('task:move', ({ taskId, newStatus }) => {
  Actions.tasks.moveCard(taskId, newStatus);
});

Bus.on('pomodoro:complete', ({ phase }) => {
  const settings = State.get('pomodoro.settings');
  if (settings.notifyEnabled) {
    const msg = phase === 'work'
      ? '⏰ انتهت جلسة التركيز! وقت الاستراحة.'
      : '💪 انتهت الاستراحة! لنعود للعمل.';
    Bus.emit('notification:show', { title: 'بومودورو', body: msg });
  }
});

Bus.on('notification:show', ({ title, body, icon }) => {
  const permission = State.get('notifications.permission');
  if (permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: icon ?? '/icons/icon-192.png',
        dir:  'rtl',
        lang: 'ar',
        badge: '/icons/icon-72.png',
      });
    } catch (err) {
      console.warn('[Bus] Notification failed:', err);
    }
  }
});

Bus.on('online:restored', () => {
  Actions.app.setOnline(true);
  /* Trigger sync if queue has items */
  if (Actions.offlineQueue.hasItems()) {
    Bus.emit('sync:start');
  }
});

Bus.on('online:lost', () => {
  Actions.app.setOnline(false);
});

/* ----------------------------------------------------------
   Network Status Monitoring
---------------------------------------------------------- */
window.addEventListener('online',  () => Bus.emit('online:restored'));
window.addEventListener('offline', () => Bus.emit('online:lost'));

/* ----------------------------------------------------------
   Autosave Status → UI Sync
---------------------------------------------------------- */
State.subscribe('autosave.status', (status) => {
  const indicator = document.getElementById('autosaveIndicator');
  const icon      = document.getElementById('autosaveIcon');
  const text      = document.getElementById('autosaveText');
  if (!indicator) return;

  indicator.className = `autosave-indicator ${status}`;

  const map = {
    saving: { icon: 'fa-sync fa-spin', text: 'جاري الحفظ...' },
    saved:  { icon: 'fa-cloud-upload-alt', text: 'تم الحفظ' },
    error:  { icon: 'fa-exclamation-circle', text: 'خطأ في الحفظ' },
    idle:   { icon: 'fa-cloud', text: '' },
  };

  const cfg = map[status] ?? map.idle;
  if (icon) icon.innerHTML = `<i class="fas ${cfg.icon}"></i>`;
  if (text) text.textContent = cfg.text;
});

/* ----------------------------------------------------------
   Online Status → UI Sync
---------------------------------------------------------- */
State.subscribe('app.isOnline', (isOnline) => {
  const bar       = document.getElementById('onlineStatusBar');
  const dot       = document.getElementById('statusDot');
  const statusTxt = document.getElementById('statusText');
  const banner    = document.getElementById('offlineBanner');

  bar?.classList.toggle('offline', !isOnline);
  if (statusTxt) statusTxt.textContent = isOnline ? 'متصل' : 'غير متصل';
  banner?.classList.toggle('visible', !isOnline);
});

/* ----------------------------------------------------------
   Theme → Document Sync
---------------------------------------------------------- */
State.subscribe('app.theme', (theme) => {
  document.body.setAttribute('data-theme', theme);
  document.body.classList.toggle('dark-mode', theme === 'dark');
});

/* ----------------------------------------------------------
   Active Tab → Document Title Sync
---------------------------------------------------------- */
const TAB_TITLES = {
  dashboard: 'لوحة التحكم',
  calendar:  'التقويم',
  chat:      'المحادثة',
  tasks:     'المهام',
  notes:     'الملاحظات',
  canvas:    'التخطيط',
};

State.subscribe('app.activeTab', (tab) => {
  const title = TAB_TITLES[tab] ?? '';
  document.title = title ? `${title} — المدير` : 'المدير';
  document.getElementById('mobileTitle').textContent = title;
});

/* ----------------------------------------------------------
   Pomodoro Title Bar Update
---------------------------------------------------------- */
State.subscribe('pomodoro.timeLeft', () => {
  if (State.get('pomodoro.isRunning')) {
    const time  = Actions.pomodoro.formatTime();
    const phase = State.get('pomodoro.phase');
    const tab   = TAB_TITLES[State.get('app.activeTab')] ?? 'المدير';
    const phaseLabel = phase === 'work' ? '🍅' : phase === 'shortBreak' ? '☕' : '🌙';
    document.title = `${phaseLabel} ${time} — ${tab}`;
  }
});

/* ============================================================
   9. GLOBAL EXPORTS
   ============================================================ */
window.State      = State;
window.Actions    = Actions;
window.Selectors  = Selectors;
window.Computed   = Computed;
window.Middleware = Middleware;
window.Bus        = Bus;

/* Freeze exports in production */
if (window.location.hostname !== 'localhost') {
  Object.freeze(Selectors);
}

console.log(
  '%c[المدير] 🚀 State Management System Ready',
  'color:#6c63ff;font-weight:900;font-size:14px;'
);
