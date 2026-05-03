/* ============================================================
   المدير — Ultimate Productivity Workspace
   app.js | Main Application Controller v2.0.0

   الملف الرئيسي الذي يجمع ويشغّل جميع مكونات التطبيق:
   - تهيئة الـ App
   - ربط الأحداث (Event Binding)
   - التنقل بين الأقسام
   - FAB & Command Palette
   - Kanban Board
   - تهيئة الـ Sidebar
   ============================================================ */

'use strict';

/* ============================================================
   1. APP CONTROLLER CLASS
   ============================================================ */
class AppController {

  #initialized   = false;
  #tabComponents = new Map();
  #resizeObserver = null;
  #mutationObserver = null;

  /* ============================================================
     INIT
  ============================================================ */
  async init() {
    if (this.#initialized) return;

    console.log(
      '%c[App] 🚀 Initializing المدير v2.0.0...',
      'color:#6c63ff;font-weight:900;font-size:16px;'
    );

    try {
      /* 1. Apply persisted settings */
      this.#applySettings();

      /* 2. Setup global UI bindings */
      this.#bindSidebar();
      this.#bindTabs();
      this.#bindFAB();
      this.#bindModals();
      this.#bindCommandPalette();
      this.#bindGlobalShortcuts();
      this.#bindMobileUI();
      this.#bindFooterActions();
      this.#bindConfirmModal();
      this.#bindSettingsModal();
      this.#bindThemeToggle();
      this.#bindDataActions();
      this.#bindSectionLinks();

      /* 3. Initialize components */
      await this.#initComponents();

      /* 4. Load initial data */
      await this.#loadInitialData();

      /* 5. Setup observers */
      this.#setupResizeObserver();
      this.#setupFocusTrap();

      /* 6. Mark as initialized */
      this.#initialized = true;
      Actions.app.setInitialized();

      /* 7. Hide splash */
      await this.#hideSplash();

      /* 8. Navigate to last active tab */
      const lastTab = State.get('app.activeTab') ?? 'dashboard';
      this.navigateTo(lastTab);

      /* 9. Request notification permission if needed */
      Perf.idle(() => this.#checkNotificationPermission());

      /* 10. Schedule reminder checks */
      Perf.idle(() => this.#scheduleExistingReminders());

      console.log(
        '%c[App] ✅ Initialized successfully!',
        'color:#55efc4;font-weight:700;'
      );

    } catch (err) {
      console.error('[App] ❌ Initialization failed:', err);
      Toast.error('خطأ في التهيئة', err.message, { duration: 0 });
    }
  }

  /* ============================================================
     2. APPLY SETTINGS FROM STATE
  ============================================================ */
  #applySettings() {
    const theme   = State.get('app.theme')       ?? 'dark';
    const accent  = State.get('app.accentColor') ?? '#6c63ff';
    const size    = State.get('app.fontSize')    ?? 16;
    const collapsed = State.get('app.sidebarCollapsed') ?? false;

    Actions.app.setTheme(theme);
    Actions.app.setAccentColor(accent);
    Actions.app.setFontSize(size);
    Actions.app.setSidebarCollapsed(collapsed);

    /* Dark mode checkbox sync */
    const dmCheck = DOM.id('settingDarkMode');
    if (dmCheck) dmCheck.checked = theme === 'dark';

    /* Font size select sync */
    const fsSelect = DOM.id('settingFontSize');
    if (fsSelect) fsSelect.value = String(size);

    /* Accent color dots sync */
    DOM.$$('.accent-dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.accent === accent);
    });
  }

  /* ============================================================
     3. SPLASH SCREEN
  ============================================================ */
  async #hideSplash() {
    const splash = DOM.id('splash-screen');
    const app    = DOM.id('app');

    if (!splash) return;

    /* Show app shell first */
    app.style.display = 'flex';

    await new Promise(resolve => setTimeout(resolve, 1800));

    splash.style.opacity    = '0';
    splash.style.transition = 'opacity 0.5s ease';

    setTimeout(() => {
      DOM.hide(splash);
      splash.style.display = 'none';
    }, 500);
  }

  /* ============================================================
     4. TAB NAVIGATION
  ============================================================ */
  navigateTo(tabName) {
    /* Update nav buttons */
    DOM.$$('.nav-btn').forEach(btn => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive);
    });

    /* Update tab panels */
    DOM.$$('.tab-panel').forEach(panel => {
      const isActive = panel.id === `tab-${tabName}`;
      panel.classList.toggle('active', isActive);
    });

    /* Update state */
    Actions.app.setActiveTab(tabName);

    /* Component-specific on-activate hooks */
    this.#onTabActivate(tabName);

    /* Mobile: close sidebar overlay */
    this.#closeMobileSidebar();
  }

  #onTabActivate(tabName) {
    switch (tabName) {
      case 'dashboard':
        window.DashboardComponent?.refresh?.();
        break;
      case 'calendar':
        window.CalendarComponent?.render?.();
        break;
      case 'tasks':
        window.KanbanComponent?.render?.();
        break;
      case 'notes':
        window.NotesComponent?.refresh?.();
        break;
      case 'canvas':
        this.#loadExcalidraw();
        break;
      case 'chat':
        DOM.scrollToBottom(DOM.id('chatMessages'));
        DOM.focus(DOM.id('chatInput'));
        break;
    }
  }

  /* ============================================================
     5. SIDEBAR BINDINGS
  ============================================================ */
  #bindSidebar() {
    /* Toggle collapse */
    DOM.id('sidebarToggle')?.addEventListener('click', () => {
      const collapsed = !State.get('app.sidebarCollapsed');
      Actions.app.setSidebarCollapsed(collapsed);

      /* Update toggle icon */
      const icon = DOM.$('#sidebarToggle i');
      if (icon) {
        icon.style.transition = 'transform 0.3s ease';
      }
    });

    /* Nav buttons */
    DOM.$$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab) this.navigateTo(tab);
      });

      /* Tooltip for collapsed sidebar */
      const label = btn.querySelector('.nav-label')?.textContent ?? '';
      btn.setAttribute('data-tooltip', label);
      btn.setAttribute('title', label);
    });

    /* Sidebar labels toggle from settings */
    State.subscribe('app.sidebarLabels', (show) => {
      DOM.$$('.nav-label').forEach(el =>
        el.style.display = show ? '' : 'none'
      );
    });
  }

  /* ============================================================
     6. TAB BINDINGS
  ============================================================ */
  #bindTabs() {
    /* Keyboard: Ctrl+1 to Ctrl+6 */
    const tabs = ['dashboard', 'calendar', 'chat', 'tasks', 'notes', 'canvas'];
    tabs.forEach((tab, i) => {
      Shortcuts.register(`ctrl+${i + 1}`, () => this.navigateTo(tab), {
        description: `الانتقال إلى ${tab}`,
        global: true,
      });
    });

    /* Section links (dashboard → tasks, etc.) */
    DOM.delegate(document, '[data-goto]', 'click', (e, el) => {
      const target = el.dataset.goto;
      if (target) this.navigateTo(target);
    });
  }

  /* ============================================================
     7. MOBILE UI
  ============================================================ */
  #bindMobileUI() {
    /* Hamburger menu */
    DOM.id('mobileMenuBtn')?.addEventListener('click', () => {
      this.#toggleMobileSidebar();
    });

    /* Overlay click */
    DOM.id('sidebarOverlay')?.addEventListener('click', () => {
      this.#closeMobileSidebar();
    });

    /* Mobile cmd palette */
    DOM.id('mobileCmdBtn')?.addEventListener('click', () => {
      this.#openCommandPalette();
    });
  }

  #toggleMobileSidebar() {
    const sidebar  = DOM.id('sidebar');
    const overlay  = DOM.id('sidebarOverlay');
    const isOpen   = sidebar?.classList.contains('mobile-open');

    sidebar?.classList.toggle('mobile-open', !isOpen);
    overlay?.classList.toggle('active', !isOpen);
  }

  #closeMobileSidebar() {
    DOM.id('sidebar')?.classList.remove('mobile-open');
    DOM.id('sidebarOverlay')?.classList.remove('active');
  }

  /* ============================================================
     8. FLOATING ACTION BUTTON (FAB)
  ============================================================ */
  #bindFAB() {
    const fabMain = DOM.id('fabMain');
    const fabMenu = DOM.id('fabMenu');

    /* Toggle FAB menu */
    fabMain?.addEventListener('click', () => {
      const isOpen = !State.get('ui.fabOpen');
      Actions.ui.setFabOpen(isOpen);
      fabMenu?.classList.toggle('open', isOpen);
      fabMain.setAttribute('aria-expanded', isOpen);
      fabMain.classList.toggle('open', isOpen);

      const icon = DOM.id('fabIcon');
      if (icon) {
        icon.className = isOpen ? 'fas fa-times' : 'fas fa-plus';
      }
    });

    /* Close FAB when clicking outside */
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.fab-container') && State.get('ui.fabOpen')) {
        Actions.ui.setFabOpen(false);
        fabMenu?.classList.remove('open');
        fabMain?.classList.remove('open');
        fabMain?.setAttribute('aria-expanded', 'false');
        const icon = DOM.id('fabIcon');
        if (icon) icon.className = 'fas fa-plus';
      }
    });

    /* FAB actions */
    DOM.id('fabAddTask')?.addEventListener('click', () => {
      this.#closeFAB();
      this.openTaskModal();
    });

    DOM.id('fabAddNote')?.addEventListener('click', () => {
      this.#closeFAB();
      this.openNoteModal();
    });

    DOM.id('fabAddReminder')?.addEventListener('click', () => {
      this.#closeFAB();
      this.openReminderModal();
    });

    DOM.id('fabOpenChat')?.addEventListener('click', () => {
      this.#closeFAB();
      this.navigateTo('chat');
      DOM.focus(DOM.id('chatInput'));
    });
  }

  #closeFAB() {
    const fabMain = DOM.id('fabMain');
    const fabMenu = DOM.id('fabMenu');
    Actions.ui.setFabOpen(false);
    fabMenu?.classList.remove('open');
    fabMain?.classList.remove('open');
    fabMain?.setAttribute('aria-expanded', 'false');
    const icon = DOM.id('fabIcon');
    if (icon) icon.className = 'fas fa-plus';
  }

  /* ============================================================
     9. COMMAND PALETTE (Ctrl+K)
  ============================================================ */
  #bindCommandPalette() {
    /* Open shortcut */
    Shortcuts.register('ctrl+k', (e) => {
      e.preventDefault();
      this.#openCommandPalette();
    }, { global: true, description: 'فتح لوحة الأوامر' });

    /* Search input */
    const input = DOM.id('cmdSearchInput');
    input?.addEventListener('input', Perf.debounce((e) => {
      this.#renderCmdResults(e.target.value.trim());
    }, 150));

    /* Keyboard navigation */
    input?.addEventListener('keydown', (e) => {
      const results = DOM.$$('.cmd-item');
      const active  = DOM.$('.cmd-item.active');
      let   idx     = active ? [...results].indexOf(active) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        idx = Math.min(idx + 1, results.length - 1);
        results.forEach((r, i) => r.classList.toggle('active', i === idx));
        results[idx]?.scrollIntoView({ block: 'nearest' });

      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
        results.forEach((r, i) => r.classList.toggle('active', i === idx));
        results[idx]?.scrollIntoView({ block: 'nearest' });

      } else if (e.key === 'Enter') {
        e.preventDefault();
        const activeItem = DOM.$('.cmd-item.active');
        activeItem?.click();
      }
    });

    /* Close on overlay click */
    DOM.id('cmdPaletteOverlay')?.addEventListener('click', (e) => {
      if (e.target === DOM.id('cmdPaletteOverlay')) {
        this.#closeCommandPalette();
      }
    });
  }

  #openCommandPalette() {
    const overlay = DOM.id('cmdPaletteOverlay');
    DOM.show(overlay, 'flex');
    Actions.ui.setCmdPaletteOpen(true);

    const input = DOM.id('cmdSearchInput');
    if (input) {
      input.value = '';
      DOM.focus(input);
    }

    this.#renderCmdResults('');
  }

  #closeCommandPalette() {
    DOM.hide(DOM.id('cmdPaletteOverlay'));
    Actions.ui.setCmdPaletteOpen(false);
  }

  #renderCmdResults(query = '') {
    const container = DOM.id('cmdResults');
    if (!container) return;

    DOM.empty(container);

    const groups = this.#buildCmdGroups(query);

    if (groups.length === 0) {
      container.innerHTML = `
        <div class="cmd-no-results">
          <i class="fas fa-search"></i>
          <p>لا توجد نتائج لـ "${StringUtils.escapeHTML(query)}"</p>
        </div>
      `;
      return;
    }

    for (const group of groups) {
      if (!group.items.length) continue;

      const groupEl = DOM.create('div', { class: 'cmd-group' });
      groupEl.innerHTML = `
        <div class="cmd-group-label">${group.label}</div>
      `;

      for (const item of group.items) {
        const itemEl = DOM.create('div', {
          class: 'cmd-item',
          role:  'option',
          tabindex: '-1',
        });

        itemEl.innerHTML = `
          <div class="cmd-item-icon"><i class="${item.icon}"></i></div>
          <div class="cmd-item-info">
            <div class="cmd-item-title">${
              query
                ? StringUtils.highlight(item.title, query)
                : StringUtils.escapeHTML(item.title)
            }</div>
            ${item.desc
              ? `<div class="cmd-item-desc">${StringUtils.escapeHTML(item.desc)}</div>`
              : ''}
          </div>
          ${item.shortcut
            ? `<span class="cmd-item-shortcut"><kbd>${item.shortcut}</kbd></span>`
            : ''}
        `;

        itemEl.addEventListener('click', () => {
          this.#closeCommandPalette();
          item.action?.();
        });

        groupEl.appendChild(itemEl);
      }

      container.appendChild(groupEl);
    }

    /* Auto-select first item */
    DOM.$('.cmd-item')?.classList.add('active');
  }

  #buildCmdGroups(query = '') {
    const q      = query.toLowerCase();
    const filter = (items) => !q
      ? items
      : items.filter(item =>
          StringUtils.matchScore(q, item.title) > 0 ||
          StringUtils.matchScore(q, item.desc ?? '') > 0
        ).sort((a, b) =>
          StringUtils.matchScore(q, b.title) - StringUtils.matchScore(q, a.title)
        );

    /* Navigation group */
    const navItems = filter([
      { title: 'لوحة التحكم',  desc: 'الانتقال إلى الداشبورد',  icon: 'fas fa-chart-pie',          shortcut: 'Ctrl+1', action: () => this.navigateTo('dashboard') },
      { title: 'التقويم',       desc: 'الانتقال إلى التقويم',    icon: 'fas fa-calendar-alt',        shortcut: 'Ctrl+2', action: () => this.navigateTo('calendar') },
      { title: 'المحادثة',      desc: 'الانتقال إلى الشات',       icon: 'fas fa-robot',               shortcut: 'Ctrl+3', action: () => this.navigateTo('chat') },
      { title: 'المهام',        desc: 'الانتقال إلى كانبان',      icon: 'fas fa-columns',             shortcut: 'Ctrl+4', action: () => this.navigateTo('tasks') },
      { title: 'الملاحظات',    desc: 'الانتقال إلى الملاحظات',  icon: 'fas fa-scroll',              shortcut: 'Ctrl+5', action: () => this.navigateTo('notes') },
      { title: 'التخطيط',      desc: 'الانتقال إلى Excalidraw',  icon: 'fas fa-drafting-compass',    shortcut: 'Ctrl+6', action: () => this.navigateTo('canvas') },
    ]);

    /* Actions group */
    const actionItems = filter([
      { title: 'إضافة مهمة جديدة',    icon: 'fas fa-plus-circle',      action: () => this.openTaskModal() },
      { title: 'إضافة ملاحظة جديدة',  icon: 'fas fa-edit',             action: () => this.openNoteModal() },
      { title: 'إضافة تذكير',          icon: 'fas fa-bell',             action: () => this.openReminderModal() },
      { title: 'تصدير البيانات',        icon: 'fas fa-file-export',      action: () => API.exportData() },
      { title: 'تحديث البيانات',        icon: 'fas fa-sync-alt',         action: () => API.refreshAll() },
      { title: 'مزامنة يدوية',          icon: 'fas fa-cloud-upload-alt', action: () => API.syncOfflineQueue() },
      { title: 'وضع التركيز (Zen)',     icon: 'fas fa-expand-arrows-alt',action: () => { this.navigateTo('notes'); Actions.notes.setZenMode(true); } },
      { title: 'إعدادات بومودورو',      icon: 'fas fa-clock',            action: () => Modal.open('pomodoroSettingsOverlay') },
      { title: 'الإعدادات',             icon: 'fas fa-sliders-h',        action: () => Modal.open('settingsModalOverlay') },
      { title: 'اختصارات لوحة المفاتيح',icon: 'fas fa-keyboard',        action: () => Modal.open('shortcutsModalOverlay') },
    ]);

    /* Tasks group (from state) */
    const allTasks    = Selectors.getAllTasks().slice(0, 5);
    const taskItems   = filter(allTasks.map(t => ({
      title:  t.title,
      desc:   `${t.status} · ${t.priority}`,
      icon:   'fas fa-tasks',
      action: () => {
        this.navigateTo('tasks');
        window.KanbanComponent?.openCardDetail?.(t.id);
      },
    })));

    /* Notes group (from state) */
    const allNotes    = Selectors.getAllNotes().slice(0, 5);
    const noteItems   = filter(allNotes.map(n => ({
      title:  n.title,
      desc:   StringUtils.truncate(StringUtils.stripMarkdown(n.content), 60),
      icon:   'fas fa-scroll',
      action: () => {
        this.navigateTo('notes');
        window.NotesComponent?.openNote?.(n.id);
      },
    })));

    return [
      { label: '📍 تنقل',    items: navItems    },
      { label: '⚡ إجراءات', items: actionItems },
      { label: '📋 المهام',  items: taskItems   },
      { label: '📝 الملاحظات', items: noteItems },
    ].filter(g => g.items.length > 0);
  }

  /* ============================================================
     10. MODALS BINDING
  ============================================================ */
  #bindModals() {
    /* ---- Task Modal ---- */
    DOM.id('taskModalClose')?.addEventListener('click',  () => this.closeTaskModal());
    DOM.id('taskModalCancel')?.addEventListener('click', () => this.closeTaskModal());
    DOM.id('taskModalSave')?.addEventListener('click',   () => this.saveTask());
    DOM.id('addTaskBtnMain')?.addEventListener('click',  () => this.openTaskModal());

    /* Column add buttons */
    DOM.delegate(document, '.column-add-btn', 'click', (e, btn) => {
      this.openTaskModal({ status: btn.dataset.status ?? 'todo' });
    });

    /* Subtask add */
    DOM.id('addSubtaskBtn')?.addEventListener('click', () => this.#addSubtaskInput());

    /* Task tags */
    DOM.id('taskTagInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = e.target.value.trim();
        if (val) this.#addTaskTag(val);
        e.target.value = '';
      }
    });

    /* Color picker */
    DOM.delegate(document, '.color-dot', 'click', (e, dot) => {
      const picker = dot.closest('#taskColorPicker');
      if (!picker) return;
      picker.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });

    /* Click outside */
    Modal.setupOutsideClick('taskModalOverlay', () => this.closeTaskModal());

    /* ---- Note Modal ---- */
    DOM.id('noteModalClose')?.addEventListener('click',  () => this.closeNoteModal());
    DOM.id('noteModalCancel')?.addEventListener('click', () => this.closeNoteModal());
    DOM.id('noteModalSave')?.addEventListener('click',   () => this.saveNoteFromModal());
    DOM.id('addNoteBtn')?.addEventListener('click',      () => this.openNoteModal());
    DOM.id('createFirstNoteBtn')?.addEventListener('click', () => this.openNoteModal());
    Modal.setupOutsideClick('noteModalOverlay', () => this.closeNoteModal());

    /* ---- Reminder Modal ---- */
    DOM.id('reminderModalClose')?.addEventListener('click',  () => this.closeReminderModal());
    DOM.id('reminderModalCancel')?.addEventListener('click', () => this.closeReminderModal());
    DOM.id('reminderModalSave')?.addEventListener('click',   () => this.saveReminder());
    DOM.id('addEventBtn')?.addEventListener('click',         () => this.openReminderModal());
    Modal.setupOutsideClick('reminderModalOverlay', () => this.closeReminderModal());

    /* ---- Shortcuts Modal ---- */
    DOM.id('shortcutsBtn')?.addEventListener('click',  () => Modal.open('shortcutsModalOverlay'));
    DOM.id('shortcutsModalOk')?.addEventListener('click', () => Modal.close('shortcutsModalOverlay'));
    DOM.id('shortcutsModalClose')?.addEventListener('click', () => Modal.close('shortcutsModalOverlay'));

    /* ---- Task Detail Modal ---- */
    DOM.id('taskDetailClose')?.addEventListener('click', () => Modal.close('taskDetailOverlay'));
    DOM.id('editTaskDetailBtn')?.addEventListener('click', () => {
      const taskId = State.get('ui.editingTaskId');
      Modal.close('taskDetailOverlay');
      if (taskId) this.openTaskModal({ taskId });
    });

    /* ---- Pomodoro Settings ---- */
    DOM.id('pomodoroSettingsBtn')?.addEventListener('click',   () => Modal.open('pomodoroSettingsOverlay'));
    DOM.id('pomodoroSettingsClose')?.addEventListener('click', () => Modal.close('pomodoroSettingsOverlay'));
    DOM.id('pomodoroSettingsCancel')?.addEventListener('click',() => Modal.close('pomodoroSettingsOverlay'));
    DOM.id('pomodoroSettingsSave')?.addEventListener('click',  () => {
      window.PomodoroComponent?.saveSettings?.();
      Modal.close('pomodoroSettingsOverlay');
    });
  }

  /* ============================================================
     11. TASK MODAL LOGIC
  ============================================================ */
  openTaskModal(options = {}) {
    const { taskId = null, status = 'todo' } = options;

    /* Reset form */
    this.#resetTaskForm();

    /* Set default status */
    const statusSelect = DOM.id('taskStatus');
    if (statusSelect) statusSelect.value = status;

    /* Edit mode */
    if (taskId) {
      const task = Selectors.getTaskById(taskId);
      if (task) {
        this.#populateTaskForm(task);
        DOM.setText(DOM.id('taskModalTitle'), '✏️ تعديل المهمة');
      }
      Actions.ui.setEditingTask(taskId);
    } else {
      DOM.setText(DOM.id('taskModalTitle'), '✨ إضافة مهمة جديدة');
      Actions.ui.setEditingTask(null);
    }

    Modal.open('taskModalOverlay');
    DOM.focus(DOM.id('taskTitle'));
  }

  closeTaskModal() {
    Modal.close('taskModalOverlay');
    this.#resetTaskForm();
  }

  #resetTaskForm() {
    const form = DOM.id('taskForm');
    if (form) form.reset();

    DOM.id('taskId').value  = '';
    DOM.empty(DOM.id('subtaskList'));
    DOM.empty(DOM.id('taskTagsDisplay'));

    /* Reset color picker */
    DOM.$$('#taskColorPicker .color-dot').forEach((d, i) => {
      d.classList.toggle('active', i === 0);
    });
  }

  #populateTaskForm(task) {
    DOM.id('taskId').value         = task.id;
    DOM.id('taskTitle').value      = task.title       ?? '';
    DOM.id('taskDescription').value = task.description ?? '';
    DOM.id('taskPriority').value   = task.priority    ?? 'medium';
    DOM.id('taskStatus').value     = task.status      ?? 'todo';
    DOM.id('taskEstimate').value   = task.estimate    ?? '';

    if (task.dueDate) {
      DOM.id('taskDueDate').value = DateUtils.toInputFormat(task.dueDate);
    }

    /* Tags */
    (task.tags ?? []).forEach(tag => this.#addTaskTag(tag));

    /* Subtasks */
    (task.checklist ?? []).forEach(item => this.#addSubtaskInput(item));

    /* Color */
    DOM.$$('#taskColorPicker .color-dot').forEach(d => {
      d.classList.toggle('active', d.dataset.color === (task.color ?? 'default'));
    });
  }

  #addTaskTag(tag) {
    const display = DOM.id('taskTagsDisplay');
    if (!display) return;

    /* Check duplicate */
    const existing = [...display.querySelectorAll('.tag-chip')]
      .map(c => c.dataset.tag);
    if (existing.includes(tag)) return;

    const chip = DOM.create('span', {
      class:      'tag-chip',
      'data-tag': tag,
    });
    chip.innerHTML = `
      ${StringUtils.escapeHTML(tag)}
      <button type="button" class="tag-chip-remove" aria-label="حذف">
        <i class="fas fa-times"></i>
      </button>
    `;
    chip.querySelector('.tag-chip-remove').addEventListener('click', () => chip.remove());
    display.appendChild(chip);
  }

  #addSubtaskInput(item = null) {
    const list = DOM.id('subtaskList');
    if (!list) return;

    const div = DOM.create('div', { class: 'subtask-item' });
    div.innerHTML = `
      <input type="checkbox" class="subtask-check" ${item?.done ? 'checked' : ''} />
      <input
        type="text"
        class="subtask-text"
        placeholder="مهمة فرعية..."
        value="${StringUtils.escapeHTML(item?.text ?? '')}"
        maxlength="200"
      />
      <button type="button" class="subtask-delete" aria-label="حذف">
        <i class="fas fa-trash"></i>
      </button>
    `;
    div.querySelector('.subtask-delete').addEventListener('click', () => div.remove());
    list.appendChild(div);

    /* Focus new input */
    DOM.focus(div.querySelector('.subtask-text'));
  }

  #collectTaskData() {
    const tags = [...DOM.$$('#taskTagsDisplay .tag-chip')]
      .map(c => c.dataset.tag);

    const checklist = [...DOM.$$('#subtaskList .subtask-item')].map(item => ({
      text: item.querySelector('.subtask-text')?.value?.trim() ?? '',
      done: item.querySelector('.subtask-check')?.checked      ?? false,
    })).filter(s => s.text);

    const activeColor = DOM.$('#taskColorPicker .color-dot.active');

    return {
      id:          DOM.id('taskId')?.value || null,
      title:       DOM.id('taskTitle')?.value?.trim()       ?? '',
      description: DOM.id('taskDescription')?.value?.trim() ?? '',
      priority:    DOM.id('taskPriority')?.value            ?? 'medium',
      status:      DOM.id('taskStatus')?.value              ?? 'todo',
      dueDate:     DOM.id('taskDueDate')?.value             ?? null,
      estimate:    DOM.id('taskEstimate')?.value
                     ? parseInt(DOM.id('taskEstimate').value) : null,
      color:       activeColor?.dataset.color               ?? 'default',
      tags,
      checklist,
    };
  }

  async saveTask() {
    const data       = this.#collectTaskData();
    const validation = Validate.task(data);

    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      Toast.warning('تحقق من البيانات', firstError);
      DOM.id('taskTitle')?.classList.add('input-error');
      Animate.shake(DOM.id('taskTitle'));
      return;
    }

    DOM.id('taskTitle')?.classList.remove('input-error');

    const editId = State.get('ui.editingTaskId');
    let   result;

    if (editId) {
      result = await API.updateTask(editId, data);
    } else {
      result = await API.createTask(data);
    }

    if (result.success || result.queued) {
      Toast.success(
        editId ? 'تم التحديث' : 'تمت الإضافة',
        editId ? 'تم تعديل المهمة بنجاح' : 'تمت إضافة المهمة بنجاح'
      );
      this.closeTaskModal();
      window.KanbanComponent?.render?.();
      window.DashboardComponent?.refresh?.();
    }
  }

  /* ============================================================
     12. NOTE MODAL LOGIC
  ============================================================ */
  openNoteModal() {
    const form = DOM.id('noteForm');
    form?.reset();
    DOM.setText(DOM.id('noteModalTitle'), '📝 ملاحظة جديدة');
    Modal.open('noteModalOverlay');
    DOM.focus(DOM.id('noteModalTitle_input'));
  }

  closeNoteModal() {
    Modal.close('noteModalOverlay');
  }

  async saveNoteFromModal() {
    const title   = DOM.id('noteModalTitle_input')?.value?.trim() ?? '';
    const content = DOM.id('noteModalContent')?.value?.trim()     ?? '';
    const folder  = DOM.id('noteModalFolder')?.value              ?? 'general';

    const validation = Validate.note({ title });
    if (!validation.valid) {
      Toast.warning('تحقق من البيانات', Object.values(validation.errors)[0]);
      Animate.shake(DOM.id('noteModalTitle_input'));
      return;
    }

    const result = await API.createNote({ title, content, folder });

    if (result.success || result.queued) {
      Toast.success('تمت الإضافة', 'تمت إضافة الملاحظة بنجاح');
      this.closeNoteModal();
      this.navigateTo('notes');
      window.NotesComponent?.refresh?.();
      if (result.data?.id) {
        setTimeout(() => window.NotesComponent?.openNote?.(result.data.id), 300);
      }
    }
  }

  /* ============================================================
     13. REMINDER MODAL LOGIC
  ============================================================ */
  openReminderModal(defaults = {}) {
    const form = DOM.id('reminderForm');
    form?.reset();

    if (defaults.date) {
      const input = DOM.id('reminderDate');
      if (input) input.value = DateUtils.toInputFormat(defaults.date);
    }

    Modal.open('reminderModalOverlay');
    DOM.focus(DOM.id('reminderTitle'));
  }

  closeReminderModal() {
    Modal.close('reminderModalOverlay');
  }

  async saveReminder() {
    const title   = DOM.id('reminderTitle')?.value?.trim()  ?? '';
    const date    = DOM.id('reminderDate')?.value           ?? '';
    const type    = DOM.id('reminderType')?.value           ?? 'reminder';
    const notes   = DOM.id('reminderNotes')?.value?.trim()  ?? '';
    const advance = parseInt(DOM.id('reminderAdvanceAmount')?.value ?? 15);

    const validation = Validate.reminder({ title, date });
    if (!validation.valid) {
      const firstErr = Object.values(validation.errors)[0];
      Toast.warning('تحقق من البيانات', firstErr);
      return;
    }

    const result = await API.createReminder({ title, date, type, notes, advance });

    if (result.success || result.queued) {
      Toast.success('تم الحفظ', 'تمت إضافة التذكير بنجاح');
      this.closeReminderModal();
      window.CalendarComponent?.addEvent?.({ title, date, type });
    }
  }

  /* ============================================================
     14. FOOTER ACTIONS
  ============================================================ */
  #bindFooterActions() {
    /* Shortcuts button */
    DOM.id('shortcutsBtn')?.addEventListener('click', () => {
      Modal.open('shortcutsModalOverlay');
    });

    /* Settings button */
    DOM.id('settingsBtn')?.addEventListener('click', () => {
      Modal.open('settingsModalOverlay');
    });
  }

  /* ============================================================
     15. CONFIRM MODAL
  ============================================================ */
  #bindConfirmModal() {
    DOM.id('confirmOk')?.addEventListener('click', () => {
      const { onConfirm } = State.get('ui.confirm');
      onConfirm?.();
      Actions.ui.hideConfirm();
    });

    DOM.id('confirmCancel')?.addEventListener('click', () => {
      const { onCancel } = State.get('ui.confirm');
      onCancel?.();
      Actions.ui.hideConfirm();
    });

    Modal.setupOutsideClick('confirmModalOverlay', () => {
      Actions.ui.hideConfirm();
    });

    /* Sync confirm message to DOM */
    State.subscribe('ui.confirm.message', (msg) => {
      DOM.setText(DOM.id('confirmMessage'), msg);
    });
  }

  /* ============================================================
     16. SETTINGS MODAL
  ============================================================ */
  #bindSettingsModal() {
    /* Close */
    DOM.id('settingsModalClose')?.addEventListener('click', () => {
      Modal.close('settingsModalOverlay');
    });

    /* Settings tabs */
    DOM.$$('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.settingsTab;
        DOM.$$('.settings-tab').forEach(t =>
          t.classList.toggle('active', t === tab)
        );
        DOM.$$('.settings-panel').forEach(p =>
          p.classList.toggle('active', p.id === `settings-${target}`)
        );
        Actions.ui.setSettingsTab(target);
      });
    });

    /* Dark mode toggle */
    DOM.id('settingDarkMode')?.addEventListener('change', (e) => {
      Actions.app.setTheme(e.target.checked ? 'dark' : 'light');
    });

    /* Font size */
    DOM.id('settingFontSize')?.addEventListener('change', (e) => {
      Actions.app.setFontSize(parseInt(e.target.value));
    });

    /* Accent color */
    DOM.$$('.accent-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        DOM.$$('.accent-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        Actions.app.setAccentColor(dot.dataset.accent);
      });
    });

    /* Sidebar labels */
    DOM.id('settingSidebarLabels')?.addEventListener('change', (e) => {
      State.set('app.sidebarLabels', e.target.checked);
    });

    /* Browser notifications */
    DOM.id('requestNotifPermBtn')?.addEventListener('click', async () => {
      const perm = await Actions.notifications.requestPermission();
      Toast[perm === 'granted' ? 'success' : 'warning'](
        perm === 'granted' ? 'تم التفعيل' : 'لم يتم التفعيل',
        perm === 'granted'
          ? 'ستصلك الإشعارات عند حلول التذكيرات'
          : 'يرجى السماح بالإشعارات من إعدادات المتصفح'
      );
      const check = DOM.id('settingBrowserNotif');
      if (check) check.checked = perm === 'granted';
    });

    /* Sound */
    DOM.id('settingSoundNotif')?.addEventListener('change', (e) => {
      State.set('notifications.soundEnabled', e.target.checked);
    });

    /* Auto sync */
    DOM.id('settingAutoSync')?.addEventListener('change', (e) => {
      State.set('settings.autoSync', e.target.checked);
    });

    /* Clear local data */
    DOM.id('clearLocalDataBtn')?.addEventListener('click', () => {
      Modal.confirm(
        'هل أنت متأكد من مسح جميع البيانات المحلية؟ سيتم إعادة تحميل التطبيق.',
        () => {
          Storage.clear();
          window.location.reload();
        }
      );
    });
  }

  /* ============================================================
     17. THEME TOGGLE
  ============================================================ */
  #bindThemeToggle() {
    DOM.id('themeToggleBtn')?.addEventListener('click', () => {
      const current = State.get('app.theme');
      const next    = current === 'dark' ? 'light' : 'dark';
      Actions.app.setTheme(next);

      const check = DOM.id('settingDarkMode');
      if (check) check.checked = next === 'dark';

      Toast.info(
        next === 'dark' ? '🌙 الوضع الليلي' : '☀️ الوضع النهاري',
        '',
        { duration: 1500 }
      );
    });
  }

  /* ============================================================
     18. DATA ACTIONS (Export / Import)
  ============================================================ */
  #bindDataActions() {
    /* Export from dashboard */
    DOM.id('exportDataBtn')?.addEventListener('click',    () => API.exportData());
    DOM.id('refreshStatsBtn')?.addEventListener('click',  () => {
      Http.cache.invalidate('/stats');
      API.refreshAll();
    });

    /* Export from settings */
    DOM.id('exportAllDataBtn')?.addEventListener('click', () => API.exportData());

    /* Import */
    DOM.id('importDataBtn')?.addEventListener('click', () => {
      DOM.id('importFileInput')?.click();
    });

    DOM.id('importFileInput')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file || !FileUtils.isJSON(file)) {
        Toast.error('خطأ', 'يرجى اختيار ملف JSON صالح');
        return;
      }

      try {
        const text   = await FileUtils.readAsText(file);
        const result = State.import(text);
        if (result) {
          Toast.success('تم الاستيراد', 'تم استيراد البيانات بنجاح. سيتم إعادة تحميل التطبيق.');
          setTimeout(() => window.location.reload(), 2000);
        } else {
          Toast.error('فشل الاستيراد', 'صيغة الملف غير صحيحة');
        }
      } catch (err) {
        Toast.error('خطأ في الاستيراد', err.message);
      }

      e.target.value = '';
    });
  }

  /* ============================================================
     19. SECTION LINKS (Dashboard → Other Tabs)
  ============================================================ */
  #bindSectionLinks() {
    DOM.delegate(document, '[data-goto]', 'click', (e, el) => {
      const tab = el.dataset.goto;
      if (tab) this.navigateTo(tab);
    });
  }

  /* ============================================================
     20. GLOBAL KEYBOARD SHORTCUTS
  ============================================================ */
  #bindGlobalShortcuts() {
    /* Ctrl+S — Save */
    Shortcuts.register('ctrl+s', (e) => {
      e.preventDefault();
      const activeNote = Selectors.getActiveNote();
      if (activeNote && State.get('app.activeTab') === 'notes') {
        window.NotesComponent?.saveActive?.();
      }
    }, { global: true, description: 'حفظ سريع' });

    /* F11 — Zen Mode */
    Shortcuts.register('f11', (e) => {
      e.preventDefault();
      if (State.get('app.activeTab') === 'notes') {
        const isZen = State.get('notes.isZenMode');
        Actions.notes.setZenMode(!isZen);
      }
    }, { global: true, description: 'وضع التركيز' });

    /* Ctrl+E — Export active note */
    Shortcuts.register('ctrl+e', (e) => {
      e.preventDefault();
      if (State.get('app.activeTab') === 'notes') {
        window.NotesComponent?.exportActive?.();
      }
    }, { global: true, description: 'تصدير الملاحظة' });

    /* Ctrl+N — New task / note based on active tab */
    Shortcuts.register('ctrl+n', (e) => {
      e.preventDefault();
      const tab = State.get('app.activeTab');
      if (tab === 'tasks') this.openTaskModal();
      if (tab === 'notes') this.openNoteModal();
    }, { global: true, description: 'جديد' });
  }

  /* ============================================================
     21. EXCALIDRAW CANVAS
  ============================================================ */
  #loadExcalidraw() {
    const frame   = DOM.id('excalidrawFrame');
    const loading = DOM.id('canvasLoading');

    if (frame?.style.display === 'none' || !frame?.src) {
      DOM.show(loading, 'flex');
      DOM.hide(frame);

      frame.onload = () => {
        DOM.hide(loading);
        DOM.show(frame, 'block');
        frame.style.display = 'block';
      };

      frame.onerror = () => {
        DOM.hide(loading);
        Toast.error('خطأ', 'لا يمكن تحميل لوحة الرسم. تحقق من الاتصال.');
      };

      /* src is already set in HTML */
      if (!frame.src) frame.src = 'https://excalidraw.com/';
    }

    /* Reload button */
    DOM.id('reloadCanvasBtn')?.addEventListener('click', () => {
      DOM.show(loading, 'flex');
      DOM.hide(frame);
      frame.src = 'https://excalidraw.com/?' + Date.now();
    });

    /* Fullscreen */
    DOM.id('fullscreenCanvasBtn')?.addEventListener('click', () => {
      const wrapper = DOM.id('canvasWrapper');
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        wrapper?.requestFullscreen?.();
      }
    });
  }

  /* ============================================================
     22. RESIZE OBSERVER
  ============================================================ */
  #setupResizeObserver() {
    this.#resizeObserver = new ResizeObserver(
      Perf.debounce((entries) => {
        for (const entry of entries) {
          /* Re-render calendar on resize */
          if (State.get('app.activeTab') === 'calendar') {
            window.CalendarComponent?.resize?.();
          }
        }
      }, 200)
    );

    const main = DOM.id('mainContent');
    if (main) this.#resizeObserver.observe(main);
  }

  /* ============================================================
     23. FOCUS TRAP (for modals)
  ============================================================ */
  #setupFocusTrap() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const modal = document.querySelector('.modal-overlay[style*="flex"]');
      if (!modal) return;

      const focusable = [...modal.querySelectorAll(
        'input, textarea, select, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      if (!focusable.length) return;

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  /* ============================================================
     24. INIT COMPONENTS
  ============================================================ */
  async #initComponents() {
    const inits = [
      () => window.PomodoroComponent?.init?.(),
      () => window.DashboardComponent?.init?.(),
      () => window.KanbanComponent?.init?.(),
      () => window.NotesComponent?.init?.(),
      () => window.CalendarComponent?.init?.(),
      () => window.ChatComponent?.init?.(),
      () => window.CommandPaletteComponent?.init?.(),
    ];

    for (const initFn of inits) {
      try {
        await initFn();
      } catch (err) {
        console.warn('[App] Component init error:', err.message);
      }
    }
  }

  /* ============================================================
     25. LOAD INITIAL DATA
  ============================================================ */
  async #loadInitialData() {
    Actions.app.setLoading(true, 'جاري تحميل البيانات...');

    try {
      /* Health check first */
      const health = await Http.healthCheck();
      if (!health.healthy) {
        Toast.warning(
          'الخادم غير متاح',
          'سيتم العمل في وضع عدم الاتصال. بياناتك محفوظة محلياً.',
          { duration: 6000 }
        );
      }

      /* Parallel data fetch */
      await API.refreshAll();

      /* Build dashboard */
      window.DashboardComponent?.refresh?.();

    } catch (err) {
      console.error('[App] Initial data load failed:', err);
      Toast.warning(
        'تعذّر تحميل البيانات',
        'جاري استخدام البيانات المحفوظة محلياً',
        { duration: 4000 }
      );
    } finally {
      Actions.app.setLoading(false);
    }
  }

  /* ============================================================
     26. NOTIFICATION SETUP
  ============================================================ */
  async #checkNotificationPermission() {
    const perm = Notification?.permission ?? 'default';
    Actions.notifications.setPermission(perm);

    const check = DOM.id('settingBrowserNotif');
    if (check) check.checked = perm === 'granted';

    /* Auto-request after 3 seconds if not decided */
    if (perm === 'default') {
      setTimeout(async () => {
        const result = await Actions.notifications.requestPermission();
        if (result === 'granted') {
          Toast.success(
            '🔔 الإشعارات مفعّلة',
            'ستصلك تنبيهات عند حلول التذكيرات'
          );
        }
      }, 3000);
    }
  }

  /* ============================================================
     27. SCHEDULE EXISTING REMINDERS
  ============================================================ */
  #scheduleExistingReminders() {
    const reminders = Selectors.getUpcomingReminders();
    for (const r of reminders) {
      Notifications.scheduleReminder(r);
    }
    console.log(`[App] ⏰ Scheduled ${reminders.length} upcoming reminders`);
  }

  /* ============================================================
     28. PUBLIC API
  ============================================================ */
  get isInitialized() { return this.#initialized; }
}

/* ============================================================
   2. OFFLINE BANNER
   ============================================================ */
function setupOfflineBanner() {
  /* Inject banner into DOM */
  const banner = DOM.create('div', {
    id:    'offlineBanner',
    class: 'offline-banner',
    role:  'alert',
  });
  banner.innerHTML = `
    <i class="fas fa-wifi"></i>
    <span>أنت غير متصل بالإنترنت</span>
    <span class="sync-count" id="bannerSyncCount"></span>
  `;
  document.body.prepend(banner);

  /* Sync queue count */
  State.subscribe('offlineQueue.items', (items) => {
    const count = DOM.id('bannerSyncCount');
    if (count) {
      count.textContent = items.length
        ? `${items.length} عملية معلّقة`
        : '';
    }
  });
}

/* ============================================================
   3. KANBAN BOARD INITIALIZER
   (Lightweight inline init — full logic in kanban.js)
   ============================================================ */
function initKanbanFallback() {
  /* If KanbanComponent not loaded, render basic cards */
  if (window.KanbanComponent) return;

  const renderColumn = (status) => {
    const container = DOM.id(`cards-${status}`);
    const counter   = DOM.id(`count-${status}`);
    if (!container) return;

    const tasks = Selectors.getTasksByStatus(status);
    DOM.empty(container);

    if (counter) DOM.setText(counter, tasks.length);

    if (!tasks.length) {
      container.innerHTML = `
        <div class="column-empty">
          <i class="fas fa-inbox"></i>
          <span>لا توجد مهام</span>
        </div>
      `;
      return;
    }

    for (const task of tasks) {
      const card = DOM.create('div', {
        class:           'kanban-card',
        'data-id':       task.id,
        'data-priority': task.priority,
        'data-color':    task.color ?? 'default',
        draggable:       'true',
      });

      const dueLabel   = task.dueDate
        ? `<span class="card-due-date ${DateUtils.isOverdue(task.dueDate) ? 'overdue' : ''}">
             <i class="fas fa-calendar"></i>
             ${DateUtils.relative(task.dueDate)}
           </span>`
        : '';

      const tags = (task.tags ?? []).slice(0, 3)
        .map(t => `<span class="card-tag">${StringUtils.escapeHTML(t)}</span>`)
        .join('');

      const checklistRatio = task.checklist?.length
        ? `${task.checklist.filter(c => c.done).length}/${task.checklist.length}`
        : '';

      card.innerHTML = `
        <div class="card-header">
          <span class="card-title">${StringUtils.escapeHTML(task.title)}</span>
          <button class="card-menu-btn" data-id="${task.id}" aria-label="خيارات">
            <i class="fas fa-ellipsis-h"></i>
          </button>
        </div>
        ${task.description
          ? `<p class="card-description">${StringUtils.escapeHTML(StringUtils.truncate(task.description, 80))}</p>`
          : ''}
        ${checklistRatio
          ? `<div class="card-checklist">
               <div class="card-checklist-progress">
                 <div class="checklist-bar">
                   <div class="checklist-bar-fill" style="width:${
                     Math.round((task.checklist.filter(c=>c.done).length / task.checklist.length) * 100)
                   }%"></div>
                 </div>
                 <span class="checklist-ratio">${checklistRatio}</span>
               </div>
             </div>`
          : ''}
        <div class="card-footer">
          <div class="card-tags">${tags}</div>
          <div class="card-meta">
            ${dueLabel}
            <span class="priority-badge ${task.priority}">
              ${task.priority === 'urgent' ? '🔴' : task.priority === 'high' ? '🟠' : task.priority === 'medium' ? '🟡' : '🟢'}
              ${task.priority}
            </span>
          </div>
        </div>
      `;

      /* Card click → open detail */
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-menu-btn')) return;
        App.openTaskModal({ taskId: task.id });
      });

      /* Card menu */
      card.querySelector('.card-menu-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        showCardMenu(e, task.id);
      });

      container.appendChild(card);
    }

    /* Init SortableJS if available */
    if (typeof Sortable !== 'undefined') {
      Sortable.create(container, {
        group:     'kanban',
        animation: 200,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass:   'sortable-drag',
        onEnd(evt) {
          const taskId    = evt.item.dataset.id;
          const newStatus = evt.to.dataset.status;
          if (taskId && newStatus) {
            API.moveTask(taskId, newStatus);
          }
        },
      });
    }
  };

  const renderAll = () => {
    ['todo', 'inprogress', 'review', 'done'].forEach(renderColumn);
  };

  State.subscribe('tasks.filtered', renderAll);
  renderAll();
}

function showCardMenu(e, taskId) {
  e.preventDefault();
  Actions.ui.showContextMenu(e.clientX, e.clientY, [
    {
      label:  'تعديل',
      icon:   'fas fa-edit',
      action: () => App.openTaskModal({ taskId }),
    },
    {
      label:  'نقل إلى: قيد التنفيذ',
      icon:   'fas fa-arrow-right',
      action: () => API.moveTask(taskId, 'inprogress'),
    },
    {
      label:  'تحديد كمكتملة',
      icon:   'fas fa-check-circle',
      action: () => API.moveTask(taskId, 'done'),
    },
    { type: 'separator' },
    {
      label:  'حذف',
      icon:   'fas fa-trash',
      danger: true,
      action: () => {
        Modal.confirm(
          'هل أنت متأكد من حذف هذه المهمة؟',
          () => API.deleteTask(taskId)
        );
      },
    },
  ], taskId);
}

/* ============================================================
   4. CONTEXT MENU RENDERER
   ============================================================ */
function setupContextMenu() {
  let menuEl = DOM.id('contextMenu');
  if (!menuEl) {
    menuEl = DOM.create('div', {
      id:    'contextMenu',
      class: 'context-menu',
      role:  'menu',
    });
    document.body.appendChild(menuEl);
  }
  DOM.hide(menuEl);

  State.subscribe('ui.contextMenu', ({ visible, x, y, items }) => {
    if (!visible || !items.length) {
      DOM.hide(menuEl);
      return;
    }

    DOM.empty(menuEl);

    for (const item of items) {
      if (item.type === 'separator') {
        menuEl.appendChild(DOM.create('div', { class: 'context-menu-separator' }));
        continue;
      }

      const el = DOM.create('div', {
        class: `context-menu-item${item.danger ? ' danger' : ''}`,
        role:  'menuitem',
      });
      el.innerHTML = `
        <i class="${item.icon ?? 'fas fa-circle'}"></i>
        ${StringUtils.escapeHTML(item.label)}
      `;
      el.addEventListener('click', () => {
        item.action?.();
        Actions.ui.hideContextMenu();
        DOM.hide(menuEl);
      });
      menuEl.appendChild(el);
    }

    /* Position menu, keep in viewport */
    DOM.show(menuEl, 'block');
    const rect   = menuEl.getBoundingClientRect();
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    const left   = x + rect.width  > vw ? x - rect.width  : x;
    const top    = y + rect.height > vh ? y - rect.height  : y;
    menuEl.style.left = `${left}px`;
    menuEl.style.top  = `${top}px`;
  });
}

/* ============================================================
   5. DASHBOARD GREETING & DATE
   ============================================================ */
function setupDashboardGreeting() {
  const greetingMsg  = DOM.id('greetingMsg');
  const dateDisplay  = DOM.id('currentDateDisplay');
  const quoteText    = DOM.id('quoteText');

  if (greetingMsg) greetingMsg.textContent = DateUtils.getGreeting();
  if (dateDisplay) {
    dateDisplay.textContent = DateUtils.format(new Date(), {
      weekday: 'long',
      year:    'numeric',
      month:   'long',
      day:     'numeric',
    });
  }
  if (quoteText) quoteText.textContent = Quotes.daily;

  /* Update greeting every hour */
  setInterval(() => {
    if (greetingMsg) greetingMsg.textContent = DateUtils.getGreeting();
  }, 60 * 60 * 1000);
}

/* ============================================================
   6. TASK SEARCH & FILTER (Panel level)
   ============================================================ */
function setupTaskFilters() {
  const searchInput = DOM.id('taskSearchInput');
  const filterSel   = DOM.id('taskFilterPriority');

  searchInput?.addEventListener('input', Perf.debounce((e) => {
    Actions.tasks.setSearch(e.target.value);
  }, 250));

  filterSel?.addEventListener('change', (e) => {
    Actions.tasks.setFilter('filterPriority', e.target.value);
  });
}

/* ============================================================
   7. NOTES SEARCH (Sidebar level)
   ============================================================ */
function setupNotesSearch() {
  const searchBtn   = DOM.id('searchNotesBtn');
  const searchBox   = DOM.id('notesSearchBox');
  const searchInput = DOM.id('notesSearchInput');

  searchBtn?.addEventListener('click', () => {
    const isVisible = DOM.isVisible(searchBox);
    isVisible ? DOM.hide(searchBox) : DOM.show(searchBox, 'block');
    if (!isVisible) DOM.focus(searchInput);
  });

  searchInput?.addEventListener('input', Perf.debounce((e) => {
    Actions.notes.setSearch(e.target.value);
    window.NotesComponent?.renderList?.();
  }, 250));
}

/* ============================================================
   8. AUTOSAVE INDICATOR SYNC
   ============================================================ */
function setupAutosaveIndicator() {
  const INDICATOR_ICONS = {
    saving: '<i class="fas fa-sync fa-spin"></i>',
    saved:  '<i class="fas fa-cloud-upload-alt"></i>',
    error:  '<i class="fas fa-exclamation-circle"></i>',
    idle:   '<i class="fas fa-cloud"></i>',
  };

  const INDICATOR_TEXTS = {
    saving: 'جاري الحفظ...',
    saved:  'تم الحفظ',
    error:  'خطأ في الحفظ',
    idle:   '',
  };

  State.subscribe('autosave.status', (status) => {
    const icon = DOM.id('autosaveIcon');
    const text = DOM.id('autosaveText');
    const ind  = DOM.id('autosaveIndicator');

    if (icon) icon.innerHTML = INDICATOR_ICONS[status] ?? INDICATOR_ICONS.idle;
    if (text) text.textContent = INDICATOR_TEXTS[status] ?? '';
    if (ind)  {
      ind.className = `autosave-indicator ${status}`;
    }
  });
}

/* ============================================================
   9. NAV BADGES (unread counts)
   ============================================================ */
function setupNavBadges() {
  /* Tasks badge — overdue count */
  State.subscribe('tasks.items', (items) => {
    const badge   = DOM.id('badge-tasks');
    const overdue = Computed.get('overdueTasks')?.length ?? 0;
    if (badge) {
      badge.textContent = overdue || '';
    }
  });

  /* Reminders badge */
  State.subscribe('dashboard.stats.activeReminders', (count) => {
    const badge = DOM.id('badge-calendar');
    if (badge) badge.textContent = count || '';
  });

  /* Chat badge (unread) */
  State.subscribe('chat.messages', (msgs) => {
    const badge = DOM.id('badge-chat');
    if (badge && State.get('app.activeTab') !== 'chat') {
      const unread = msgs.filter(m => m.role === 'assistant' && !m.isRead).length;
      badge.textContent = unread || '';
    }
  });
}

/* ============================================================
   10. ONLINE STATUS BANNER
   ============================================================ */
function setupOnlineStatus() {
  const update = (isOnline) => {
    const bar  = DOM.id('onlineStatusBar');
    const dot  = DOM.id('statusDot');
    const text = DOM.id('statusText');

    bar?.classList.toggle('offline', !isOnline);
    if (text) text.textContent = isOnline ? 'متصل' : 'غير متصل';

    const banner = DOM.id('offlineBanner');
    banner?.classList.toggle('visible', !isOnline);
  };

  update(navigator.onLine);
  window.addEventListener('online',  () => update(true));
  window.addEventListener('offline', () => update(false));
}

/* ============================================================
   11. CHAT TAB — Mark messages as read when tab active
   ============================================================ */
function setupChatReadTracking() {
  State.subscribe('app.activeTab', (tab) => {
    if (tab === 'chat') {
      const messages = State.get('chat.messages');
      const updated  = messages.map(m => ({ ...m, isRead: true }));
      State.set('chat.messages', updated, { persist: false, silent: true });
      DOM.setText(DOM.id('badge-chat'), '');
    }
  });
}

/* ============================================================
   12. TOAST BUS LISTENER
   ============================================================ */
function setupToastBusListener() {
  Bus.on('toast:show', ({ type, title, message, duration }) => {
    Toast[type]?.(title, message, { duration });
  });
}

/* ============================================================
   13. POMODORO BADGE IN TITLE
   ============================================================ */
function setupPomodoroTitle() {
  State.subscribe('pomodoro.isRunning', (running) => {
    if (!running) {
      /* Restore normal title */
      const tab   = State.get('app.activeTab');
      const title = { dashboard:'لوحة التحكم', calendar:'التقويم', chat:'المحادثة',
                      tasks:'المهام', notes:'الملاحظات', canvas:'التخطيط' }[tab] ?? '';
      document.title = title ? `${title} — المدير` : 'المدير';
    }
  });
}

/* ============================================================
   14. MAIN ENTRY POINT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {

  console.log(
    '%c[المدير] 🌟 DOM Ready — Starting App...',
    'color:#feca57;font-weight:900;font-size:14px;'
  );

  /* ---- Setup Global Utilities ---- */
  setupOfflineBanner();
  setupContextMenu();
  setupDashboardGreeting();
  setupTaskFilters();
  setupNotesSearch();
  setupAutosaveIndicator();
  setupNavBadges();
  setupOnlineStatus();
  setupChatReadTracking();
  setupToastBusListener();
  setupPomodoroTitle();

  /* ---- Create & Init App Controller ---- */
  window.App = new AppController();
  await App.init();

  /* ---- Init Fallback Kanban (if component not loaded) ---- */
  Perf.idle(initKanbanFallback);

  /* ---- Periodic UI Refresh ---- */
  setInterval(() => {
    /* Refresh relative timestamps */
    DOM.$$('[data-timestamp="now"]').forEach(el => {
      el.textContent = DateUtils.formatTime(new Date());
    });

    /* Refresh heatmap if dashboard active */
    if (State.get('app.activeTab') === 'dashboard') {
      window.DashboardComponent?.refreshHeatmap?.();
    }
  }, 60 * 1000);

  /* ---- PWA Install Prompt ---- */
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    /* Show install toast after 10 seconds */
    setTimeout(() => {
      Toast.info(
        '📱 تثبيت التطبيق',
        'يمكنك تثبيت المدير على جهازك للوصول السريع',
        {
          duration: 8000,
          action: {
            label:   'تثبيت',
            onClick: async () => {
              deferredPrompt?.prompt?.();
              const { outcome } = await deferredPrompt?.userChoice;
              if (outcome === 'accepted') {
                Toast.success('تم التثبيت', 'تم تثبيت التطبيق بنجاح 🎉');
              }
              deferredPrompt = null;
            },
          },
        }
      );
    }, 10000);
  });

  /* Notify when PWA is installed */
  window.addEventListener('appinstalled', () => {
    Toast.success('تم التثبيت! 🎉', 'يمكنك الآن فتح المدير من الشاشة الرئيسية');
    deferredPrompt = null;
  });

  console.log(
    '%c[المدير] ✅ App fully loaded and ready!',
    'color:#55efc4;font-weight:900;font-size:16px;'
  );
});

/* ============================================================
   15. GLOBAL ERROR HANDLERS
   ============================================================ */
window.addEventListener('error', (e) => {
  console.error('[App] Uncaught error:', e.error);
  if (window.location.hostname !== 'localhost') return;
  Toast.error('خطأ غير متوقع', e.message, { duration: 5000 });
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[App] Unhandled promise rejection:', e.reason);
  e.preventDefault();
});