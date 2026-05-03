/* ============================================================
   المدير — Notes Editor Component v2.0.0
   محرر ملاحظات بأسلوب Obsidian:
   Markdown، KaTeX، Wiki Links، Zen Mode، TOC، Export
   ============================================================ */

'use strict';

class NotesEditorComponent {

  #autosaveTimer  = null;
  #currentNoteId  = null;
  #viewMode       = 'edit';    // 'edit' | 'split' | 'preview'
  #isZen          = false;
  #wikiLinkCache  = new Map();

  /* ============================================================
     INIT
  ============================================================ */
  init() {
    this.#bindEditorEvents();
    this.#bindToolbarEvents();
    this.#bindSidebarEvents();
    this.#bindZenMode();
    this.#bindViewToggle();
    this.#subscribeToState();
    console.log('[Notes] ✅ Initialized');
  }

  /* ============================================================
     REFRESH (called when tab activates)
  ============================================================ */
  refresh() {
    this.renderList();
    /* Re-open last active note */
    const lastId = State.get('notes.activeNoteId');
    if (lastId) {
      const note = Selectors.getNoteById(lastId);
      if (note) this.openNote(lastId);
    }
  }

  /* ============================================================
     SUBSCRIBE TO STATE
  ============================================================ */
  #subscribeToState() {
    State.subscribe('notes.items',      () => this.renderList());
    State.subscribe('notes.isZenMode',  (zen) => this.#handleZenChange(zen));
    State.subscribe('notes.viewMode',   (mode) => this.#applyViewMode(mode));
    State.subscribe('notes.tocVisible', (vis)  => {
      DOM.id('tocPanel').style.display = vis ? 'block' : 'none';
    });
  }

  /* ============================================================
     RENDER NOTES LIST (Sidebar)
  ============================================================ */
  renderList() {
    const container = DOM.id('notesList');
    if (!container) return;

    DOM.empty(container);

    const notes = Actions.notes.getFiltered();

    if (!notes.length) {
      container.innerHTML = `
        <div class="empty-state-mini" style="flex-direction:column;padding:24px 16px;">
          <i class="fas fa-scroll" style="font-size:2rem;margin-bottom:8px;opacity:0.3;"></i>
          <span>لا توجد ملاحظات</span>
        </div>
      `;
      return;
    }

    /* Group by folder */
    const grouped = notes.reduce((acc, note) => {
      const folder = note.folder ?? 'general';
      acc[folder]  = acc[folder] ?? [];
      acc[folder].push(note);
      return acc;
    }, {});

    const folderLabels = {
      general:  '📂 عام',
      work:     '💼 عمل',
      personal: '👤 شخصي',
      ideas:    '💡 أفكار',
      research: '🔬 بحث',
    };

    for (const [folder, folderNotes] of Object.entries(grouped)) {
      /* Folder header */
      const header = DOM.create('div', {
        class: 'note-list-folder-header',
        style: 'padding:4px 12px;font-size:11px;font-weight:700;color:var(--text-muted);margin-top:8px;',
      });
      header.textContent = folderLabels[folder] ?? folder;
      container.appendChild(header);

      /* Notes in folder */
      for (const note of folderNotes) {
        const isActive = note.id === this.#currentNoteId;
        const item     = DOM.create('div', {
          class:     `note-list-item${isActive ? ' active' : ''}`,
          'data-id': note.id,
          role:      'button',
          tabindex:  '0',
          title:     note.title,
        });

        item.innerHTML = `
          <div class="note-list-title">${StringUtils.escapeHTML(note.title)}</div>
          <div class="note-list-preview">
            ${StringUtils.escapeHTML(
              StringUtils.truncate(StringUtils.stripMarkdown(note.content), 50)
            )}
          </div>
          <div class="note-list-meta">
            <span class="note-list-date">${DateUtils.relative(note.updatedAt)}</span>
            <span class="note-list-folder">${folderLabels[folder] ?? folder}</span>
          </div>
        `;

        item.addEventListener('click', () => this.openNote(note.id));
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.openNote(note.id);
        });

        /* Right-click context menu */
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.#showNoteContextMenu(e, note.id);
        });

        container.appendChild(item);
      }
    }
  }

  /* ============================================================
     OPEN NOTE
  ============================================================ */
  openNote(noteId) {
    const note = Selectors.getNoteById(noteId);
    if (!note) return;

    /* Save current note first */
    if (this.#currentNoteId && this.#currentNoteId !== noteId) {
      this.saveActive();
    }

    this.#currentNoteId = noteId;
    Actions.notes.setActive(noteId);

    /* Show editor, hide empty state */
    DOM.show(DOM.id('notesEditorContainer'), 'flex');
    DOM.hide(DOM.id('notesEmptyState'));

    /* Populate fields */
    const titleInput = DOM.id('noteTitleInput');
    const editor     = DOM.id('noteEditor');
    const zenTitle   = DOM.id('zenTitle');
    const zenEditor  = DOM.id('zenEditor');

    if (titleInput) titleInput.value = note.title ?? '';
    if (editor)     editor.value     = note.content ?? '';
    if (zenTitle)   zenTitle.value   = note.title ?? '';
    if (zenEditor)  zenEditor.value  = note.content ?? '';

    /* Tags */
    this.#renderTags(note.tags ?? []);

    /* Word/char count */
    this.#updateCounts(note.content ?? '');

    /* Last edited */
    const lastEdited = DOM.id('noteLastEdited');
    if (lastEdited) {
      lastEdited.textContent = `آخر تعديل: ${DateUtils.relative(note.updatedAt)}`;
    }

    /* Render preview if split/preview mode */
    this.#renderPreview(note.content ?? '');

    /* TOC */
    this.#renderTOC(note.content ?? '');

    /* Update sidebar selection */
    DOM.$$('.note-list-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === noteId);
    });

    /* Auto-resize editor */
    DOM.autoResize(editor);

    /* Focus editor */
    if (this.#viewMode !== 'preview') {
      DOM.focus(editor, { end: true });
    }

    /* Hide saved badge */
    DOM.id('noteSavedBadge')?.classList.remove('visible');
  }

  /* ============================================================
     BIND EDITOR EVENTS
  ============================================================ */
  #bindEditorEvents() {
    const editor = DOM.id('noteEditor');
    if (!editor) return;

    /* Input → live preview + autosave */
    editor.addEventListener('input', () => {
      const content  = editor.value;
      const noteId   = this.#currentNoteId;
      if (!noteId) return;

      this.#updateCounts(content);
      this.#renderPreview(content);
      this.#renderTOC(content);
      Actions.notes.markUnsaved();

      /* Autosave debounce */
      clearTimeout(this.#autosaveTimer);
      this.#autosaveTimer = setTimeout(() => {
        this.saveActive();
      }, State.get('settings.autosaveDelay') ?? 2000);
    });

    /* Tab key → indent */
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        DOM.insertAtCursor(editor, '  ');
      }
    });

    /* Auto-resize */
    editor.addEventListener('input', () => DOM.autoResize(editor));

    /* Title input */
    const titleInput = DOM.id('noteTitleInput');
    titleInput?.addEventListener('input', Perf.debounce(() => {
      const noteId = this.#currentNoteId;
      if (!noteId) return;
      Actions.notes.update(noteId, { title: titleInput.value });
      Actions.notes.markUnsaved();
      this.renderList();

      clearTimeout(this.#autosaveTimer);
      this.#autosaveTimer = setTimeout(() => this.saveActive(), 2000);
    }, 400));

    /* Tags */
    DOM.id('tagInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tag = e.target.value.trim();
        if (tag) {
          this.#addTag(tag);
          e.target.value = '';
        }
      }
    });

    /* Wiki link click in preview */
    DOM.delegate(
      DOM.id('notePreviewPane'),
      '.wiki-link',
      'click',
      (e, link) => {
        e.preventDefault();
        const noteName = link.dataset.note;
        const target   = State.get('notes.items')
          .find(n => n.title.toLowerCase() === noteName.toLowerCase());
        if (target) {
          this.openNote(target.id);
        } else {
          Modal.confirm(
            `ملاحظة "${noteName}" غير موجودة. هل تريد إنشاؤها؟`,
            () => API.createNote({ title: noteName }).then(res => {
              if (res.data?.id) this.openNote(res.data.id);
            })
          );
        }
      }
    );
  }

  /* ============================================================
     BIND TOOLBAR EVENTS
  ============================================================ */
  #bindToolbarEvents() {
    const editor = DOM.id('noteEditor');

    /* Format buttons */
    DOM.delegate(document, '.toolbar-btn[data-action]', 'click', (e, btn) => {
      const action = btn.dataset.action;
      this.#applyFormat(action, editor);
    });

    /* TOC toggle */
    DOM.id('tocToggleBtn')?.addEventListener('click', () => {
      Actions.notes.setTocVisible(!State.get('notes.tocVisible'));
    });

    DOM.id('tocCloseBtn')?.addEventListener('click', () => {
      Actions.notes.setTocVisible(false);
    });

    /* Zen mode */
    DOM.id('zenModeBtn')?.addEventListener('click', () => {
      Actions.notes.setZenMode(true);
    });

    /* Export */
    DOM.id('exportNoteBtn')?.addEventListener('click', () => {
      this.exportActive();
    });

    /* Delete */
    DOM.id('deleteNoteBtn')?.addEventListener('click', () => {
      const noteId = this.#currentNoteId;
      if (!noteId) return;
      const note   = Selectors.getNoteById(noteId);
      Modal.confirm(
        `هل أنت متأكد من حذف ملاحظة "${note?.title ?? ''}"؟`,
        async () => {
          await API.deleteNote(noteId);
          this.#currentNoteId = null;
          DOM.hide(DOM.id('notesEditorContainer'));
          DOM.show(DOM.id('notesEmptyState'), 'flex');
          Toast.success('تم الحذف', 'تم حذف الملاحظة بنجاح');
          this.renderList();
        }
      );
    });

    /* Keyboard shortcuts in editor */
    DOM.id('noteEditor')?.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') { e.preventDefault(); this.#applyFormat('bold', editor); }
        if (e.key === 'i') { e.preventDefault(); this.#applyFormat('italic', editor); }
        if (e.key === 's') { e.preventDefault(); this.saveActive(); }
        if (e.key === 'e') { e.preventDefault(); this.exportActive(); }
      }
    });
  }

  /* ============================================================
     APPLY FORMATTING
  ============================================================ */
  #applyFormat(action, editor) {
    if (!editor) return;

    const formats = {
      bold:          { before: '**',  after: '**',  placeholder: 'نص غامق' },
      italic:        { before: '*',   after: '*',   placeholder: 'نص مائل' },
      strikethrough: { before: '~~',  after: '~~',  placeholder: 'نص محذوف' },
      code:          { before: '`',   after: '`',   placeholder: 'كود' },
      link:          { before: '[',   after: '](رابط)', placeholder: 'نص الرابط' },
      math:          { before: '$',   after: '$',   placeholder: 'معادلة' },
    };

    if (action === 'table') {
      const tableText = `\n| العمود 1 | العمود 2 | العمود 3 |\n|---------|---------|----------|\n| خلية    | خلية    | خلية     |\n`;
      DOM.insertAtCursor(editor, tableText, '');
      return;
    }

    const fmt = formats[action];
    if (fmt) {
      DOM.insertAtCursor(editor, fmt.before, fmt.after, fmt.placeholder);
      editor.dispatchEvent(new Event('input'));
    }
  }

  /* ============================================================
     VIEW MODE TOGGLE
  ============================================================ */
  #bindViewToggle() {
    DOM.$$('#noteViewGroup .toolbar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.view;
        Actions.notes.setViewMode(mode);
        DOM.$$('#noteViewGroup .toolbar-btn').forEach(b =>
          b.classList.toggle('active', b === btn)
        );
      });
    });
  }

  #applyViewMode(mode) {
    this.#viewMode = mode;
    const editorPane  = DOM.id('noteEditorPane');
    const previewPane = DOM.id('notePreviewPane');

    switch (mode) {
      case 'edit':
        DOM.show(editorPane,  'flex');
        DOM.hide(previewPane);
        editorPane.classList.remove('split');
        break;
      case 'split':
        DOM.show(editorPane,  'flex');
        DOM.show(previewPane, 'flex');
        editorPane.classList.add('split');
        this.#renderPreview(DOM.id('noteEditor')?.value ?? '');
        break;
      case 'preview':
        DOM.hide(editorPane);
        DOM.show(previewPane, 'flex');
        this.#renderPreview(DOM.id('noteEditor')?.value ?? '');
        break;
    }
  }

  /* ============================================================
     RENDER PREVIEW
  ============================================================ */
  #renderPreview(content) {
    if (this.#viewMode === 'edit') return;

    const preview = DOM.id('notePreview');
    if (!preview) return;

    const html = MarkdownUtils.render(content, {
      sanitize:  true,
      katex:     true,
      wikiLinks: true,
      onWikiLink: (name) => `#wiki-${StringUtils.slugify(name)}`,
    });

    preview.innerHTML = html;

    /* Highlight code blocks */
    if (typeof hljs !== 'undefined') {
      preview.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
      });
    }

    /* Render KaTeX (auto-render for any missed) */
    if (typeof renderMathInElement !== 'undefined') {
      try {
        renderMathInElement(preview, {
          delimiters: [
            { left: '$$', right: '$$', display: true  },
            { left: '$',  right: '$',  display: false },
          ],
          throwOnError: false,
        });
      } catch {}
    }
  }

  /* ============================================================
     RENDER TOC
  ============================================================ */
  #renderTOC(content) {
    const tocList = DOM.id('tocList');
    if (!tocList) return;

    const headings = StringUtils.extractHeadings(content);
    DOM.empty(tocList);

    if (!headings.length) {
      tocList.innerHTML = `<li style="color:var(--text-muted);font-size:12px;padding:8px;">
        لا توجد عناوين
      </li>`;
      return;
    }

    for (const h of headings) {
      const li = DOM.create('li', {
        class: `toc-item h${h.level}`,
        title: h.text,
      });
      li.textContent = h.text;
      li.addEventListener('click', () => {
        /* Scroll to heading in preview */
        const target = DOM.id('notePreview')?.querySelector(`#${h.id}`);
        target?.scrollIntoView({ behavior: 'smooth' });
        /* In edit mode: find line in textarea */
        if (this.#viewMode === 'edit') {
          const editor   = DOM.id('noteEditor');
          const lines    = editor?.value.split('\n') ?? [];
          const lineIdx  = lines.findIndex(l => l.includes(h.text));
          if (lineIdx !== -1 && editor) {
            const pos = lines.slice(0, lineIdx).join('\n').length;
            editor.setSelectionRange(pos, pos);
            editor.focus();
          }
        }
      });
      tocList.appendChild(li);
    }
  }

  /* ============================================================
     TAGS MANAGEMENT
  ============================================================ */
  #renderTags(tags) {
    const list = DOM.id('noteTagsList');
    if (!list) return;
    DOM.empty(list);

    for (const tag of tags) {
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
      chip.querySelector('.tag-chip-remove').addEventListener('click', () => {
        chip.remove();
        this.#saveTagsFromDOM();
      });
      list.appendChild(chip);
    }
  }

  #addTag(tag) {
    const noteId = this.#currentNoteId;
    if (!noteId) return;
    const note = Selectors.getNoteById(noteId);
    const tags = note?.tags ?? [];
    if (tags.includes(tag)) return;
    const newTags = [...tags, tag];
    this.#renderTags(newTags);
    Actions.notes.update(noteId, { tags: newTags });
    this.saveActive();
  }

  #saveTagsFromDOM() {
    const noteId = this.#currentNoteId;
    if (!noteId) return;
    const tags = [...DOM.$$('#noteTagsList .tag-chip')]
      .map(c => c.dataset.tag);
    Actions.notes.update(noteId, { tags });
    this.saveActive();
  }

  /* ============================================================
     UPDATE WORD / CHAR COUNT
  ============================================================ */
  #updateCounts(content) {
    const words = StringUtils.wordCount(content);
    const chars  = content.length;
    const readT  = StringUtils.readTime(content);

    DOM.setText(DOM.id('noteWordCount'),   `${words} كلمة`);
    DOM.setText(DOM.id('noteCharCount'),   `${chars} حرف`);
    DOM.setText(DOM.id('noteReadTime'),    `~${readT} دقيقة قراءة`);
    DOM.setText(DOM.id('zenWordCount'),    `${words} كلمة`);
    DOM.setText(DOM.id('zenTime'),         DateUtils.formatTime(new Date()));

    Actions.notes.setWordCount(words);
    Actions.notes.setCharCount(chars);
  }

  /* ============================================================
     SAVE ACTIVE NOTE
  ============================================================ */
  async saveActive() {
    const noteId = this.#currentNoteId;
    if (!noteId) return;

    const editor     = DOM.id('noteEditor');
    const titleInput = DOM.id('noteTitleInput');
    const content    = editor?.value     ?? '';
    const title      = titleInput?.value ?? '';

    const wordCount = StringUtils.wordCount(content);
    const charCount = content.length;
    const readTime  = StringUtils.readTime(content);

    /* Extract wiki links */
    const links = StringUtils.extractWikiLinks(content);

    Actions.notes.update(noteId, {
      title, content, links,
      wordCount, charCount, readTime,
    });

    const result = await API.saveNote(noteId, {
      title, content, links,
      wordCount, charCount, readTime,
    });

    if (result.success || result.queued) {
      /* Show saved badge */
      const badge = DOM.id('noteSavedBadge');
      badge?.classList.add('visible');
      setTimeout(() => badge?.classList.remove('visible'), 2000);

      Actions.notes.markSaved();
    }

    this.renderList();
  }

  /* ============================================================
     EXPORT NOTE AS .md
  ============================================================ */
  exportActive() {
    const noteId = this.#currentNoteId;
    if (!noteId) return;

    const note = Selectors.getNoteById(noteId);
    if (!note) return;

    const frontmatter = [
      '---',
      `title: "${note.title}"`,
      `date: ${new Date(note.createdAt).toISOString()}`,
      `tags: [${(note.tags ?? []).join(', ')}]`,
      `folder: ${note.folder ?? 'general'}`,
      '---',
      '',
    ].join('\n');

    FileUtils.downloadMarkdown(frontmatter + note.content, note.title);
    Toast.success('تم التصدير', `تم تصدير "${note.title}" كملف Markdown`);
  }

  /* ============================================================
     ZEN MODE
  ============================================================ */
  #bindZenMode() {
    /* Zen editor sync */
    DOM.id('zenEditor')?.addEventListener('input', (e) => {
      const editor = DOM.id('noteEditor');
      if (editor) editor.value = e.target.value;
      this.#updateCounts(e.target.value);
      editor?.dispatchEvent(new Event('input'));
    });

    DOM.id('zenTitle')?.addEventListener('input', (e) => {
      const titleInput = DOM.id('noteTitleInput');
      if (titleInput) titleInput.value = e.target.value;
      titleInput?.dispatchEvent(new Event('input'));
    });

    /* Exit zen */
    DOM.id('zenExitBtn')?.addEventListener('click', () => {
      Actions.notes.setZenMode(false);
    });

    /* F11 shortcut */
    Shortcuts.register('f11', () => {
      if (State.get('app.activeTab') === 'notes') {
        Actions.notes.setZenMode(!State.get('notes.isZenMode'));
      }
    }, { global: true });
  }

  #handleZenChange(isZen) {
    this.#isZen = isZen;
    const overlay = DOM.id('zenModeOverlay');

    if (isZen) {
      DOM.show(overlay, 'flex');
      /* Sync content */
      const editor  = DOM.id('noteEditor');
      const title   = DOM.id('noteTitleInput');
      const zenEd   = DOM.id('zenEditor');
      const zenTi   = DOM.id('zenTitle');
      if (editor && zenEd) zenEd.value = editor.value;
      if (title  && zenTi) zenTi.value = title.value;
      DOM.focus(zenEd, { end: true });
    } else {
      DOM.hide(overlay);
      /* Sync back */
      const zenEd = DOM.id('zenEditor');
      const editor = DOM.id('noteEditor');
      if (zenEd && editor) {
        editor.value = zenEd.value;
        editor.dispatchEvent(new Event('input'));
      }
      DOM.focus(editor, { end: true });
    }
  }

  /* ============================================================
     SIDEBAR EVENTS
  ============================================================ */
  #bindSidebarEvents() {
    /* Add note button */
    DOM.id('addNoteBtn')?.addEventListener('click', () => {
      App.openNoteModal();
    });

    /* Search */
    DOM.id('searchNotesBtn')?.addEventListener('click', () => {
      const box = DOM.id('notesSearchBox');
      const visible = DOM.isVisible(box);
      visible ? DOM.hide(box) : DOM.show(box, 'block');
      if (!visible) DOM.focus(DOM.id('notesSearchInput'));
    });

    DOM.id('notesSearchInput')?.addEventListener(
      'input',
      Perf.debounce((e) => {
        Actions.notes.setSearch(e.target.value);
        this.renderList();
      }, 250)
    );
  }

  /* ============================================================
     NOTE CONTEXT MENU (right-click in list)
  ============================================================ */
  #showNoteContextMenu(e, noteId) {
    const note = Selectors.getNoteById(noteId);
    if (!note) return;

    Actions.ui.showContextMenu(e.clientX, e.clientY, [
      {
        label:  'فتح',
        icon:   'fas fa-folder-open',
        action: () => this.openNote(noteId),
      },
      {
        label:  'تصدير كـ Markdown',
        icon:   'fas fa-file-download',
        action: () => {
          this.openNote(noteId);
          setTimeout(() => this.exportActive(), 100);
        },
      },
      {
        label:  'نسخ المحتوى',
        icon:   'fas fa-copy',
        action: async () => {
          await DOM.copyToClipboard(note.content ?? '');
          Toast.success('تم النسخ', 'تم نسخ محتوى الملاحظة');
        },
      },
      { type: 'separator' },
      {
        label:  'حذف',
        icon:   'fas fa-trash',
        danger: true,
        action: () => {
          Modal.confirm(
            `هل أنت متأكد من حذف "${note.title}"؟`,
            async () => {
              await API.deleteNote(noteId);
              if (this.#currentNoteId === noteId) {
                this.#currentNoteId = null;
                DOM.hide(DOM.id('notesEditorContainer'));
                DOM.show(DOM.id('notesEmptyState'), 'flex');
              }
              this.renderList();
              Toast.success('تم الحذف', 'تم حذف الملاحظة');
            }
          );
        },
      },
    ], noteId);
  }
}

/* ---- Singleton Export ---- */
window.NotesComponent = new NotesEditorComponent();