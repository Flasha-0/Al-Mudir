/* ============================================================
   المدير — Chat Component v2.0.0
   المحادثة مع AI: Voice، TTS، Streaming، Suggestions
   ============================================================ */

'use strict';

class ChatComponent {

  #isRecording    = false;
  #speechSynth    = window.speechSynthesis;
  #currentUtter   = null;
  #msgObserver    = null;
  #contextWindow  = 10; // last N messages sent as context

  /* ============================================================
     INIT
  ============================================================ */
  init() {
    this.#bindInputEvents();
    this.#bindVoiceEvents();
    this.#bindChatActions();
    this.#bindSuggestions();
    this.#setupScrollObserver();
    this.#subscribeToState();
    this.#renderTimestamps();
    console.log('[Chat] ✅ Initialized');
  }

  /* ============================================================
     SUBSCRIBE TO STATE
  ============================================================ */
  #subscribeToState() {
    /* Typing indicator */
    State.subscribe('chat.isTyping', (isTyping) => {
      const ind = DOM.id('typingIndicator');
      if (ind) ind.style.display = isTyping ? 'inline-flex' : 'none';
      if (isTyping) DOM.scrollToBottom(DOM.id('chatMessages'));
    });

    /* Recording state → mic button */
    State.subscribe('chat.isRecording', (rec) => {
      const btn = DOM.id('chatMicBtn');
      btn?.classList.toggle('recording', rec);
      const icon = btn?.querySelector('i');
      if (icon) {
        icon.className = rec ? 'fas fa-stop' : 'fas fa-microphone';
      }
    });

    /* Voice toggle button */
    State.subscribe('chat.voiceEnabled', (enabled) => {
      const btn  = DOM.id('chatVoiceToggle');
      const icon = btn?.querySelector('i');
      if (icon) {
        icon.className = enabled
          ? 'fas fa-volume-up'
          : 'fas fa-volume-mute';
      }
      btn?.classList.toggle('active', enabled);
    });

    /* New messages → scroll & render */
    State.subscribe('chat.messages', (msgs) => {
      this.#renderMessages(msgs);
    });
  }

  /* ============================================================
     BIND INPUT EVENTS
  ============================================================ */
  #bindInputEvents() {
    const input   = DOM.id('chatInput');
    const sendBtn = DOM.id('chatSendBtn');

    if (!input) return;

    /* Auto-resize textarea */
    input.addEventListener('input', () => {
      DOM.autoResize(input);
      this.#updateCharCounter(input.value.length);
      this.#updateSendBtn(input.value.trim());
      Actions.chat.setInput(input.value);
    });

    /* Enter to send / Shift+Enter for newline */
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.#sendMessage();
      }
    });

    /* Send button */
    sendBtn?.addEventListener('click', () => this.#sendMessage());

    /* Paste handler */
    input.addEventListener('paste', (e) => {
      setTimeout(() => {
        DOM.autoResize(input);
        this.#updateCharCounter(input.value.length);
      }, 10);
    });
  }

  /* ============================================================
     BIND VOICE EVENTS
  ============================================================ */
  #bindVoiceEvents() {
    /* Microphone button */
    DOM.id('chatMicBtn')?.addEventListener('click', () => {
      if (this.#isRecording) {
        this.#stopRecording();
      } else {
        this.#startRecording();
      }
    });

    /* Voice toggle */
    DOM.id('chatVoiceToggle')?.addEventListener('click', () => {
      const enabled = !State.get('chat.voiceEnabled');
      Actions.chat.setVoiceEnabled(enabled);

      /* Stop ongoing speech */
      if (!enabled) this.#speechSynth?.cancel();

      Toast.info(
        enabled ? '🔊 النطق مفعّل' : '🔇 النطق متوقف',
        '',
        { duration: 1500 }
      );
    });

    /* Voice events from Bus */
    Bus.on('voice:transcript', ({ text, isFinal }) => {
      const input = DOM.id('chatInput');
      if (!input) return;
      input.value = text;
      DOM.autoResize(input);
      this.#updateCharCounter(text.length);
      this.#updateSendBtn(text.trim());

      if (isFinal && text.trim()) {
        setTimeout(() => this.#sendMessage(), 500);
      }
    });

    Bus.on('voice:error', ({ message }) => {
      Toast.warning('خطأ في الصوت', message);
      this.#isRecording = false;
      Actions.chat.setRecording(false);
    });
  }

  /* ============================================================
     BIND CHAT ACTIONS (Clear, Export)
  ============================================================ */
  #bindChatActions() {
    /* Clear chat */
    DOM.id('clearChatBtn')?.addEventListener('click', () => {
      Modal.confirm(
        'هل أنت متأكد من مسح سجل المحادثة؟',
        () => {
          Actions.chat.clearMessages();
          this.#addWelcomeMessage();
          Toast.success('تم المسح', 'تم مسح سجل المحادثة');
        }
      );
    });

    /* Export chat */
    DOM.id('exportChatBtn')?.addEventListener('click', () => {
      this.#exportChat();
    });
  }

  /* ============================================================
     BIND SUGGESTIONS
  ============================================================ */
  #bindSuggestions() {
    DOM.delegate(
      DOM.id('chatSuggestions'),
      '.suggestion-chip',
      'click',
      (e, chip) => {
        const msg = chip.dataset.msg;
        if (!msg) return;

        const input = DOM.id('chatInput');
        if (input) {
          input.value = msg;
          DOM.autoResize(input);
          this.#updateCharCounter(msg.length);
          this.#updateSendBtn(msg);
        }

        /* Auto-send suggestion */
        setTimeout(() => this.#sendMessage(), 100);

        /* Hide suggestions after use */
        DOM.hide(DOM.id('chatSuggestions'));
      }
    );
  }

  /* ============================================================
     SEND MESSAGE
  ============================================================ */
  async #sendMessage() {
    const input = DOM.id('chatInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text || State.get('chat.isLoading')) return;

    /* Clear input */
    input.value = '';
    DOM.autoResize(input);
    this.#updateCharCounter(0);
    this.#updateSendBtn('');

    /* Hide suggestions */
    DOM.hide(DOM.id('chatSuggestions'));

    /* Build context from recent messages */
    const recentMsgs  = State.get('chat.messages').slice(-this.#contextWindow);
    const context     = recentMsgs.map(m => ({
      role:    m.role,
      content: m.content,
    }));

    /* Send to API */
    const result = await API.sendChatMessage(text, {
      context,
      sessionId: State.get('chat.sessionId'),
      onStream:  null,
    });

    /* Speak response */
    if (result.success && State.get('chat.voiceEnabled')) {
      this.#speak(result.data);
    }

    DOM.focus(input);
  }

  /* ============================================================
     RENDER MESSAGES
  ============================================================ */
  #renderMessages(messages) {
    const container = DOM.id('chatMessages');
    if (!container) return;

    /* Check if scrolled to bottom before render */
    const wasAtBottom = DOM.isScrolledToBottom(container);

    DOM.empty(container);

    if (!messages.length) {
      this.#addWelcomeMessage();
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const msg of messages) {
      fragment.appendChild(this.#buildMessage(msg));
    }

    container.appendChild(fragment);

    /* Scroll to bottom if was at bottom */
    if (wasAtBottom) {
      DOM.scrollToBottom(container);
    }
  }

  /* ============================================================
     BUILD MESSAGE ELEMENT
  ============================================================ */
  #buildMessage(msg) {
    const isUser   = msg.role === 'user';
    const isSystem = msg.role === 'system';

    const wrapper = DOM.create('div', {
      class:    `chat-message ${isUser ? 'user-message' : 'ai-message'}${isSystem ? ' system-message' : ''}`,
      'data-id': msg.id,
      role:     'article',
    });

    /* Avatar */
    const avatar = DOM.create('div', { class: 'message-avatar' });
    avatar.innerHTML = isUser
      ? '<i class="fas fa-user"></i>'
      : '<i class="fas fa-brain"></i>';

    /* Content */
    const content = DOM.create('div', { class: 'message-content' });

    /* Header */
    const header = DOM.create('div', { class: 'message-header' });
    header.innerHTML = `
      <span class="message-sender">${isUser ? 'أنت' : 'المدير AI'}</span>
      <span class="message-time">${DateUtils.formatTime(msg.timestamp)}</span>
      ${msg.tokens ? `<span class="message-tokens" style="font-size:10px;color:var(--text-muted);">${msg.tokens} token</span>` : ''}
    `;

    /* Body */
    const body = DOM.create('div', { class: 'message-body' });

    if (isUser) {
      /* User messages: plain text */
      body.textContent = msg.content;
    } else {
      /* AI messages: rendered markdown */
      body.innerHTML = MarkdownUtils.render(msg.content, {
        sanitize:  true,
        katex:     true,
        wikiLinks: false,
      });

      /* Highlight code */
      if (typeof hljs !== 'undefined') {
        body.querySelectorAll('pre code').forEach(block => {
          hljs.highlightElement(block);
        });
      }
    }

    /* Error styling */
    if (msg.isError) {
      body.style.background = 'var(--danger-light)';
      body.style.borderColor = 'rgba(225,112,85,0.3)';
    }

    /* Actions */
    const actions = this.#buildMessageActions(msg);

    content.append(header, body, actions);
    wrapper.append(avatar, content);

    return wrapper;
  }

  /* ============================================================
     MESSAGE ACTIONS (Copy, Speak, Regenerate)
  ============================================================ */
  #buildMessageActions(msg) {
    const actions = DOM.create('div', { class: 'message-actions' });
    const isAI    = msg.role === 'assistant';

    /* Copy */
    const copyBtn = DOM.create('button', {
      class: 'msg-action-btn',
      title: 'نسخ',
    });
    copyBtn.innerHTML = '<i class="fas fa-copy"></i> نسخ';
    copyBtn.addEventListener('click', async () => {
      await DOM.copyToClipboard(msg.content);
      copyBtn.innerHTML = '<i class="fas fa-check"></i> تم';
      setTimeout(() => {
        copyBtn.innerHTML = '<i class="fas fa-copy"></i> نسخ';
      }, 2000);
    });
    actions.appendChild(copyBtn);

    /* Speak (AI only) */
    if (isAI) {
      const speakBtn = DOM.create('button', {
        class: 'msg-action-btn',
        title: 'نطق',
      });
      speakBtn.innerHTML = '<i class="fas fa-volume-up"></i> نطق';
      speakBtn.addEventListener('click', () => {
        if (this.#currentUtter && this.#speechSynth?.speaking) {
          this.#speechSynth.cancel();
          speakBtn.innerHTML = '<i class="fas fa-volume-up"></i> نطق';
        } else {
          this.#speak(msg.content);
          speakBtn.innerHTML = '<i class="fas fa-stop"></i> إيقاف';
          if (this.#currentUtter) {
            this.#currentUtter.onend = () => {
              speakBtn.innerHTML = '<i class="fas fa-volume-up"></i> نطق';
            };
          }
        }
      });
      actions.appendChild(speakBtn);
    }

    /* React */
    const reactions = ['👍', '👎', '❤️'];
    for (const emoji of reactions) {
      const btn = DOM.create('button', {
        class: 'msg-action-btn',
        title: emoji,
        style: 'font-size:14px;padding:2px 6px;',
      });
      btn.textContent = emoji;
      btn.addEventListener('click', () => {
        btn.style.transform = 'scale(1.3)';
        setTimeout(() => btn.style.transform = '', 300);
        Bus.emit('chat:reaction', { msgId: msg.id, emoji });
      });
      actions.appendChild(btn);
    }

    return actions;
  }

  /* ============================================================
     WELCOME MESSAGE
  ============================================================ */
  #addWelcomeMessage() {
    const container = DOM.id('chatMessages');
    if (!container) return;

    const welcomeHtml = `
      <div class="chat-message ai-message welcome-message">
        <div class="message-avatar"><i class="fas fa-brain"></i></div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-sender">المدير AI</span>
            <span class="message-time">${DateUtils.formatTime(new Date())}</span>
          </div>
          <div class="message-body">
            <p>مرحباً! أنا <strong>المدير</strong> — مساعدك الذكي المتكامل. 🧠</p>
            <p>يمكنني مساعدتك في:</p>
            <ul>
              <li>📝 إنشاء وإدارة المهام والملاحظات</li>
              <li>📅 تنظيم جدولك اليومي</li>
              <li>💡 الإجابة على أسئلتك وتحليل أفكارك</li>
              <li>⚡ تنفيذ الأوامر الصوتية</li>
            </ul>
            <p>كيف يمكنني مساعدتك اليوم؟</p>
          </div>
        </div>
      </div>
    `;
    container.innerHTML = welcomeHtml;
    DOM.show(DOM.id('chatSuggestions'), 'flex');
  }

  /* ============================================================
     VOICE RECORDING
  ============================================================ */
  #startRecording() {
    if (!Voice.isSupported) {
      Toast.warning(
        'الصوت غير مدعوم',
        'متصفحك لا يدعم التعرف على الصوت. جرب Chrome أو Edge.'
      );
      return;
    }

    this.#isRecording = true;
    Actions.chat.setRecording(true);

    Voice.start({
      onStart:  () => Toast.info('🎙️ جاري الاستماع...', '', { duration: 2000 }),
      onError:  (err) => {
        this.#isRecording = false;
        Actions.chat.setRecording(false);
      },
      onEnd:    (transcript) => {
        this.#isRecording = false;
        /* Final send handled by bus event */
      },
    });
  }

  #stopRecording() {
    Voice.stop();
    this.#isRecording = false;
    Actions.chat.setRecording(false);
  }

  /* ============================================================
     TEXT TO SPEECH
  ============================================================ */
  #speak(text) {
    if (!this.#speechSynth) return;

    this.#speechSynth.cancel();

    const clean = StringUtils.stripMarkdown(text).slice(0, 500);
    if (!clean) return;

    const utterance      = new SpeechSynthesisUtterance(clean);
    utterance.lang       = State.get('settings.ttsLang') ?? 'ar-EG';
    utterance.rate       = State.get('settings.ttsRate') ?? 1.0;
    utterance.pitch      = State.get('settings.ttsPitch') ?? 1.0;
    utterance.volume     = 0.9;

    /* Arabic voice */
    const voices      = this.#speechSynth.getVoices();
    const arabicVoice = voices.find(v =>
      v.lang.startsWith('ar') || v.name.toLowerCase().includes('arabic')
    );
    if (arabicVoice) utterance.voice = arabicVoice;

    utterance.onerror = () => {};
    this.#currentUtter = utterance;
    this.#speechSynth.speak(utterance);
  }

  /* ============================================================
     EXPORT CHAT
  ============================================================ */
  #exportChat() {
    const messages = State.get('chat.messages');
    if (!messages.length) {
      Toast.warning('لا توجد رسائل', 'المحادثة فارغة');
      return;
    }

    const lines = messages.map(m => {
      const role = m.role === 'user' ? 'أنت' : 'المدير AI';
      const time = DateUtils.formatDateTime(m.timestamp);
      return `[${time}] ${role}:\n${m.content}\n`;
    });

    const content  = `# سجل المحادثة — المدير\n\n` + lines.join('\n---\n\n');
    const filename = `chat-${new Date().toISOString().slice(0, 10)}.md`;
    FileUtils.downloadMarkdown(content, filename.replace('.md', ''));
    Toast.success('تم التصدير', `تم تصدير ${messages.length} رسالة`);
  }

  /* ============================================================
     SCROLL OBSERVER (auto-scroll on new messages)
  ============================================================ */
  #setupScrollObserver() {
    const container = DOM.id('chatMessages');
    if (!container || !window.MutationObserver) return;

    this.#msgObserver = new MutationObserver(() => {
      if (DOM.isScrolledToBottom(container, 100)) {
        DOM.scrollToBottom(container);
      }
    });

    this.#msgObserver.observe(container, { childList: true });
  }

  /* ============================================================
     HELPERS
  ============================================================ */
  #updateCharCounter(count) {
    const el  = DOM.id('charCounter');
    const max = 4000;
    if (!el) return;

    el.textContent = `${count} / ${max}`;
    el.className   = 'char-counter';
    if (count > max * 0.8) el.classList.add('warning');
    if (count > max * 0.95) el.classList.add('danger');
  }

  #updateSendBtn(text) {
    const btn = DOM.id('chatSendBtn');
    if (btn) btn.disabled = !text || State.get('chat.isLoading');
  }

  #renderTimestamps() {
    setInterval(() => {
      DOM.$$('.message-time[data-ts]').forEach(el => {
        el.textContent = DateUtils.relative(el.dataset.ts);
      });
    }, 60000);
  }
}

/* ---- Singleton Export ---- */
window.ChatComponent = new ChatComponent();