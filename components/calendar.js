/* ============================================================
   المدير — Calendar Component v2.0.0
   FullCalendar: عرض المهام والتذكيرات، Drag & Drop
   ============================================================ */

'use strict';

class CalendarComponent {

  #calendar      = null;
  #initialized   = false;

  /* ============================================================
     INIT
  ============================================================ */
  init() {
    this.#subscribeToState();
    console.log('[Calendar] ✅ Initialized');
  }

  /* ============================================================
     RENDER FULLCALENDAR (lazy — first time tab opens)
  ============================================================ */
  render() {
    if (this.#initialized) {
      this.#refreshEvents();
      return;
    }

    const el = DOM.id('fullCalendar');
    if (!el || typeof FullCalendar === 'undefined') {
      console.warn('[Calendar] FullCalendar not loaded');
      return;
    }

    this.#calendar = new FullCalendar.Calendar(el, {
      locale:          'ar',
      direction:       'rtl',
      initialView:     State.get('calendar.activeView') ?? 'dayGridMonth',
      height:          'auto',
      expandRows:      true,
      selectable:      true,
      editable:        true,
      droppable:       true,
      dayMaxEvents:    3,
      moreLinkText:    (n) => `+${n} أكثر`,
      nowIndicator:    true,
      weekNumbers:     false,
      navLinks:        true,

      headerToolbar: {
        start:  'prev,next today',
        center: 'title',
        end:    '',
      },

      buttonText: {
        today:    'اليوم',
        month:    'شهر',
        week:     'أسبوع',
        day:      'يوم',
        list:     'قائمة',
      },

      /* Events */
      events: (info, success) => {
        const events = this.#buildCalendarEvents();
        success(events);
      },

      /* Click on event */
      eventClick: (info) => {
        this.#onEventClick(info);
      },

      /* Click on date → add reminder */
      dateClick: (info) => {
        App.openReminderModal({ date: info.date });
      },

      /* Select range → add event */
      select: (info) => {
        App.openReminderModal({ date: info.start });
      },

      /* Drag event → update date */
      eventDrop: (info) => {
        this.#onEventDrop(info);
      },

      /* Resize event */
      eventResize: (info) => {
        this.#onEventResize(info);
      },

      /* Render event */
      eventDidMount: (info) => {
        this.#styleEvent(info);
      },

      /* More link click */
      moreLinkClick: 'popover',

      /* Loading state */
      loading: (isLoading) => {
        const el = DOM.$('#tab-calendar .calendar-wrapper');
        if (el) el.style.opacity = isLoading ? '0.7' : '1';
      },
    });

    this.#calendar.render();
    this.#initialized = true;

    /* Bind view switcher */
    this.#bindViewSwitcher();

    console.log('[Calendar] 📅 FullCalendar rendered');
  }

  /* ============================================================
     BUILD CALENDAR EVENTS from State
  ============================================================ */
  #buildCalendarEvents() {
    const events = [];

    /* Reminders / Calendar events */
    const calEvents = State.get('calendar.events') ?? [];
    for (const ev of calEvents) {
      events.push({
        id:          ev.id,
        title:       ev.title,
        start:       ev.start,
        end:         ev.end,
        allDay:      ev.allDay ?? false,
        color:       ev.color  ?? '#6c63ff',
        textColor:   '#ffffff',
        extendedProps: {
          source: 'reminder',
          type:   ev.type ?? 'reminder',
          notes:  ev.notes ?? '',
          ...ev.extendedProps,
        },
      });
    }

    /* Tasks with due dates */
    const tasks = State.get('tasks.items') ?? [];
    for (const task of tasks) {
      if (!task.dueDate) continue;

      const color = {
        urgent: '#ff6b6b',
        high:   '#ff9f43',
        medium: '#6c63ff',
        low:    '#55efc4',
      }[task.priority] ?? '#6c63ff';

      events.push({
        id:          `task-${task.id}`,
        title:       `📋 ${task.title}`,
        start:       task.dueDate,
        allDay:      false,
        color,
        textColor:   '#ffffff',
        classNames:  [
          'calendar-task-event',
          task.status === 'done' ? 'event-done' : '',
        ],
        extendedProps: {
          source:   'task',
          taskId:   task.id,
          status:   task.status,
          priority: task.priority,
          notes:    task.description ?? '',
        },
      });
    }

    return events;
  }

  /* ============================================================
     EVENT CLICK
  ============================================================ */
  #onEventClick(info) {
    const props  = info.event.extendedProps;
    const source = props.source;

    if (source === 'task') {
      /* Open task detail */
      window.KanbanComponent?.openCardDetail?.(props.taskId);
      return;
    }

    /* Show event popup */
    this.#showEventPopup(info.event, info.el);
  }

  #showEventPopup(event, anchor) {
    /* Remove existing popup */
    DOM.id('calEventPopup')?.remove();

    const popup = DOM.create('div', {
      id:    'calEventPopup',
      class: 'glass',
      style: `
        position:fixed;
        z-index:${getComputedStyle(document.documentElement)
          .getPropertyValue('--z-dropdown') || 100};
        min-width:240px;
        max-width:320px;
        border-radius:12px;
        padding:16px;
        box-shadow:var(--shadow-xl);
        animation:panelFadeIn 0.2s ease;
      `,
    });

    const typeIcons = {
      reminder: 'fas fa-bell',
      meeting:  'fas fa-users',
      deadline: 'fas fa-flag',
      event:    'fas fa-calendar-check',
    };

    const props = event.extendedProps;
    popup.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <span style="width:12px;height:12px;border-radius:50%;background:${event.backgroundColor};flex-shrink:0;"></span>
        <strong style="font-size:15px;color:var(--text-primary);">${StringUtils.escapeHTML(event.title)}</strong>
        <button id="calPopupClose" style="margin-right:auto;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--text-secondary);">
        <div style="display:flex;align-items:center;gap:8px;">
          <i class="fas fa-clock" style="color:var(--text-muted);width:14px;"></i>
          <span>${DateUtils.formatDateTime(event.start)}</span>
        </div>
        ${props.type ? `
          <div style="display:flex;align-items:center;gap:8px;">
            <i class="${typeIcons[props.type] ?? 'fas fa-tag'}" style="color:var(--text-muted);width:14px;"></i>
            <span>${props.type}</span>
          </div>` : ''}
        ${props.notes ? `
          <div style="display:flex;align-items:flex-start;gap:8px;margin-top:4px;">
            <i class="fas fa-sticky-note" style="color:var(--text-muted);width:14px;margin-top:2px;"></i>
            <span>${StringUtils.escapeHTML(StringUtils.truncate(props.notes, 100))}</span>
          </div>` : ''}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button id="calPopupEdit" class="btn btn-outline btn-sm">
          <i class="fas fa-edit"></i> تعديل
        </button>
        <button id="calPopupDelete" class="btn btn-danger btn-sm">
          <i class="fas fa-trash"></i> حذف
        </button>
      </div>
    `;

    /* Position relative to anchor */
    document.body.appendChild(popup);
    const anchorRect = anchor.getBoundingClientRect();
    const popupRect  = popup.getBoundingClientRect();
    const top  = Math.min(anchorRect.bottom + 8, window.innerHeight - popupRect.height - 16);
    const left = Math.min(anchorRect.left, window.innerWidth  - popupRect.width  - 16);
    popup.style.top  = `${top}px`;
    popup.style.left = `${left}px`;

    /* Close */
    DOM.id('calPopupClose')?.addEventListener('click', () => popup.remove());

    /* Edit */
    DOM.id('calPopupEdit')?.addEventListener('click', () => {
      popup.remove();
      App.openReminderModal({ date: event.start });
    });

    /* Delete */
    DOM.id('calPopupDelete')?.addEventListener('click', () => {
      popup.remove();
      Modal.confirm(
        `هل أنت متأكد من حذف "${event.title}"؟`,
        () => {
          Actions.calendar.removeEvent(event.id);
          this.#calendar?.getEventById(event.id)?.remove();
          Toast.success('تم الحذف', 'تم حذف الحدث');
        }
      );
    });

    /* Click outside to close */
    setTimeout(() => {
      document.addEventListener('click', function closePopup(e) {
        if (!popup.contains(e.target) && !anchor.contains(e.target)) {
          popup.remove();
          document.removeEventListener('click', closePopup);
        }
      });
    }, 100);
  }

  /* ============================================================
     EVENT DROP (drag to new date)
  ============================================================ */
  #onEventDrop(info) {
    const props = info.event.extendedProps;

    if (props.source === 'task') {
      /* Update task due date */
      const taskId  = props.taskId;
      const newDate = info.event.start.toISOString();
      API.updateTask(taskId, { dueDate: newDate });
      Toast.success(
        'تم التحديث',
        `تم تغيير تاريخ المهمة إلى ${DateUtils.format(newDate)}`
      );
    } else {
      Toast.info('تم النقل', `"${info.event.title}" → ${DateUtils.format(info.event.start)}`);
    }
  }

  /* ============================================================
     EVENT RESIZE
  ============================================================ */
  #onEventResize(info) {
    Toast.info('تم التمديد', `"${info.event.title}" حتى ${DateUtils.format(info.event.end)}`);
  }

  /* ============================================================
     STYLE EVENT (custom rendering)
  ============================================================ */
  #styleEvent(info) {
    const props = info.event.extendedProps;

    /* Done tasks */
    if (props.source === 'task' && props.status === 'done') {
      info.el.style.opacity        = '0.5';
      info.el.style.textDecoration = 'line-through';
    }

    /* Tooltip */
    info.el.title = info.event.title +
      (info.event.start ? `\n${DateUtils.formatDateTime(info.event.start)}` : '') +
      (props.notes ? `\n${props.notes.slice(0, 80)}` : '');
  }

  /* ============================================================
     VIEW SWITCHER
  ============================================================ */
  #bindViewSwitcher() {
    DOM.$$('#calViewSwitcher .view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (!view || !this.#calendar) return;

        DOM.$$('#calViewSwitcher .view-btn').forEach(b =>
          b.classList.toggle('active', b === btn)
        );

        this.#calendar.changeView(view);
        Actions.calendar.setView(view);
      });
    });
  }

  /* ============================================================
     REFRESH EVENTS
  ============================================================ */
  #refreshEvents() {
    this.#calendar?.refetchEvents();
  }

  /* ============================================================
     ADD EVENT (from outside)
  ============================================================ */
  addEvent(eventData) {
    if (!this.#calendar) return;

    const color = {
      reminder: '#6c63ff',
      meeting:  '#48dbfb',
      deadline: '#ff6b6b',
      event:    '#55efc4',
    }[eventData.type] ?? '#6c63ff';

    this.#calendar.addEvent({
      id:        eventData.id ?? StringUtils.uid('ev'),
      title:     eventData.title,
      start:     eventData.date,
      allDay:    false,
      color,
      textColor: '#ffffff',
      extendedProps: {
        source: 'reminder',
        type:   eventData.type,
      },
    });
  }

  /* ============================================================
     SUBSCRIBE TO STATE
  ============================================================ */
  #subscribeToState() {
    State.subscribe('calendar.events', () => {
      if (this.#initialized) this.#refreshEvents();
    });

    State.subscribe('tasks.items', Perf.debounce(() => {
      if (this.#initialized) this.#refreshEvents();
    }, 500));
  }

  /* ============================================================
     RESIZE (called on window resize)
  ============================================================ */
  resize() {
    this.#calendar?.updateSize();
  }
}

/* ---- Singleton Export ---- */
window.CalendarComponent = new CalendarComponent();