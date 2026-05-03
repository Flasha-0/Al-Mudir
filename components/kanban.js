/* ============================================================
   المدير — Kanban Board Component v2.0.0
   لوحة المهام: Drag & Drop، Subtasks، Card Detail
   ============================================================ */

'use strict';

class KanbanBoardComponent {

  #sortables   = new Map();
  #COLUMNS     = ['todo', 'inprogress', 'review', 'done'];

  #COLUMN_META = {
    todo:       { label: 'للبدء',       icon: 'fas fa-inbox',         color: '#6c63ff' },
    inprogress: { label: 'قيد التنفيذ', icon: 'fas fa-spinner',       color: '#ff9f43' },
    review:     { label: 'للمراجعة',    icon: 'fas fa-search',        color: '#48dbfb' },
    done:       { label: 'مكتملة',      icon: 'fas fa-check-circle',  color: '#55efc4' },
  };

  /* ============================================================
     INIT
  ============================================================ */
  init() {
    this.#initSortable();
    this.#bindEvents();
    this.#subscribeToState();
    this.render();
    console.log('[Kanban] ✅ Initialized');
  }

  /* ============================================================
     INIT SORTABLEJS
  ============================================================ */
  #initSortable() {
    if (typeof Sortable === 'undefined') {
      console.warn('[Kanban] SortableJS not loaded');
      return;
    }

    for (const status of this.#COLUMNS) {
      const container = DOM.id(`cards-${status}`);
      if (!container) continue;

      const sortable = Sortable.create(container, {
        group:        'kanban',
        animation:    200,
        ghostClass:   'sortable-ghost',
        chosenClass:  'sortable-chosen',
        dragClass:    'sortable-drag',
        handle:       '.kanban-card',
        delay:        50,
        delayOnTouchOnly: true,

        onStart: (evt) => {
          Actions.tasks.setDraggedCard(evt.item.dataset.id);
          evt.item.classList.add('is-dragging');
          DOM.$$('.kanban-cards').forEach(c =>
            c.classList.add('drop-target')
          );
        },

        onEnd: (evt) => {
          evt.item.classList.remove('is-dragging');
          DOM.$$('.kanban-cards').forEach(c =>
            c.classList.remove('drop-target', 'drag-over')
          );
          Actions.tasks.setDraggedCard(null);

          const taskId    = evt.item.dataset.id;
          const newStatus = evt.to.dataset.status;
          const oldStatus = evt.from.dataset.status;

          if (taskId && newStatus && newStatus !== oldStatus) {
            API.moveTask(taskId, newStatus);
            Toast.success(
              'تم النقل',
              `نُقلت المهمة إلى "${this.#COLUMN_META[newStatus]?.label}"`,
              { duration: 2000 }
            );
          }
        },

        onMove: (evt) => {
          DOM.$$('.kanban-cards').forEach(c =>
            c.classList.remove('drag-over')
          );
          evt.to.classList.add('drag-over');
          return true;
        },
      });

      this.#sortables.set(status, sortable);
    }
  }

  /* ============================================================
     BIND EVENTS
  ============================================================ */
  #bindEvents() {
    /* Column add buttons */
    DOM.delegate(
      DOM.id('kanbanBoard'),
      '.column-add-btn',
      'click',
      (e, btn) => {
        App.openTaskModal({ status: btn.dataset.status });
      }
    );

    /* Card click → detail */
    DOM.delegate(
      DOM.id('kanbanBoard'),
      '.kanban-card',
      'click',
      (e, card) => {
        if (e.target.closest('.card-menu-btn')) return;
        this.openCardDetail(card.dataset.id);
      }
    );

    /* Card menu button */
    DOM.delegate(
      DOM.id('kanbanBoard'),
      '.card-menu-btn',
      'click',
      (e, btn) => {
        e.stopPropagation();
        const taskId = btn.dataset.id;
        this.#showCardContextMenu(e, taskId);
      }
    );

    /* Subtask checkbox toggle */
    DOM.delegate(
      DOM.id('kanbanBoard'),
      '.card-checklist-item input[type="checkbox"]',
      'change',
      (e, checkbox) => {
        e.stopPropagation();
        const card      = checkbox.closest('.kanban-card');
        const taskId    = card?.dataset.id;
        const idx       = parseInt(checkbox.dataset.idx ?? '0');
        if (taskId) Actions.tasks.toggleSubtask(taskId, idx);
      }
    );

    /* Search input */
    DOM.id('taskSearchInput')?.addEventListener(
      'input',
      Perf.debounce((e) => {
        Actions.tasks.setSearch(e.target.value);
      }, 250)
    );

    /* Priority filter */
    DOM.id('taskFilterPriority')?.addEventListener('change', (e) => {
      Actions.tasks.setFilter('filterPriority', e.target.value);
    });

    /* Task detail modal: edit button */
    DOM.id('editTaskDetailBtn')?.addEventListener('click', () => {
      const taskId = State.get('ui.editingTaskId');
      Modal.close('taskDetailOverlay');
      if (taskId) App.openTaskModal({ taskId });
    });

    DOM.id('taskDetailClose')?.addEventListener('click', () => {
      Modal.close('taskDetailOverlay');
    });
  }

  /* ============================================================
     SUBSCRIBE TO STATE
  ============================================================ */
  #subscribeToState() {
    State.subscribe('tasks.filtered', Perf.debounce(() => {
      this.render();
    }, 100));
  }

  /* ============================================================
     RENDER ALL COLUMNS
  ============================================================ */
  render() {
    for (const status of this.#COLUMNS) {
      this.#renderColumn(status);
    }
  }

  /* ============================================================
     RENDER SINGLE COLUMN
  ============================================================ */
  #renderColumn(status) {
    const container  = DOM.id(`cards-${status}`);
    const countEl    = DOM.id(`count-${status}`);
    if (!container) return;

    const tasks = Selectors.getTasksByStatus(status);

    /* Update counter */
    if (countEl) {
      countEl.textContent = tasks.length;
      countEl.classList.toggle('badge-pulse', status === 'inprogress' && tasks.length > 0);
    }

    /* Preserve scroll position */
    const scrollTop = container.scrollTop;

    DOM.empty(container);

    if (!tasks.length) {
      container.innerHTML = this.#renderEmptyColumn(status);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const task of tasks) {
      fragment.appendChild(this.#buildCard(task));
    }
    container.appendChild(fragment);

    /* Restore scroll */
    container.scrollTop = scrollTop;
  }

  /* ============================================================
     BUILD CARD ELEMENT
  ============================================================ */
  #buildCard(task) {
    const card = DOM.create('div', {
      class:           'kanban-card',
      'data-id':       task.id,
      'data-status':   task.status,
      'data-priority': task.priority,
      'data-color':    task.color ?? 'default',
      draggable:       'true',
      role:            'article',
      'aria-label':    `مهمة: ${task.title}`,
      tabindex:        '0',
    });

    /* Due date status */
    const dueClass  = task.dueDate
      ? DateUtils.isOverdue(task.dueDate) && task.status !== 'done'
        ? 'overdue'
        : DateUtils.isToday(task.dueDate)
          ? 'today'
          : DateUtils.isTomorrow(task.dueDate)
            ? 'soon'
            : ''
      : '';

    /* Checklist summary */
    const checklist   = task.checklist ?? [];
    const checkDone   = checklist.filter(c => c.done).length;
    const checkRatio  = checklist.length
      ? Math.round((checkDone / checklist.length) * 100)
      : 0;

    /* Tags (max 3) */
    const tags = (task.tags ?? []).slice(0, 3)
      .map(t => `<span class="card-tag">${StringUtils.escapeHTML(t)}</span>`)
      .join('');

    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${StringUtils.escapeHTML(task.title)}</span>
        <button class="card-menu-btn" data-id="${task.id}" aria-label="خيارات المهمة">
          <i class="fas fa-ellipsis-h"></i>
        </button>
      </div>

      ${task.description ? `
        <p class="card-description">
          ${StringUtils.escapeHTML(StringUtils.truncate(task.description, 90))}
        </p>` : ''}

      ${checklist.length ? `
        <div class="card-checklist">
          <div class="card-checklist-progress">
            <div class="checklist-bar">
              <div class="checklist-bar-fill" style="width:${checkRatio}%"></div>
            </div>
            <span class="checklist-ratio">${checkDone}/${checklist.length}</span>
          </div>
          ${checklist.slice(0, 3).map((item, idx) => `
            <div class="card-checklist-item">
              <input
                type="checkbox"
                ${item.done ? 'checked' : ''}
                data-idx="${idx}"
                aria-label="${StringUtils.escapeHTML(item.text)}"
              />
              <span class="${item.done ? 'done' : ''}">
                ${StringUtils.escapeHTML(StringUtils.truncate(item.text, 40))}
              </span>
            </div>
          `).join('')}
          ${checklist.length > 3
            ? `<div class="card-checklist-item text-muted" style="font-size:11px;">
                 +${checklist.length - 3} مهام فرعية أخرى
               </div>`
            : ''}
        </div>` : ''}

      <div class="card-footer">
        <div class="card-tags">${tags}</div>
        <div class="card-meta">
          ${task.dueDate ? `
            <span class="card-due-date ${dueClass}" title="${DateUtils.formatDateTime(task.dueDate)}">
              <i class="fas fa-clock"></i>
              ${DateUtils.isToday(task.dueDate)
                ? 'اليوم'
                : DateUtils.isTomorrow(task.dueDate)
                  ? 'غداً'
                  : DateUtils.relative(task.dueDate)}
            </span>` : ''}
          <span class="priority-badge ${task.priority}">
            ${this.#priorityEmoji(task.priority)} ${this.#priorityLabel(task.priority)}
          </span>
        </div>
      </div>

      ${task.estimate ? `
        <div class="card-estimate" style="font-size:10px;color:var(--text-muted);padding-top:4px;">
          <i class="fas fa-hourglass-half"></i> ${task.estimate} دقيقة
        </div>` : ''}
    `;

    /* Keyboard: Enter to open */
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.openCardDetail(task.id);
    });

    return card;
  }

  /* ============================================================
     EMPTY COLUMN
  ============================================================ */
  #renderEmptyColumn(status) {
    const msgs = {
      todo:       { icon: 'fas fa-inbox',        text: 'أضف مهامك هنا' },
      inprogress: { icon: 'fas fa-fire',         text: 'لا توجد مهام جارية' },
      review:     { icon: 'fas fa-eye',          text: 'لا توجد مهام للمراجعة' },
      done:       { icon: 'fas fa-trophy',       text: 'أكمل مهامك لتظهر هنا' },
    };
    const { icon, text } = msgs[status] ?? msgs.todo;
    return `
      <div class="column-empty">
        <i class="${icon}"></i>
        <span>${text}</span>
      </div>
    `;
  }

  /* ============================================================
     CARD CONTEXT MENU
  ============================================================ */
  #showCardContextMenu(e, taskId) {
    const task = Selectors.getTaskById(taskId);
    if (!task) return;

    const moveItems = this.#COLUMNS
      .filter(s => s !== task.status)
      .map(s => ({
        label:  `نقل إلى: ${this.#COLUMN_META[s].label}`,
        icon:   this.#COLUMN_META[s].icon,
        action: () => API.moveTask(taskId, s),
      }));

    Actions.ui.showContextMenu(e.clientX, e.clientY, [
      {
        label:  'عرض التفاصيل',
        icon:   'fas fa-expand-alt',
        action: () => this.openCardDetail(taskId),
      },
      {
        label:  'تعديل',
        icon:   'fas fa-edit',
        action: () => App.openTaskModal({ taskId }),
      },
      { type: 'separator' },
      ...moveItems,
      { type: 'separator' },
      {
        label:  'حذف',
        icon:   'fas fa-trash',
        danger: true,
        action: () => {
          Modal.confirm(
            `هل أنت متأكد من حذف المهمة "${task.title}"؟`,
            () => {
              API.deleteTask(taskId);
              Toast.success('تم الحذف', 'تم حذف المهمة بنجاح');
            }
          );
        },
      },
    ], taskId);
  }

  /* ============================================================
     CARD DETAIL MODAL
  ============================================================ */
  openCardDetail(taskId) {
    const task = Selectors.getTaskById(taskId);
    if (!task) return;

    Actions.ui.setEditingTask(taskId);

    const body = DOM.id('taskDetailBody');
    if (!body) return;

    const checklist = task.checklist ?? [];
    const checkDone = checklist.filter(c => c.done).length;

    body.innerHTML = `
      <div class="task-detail-grid">
        <div class="task-detail-main">
          <div class="detail-field">
            <h2 style="font-size:1.4rem;font-weight:800;color:var(--text-primary);margin-bottom:8px;">
              ${StringUtils.escapeHTML(task.title)}
            </h2>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
              <span class="priority-badge ${task.priority}">
                ${this.#priorityEmoji(task.priority)} ${this.#priorityLabel(task.priority)}
              </span>
              <span class="card-tag" style="background:var(--bg-overlay);">
                ${this.#COLUMN_META[task.status]?.label ?? task.status}
              </span>
              ${(task.tags ?? []).map(t =>
                `<span class="card-tag">${StringUtils.escapeHTML(t)}</span>`
              ).join('')}
            </div>
          </div>

          ${task.description ? `
            <div class="detail-field">
              <div class="detail-field-label"><i class="fas fa-align-left"></i> الوصف</div>
              <div class="note-preview" style="padding:12px;background:var(--bg-elevated);border-radius:8px;">
                ${MarkdownUtils.render(task.description)}
              </div>
            </div>` : ''}

          ${checklist.length ? `
            <div class="detail-field">
              <div class="detail-field-label">
                <i class="fas fa-list-check"></i>
                المهام الفرعية (${checkDone}/${checklist.length})
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                ${checklist.map((item, idx) => `
                  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;
                                padding:8px;border-radius:6px;background:var(--bg-elevated);">
                    <input
                      type="checkbox"
                      ${item.done ? 'checked' : ''}
                      data-task-id="${task.id}"
                      data-idx="${idx}"
                      style="accent-color:var(--accent);width:16px;height:16px;"
                    />
                    <span style="${item.done ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">
                      ${StringUtils.escapeHTML(item.text)}
                    </span>
                  </label>
                `).join('')}
              </div>
            </div>` : ''}
        </div>

        <div class="task-detail-sidebar">
          <div class="detail-field">
            <div class="detail-field-label"><i class="fas fa-calendar"></i> تاريخ الاستحقاق</div>
            <div class="detail-field-value">
              ${task.dueDate
                ? `<span class="${DateUtils.isOverdue(task.dueDate) && task.status !== 'done' ? 'text-danger' : ''}">
                     ${DateUtils.formatDateTime(task.dueDate)}
                     <br><small style="color:var(--text-muted);">${DateUtils.relative(task.dueDate)}</small>
                   </span>`
                : '<span style="color:var(--text-muted);">غير محدد</span>'}
            </div>
          </div>

          ${task.estimate ? `
            <div class="detail-field">
              <div class="detail-field-label"><i class="fas fa-hourglass-half"></i> الوقت المقدر</div>
              <div class="detail-field-value">${task.estimate} دقيقة</div>
            </div>` : ''}

          <div class="detail-field">
            <div class="detail-field-label"><i class="fas fa-clock"></i> تاريخ الإنشاء</div>
            <div class="detail-field-value">
              ${DateUtils.format(task.createdAt)} <br>
              <small style="color:var(--text-muted);">${DateUtils.relative(task.createdAt)}</small>
            </div>
          </div>

          ${task.completedAt ? `
            <div class="detail-field">
              <div class="detail-field-label"><i class="fas fa-check-circle text-success"></i> تاريخ الإكمال</div>
              <div class="detail-field-value">${DateUtils.format(task.completedAt)}</div>
            </div>` : ''}

          <div class="detail-field">
            <div class="detail-field-label"><i class="fas fa-flag"></i> الأولوية</div>
            <div class="detail-field-value">
              <span class="priority-badge ${task.priority}">
                ${this.#priorityEmoji(task.priority)} ${this.#priorityLabel(task.priority)}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;

    /* Subtask checkbox in detail modal */
    DOM.delegate(body, 'input[type="checkbox"][data-task-id]', 'change', (e, cb) => {
      const tId = cb.dataset.taskId;
      const idx  = parseInt(cb.dataset.idx);
      Actions.tasks.toggleSubtask(tId, idx);
      /* Re-render detail */
      setTimeout(() => this.openCardDetail(tId), 50);
    });

    Modal.open('taskDetailOverlay');
  }

  /* ============================================================
     HELPERS
  ============================================================ */
  #priorityEmoji(p) {
    return { urgent:'🔴', high:'🟠', medium:'🟡', low:'🟢' }[p] ?? '⚪';
  }

  #priorityLabel(p) {
    return { urgent:'عاجل', high:'مرتفع', medium:'متوسط', low:'منخفض' }[p] ?? p;
  }
}

/* ---- Singleton Export ---- */
window.KanbanComponent = new KanbanBoardComponent();