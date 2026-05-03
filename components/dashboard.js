/* ============================================================
   المدير — Dashboard Component v2.0.0
   لوحة التحكم: إحصائيات، مهام اليوم، ملاحظات، تذكيرات، Heatmap
   ============================================================ */

'use strict';

class DashboardComponent {

  #refreshTimer  = null;
  #REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

  /* ============================================================
     INIT
  ============================================================ */
  init() {
    this.#bindEvents();
    this.#subscribeToState();
    console.log('[Dashboard] ✅ Initialized');
  }

  /* ============================================================
     BIND EVENTS
  ============================================================ */
  #bindEvents() {
    /* Export button */
    DOM.id('exportDataBtn')?.addEventListener('click', () => {
      Toast.promise(API.exportData(), {
        loading: 'جاري تصدير البيانات...',
        success: 'تم تصدير البيانات بنجاح',
        error:   'فشل تصدير البيانات',
      });
    });

    /* Refresh button */
    DOM.id('refreshStatsBtn')?.addEventListener('click', () => {
      Http.cache.invalidate('/stats');
      this.refresh();
    });

    /* Today task checkboxes (delegated) */
    DOM.delegate(
      DOM.id('todayTasksList'),
      '.today-task-check',
      'click',
      (e, el) => {
        const taskId = el.closest('.today-task-item')?.dataset.id;
        if (!taskId) return;
        const task   = Selectors.getTaskById(taskId);
        const newSts = task?.status === 'done' ? 'todo' : 'done';
        API.moveTask(taskId, newSts);
      }
    );

    /* Recent notes click */
    DOM.delegate(
      DOM.id('recentNotesList'),
      '.recent-note-item',
      'click',
      (e, el) => {
        const noteId = el.dataset.id;
        if (!noteId) return;
        App.navigateTo('notes');
        setTimeout(() => window.NotesComponent?.openNote?.(noteId), 300);
      }
    );

    /* Upcoming reminders click */
    DOM.delegate(
      DOM.id('upcomingRemindersList'),
      '.reminder-item',
      'click',
      () => App.navigateTo('calendar')
    );
  }

  /* ============================================================
     SUBSCRIBE TO STATE CHANGES
  ============================================================ */
  #subscribeToState() {
    State.subscribe('dashboard.stats',      () => this.#renderStats());
    State.subscribe('dashboard.todayTasks', () => this.#renderTodayTasks());
    State.subscribe('dashboard.recentNotes', () => this.#renderRecentNotes());
    State.subscribe('dashboard.upcomingReminders', () => this.#renderReminders());
    State.subscribe('tasks.items', Perf.debounce(() => {
      this.#syncTodayTasksFromState();
    }, 500));
  }

  /* ============================================================
     REFRESH (Full data reload)
  ============================================================ */
  async refresh() {
    this.#showSkeletons();

    try {
      await API.getStats();
      this.#syncTodayTasksFromState();
      this.#syncRecentNotesFromState();
      this.#syncRemindersFromState();
      this.refreshHeatmap();
      Actions.dashboard.setLastRefreshed();
    } catch (err) {
      console.error('[Dashboard] Refresh failed:', err);
    }
  }

  /* ============================================================
     SYNC FROM LOCAL STATE (no API call)
  ============================================================ */
  #syncTodayTasksFromState() {
    const todayTasks = Selectors.getTodayTasks();
    Actions.dashboard.setTodayTasks(todayTasks);
  }

  #syncRecentNotesFromState() {
    const notes = Selectors.getAllNotes().slice(0, 5);
    Actions.dashboard.setRecentNotes(notes);
  }

  #syncRemindersFromState() {
    const reminders = Selectors.getUpcomingReminders();
    Actions.dashboard.setUpcomingReminders(reminders);
  }

  /* ============================================================
     RENDER: STATS GRID
  ============================================================ */
  #renderStats() {
    const stats = Selectors.getStats();

    const fields = [
      {
        id:       'statTasksValue',
        value:    stats.totalTasks,
        changeId: 'statTasksChange',
        change:   stats.tasksChange,
      },
      {
        id:       'statNotesValue',
        value:    stats.totalNotes,
        changeId: 'statNotesChange',
        change:   stats.notesChange,
      },
      {
        id:       'statRemindersValue',
        value:    stats.activeReminders,
        changeId: 'statRemindersChange',
        change:   stats.remindersChange,
      },
      {
        id:       'statCompletedValue',
        value:    stats.completedToday,
        changeId: 'statCompletedChange',
        change:   stats.completedChange,
      },
    ];

    for (const field of fields) {
      const el = DOM.id(field.id);
      if (el) {
        Animate.countTo(el, field.value ?? 0, 800);
        Animate.removeSkeleton(el.closest('.stat-card'));
      }

      const changeEl = DOM.id(field.changeId);
      if (changeEl && field.change !== undefined) {
        const isPos  = field.change >= 0;
        const sign   = isPos ? '+' : '';
        changeEl.textContent  = `${sign}${field.change} من الأمس`;
        changeEl.className    = `stat-change ${isPos ? 'positive' : 'negative'}`;
      }
    }
  }

  /* ============================================================
     RENDER: TODAY'S TASKS PROGRESS
  ============================================================ */
  #renderTodayTasks() {
    const tasks     = State.get('dashboard.todayTasks');
    const container = DOM.id('todayTasksList');
    const fillEl    = DOM.id('todayProgressFill');
    const labelEl   = DOM.id('todayProgressLabel');
    const percentEl = DOM.id('todayProgressPercent');

    if (!container) return;

    const total     = tasks.length;
    const done      = tasks.filter(t => t.status === 'done').length;
    const percent   = total ? Math.round((done / total) * 100) : 0;

    /* Progress bar */
    if (fillEl)    fillEl.style.width    = `${percent}%`;
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (labelEl)   labelEl.textContent   =
      total
        ? `${done} من ${total} ${total === 1 ? 'مهمة' : 'مهام'} مكتملة`
        : 'لا توجد مهام لليوم';

    /* Task list */
    DOM.empty(container);

    if (!total) {
      container.innerHTML = `
        <div class="empty-state-mini">
          <i class="fas fa-coffee"></i>
          <span>لا توجد مهام مجدولة لليوم — استمتع بيومك ☕</span>
        </div>
      `;
      return;
    }

    /* Sort: undone first */
    const sorted = [...tasks].sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (a.status !== 'done' && b.status === 'done') return -1;
      return 0;
    });

    for (const task of sorted) {
      const isDone = task.status === 'done';
      const item   = DOM.create('div', {
        class:    'today-task-item',
        'data-id': task.id,
      });

      const priorityColor = ColorUtils.priorityColor(task.priority);

      item.innerHTML = `
        <div class="today-task-check ${isDone ? 'done' : ''}"
             style="border-color:${priorityColor};"
             role="checkbox"
             aria-checked="${isDone}"
             tabindex="0">
          ${isDone ? '<i class="fas fa-check" style="font-size:10px;color:white;"></i>' : ''}
        </div>
        <span class="today-task-title ${isDone ? 'done' : ''}">
          ${StringUtils.escapeHTML(task.title)}
        </span>
        ${task.dueDate
          ? `<span class="note-meta" style="font-size:11px;">
               ${DateUtils.formatTime(task.dueDate)}
             </span>`
          : ''}
      `;

      /* Keyboard support */
      item.querySelector('.today-task-check')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') e.target.click();
      });

      container.appendChild(item);
    }
  }

  /* ============================================================
     RENDER: RECENT NOTES
  ============================================================ */
  #renderRecentNotes() {
    const notes     = State.get('dashboard.recentNotes');
    const container = DOM.id('recentNotesList');
    if (!container) return;

    DOM.empty(container);

    if (!notes.length) {
      container.innerHTML = `
        <div class="empty-state-mini">
          <i class="fas fa-sticky-note"></i>
          <span>لا توجد ملاحظات بعد</span>
        </div>
      `;
      return;
    }

    for (const note of notes) {
      const item = DOM.create('div', {
        class:    'recent-note-item',
        'data-id': note.id,
        role:     'button',
        tabindex: '0',
        title:    note.title,
      });

      item.innerHTML = `
        <div class="note-item-icon">
          <i class="fas fa-scroll"></i>
        </div>
        <div class="note-item-body">
          <div class="note-item-title">${StringUtils.escapeHTML(note.title)}</div>
          <div class="note-item-preview">
            ${StringUtils.escapeHTML(
              StringUtils.truncate(StringUtils.stripMarkdown(note.content), 60)
            )}
          </div>
        </div>
        <span class="note-item-time">${DateUtils.relative(note.updatedAt)}</span>
      `;

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') item.click();
      });

      container.appendChild(item);
    }
  }

  /* ============================================================
     RENDER: UPCOMING REMINDERS
  ============================================================ */
  #renderReminders() {
    const reminders = State.get('dashboard.upcomingReminders');
    const container = DOM.id('upcomingRemindersList');
    if (!container) return;

    DOM.empty(container);

    if (!reminders.length) {
      container.innerHTML = `
        <div class="empty-state-mini">
          <i class="fas fa-bell-slash"></i>
          <span>لا توجد تذكيرات قادمة</span>
        </div>
      `;
      return;
    }

    for (const rem of reminders) {
      const item  = DOM.create('div', {
        class: 'reminder-item',
        role:  'button',
        tabindex: '0',
      });

      const typeIcons = {
        reminder: 'fas fa-bell',
        meeting:  'fas fa-users',
        deadline: 'fas fa-flag',
        event:    'fas fa-calendar-check',
      };

      item.innerHTML = `
        <div class="reminder-icon-wrapper ${rem.type ?? 'reminder'}">
          <i class="${typeIcons[rem.type] ?? typeIcons.reminder}"></i>
        </div>
        <div class="note-item-body">
          <div class="note-item-title">${StringUtils.escapeHTML(rem.title)}</div>
          <div class="note-item-preview">
            ${DateUtils.isToday(rem.date)
              ? `اليوم، ${DateUtils.formatTime(rem.date)}`
              : DateUtils.isTomorrow(rem.date)
                ? `غداً، ${DateUtils.formatTime(rem.date)}`
                : DateUtils.formatDateTime(rem.date)}
          </div>
        </div>
        <span class="note-item-time ${DateUtils.isToday(rem.date) ? 'text-warning' : ''}">
          ${DateUtils.relative(rem.date)}
        </span>
      `;

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') item.click();
      });

      container.appendChild(item);
    }
  }

  /* ============================================================
     RENDER: ACTIVITY HEATMAP
  ============================================================ */
  refreshHeatmap() {
    const container = DOM.id('activityHeatmap');
    if (!container) return;

    const tasks = State.get('tasks.items');
    const notes = State.get('notes.items');
    const data  = Heatmap.buildData(tasks, notes);
    Heatmap.generate(container, data, 35);
  }

  /* ============================================================
     SKELETON LOADING
  ============================================================ */
  #showSkeletons() {
    DOM.$$('.stat-card').forEach(card => {
      const val = card.querySelector('.stat-value');
      if (val) Animate.addSkeleton(val);
    });
  }
}

/* ---- Singleton Export ---- */
window.DashboardComponent = new DashboardComponent();