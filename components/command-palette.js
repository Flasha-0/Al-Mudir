/* ============================================================
   المدير — Command Palette Component v2.0.0
   لوحة أوامر سريعة: تنقل، بحث، إجراءات
   ============================================================ */

'use strict';

class CommandPaletteComponent {

  #selectedIdx = -1;
  #allItems    = [];
  #filtered    = [];
  #recentCmds  = [];
  #MAX_RECENT  = 5;

  /* ============================================================
     INIT
  ============================================================ */
  init() {
    this.#loadRecentCommands();
    this.#bindEvents();
    console.log('[CommandPalette] ✅ Initialized');
  }

  /* ============================================================
     BIND EVENTS
  ============================================================ */
  #bindEvents() {
    /* Ctrl+K */
    Shortcuts.register('ctrl+k', (e) => {
      e.preventDefault();
      this.#isOpen() ? this.close() : this.open();
    }, { global: true, description: 'لوحة الأوامر' });

    /* Search input */
    const input = DOM.id('cmdSearchInput');
    input?.addEventListener('input', Perf.debounce((e) => {
      this.#search(e.target.value.trim());
    }, 100));

    /* Keyboard nav */
    input?.addEventListener('keydown', (e) => this.#handleKeydown(e));

    /* Overlay click to close */
    DOM.id('cmdPaletteOverlay')?.addEventListener('click', (e) => {
      if (e.target === DOM.id('cmdPaletteOverlay')) this.close();
    });

    /* Results click */
    DOM.delegate(
      DOM.id('cmdResults'),
      '.cmd-item',
      'click',
      (e, item) => {
        const idx = parseInt(item.dataset.idx ?? '0');
        this.#execute(this.#filtered[idx]);
      }
    );
  }

  /* ============================================================
     OPEN
  ============================================================ */
  open() {
    const overlay = DOM.id('cmdPaletteOverlay');
    DOM.show(overlay, 'flex');
    Actions.ui.setCmdPaletteOpen(true);

    const input = DOM.id('cmdSearchInput');
    if (input) {
      input.value = '';
      DOM.focus(input);
    }

    this.#selectedIdx = -1;
    this.#buildAllItems();
    this.#search('');
  }

  /* ============================================================
     CLOSE
  ============================================================ */
  close() {
    DOM.hide(DOM.id('cmdPaletteOverlay'));
    Actions.ui.setCmdPaletteOpen(false);
    this.#selectedIdx = -1;
  }

  #isOpen() {
    return State.get('ui.cmdPaletteOpen');
  }

  /* ============================================================
     BUILD ALL ITEMS (commands + data)
  ============================================================ */
  #buildAllItems() {
    this.#allItems = [
      /* Navigation */
      ...this.#navItems(),
      /* Actions */
      ...this.#actionItems(),
      /* Tasks */
      ...this.#taskItems(),
      /* Notes */
      ...this.#noteItems(),
      /* Settings */
      ...this.#settingItems(),
    ];
  }

  /* ============================================================
     ITEM BUILDERS
  ============================================================ */
  #navItems() {
    return [
      { group:'nav', title:'لوحة التحكم',  desc:'الانتقال إلى الداشبورد',  icon:'fas fa-chart-pie',         shortcut:'Ctrl+1', action:()=>App.navigateTo('dashboard') },
      { group:'nav', title:'التقويم',       desc:'الانتقال إلى التقويم',    icon:'fas fa-calendar-alt',       shortcut:'Ctrl+2', action:()=>App.navigateTo('calendar') },
      { group:'nav', title:'المحادثة',      desc:'الانتقال إلى الشات',       icon:'fas fa-robot',              shortcut:'Ctrl+3', action:()=>App.navigateTo('chat') },
      { group:'nav', title:'المهام',        desc:'الانتقال إلى الكانبان',    icon:'fas fa-columns',            shortcut:'Ctrl+4', action:()=>App.navigateTo('tasks') },
      { group:'nav', title:'الملاحظات',    desc:'الانتقال إلى الملاحظات',  icon:'fas fa-scroll',             shortcut:'Ctrl+5', action:()=>App.navigateTo('notes') },
      { group:'nav', title:'التخطيط',      desc:'الانتقال إلى Excalidraw',  icon:'fas fa-drafting-compass',   shortcut:'Ctrl+6', action:()=>App.navigateTo('canvas') },
    ];
  }

  #actionItems() {
    return [
      { group:'actions', title:'إضافة مهمة جديدة',     icon:'fas fa-plus-circle',       shortcut:'Ctrl+N', action:()=>App.openTaskModal() },
      { group:'actions', title:'إضافة ملاحظة جديدة',   icon:'fas fa-edit',              shortcut:'Ctrl+N', action:()=>App.openNoteModal() },
      { group:'actions', title:'إضافة تذكير',           icon:'fas fa-bell',              action:()=>App.openReminderModal() },
      { group:'actions', title:'تصدير البيانات',        icon:'fas fa-file-export',       action:()=>API.exportData() },
      { group:'actions', title:'تحديث البيانات',        icon:'fas fa-sync-alt',          action:()=>API.refreshAll() },
      { group:'actions', title:'مزامنة يدوية',          icon:'fas fa-cloud-upload-alt',  action:()=>API.syncOfflineQueue() },
      { group:'actions', title:'وضع التركيز Zen',       icon:'fas fa-expand-arrows-alt', shortcut:'F11',    action:()=>{ App.navigateTo('notes'); Actions.notes.setZenMode(true); } },
      { group:'actions', title:'تشغيل/إيقاف بومودورو',  icon:'fas fa-clock',            action:()=>{ const r=State.get('pomodoro.isRunning'); r ? window.PomodoroComponent?.pause?.() : window.PomodoroComponent?.start?.(); } },
      { group:'actions', title:'مسح المحادثة',          icon:'fas fa-trash-alt',         action:()=>Actions.chat.clearMessages() },
    ];
  }

  #taskItems() {
    return Selectors.getAllTasks().slice(0, 8).map(t => ({
      group:  'tasks',
      title:   t.title,
      desc:   `${t.status} · ${t.priority} ${t.dueDate ? '· ' + DateUtils.relative(t.dueDate) : ''}`,
      icon:   'fas fa-tasks',
      meta:    t,
      action: () => {
        App.navigateTo('tasks');
        setTimeout(() => window.KanbanComponent?.openCardDetail?.(t.id), 300);
      },
    }));
  }

  #noteItems() {
    return Selectors.getAllNotes().slice(0, 6).map(n => ({
      group:  'notes',
      title:   n.title,
      desc:    StringUtils.truncate(StringUtils.stripMarkdown(n.content), 60),
      icon:   'fas fa-scroll',
      meta:    n,
      action: () => {
        App.navigateTo('notes');
        setTimeout(() => window.NotesComponent?.openNote?.(n.id), 300);
      },
    }));
  }

  #settingItems() {
    return [
      { group:'settings', title:'تبديل المظهر (داكن/فاتح)', icon:'fas fa-moon',     action:()=>Actions.app.setTheme(State.get('app.theme')==='dark'?'light':'dark') },
      { group:'settings', title:'الإعدادات',                 icon:'fas fa-sliders-h', action:()=>Modal.open('settingsModalOverlay') },
      { group:'settings', title:'اختصارات لوحة المفاتيح',    icon:'fas fa-keyboard',  action:()=>Modal.open('shortcutsModalOverlay') },
      { group:'settings', title:'إعدادات بومودورو',          icon:'fas fa-clock',     action:()=>Modal.open('pomodoroSettingsOverlay') },
    ];
  }

  /* ============================================================
     SEARCH & FILTER
  ============================================================ */
  #search(query) {
    this.#selectedIdx = -1;

    if (!query) {
      /* Show recent + quick nav */
      this.#filtered = [
        ...this.#getRecentItems(),
        ...this.#allItems.filter(i => i.group === 'nav').slice(0, 6),
        ...this.#allItems.filter(i => i.group === 'actions').slice(0, 5),
      ];
    } else {
      /* Score and sort */
      this.#filtered = this.#allItems
        .map(item => ({
          item,
          score: Math.max(
            StringUtils.matchScore(query, item.title),
            StringUtils.matchScore(query, item.desc ?? ''),
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item)
        .slice(0, 12);
    }

    this.#render(query);
  }

  /* ============================================================
     RENDER RESULTS
  ============================================================ */
  #render(query = '') {
    const container = DOM.id('cmdResults');
    if (!container) return;

    DOM.empty(container);

    if (!this.#filtered.length) {
      container.innerHTML = `
        <div class="cmd-no-results">
          <i class="fas fa-search"></i>
          <p>لا توجد نتائج لـ "<strong>${StringUtils.escapeHTML(query)}</strong>"</p>
          <p style="font-size:12px;margin-top:8px;color:var(--text-muted);">
            جرّب كلمات مختلفة أو استخدم إجراء مباشر
          </p>
        </div>
      `;
      return;
    }

    /* Group items */
    const groupOrder  = ['recent', 'nav', 'actions', 'tasks', 'notes', 'settings'];
    const groupLabels = {
      recent:   '🕐 الأوامر الأخيرة',
      nav:      '📍 تنقل',
      actions:  '⚡ إجراءات',
      tasks:    '📋 المهام',
      notes:    '📝 الملاحظات',
      settings: '⚙️ الإعدادات',
    };

    const groups = {};
    this.#filtered.forEach((item, idx) => {
      const g = item.group ?? 'actions';
      groups[g] = groups[g] ?? [];
      groups[g].push({ item, idx });
    });

    const fragment = document.createDocumentFragment();

    for (const groupKey of groupOrder) {
      if (!groups[groupKey]?.length) continue;

      const groupEl = DOM.create('div', { class: 'cmd-group' });
      groupEl.innerHTML = `
        <div class="cmd-group-label">${groupLabels[groupKey] ?? groupKey}</div>
      `;

      for (const { item, idx } of groups[groupKey]) {
        const itemEl = this.#buildItem(item, idx, query);
        groupEl.appendChild(itemEl);
      }

      fragment.appendChild(groupEl);
    }

    container.appendChild(fragment);

    /* Auto-select first */
    if (this.#filtered.length > 0) {
      this.#selectItem(0);
    }
  }

  /* ============================================================
     BUILD ITEM ELEMENT
  ============================================================ */
  #buildItem(item, idx, query) {
    const el = DOM.create('div', {
      class:      'cmd-item',
      role:       'option',
      tabindex:   '-1',
      'data-idx': idx,
      'aria-selected': 'false',
    });

    const titleHTML = query
      ? StringUtils.highlight(
          StringUtils.escapeHTML(item.title),
          query
        )
      : StringUtils.escapeHTML(item.title);

    el.innerHTML = `
      <div class="cmd-item-icon">
        <i class="${item.icon ?? 'fas fa-circle'}"></i>
      </div>
      <div class="cmd-item-info">
        <div class="cmd-item-title">${titleHTML}</div>
        ${item.desc
          ? `<div class="cmd-item-desc">${StringUtils.escapeHTML(item.desc)}</div>`
          : ''}
      </div>
      ${item.shortcut
        ? `<div class="cmd-item-shortcut"><kbd>${item.shortcut}</kbd></div>`
        : ''}
    `;

    return el;
  }

  /* ============================================================
     KEYBOARD NAVIGATION
  ============================================================ */
  #handleKeydown(e) {
    const items = DOM.$$('.cmd-item');
    if (!items.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.#selectItem(Math.min(this.#selectedIdx + 1, items.length - 1));
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.#selectItem(Math.max(this.#selectedIdx - 1, 0));
        break;

      case 'Enter':
        e.preventDefault();
        if (this.#selectedIdx >= 0) {
          this.#execute(this.#filtered[this.#selectedIdx]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        this.close();
        break;

      case 'Tab':
        e.preventDefault();
        const next = e.shiftKey
          ? Math.max(this.#selectedIdx - 1, 0)
          : Math.min(this.#selectedIdx + 1, items.length - 1);
        this.#selectItem(next);
        break;
    }
  }

  /* ============================================================
     SELECT ITEM (highlight)
  ============================================================ */
  #selectItem(idx) {
    const items = DOM.$$('.cmd-item');
    if (!items.length) return;

    /* Clamp */
    idx = Math.max(0, Math.min(idx, items.length - 1));

    items.forEach((el, i) => {
      const active = i === idx;
      el.classList.toggle('active', active);
      el.setAttribute('aria-selected', active);
    });

    /* Scroll into view */
    items[idx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    this.#selectedIdx = idx;
  }

  /* ============================================================
     EXECUTE COMMAND
  ============================================================ */
  #execute(item) {
    if (!item) return;

    /* Save to recent */
    this.#addToRecent(item);

    this.close();

    /* Small delay so close animation completes */
    setTimeout(() => item.action?.(), 50);
  }

  /* ============================================================
     RECENT COMMANDS
  ============================================================ */
  #addToRecent(item) {
    const existing = this.#recentCmds.findIndex(r => r.title === item.title);
    if (existing !== -1) this.#recentCmds.splice(existing, 1);

    this.#recentCmds.unshift({
      ...item,
      group:     'recent',
      usedAt:    Date.now(),
    });

    if (this.#recentCmds.length > this.#MAX_RECENT) {
      this.#recentCmds = this.#recentCmds.slice(0, this.#MAX_RECENT);
    }

    Storage.set('recentCommands', this.#recentCmds.map(r => ({
      title:   r.title,
      desc:    r.desc,
      icon:    r.icon,
      group:   r.group,
      usedAt:  r.usedAt,
    })));
  }

  #getRecentItems() {
    return this.#recentCmds.map(r => {
      /* Re-attach action from allItems */
      const original = this.#allItems.find(i => i.title === r.title);
      return original
        ? { ...r, action: original.action, group: 'recent' }
        : null;
    }).filter(Boolean);
  }

  #loadRecentCommands() {
    this.#recentCmds = Storage.get('recentCommands', []);
  }
}

/* ---- Singleton Export ---- */
window.CommandPaletteComponent = new CommandPaletteComponent();