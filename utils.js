/* ============================================================
   المدير — Ultimate Productivity Workspace
   utils.js | Utilities Library v2.0.0

   مكتبة شاملة للأدوات المساعدة:
   DOM، التاريخ، النصوص، Markdown، الصوت،
   التحقق، التشفير، الأداء، وغيرها
   ============================================================ */

'use strict';

/* ============================================================
   1. DOM UTILITIES
   ============================================================ */
const DOM = {

  /* --- Query Selectors --- */
  $:   (selector, parent = document) => parent.querySelector(selector),
  $$:  (selector, parent = document) => [...parent.querySelectorAll(selector)],
  id:  (id) => document.getElementById(id),

  /* --- Element Creation --- */
  create(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);

    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'class' || key === 'className') {
        el.className = Array.isArray(val) ? val.join(' ') : val;
      } else if (key === 'style' && typeof val === 'object') {
        Object.assign(el.style, val);
      } else if (key === 'dataset' && typeof val === 'object') {
        Object.assign(el.dataset, val);
      } else if (key.startsWith('on') && typeof val === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === 'html') {
        el.innerHTML = val;
      } else if (key === 'text') {
        el.textContent = val;
      } else if (val !== null && val !== undefined) {
        el.setAttribute(key, val);
      }
    }

    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    }

    return el;
  },

  /* --- Class Manipulation --- */
  addClass:    (el, ...classes)  => el?.classList.add(...classes),
  removeClass: (el, ...classes)  => el?.classList.remove(...classes),
  toggleClass: (el, cls, force)  => el?.classList.toggle(cls, force),
  hasClass:    (el, cls)         => el?.classList.contains(cls) ?? false,
  replaceClass:(el, old, nw)     => { el?.classList.remove(old); el?.classList.add(nw); },

  /* --- Visibility --- */
  show(el, display = 'flex') {
    if (!el) return;
    el.style.display = display;
    el.removeAttribute('hidden');
  },

  hide(el) {
    if (!el) return;
    el.style.display = 'none';
  },

  toggle(el, display = 'flex') {
    if (!el) return;
    const isHidden = el.style.display === 'none' || el.hidden;
    isHidden ? DOM.show(el, display) : DOM.hide(el);
  },

  isVisible(el) {
    if (!el) return false;
    return el.style.display !== 'none' &&
           !el.hidden &&
           el.offsetParent !== null;
  },

  /* --- Attribute Helpers --- */
  setAttrs(el, attrs) {
    if (!el) return;
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) {
        el.removeAttribute(k);
      } else {
        el.setAttribute(k, v);
      }
    }
  },

  getData:  (el, key) => el?.dataset?.[key],
  setData:  (el, key, val) => { if (el) el.dataset[key] = val; },

  /* --- Content --- */
  setText: (el, text) => { if (el) el.textContent = text ?? ''; },
  setHTML: (el, html) => { if (el) el.innerHTML   = html ?? ''; },

  /* --- Focus Management --- */
  focus(el, options = {}) {
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus(options);
      if (options.selectAll && el.select) el.select();
      if (options.end) {
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  },

  /* --- Scroll --- */
  scrollTo(el, options = { behavior: 'smooth', block: 'start' }) {
    el?.scrollIntoView(options);
  },

  scrollToBottom(el) {
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  },

  isScrolledToBottom(el, threshold = 50) {
    if (!el) return false;
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  },

  /* --- Position & Size --- */
  getRect:   (el) => el?.getBoundingClientRect() ?? null,
  getOffset: (el) => {
    if (!el) return { top: 0, left: 0 };
    const rect = el.getBoundingClientRect();
    return {
      top:  rect.top  + window.scrollY,
      left: rect.left + window.scrollX,
    };
  },

  /* --- Clipboard --- */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* Fallback */
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  },

  async readClipboard() {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  },

  /* --- Textarea Helpers --- */
  insertAtCursor(textarea, before, after = '', placeholder = '') {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end   = textarea.selectionEnd;
    const sel   = textarea.value.slice(start, end) || placeholder;
    const newVal =
      textarea.value.slice(0, start) +
      before + sel + after +
      textarea.value.slice(end);

    textarea.value = newVal;
    const newPos = start + before.length + sel.length;
    textarea.setSelectionRange(
      start + before.length,
      newPos
    );
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
  },

  autoResize(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  },

  /* --- Templates --- */
  fromTemplate(templateId, data = {}) {
    const tpl = document.getElementById(templateId);
    if (!tpl) return null;
    let html = tpl.innerHTML;
    for (const [k, v] of Object.entries(data)) {
      html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v ?? '');
    }
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    return wrapper.firstElementChild;
  },

  /* --- Event Delegation --- */
  delegate(parent, selector, event, handler) {
    parent?.addEventListener(event, (e) => {
      const target = e.target.closest(selector);
      if (target && parent.contains(target)) {
        handler(e, target);
      }
    });
  },

  /* --- Remove all children --- */
  empty(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  },

  /* --- Safe Remove --- */
  remove(el) {
    el?.parentNode?.removeChild(el);
  },
};

/* ============================================================
   2. DATE & TIME UTILITIES
   ============================================================ */
const DateUtils = {

  /* Arabic month names */
  MONTHS_AR: [
    'يناير','فبراير','مارس','أبريل','مايو','يونيو',
    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
  ],

  DAYS_AR: ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],

  DAYS_SHORT_AR: ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'],

  /* Parse any date input */
  parse(input) {
    if (!input) return null;
    if (input instanceof Date) return isNaN(input) ? null : input;
    const d = new Date(input);
    return isNaN(d) ? null : d;
  },

  /* Format date to Arabic locale */
  format(input, options = {}) {
    const d = this.parse(input);
    if (!d) return '—';

    const defaults = {
      year:  'numeric',
      month: 'long',
      day:   'numeric',
    };

    return d.toLocaleDateString('ar-SA', { ...defaults, ...options });
  },

  /* Format datetime */
  formatDateTime(input) {
    const d = this.parse(input);
    if (!d) return '—';
    return d.toLocaleString('ar-SA', {
      year:   'numeric',
      month:  'short',
      day:    'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    });
  },

  /* Format time only */
  formatTime(input) {
    const d = this.parse(input);
    if (!d) return '—';
    return d.toLocaleTimeString('ar-SA', {
      hour:   '2-digit',
      minute: '2-digit',
    });
  },

  /* Relative time (مثل: "منذ 5 دقائق") */
  relative(input) {
    const d   = this.parse(input);
    if (!d) return '—';
    const now = Date.now();
    const diff = now - d.getTime(); // ms
    const abs  = Math.abs(diff);
    const isFuture = diff < 0;

    const units = [
      { limit: 60 * 1000,           unit: 'ثانية',  div: 1000 },
      { limit: 60 * 60 * 1000,      unit: 'دقيقة',  div: 60 * 1000 },
      { limit: 24 * 60 * 60 * 1000, unit: 'ساعة',   div: 60 * 60 * 1000 },
      { limit: 7  * 24 * 60 * 60 * 1000, unit: 'يوم', div: 24 * 60 * 60 * 1000 },
      { limit: 30 * 24 * 60 * 60 * 1000, unit: 'أسبوع', div: 7 * 24 * 60 * 60 * 1000 },
      { limit: 365 * 24 * 60 * 60 * 1000, unit: 'شهر', div: 30 * 24 * 60 * 60 * 1000 },
      { limit: Infinity,             unit: 'سنة',   div: 365 * 24 * 60 * 60 * 1000 },
    ];

    if (abs < 5000) return 'الآن';

    for (const { limit, unit, div } of units) {
      if (abs < limit) {
        const val = Math.round(abs / div);
        return isFuture ? `بعد ${val} ${unit}` : `منذ ${val} ${unit}`;
      }
    }
    return this.format(d);
  },

  /* Is today */
  isToday(input) {
    const d = this.parse(input);
    if (!d) return false;
    return d.toDateString() === new Date().toDateString();
  },

  /* Is tomorrow */
  isTomorrow(input) {
    const d = this.parse(input);
    if (!d) return false;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return d.toDateString() === tomorrow.toDateString();
  },

  /* Is this week */
  isThisWeek(input) {
    const d = this.parse(input);
    if (!d) return false;
    const now  = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return d >= start && d < end;
  },

  /* Is overdue */
  isOverdue(input) {
    const d = this.parse(input);
    if (!d) return false;
    return d < new Date();
  },

  /* Days until */
  daysUntil(input) {
    const d   = this.parse(input);
    if (!d) return null;
    const diff = d.getTime() - new Date().setHours(0,0,0,0);
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  },

  /* Start of day */
  startOfDay(input = new Date()) {
    const d = this.parse(input) ?? new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  },

  /* End of day */
  endOfDay(input = new Date()) {
    const d = this.parse(input) ?? new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  },

  /* Add days */
  addDays(input, days) {
    const d = new Date(this.parse(input) ?? new Date());
    d.setDate(d.getDate() + days);
    return d;
  },

  /* Format for <input type="datetime-local"> */
  toInputFormat(input = new Date()) {
    const d = this.parse(input) ?? new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  /* Get week days array for heatmap */
  getLastNDays(n = 35) {
    return Array.from({ length: n }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (n - 1 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });
  },

  /* Current time greeting */
  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 5)  return 'طاب ليلك 🌙';
    if (hour < 12) return 'صباح الخير ☀️';
    if (hour < 17) return 'مساء النور 🌤️';
    if (hour < 21) return 'مساء الخير 🌆';
    return 'طاب مساؤك 🌙';
  },

  /* Format seconds as MM:SS */
  formatSeconds(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  },

  /* Format duration in ms to human readable */
  formatDuration(ms) {
    const secs  = Math.floor(ms / 1000);
    const mins  = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0)  return `${hours}س ${mins % 60}د`;
    if (mins > 0)   return `${mins}د ${secs % 60}ث`;
    return `${secs}ث`;
  },
};

/* ============================================================
   3. STRING UTILITIES
   ============================================================ */
const StringUtils = {

  /* Truncate with ellipsis */
  truncate(str, max = 50, suffix = '...') {
    if (!str || str.length <= max) return str ?? '';
    return str.slice(0, max - suffix.length).trimEnd() + suffix;
  },

  /* Slugify (for IDs) */
  slugify(str) {
    return (str ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s\u0600-\u06FF-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  /* Capitalize first letter */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  /* Count words (supports Arabic) */
  wordCount(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).filter(Boolean).length;
  },

  /* Estimated read time (minutes) */
  readTime(str, wpm = 200) {
    const words = this.wordCount(str);
    return Math.max(1, Math.ceil(words / wpm));
  },

  /* Highlight search terms */
  highlight(text, query, className = 'search-highlight') {
    if (!query || !text) return text ?? '';
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex   = new RegExp(`(${escaped})`, 'gi');
    return text.replace(regex, `<mark class="${className}">$1</mark>`);
  },

  /* Extract wiki links [[link]] */
  extractWikiLinks(text) {
    const regex   = /\[\[([^\]]+)\]\]/g;
    const links   = [];
    let   match;
    while ((match = regex.exec(text)) !== null) {
      links.push(match[1].trim());
    }
    return [...new Set(links)];
  },

  /* Replace wiki links with HTML */
  renderWikiLinks(text, onLink = null) {
    return text.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
      const href = onLink ? onLink(name) : `#note-${this.slugify(name)}`;
      return `<a class="wiki-link" data-note="${name}" href="${href}">${name}</a>`;
    });
  },

  /* Strip HTML tags */
  stripHTML(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent ?? tmp.innerText ?? '';
  },

  /* Strip Markdown symbols */
  stripMarkdown(md) {
    return (md ?? '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/!\[.+?\]\(.+?\)/g, '')
      .replace(/^\s*[-*+]\s/gm, '')
      .replace(/^\s*\d+\.\s/gm, '')
      .replace(/^\s*>/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  },

  /* Extract headings for TOC */
  extractHeadings(markdown) {
    const regex    = /^(#{1,6})\s+(.+)$/gm;
    const headings = [];
    let   match;
    while ((match = regex.exec(markdown)) !== null) {
      headings.push({
        level: match[1].length,
        text:  match[2].trim(),
        id:    this.slugify(match[2]),
      });
    }
    return headings;
  },

  /* Escape HTML */
  escapeHTML(str) {
    const map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' };
    return (str ?? '').replace(/[&<>"']/g, c => map[c]);
  },

  /* Generate unique ID */
  uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  },

  /* Format file size */
  formatSize(bytes) {
    if (bytes < 1024)                    return `${bytes} B`;
    if (bytes < 1024 * 1024)             return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  },

  /* Pad number */
  pad: (n, size = 2) => String(n).padStart(size, '0'),

  /* Is Arabic text */
  isArabic(str) {
    return /[\u0600-\u06FF]/.test(str ?? '');
  },

  /* Get text direction */
  getDir(str) {
    return this.isArabic(str) ? 'rtl' : 'ltr';
  },

  /* Normalize Arabic text (remove diacritics) */
  normalizeArabic(str) {
    return (str ?? '')
      .replace(/[\u064B-\u065F]/g, '')  // Remove harakat
      .replace(/\u0640/g, '')           // Remove tatweel
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي');
  },

  /* Search match score (for command palette ranking) */
  matchScore(query, target) {
    if (!query || !target) return 0;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    if (t === q)            return 100;
    if (t.startsWith(q))    return 80;
    if (t.includes(q))      return 60;
    /* Fuzzy: check if all chars appear in order */
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) qi++;
    }
    return qi === q.length ? 30 : 0;
  },
};

/* ============================================================
   4. MARKDOWN RENDERER
   ============================================================ */
const MarkdownUtils = {

  /* Renderer instance */
  _renderer: null,

  /* Setup marked.js with custom options */
  setup() {
    if (typeof marked === 'undefined') {
      console.warn('[Markdown] marked.js not loaded');
      return;
    }

    /* Custom renderer */
    const renderer = new marked.Renderer();

    /* Code blocks with syntax highlighting */
    renderer.code = (code, language) => {
      let highlighted = code;
      let validLang   = language ?? '';

      if (typeof hljs !== 'undefined') {
        try {
          if (validLang && hljs.getLanguage(validLang)) {
            highlighted = hljs.highlight(code, { language: validLang }).value;
          } else {
            highlighted = hljs.highlightAuto(code).value;
            validLang   = 'auto';
          }
        } catch { highlighted = StringUtils.escapeHTML(code); }
      } else {
        highlighted = StringUtils.escapeHTML(code);
      }

      return `
        <div class="code-block-wrapper">
          <span class="code-lang-badge">${validLang}</span>
          <button class="code-copy-btn" onclick="Utils.copyCode(this)" title="نسخ الكود">
            <i class="fas fa-copy"></i> نسخ
          </button>
          <pre><code class="hljs language-${validLang}">${highlighted}</code></pre>
        </div>
      `;
    };

    /* Inline code */
    renderer.codespan = (code) => {
      return `<code>${StringUtils.escapeHTML(code)}</code>`;
    };

    /* Links — open external in new tab */
    renderer.link = (href, title, text) => {
      const isExternal = href?.startsWith('http');
      const titleAttr  = title ? ` title="${title}"` : '';
      const target     = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${href}"${titleAttr}${target}>${text}</a>`;
    };

    /* Headings with IDs */
    renderer.heading = (text, level) => {
      const id = StringUtils.slugify(text);
      return `<h${level} id="${id}">${text}</h${level}>`;
    };

    /* Checkboxes in lists */
    renderer.listitem = (text, task, checked) => {
      if (task) {
        const icon = checked
          ? '<i class="fas fa-check-circle text-success"></i>'
          : '<i class="far fa-circle text-muted"></i>';
        return `<li class="task-list-item">${icon} ${text}</li>`;
      }
      return `<li>${text}</li>`;
    };

    /* Images with lazy loading */
    renderer.image = (href, title, alt) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<img src="${href}" alt="${alt ?? ''}"${titleAttr} loading="lazy" />`;
    };

    /* Blockquote */
    renderer.blockquote = (quote) => {
      return `<blockquote class="md-blockquote">${quote}</blockquote>`;
    };

    marked.setOptions({
      renderer,
      breaks:   true,
      gfm:      true,
      pedantic: false,
    });

    this._renderer = renderer;
    console.log('[Markdown] ✅ marked.js configured');
  },

  /* Render Markdown to HTML (with KaTeX + Wiki Links + DOMPurify) */
  render(markdown, options = {}) {
    if (!markdown) return '';
    if (typeof marked === 'undefined') return `<p>${StringUtils.escapeHTML(markdown)}</p>`;

    const {
      sanitize  = true,
      katex     = true,
      wikiLinks = true,
      onWikiLink = null,
    } = options;

    let text = markdown;

    /* Pre-process: protect KaTeX from markdown parsing */
    const mathBlocks  = [];
    const mathInlines = [];

    if (katex && typeof window.katex !== 'undefined') {
      /* Block math: $$....$$ */
      text = text.replace(/\$\$([^$]+)\$\$/gs, (_, expr) => {
        const idx = mathBlocks.length;
        try {
          mathBlocks.push(
            window.katex.renderToString(expr.trim(), {
              displayMode:  true,
              throwOnError: false,
              output:       'html',
            })
          );
        } catch (e) {
          mathBlocks.push(`<code class="katex-error">${StringUtils.escapeHTML(expr)}</code>`);
        }
        return `KATEX_BLOCK_${idx}`;
      });

      /* Inline math: $...$ */
      text = text.replace(/\$([^$\n]+)\$/g, (_, expr) => {
        const idx = mathInlines.length;
        try {
          mathInlines.push(
            window.katex.renderToString(expr.trim(), {
              displayMode:  false,
              throwOnError: false,
              output:       'html',
            })
          );
        } catch (e) {
          mathInlines.push(`<code>${StringUtils.escapeHTML(expr)}</code>`);
        }
        return `KATEX_INLINE_${idx}`;
      });
    }

    /* Parse Markdown */
    let html = marked.parse(text);

    /* Restore KaTeX */
    html = html.replace(/KATEX_BLOCK_(\d+)/g,  (_, i) =>
      `<div class="katex-display">${mathBlocks[i]}</div>`
    );
    html = html.replace(/KATEX_INLINE_(\d+)/g, (_, i) => mathInlines[i]);

    /* Process Wiki Links */
    if (wikiLinks) {
      html = StringUtils.renderWikiLinks(html, onWikiLink);
    }

    /* Sanitize with DOMPurify */
    if (sanitize && typeof DOMPurify !== 'undefined') {
      html = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'p','br','strong','em','u','s','del','ins','mark',
          'h1','h2','h3','h4','h5','h6',
          'ul','ol','li','blockquote','hr','pre','code',
          'table','thead','tbody','tr','th','td',
          'a','img','figure','figcaption',
          'div','span','button','i','kbd','sup','sub',
        ],
        ALLOWED_ATTR: [
          'href','src','alt','title','class','id','target','rel',
          'loading','data-note','data-action','onclick',
        ],
        ALLOW_DATA_ATTR: true,
      });
    }

    return html;
  },

  /* Quick preview (no KaTeX, faster) */
  preview(markdown, maxChars = 200) {
    const stripped = StringUtils.stripMarkdown(markdown);
    return StringUtils.truncate(stripped, maxChars);
  },
};

/* ============================================================
   5. VALIDATION UTILITIES
   ============================================================ */
const Validate = {

  required(value, fieldName = 'الحقل') {
    if (!value || (typeof value === 'string' && !value.trim())) {
      return `${fieldName} مطلوب`;
    }
    return null;
  },

  minLength(value, min, fieldName = 'الحقل') {
    if ((value ?? '').length < min) {
      return `${fieldName} يجب أن يكون ${min} أحرف على الأقل`;
    }
    return null;
  },

  maxLength(value, max, fieldName = 'الحقل') {
    if ((value ?? '').length > max) {
      return `${fieldName} يجب أن لا يتجاوز ${max} حرفاً`;
    }
    return null;
  },

  /* Validate a form object */
  form(data, rules) {
    const errors = {};
    for (const [field, fieldRules] of Object.entries(rules)) {
      for (const rule of fieldRules) {
        const error = rule(data[field]);
        if (error) {
          errors[field] = error;
          break;
        }
      }
    }
    return { valid: Object.keys(errors).length === 0, errors };
  },

  /* Task form validation */
  task(data) {
    return this.form(data, {
      title: [
        (v) => this.required(v, 'عنوان المهمة'),
        (v) => this.minLength(v, 2,   'عنوان المهمة'),
        (v) => this.maxLength(v, 200, 'عنوان المهمة'),
      ],
    });
  },

  /* Note form validation */
  note(data) {
    return this.form(data, {
      title: [
        (v) => this.required(v, 'عنوان الملاحظة'),
        (v) => this.minLength(v, 1,   'عنوان الملاحظة'),
        (v) => this.maxLength(v, 200, 'عنوان الملاحظة'),
      ],
    });
  },

  /* Reminder form validation */
  reminder(data) {
    return this.form(data, {
      title: [
        (v) => this.required(v, 'عنوان التذكير'),
        (v) => this.maxLength(v, 200, 'عنوان التذكير'),
      ],
      date: [
        (v) => this.required(v, 'تاريخ التذكير'),
        (v) => {
          if (v && new Date(v) < new Date()) {
            return 'لا يمكن إضافة تذكير في الماضي';
          }
          return null;
        },
      ],
    });
  },
};

/* ============================================================
   6. PERFORMANCE UTILITIES
   ============================================================ */
const Perf = {

  /* Debounce */
  debounce(fn, delay = 300) {
    let timer;
    const debounced = function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
    debounced.cancel = () => clearTimeout(timer);
    debounced.flush  = function(...args) {
      clearTimeout(timer);
      fn.apply(this, args);
    };
    return debounced;
  },

  /* Throttle */
  throttle(fn, limit = 300) {
    let lastCall = 0;
    let timer;
    return function(...args) {
      const now  = Date.now();
      const diff = now - lastCall;
      if (diff >= limit) {
        lastCall = now;
        return fn.apply(this, args);
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        lastCall = Date.now();
        fn.apply(this, args);
      }, limit - diff);
    };
  },

  /* Memoize */
  memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
    const cache = new Map();
    const memoized = function(...args) {
      const key = keyFn(...args);
      if (cache.has(key)) return cache.get(key);
      const result = fn.apply(this, args);
      cache.set(key, result);
      return result;
    };
    memoized.clear  = () => cache.clear();
    memoized.delete = (key) => cache.delete(key);
    memoized.size   = () => cache.size;
    return memoized;
  },

  /* Lazy execution (runs once when element enters viewport) */
  lazyLoad(el, callback, options = {}) {
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          callback(entry.target);
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.1, ...options });
    observer.observe(el);
    return observer;
  },

  /* RAF-batched DOM update */
  batchDOM(fn) {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        fn();
        resolve();
      });
    });
  },

  /* Measure execution time */
  measure(label, fn) {
    const start  = performance.now();
    const result = fn();
    const end    = performance.now();
    console.log(`[Perf] ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
  },

  /* Async measure */
  async measureAsync(label, fn) {
    const start  = performance.now();
    const result = await fn();
    const end    = performance.now();
    console.log(`[Perf] ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
  },

  /* Check if device is low-end */
  isLowEnd() {
    return (navigator.hardwareConcurrency ?? 4) <= 2 ||
           (navigator.deviceMemory ?? 4) <= 2;
  },

  /* Request idle callback wrapper */
  idle(fn, options = { timeout: 2000 }) {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(fn, options);
    } else {
      setTimeout(fn, 200);
    }
  },
};

/* ============================================================
   7. STORAGE UTILITIES
   ============================================================ */
const Storage = {

  PREFIX: 'almudir_',

  key:  (k) => `${Storage.PREFIX}${k}`,

  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(this.key(key));
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(this.key(key), JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('[Storage] Set failed:', err);
      return false;
    }
  },

  remove(key) {
    localStorage.removeItem(this.key(key));
  },

  clear(prefix = '') {
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith(this.PREFIX + prefix)
    );
    keys.forEach(k => localStorage.removeItem(k));
  },

  /* Session storage */
  session: {
    get(key, fallback = null) {
      try {
        const raw = sessionStorage.getItem(key);
        return raw !== null ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { sessionStorage.setItem(key, JSON.stringify(value)); return true; }
      catch { return false; }
    },
    remove: (key) => sessionStorage.removeItem(key),
  },

  /* Storage size */
  getSize() {
    let size = 0;
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(this.PREFIX)) {
        size += (localStorage.getItem(k) ?? '').length * 2;
      }
    }
    return size;
  },

  /* Check available space */
  hasSpace(bytesNeeded = 0) {
    try {
      const test = 'x'.repeat(bytesNeeded / 2);
      localStorage.setItem('__space_test__', test);
      localStorage.removeItem('__space_test__');
      return true;
    } catch {
      return false;
    }
  },
};

/* ============================================================
   8. TOAST NOTIFICATION SYSTEM (UI Layer)
   ============================================================ */
const Toast = {

  ICONS: {
    success: 'fas fa-check-circle',
    error:   'fas fa-times-circle',
    warning: 'fas fa-exclamation-triangle',
    info:    'fas fa-info-circle',
  },

  _timers: new Map(),

  show(type, title, message = '', options = {}) {
    const {
      duration = 4000,
      closable = true,
      action   = null,
    } = options;

    const id      = StringUtils.uid('toast');
    const container = DOM.id('toastContainer');
    if (!container) return id;

    const toast = DOM.create('div', {
      class:    `toast ${type}`,
      id,
      role:     'alert',
      'aria-live': 'assertive',
    });

    toast.innerHTML = `
      <div class="toast-icon">
        <i class="${this.ICONS[type] ?? this.ICONS.info}"></i>
      </div>
      <div class="toast-content">
        ${title   ? `<div class="toast-title">${StringUtils.escapeHTML(title)}</div>` : ''}
        ${message ? `<div class="toast-msg">${StringUtils.escapeHTML(message)}</div>` : ''}
        ${action  ? `<button class="toast-action-btn">${action.label}</button>` : ''}
      </div>
      ${closable ? `<button class="toast-close" aria-label="إغلاق"><i class="fas fa-times"></i></button>` : ''}
    `;

    /* Set progress animation duration */
    toast.style.setProperty('--toast-duration', `${duration}ms`);
    toast.querySelector('::before');
    const styleTag = document.createElement('style');
    styleTag.textContent = `
      #${id}::before { animation-duration: ${duration}ms; }
    `;
    document.head.appendChild(styleTag);

    /* Action button */
    if (action) {
      toast.querySelector('.toast-action-btn')?.addEventListener('click', () => {
        action.onClick?.();
        this.dismiss(id);
      });
    }

    /* Close button */
    if (closable) {
      toast.querySelector('.toast-close')?.addEventListener('click', () => {
        this.dismiss(id);
      });
    }

    container.appendChild(toast);

    /* Auto dismiss */
    if (duration > 0) {
      const timer = setTimeout(() => this.dismiss(id), duration);
      this.#timers.set(id, timer);
    }

    /* Update state */
    if (typeof Actions !== 'undefined') {
      Actions.ui.addToast({ id, type, title, message, duration });
    }

    return id;
  },

  dismiss(id) {
    const el = DOM.id(id);
    if (!el) return;

    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);

    el.classList.add('removing');
    el.addEventListener('animationend', () => {
      DOM.remove(el);
      DOM.$$(`style`).forEach(s => {
        if (s.textContent.includes(`#${id}`)) s.remove();
      });
      if (typeof Actions !== 'undefined') {
        Actions.ui.removeToast(id);
      }
    }, { once: true });

    setTimeout(() => DOM.remove(el), 500); // fallback
  },

  /* Convenience methods */
  success: (title, msg, opts) => Toast.show('success', title, msg, opts),
  error:   (title, msg, opts) => Toast.show('error',   title, msg, opts),
  warning: (title, msg, opts) => Toast.show('warning', title, msg, opts),
  info:    (title, msg, opts) => Toast.show('info',    title, msg, opts),

  /* Promise toast (shows loading → success/error) */
  async promise(promise, labels = {}) {
    const id = Toast.show('info', labels.loading ?? 'جاري التحميل...', '', { duration: 0, closable: false });
    try {
      const result = await promise;
      Toast.dismiss(id);
      Toast.success(labels.success ?? 'تم بنجاح');
      return result;
    } catch (err) {
      Toast.dismiss(id);
      Toast.error(labels.error ?? 'حدث خطأ', err.message);
      throw err;
    }
  },

  /* Dismiss all */
  dismissAll() {
    DOM.$$('.toast').forEach(el => this.dismiss(el.id));
  },
};

/* ============================================================
   9. MODAL UTILITIES
   ============================================================ */
const Modal = {

  _focusTrap:  null,
  _lastFocused: null,

  open(overlayId) {
    const overlay = DOM.id(overlayId);
    if (!overlay) return;

    /* Save last focused element */
    this._lastFocused = document.activeElement;

    DOM.show(overlay, 'flex');
    overlay.setAttribute('aria-hidden', 'false');

    /* Focus first focusable element */
    const focusable = overlay.querySelectorAll(
      'input, textarea, select, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) {
      requestAnimationFrame(() => focusable[0].focus());
    }

    /* Update state */
    const name = overlayId.replace('ModalOverlay', '').replace('Overlay', '');
    if (typeof Actions !== 'undefined') {
      Actions.ui.openModal(name);
    }

    /* Prevent body scroll */
    document.body.style.overflow = 'hidden';
  },

  close(overlayId) {
    const overlay = DOM.id(overlayId);
    if (!overlay) return;

    DOM.hide(overlay);
    overlay.setAttribute('aria-hidden', 'true');

    /* Restore focus */
    this._lastFocused?.focus?.();

    /* Update state */
    const name = overlayId.replace('ModalOverlay', '').replace('Overlay', '');
    if (typeof Actions !== 'undefined') {
      Actions.ui.closeModal(name);
    }

    /* Restore body scroll */
    if (!document.querySelector('.modal-overlay[style*="flex"]')) {
      document.body.style.overflow = '';
    }
  },

  closeAll() {
    DOM.$$('.modal-overlay').forEach(el => {
      DOM.hide(el);
      el.setAttribute('aria-hidden', 'true');
    });
    document.body.style.overflow = '';
    if (typeof Actions !== 'undefined') {
      Actions.ui.closeAllModals();
    }
  },

  /* Click outside to close */
  setupOutsideClick(overlayId, closeCallback) {
    const overlay = DOM.id(overlayId);
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) closeCallback();
    });
  },

  /* Confirm dialog */
  confirm(message, onConfirm, onCancel = null) {
    if (typeof Actions !== 'undefined') {
      Actions.ui.showConfirm(message, onConfirm, onCancel);
    }
    Modal.open('confirmModalOverlay');
  },
};

/* ============================================================
   10. ANIMATION UTILITIES
   ============================================================ */
const Animate = {

  /* Fade in element */
  fadeIn(el, duration = 300) {
    if (!el) return Promise.resolve();
    el.style.opacity   = '0';
    el.style.display   = el.dataset.display ?? 'flex';
    el.style.transition = `opacity ${duration}ms ease`;
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    return new Promise(r => setTimeout(r, duration));
  },

  /* Fade out element */
  fadeOut(el, duration = 300) {
    if (!el) return Promise.resolve();
    el.style.transition = `opacity ${duration}ms ease`;
    el.style.opacity    = '0';
    return new Promise(r => setTimeout(() => {
      el.style.display = 'none';
      r();
    }, duration));
  },

  /* Slide down */
  slideDown(el, duration = 300) {
    if (!el) return Promise.resolve();
    el.style.display  = 'block';
    el.style.overflow = 'hidden';
    const h = el.scrollHeight;
    el.style.height   = '0';
    el.style.transition = `height ${duration}ms ease`;
    requestAnimationFrame(() => { el.style.height = `${h}px`; });
    return new Promise(r => setTimeout(() => {
      el.style.height   = '';
      el.style.overflow = '';
      r();
    }, duration));
  },

  /* Slide up */
  slideUp(el, duration = 300) {
    if (!el) return Promise.resolve();
    el.style.overflow   = 'hidden';
    el.style.height     = `${el.scrollHeight}px`;
    el.style.transition = `height ${duration}ms ease`;
    requestAnimationFrame(() => { el.style.height = '0'; });
    return new Promise(r => setTimeout(() => {
      el.style.display = 'none';
      el.style.height  = '';
      r();
    }, duration));
  },

  /* Bounce scale */
  bounce(el) {
    if (!el) return;
    el.style.transform  = 'scale(1.05)';
    el.style.transition = 'transform 0.15s ease';
    setTimeout(() => {
      el.style.transform = 'scale(1)';
    }, 150);
  },

  /* Shake (for errors) */
  shake(el) {
    if (!el) return;
    el.classList.add('shake-animation');
    el.addEventListener('animationend', () => {
      el.classList.remove('shake-animation');
    }, { once: true });
  },

  /* Number counter animation */
  countTo(el, target, duration = 800, formatter = (n) => n) {
    if (!el) return;
    const start     = parseInt(el.textContent) || 0;
    const range     = target - start;
    const startTime = performance.now();

    const step = (currentTime) => {
      const elapsed  = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      const current  = Math.round(start + range * eased);
      el.textContent = formatter(current);
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  },

  /* Skeleton loading pulse */
  addSkeleton(el) {
    el?.classList.add('skeleton');
  },

  removeSkeleton(el) {
    el?.classList.remove('skeleton');
  },
};

/* ============================================================
   11. KEYBOARD SHORTCUTS
   ============================================================ */
const Shortcuts = {

  _handlers: new Map(),
  _enabled:  true,

  /* Register shortcut */
  register(combo, handler, options = {}) {
    const { description = '', global = true, prevent = true } = options;
    const key = this.#normalizeCombo(combo);

    this._handlers.set(key, { handler, description, global, prevent, combo });
    return () => this.unregister(combo);
  },

  /* Unregister */
  unregister(combo) {
    this._handlers.delete(this.#normalizeCombo(combo));
  },

  /* Normalize key combo string */
  #normalizeCombo(combo) {
    return combo
      .toLowerCase()
      .split('+')
      .map(k => k.trim())
      .sort((a, b) => {
        const order = ['ctrl','alt','shift','meta'];
        const ai = order.indexOf(a), bi = order.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return 0;
      })
      .join('+');
  },

  /* Match event to combo */
  #matchEvent(e) {
    const parts = [];
    if (e.ctrlKey  || e.metaKey) parts.push('ctrl');
    if (e.altKey)   parts.push('alt');
    if (e.shiftKey) parts.push('shift');

    let key = e.key.toLowerCase();
    if (key === ' ')          key = 'space';
    if (key === 'escape')     key = 'esc';
    if (key === 'arrowup')    key = 'up';
    if (key === 'arrowdown')  key = 'down';
    if (key === 'arrowleft')  key = 'left';
    if (key === 'arrowright') key = 'right';

    parts.push(key);
    return parts.sort((a, b) => {
      const order = ['ctrl','alt','shift','meta'];
      const ai = order.indexOf(a), bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    }).join('+');
  },

  /* Handle keydown */
  handle(e) {
    if (!this._enabled) return;

    /* Skip if user is typing in an input (unless explicitly global) */
    const isEditing = ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);

    const combo   = this.#matchEvent(e);
    const matched = this._handlers.get(combo);

    if (matched) {
      if (isEditing && !matched.global) return;
      if (matched.prevent) e.preventDefault();
      matched.handler(e);
    }
  },

  enable()  { this._enabled = true; },
  disable() { this._enabled = false; },

  /* Get all registered shortcuts (for display) */
  getAll() {
    return [...this._handlers.entries()].map(([key, { combo, description }]) => ({
      key, combo, description,
    }));
  },
};

/* Listen globally */
document.addEventListener('keydown', (e) => Shortcuts.handle(e));

/* ============================================================
   12. FILE UTILITIES
   ============================================================ */
const FileUtils = {

  /* Download text as file */
  download(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const link = DOM.create('a', { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /* Download Markdown note */
  downloadMarkdown(content, title) {
    const filename = `${StringUtils.slugify(title) || 'note'}.md`;
    this.download(content, filename, 'text/markdown');
  },

  /* Download JSON */
  downloadJSON(data, filename) {
    const content = JSON.stringify(data, null, 2);
    this.download(content, filename, 'application/json');
  },

  /* Read file as text */
  readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    });
  },

  /* Read file as Data URL */
  readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /* Format file size */
  formatSize: StringUtils.formatSize,

  /* Validate file type */
  isJSON(file) { return file?.type === 'application/json' || file?.name?.endsWith('.json'); },
  isMD(file)   { return file?.name?.endsWith('.md') || file?.name?.endsWith('.markdown'); },
};

/* ============================================================
   13. COLOR UTILITIES
   ============================================================ */
const ColorUtils = {

  /* Hex to RGB */
  hexToRGB(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  },

  /* RGB to Hex */
  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(n =>
      Math.round(n).toString(16).padStart(2, '0')
    ).join('');
  },

  /* Get contrast color (black or white) */
  contrastColor(hex) {
    const { r, g, b } = this.hexToRGB(hex);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  },

  /* Lighten color */
  lighten(hex, amount = 0.2) {
    const { r, g, b } = this.hexToRGB(hex);
    return this.rgbToHex(
      Math.min(255, r + (255 - r) * amount),
      Math.min(255, g + (255 - g) * amount),
      Math.min(255, b + (255 - b) * amount),
    );
  },

  /* Add alpha to hex */
  withAlpha(hex, alpha = 0.5) {
    const { r, g, b } = this.hexToRGB(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  },

  /* Priority color map */
  priorityColor(priority) {
    const map = {
      urgent: '#ff6b6b',
      high:   '#ff9f43',
      medium: '#feca57',
      low:    '#55efc4',
    };
    return map[priority] ?? map.medium;
  },
};

/* ============================================================
   14. AUDIO UTILITIES (Pomodoro sounds)
   ============================================================ */
const AudioUtils = {

  _ctx: null,

  /* Get/create AudioContext */
  #getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext ?? window.webkitAudioContext)();
    }
    return this._ctx;
  },

  /* Generate beep sound */
  beep(frequency = 440, duration = 0.3, type = 'sine', volume = 0.3) {
    try {
      const ctx        = this.#getCtx();
      const oscillator = ctx.createOscillator();
      const gainNode   = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = frequency;
      oscillator.type            = type;
      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (err) {
      console.warn('[Audio] Beep failed:', err);
    }
  },

  /* Work session start sound */
  workStart() {
    this.beep(528, 0.2, 'sine', 0.25);
    setTimeout(() => this.beep(660, 0.2, 'sine', 0.25), 250);
    setTimeout(() => this.beep(800, 0.4, 'sine', 0.3),  500);
  },

  /* Break start sound */
  breakStart() {
    this.beep(800, 0.2, 'sine', 0.25);
    setTimeout(() => this.beep(660, 0.2, 'sine', 0.25), 250);
    setTimeout(() => this.beep(528, 0.4, 'sine', 0.25), 500);
  },

  /* Tick sound */
  tick() {
    this.beep(1000, 0.05, 'square', 0.05);
  },

  /* Notification sound */
  notify() {
    this.beep(440, 0.15, 'sine', 0.2);
    setTimeout(() => this.beep(554, 0.15, 'sine', 0.2), 200);
    setTimeout(() => this.beep(659, 0.3,  'sine', 0.2), 400);
  },

  /* Resume AudioContext on user gesture */
  resume() {
    if (this._ctx?.state === 'suspended') {
      this._ctx.resume();
    }
  },
};

/* Resume audio on first user interaction */
document.addEventListener('click', () => AudioUtils.resume(), { once: true });

/* ============================================================
   15. COPY CODE HELPER (used in rendered markdown)
   ============================================================ */
const Utils = {

  async copyCode(btn) {
    const wrapper = btn.closest('.code-block-wrapper');
    const code    = wrapper?.querySelector('code');
    if (!code) return;

    const text = code.textContent;
    const ok   = await DOM.copyToClipboard(text);

    if (ok) {
      btn.innerHTML = '<i class="fas fa-check"></i> تم النسخ';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-copy"></i> نسخ';
        btn.classList.remove('copied');
      }, 2000);
    }
  },
};

/* ============================================================
   16. QUOTES (Daily Motivation)
   ============================================================ */
const Quotes = {

  list: [
    'النجاح ليس مفتاحاً للسعادة، السعادة هي مفتاح النجاح.',
    'العمل الجاد يغلب الموهبة حين تكاسلت الموهبة.',
    'كل يوم هو فرصة جديدة لتكون أفضل مما كنت بالأمس.',
    'الأهداف الكبيرة تحتاج إلى إجراءات صغيرة يومية.',
    'لا تنتظر الفرصة المثالية، اصنع فرصتك بنفسك.',
    'التركيز على الحاضر هو أقوى سلاح في يد الإنسان.',
    'الإنتاجية ليست في كمية العمل، بل في جودة الوقت.',
    'من يتحكم في وقته يتحكم في حياته.',
    'التقدم البطيء أفضل ألف مرة من السكون التام.',
    'الفشل هو الخطوة الأخيرة قبل النجاح، لا تستسلم.',
    'الانضباط هو الجسر بين الأهداف والإنجازات.',
    'ابدأ صغيراً، فكر كبيراً، تحرك الآن.',
    'كل دقيقة تمضيها في التخطيط توفر عشر دقائق في التنفيذ.',
    'الشخص الناجح يصنع عادات جيدة ويسمح لها أن تتحكم فيه.',
    'الوقت هو العملة الوحيدة التي لا يمكن استردادها.',
  ],

  get daily() {
    const today = new Date().toDateString();
    const index = (today.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0))
      % this.list.length;
    return this.list[index];
  },

  random() {
    return this.list[Math.floor(Math.random() * this.list.length)];
  },
};

/* ============================================================
   17. ACTIVITY HEATMAP GENERATOR
   ============================================================ */
const Heatmap = {

  generate(container, data = {}, days = 35) {
    if (!container) return;

    DOM.empty(container);
    const dayList = DateUtils.getLastNDays(days);

    for (const day of dayList) {
      const key   = day.toISOString().slice(0, 10);
      const count = data[key] ?? 0;
      const level = Math.min(4, count);

      const cell = DOM.create('div', {
        class:     'heatmap-cell',
        'data-level': level,
        'data-date':  key,
        'data-count': count,
        title: `${DateUtils.format(day)}: ${count} نشاط`,
      });

      container.appendChild(cell);
    }
  },

  /* Build activity data from tasks and notes */
  buildData(tasks = [], notes = []) {
    const data = {};

    const record = (dateStr) => {
      if (!dateStr) return;
      const key = dateStr.slice(0, 10);
      data[key] = (data[key] ?? 0) + 1;
    };

    tasks.forEach(t => {
      record(t.createdAt);
      if (t.completedAt) record(t.completedAt);
    });

    notes.forEach(n => {
      record(n.createdAt);
      record(n.updatedAt);
    });

    return data;
  },
};

/* ============================================================
   18. GLOBAL SETUP & EXPORTS
   ============================================================ */

/* Setup Markdown on load */
document.addEventListener('DOMContentLoaded', () => {
  MarkdownUtils.setup();
});

/* ESC key: close modals / zen mode */
Shortcuts.register('esc', () => {
  /* Close command palette */
  if (typeof Actions !== 'undefined' && Selectors?.isFabOpen()) {
    Actions.ui.setFabOpen(false);
  }
  if (typeof Actions !== 'undefined' && State?.get('ui.cmdPaletteOpen')) {
    Actions.ui.setCmdPaletteOpen(false);
    DOM.hide(DOM.id('cmdPaletteOverlay'));
  }
  /* Close any open modal */
  const openModal = document.querySelector('.modal-overlay[style*="flex"]');
  if (openModal) {
    Modal.close(openModal.id);
  }
  /* Exit zen mode */
  if (State?.get('notes.isZenMode')) {
    Actions.notes.setZenMode(false);
  }
  /* Hide context menu */
  if (State?.get('ui.contextMenu.visible')) {
    Actions.ui.hideContextMenu();
    DOM.hide(DOM.id('contextMenu'));
  }
}, { global: true, prevent: false });

/* Close context menu on click outside */
document.addEventListener('click', (e) => {
  if (!e.target.closest('.context-menu')) {
    if (typeof Actions !== 'undefined') {
      Actions.ui.hideContextMenu();
    }
    DOM.hide(DOM.id('contextMenu'));
  }
});

/* Expose UI helpers globally */
window.UI = {
  toast:   Toast,
  modal:   Modal,
  animate: Animate,
};

/* Full export */
window.DOM          = DOM;
window.DateUtils    = DateUtils;
window.StringUtils  = StringUtils;
window.MarkdownUtils = MarkdownUtils;
window.Validate     = Validate;
window.Perf         = Perf;
window.Storage      = Storage;
window.Toast        = Toast;
window.Modal        = Modal;
window.Animate      = Animate;
window.Shortcuts    = Shortcuts;
window.FileUtils    = FileUtils;
window.ColorUtils   = ColorUtils;
window.AudioUtils   = AudioUtils;
window.Utils        = Utils;
window.Quotes       = Quotes;
window.Heatmap      = Heatmap;

console.log(
  '%c[المدير] 🛠️ Utils Library Ready — 18 modules loaded',
  'color:#55efc4;font-weight:900;font-size:14px;'
);
