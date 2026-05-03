/* ============================================================
   المدير — Pomodoro Component v2.0.0
   مؤقت بومودورو: Focus، Short Break، Long Break، Sound
   ============================================================ */

'use strict';

class PomodoroTimerComponent {

  #intervalId  = null;
  #PHASES = {
    work:       { label: 'تركيز',       class: 'work',  emoji: '🍅' },
    shortBreak: { label: 'استراحة قصيرة', class: 'break', emoji: '☕' },
    longBreak:  { label: 'استراحة طويلة', class: 'long',  emoji: '🌙' },
  };

  /* ============================================================
     INIT
  ============================================================ */
  init() {
    this.#bindControls();
    this.#bindSettingsForm();
    this.#subscribeToState();
    this.#renderAll();
    this.#renderSessionDots();
    console.log('[Pomodoro] ✅ Initialized');
  }

  /* ============================================================
     BIND CONTROLS
  ============================================================ */
  #bindControls() {
    DOM.id('pomodoroStart')?.addEventListener('click', () => {
      const isRunning = State.get('pomodoro.isRunning');
      isRunning ? this.#pause() : this.#start();
    });

    DOM.id('pomodoroReset')?.addEventListener('click', () => this.#reset());
    DOM.id('pomodoroSkip')?.addEventListener('click',  () => this.#skip());
  }

  /* ============================================================
     BIND SETTINGS FORM
  ============================================================ */
  #bindSettingsForm() {
    /* Sync form values from state on open */
    State.subscribe('ui.modals.pomodoroSettings', (open) => {
      if (!open) return;
      const s = State.get('pomodoro.settings');
      const fields = {
        pomoDuration:   s.workDuration,
        pomoShortBreak: s.shortBreak,
        pomoLongBreak:  s.longBreak,
        pomoSessions:   s.sessionsGoal,
        pomoSound:      s.soundEnabled,
        pomoNotify:     s.notifyEnabled,
      };
      for (const [id, val] of Object.entries(fields)) {
        const el = DOM.id(id);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = val;
        else el.value = val;
      }
    });
  }

  /* ============================================================
     SAVE SETTINGS (called from modal save button)
  ============================================================ */
  saveSettings() {
    const settings = {
      workDuration:  parseInt(DOM.id('pomoDuration')?.value    ?? 25),
      shortBreak:    parseInt(DOM.id('pomoShortBreak')?.value  ?? 5),
      longBreak:     parseInt(DOM.id('pomoLongBreak')?.value   ?? 15),
      sessionsGoal:  parseInt(DOM.id('pomoSessions')?.value    ?? 4),
      soundEnabled:  DOM.id('pomoSound')?.checked  ?? true,
      notifyEnabled: DOM.id('pomoNotify')?.checked ?? true,
    };

    Actions.pomodoro.updateSettings(settings);
    Toast.success('تم الحفظ', 'تم تحديث إعدادات بومودورو');
  }

  /* ============================================================
     START
  ============================================================ */
  #start() {
    Actions.pomodoro.start();
    this.#clearInterval();

    this.#intervalId = setInterval(() => {
      Actions.pomodoro.tick();
    }, 1000);

    this.#updateStartBtn(true);
    Toast.info(
      `${this.#PHASES[State.get('pomodoro.phase')]?.emoji ?? '🍅'} بدأت الجلسة`,
      this.#PHASES[State.get('pomodoro.phase')]?.label ?? '',
      { duration: 2000 }
    );
  }

  /* ============================================================
     PAUSE
  ============================================================ */
  #pause() {
    this.#clearInterval();
    Actions.pomodoro.pause();
    this.#updateStartBtn(false);
    Toast.info('⏸️ متوقف مؤقتاً', '', { duration: 1500 });
  }

  /* ============================================================
     RESET
  ============================================================ */
  #reset() {
    this.#clearInterval();
    Actions.pomodoro.reset();
    this.#updateStartBtn(false);
  }

  /* ============================================================
     SKIP PHASE
  ============================================================ */
  #skip() {
    this.#clearInterval();
    const wasRunning = State.get('pomodoro.isRunning');
    Actions.pomodoro.skip();
    this.#updateStartBtn(false);

    if (wasRunning) {
      /* Auto-start next phase */
      setTimeout(() => this.#start(), 500);
    }
  }

  /* ============================================================
     PHASE COMPLETE HANDLER
  ============================================================ */
  #onPhaseComplete(prevPhase, newPhase) {
    const settings = State.get('pomodoro.settings');

    /* Sound */
    if (settings.soundEnabled) {
      if (prevPhase === 'work') {
        AudioUtils.breakStart();
      } else {
        AudioUtils.workStart();
      }
    }

    /* Browser notification */
    const phaseInfo = this.#PHASES[newPhase];
    Bus.emit('pomodoro:complete', { phase: prevPhase });
    Bus.emit('notification:show', {
      title: `${phaseInfo.emoji} ${phaseInfo.label}`,
      body:  prevPhase === 'work'
        ? 'انتهت جلسة التركيز! وقت الاستراحة 😊'
        : 'انتهت الاستراحة! هيا للعمل 💪',
    });

    /* Toast */
    Toast[prevPhase === 'work' ? 'success' : 'info'](
      `${phaseInfo.emoji} ${phaseInfo.label}`,
      prevPhase === 'work'
        ? 'أحسنت! وقت الاستراحة.'
        : 'لنعود للتركيز!',
      { duration: 5000 }
    );

    /* Auto-start next phase after 3s */
    setTimeout(() => {
      if (State.get('pomodoro.isRunning') === false) {
        this.#start();
      }
    }, 3000);
  }

  /* ============================================================
     SUBSCRIBE TO STATE
  ============================================================ */
  #subscribeToState() {
    /* timeLeft → update display */
    State.subscribe('pomodoro.timeLeft', (timeLeft) => {
      this.#renderTime(timeLeft);
      this.#renderProgress();

      /* Phase complete */
      if (timeLeft <= 0 && State.get('pomodoro.isRunning')) {
        this.#clearInterval();
      }
    });

    /* Phase change */
    let prevPhase = State.get('pomodoro.phase');
    State.subscribe('pomodoro.phase', (phase) => {
      if (phase !== prevPhase) {
        this.#onPhaseComplete(prevPhase, phase);
        prevPhase = phase;
      }
      this.#renderPhase(phase);
      this.#renderSessionDots();
    });

    /* Running state */
    State.subscribe('pomodoro.isRunning', (running) => {
      this.#updateStartBtn(running);
    });

    /* Sessions */
    State.subscribe('pomodoro.sessionsDone', (n) => {
      this.#renderSessionCount(n);
      this.#renderSessionDots();
    });
  }

  /* ============================================================
     RENDER
  ============================================================ */
  #renderAll() {
    const pomo = State.get('pomodoro');
    this.#renderTime(pomo.timeLeft);
    this.#renderPhase(pomo.phase);
    this.#renderProgress();
    this.#renderSessionCount(pomo.sessionsDone);
  }

  #renderTime(seconds) {
    const el = DOM.id('pomodoroTime');
    if (el) el.textContent = DateUtils.formatSeconds(seconds);

    /* Update document title if running */
    if (State.get('pomodoro.isRunning')) {
      const phase  = State.get('pomodoro.phase');
      const emoji  = this.#PHASES[phase]?.emoji ?? '🍅';
      const tab    = { dashboard:'لوحة التحكم', calendar:'التقويم', chat:'المحادثة',
                       tasks:'المهام', notes:'الملاحظات', canvas:'التخطيط' }
                       [State.get('app.activeTab')] ?? 'المدير';
      document.title = `${emoji} ${DateUtils.formatSeconds(seconds)} — ${tab}`;
    }
  }

  #renderPhase(phase) {
    const el   = DOM.id('pomodoroPhase');
    const info = this.#PHASES[phase] ?? this.#PHASES.work;
    if (el) {
      el.textContent = `${info.emoji} ${info.label}`;
      el.className   = `pomodoro-phase ${info.class}`;
    }
  }

  #renderProgress() {
    const fill = DOM.id('pomodoroProgressFill');
    if (fill) {
      fill.style.width = `${Actions.pomodoro.getProgress()}%`;
    }
  }

  #renderSessionDots() {
    const dotsEl   = DOM.id('sessionDots');
    const settings = State.get('pomodoro.settings');
    const done     = State.get('pomodoro.sessionsDone');
    const goal     = settings.sessionsGoal ?? 4;

    if (!dotsEl) return;

    dotsEl.innerHTML = Array.from({ length: goal }, (_, i) => `
      <span class="session-dot ${i < done ? 'completed' : ''}"
            title="جلسة ${i + 1}${i < done ? ' ✓' : ''}">
      </span>
    `).join('');
  }

  #renderSessionCount(n) {
    const settings = State.get('pomodoro.settings');
    const goal     = settings.sessionsGoal ?? 4;
    DOM.setText(DOM.id('sessionCount'), `${n} / ${goal} جلسات`);
  }

  #updateStartBtn(running) {
    const btn  = DOM.id('pomodoroStart');
    const icon = btn?.querySelector('i');

    if (icon) icon.className = running ? 'fas fa-pause' : 'fas fa-play';
    btn?.classList.toggle('running', running);
    btn?.setAttribute('title', running ? 'إيقاف مؤقت' : 'تشغيل');
    btn?.setAttribute('aria-label', running ? 'إيقاف مؤقت' : 'تشغيل');
  }

  /* ============================================================
     HELPERS
  ============================================================ */
  #clearInterval() {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
  }
}

/* ---- Singleton Export ---- */
window.PomodoroComponent = new PomodoroTimerComponent();