/* ============================================================
   المدير — Ultimate Productivity Workspace
   api.js | API Communication Layer v2.0.0

   طبقة تواصل كاملة مع Flask Backend
   تشمل: Request Queue، Retry Logic، Cache، Interceptors
   ============================================================ */

'use strict';

/* ============================================================
   1. CONFIGURATION
   ============================================================ */
const API_CONFIG = {
  BASE_URL:        'http://localhost:5000/api',
  TIMEOUT:         15000,          // 15 seconds
  RETRY_ATTEMPTS:  3,
  RETRY_DELAY:     1000,           // 1 second base delay
  RETRY_BACKOFF:   2,              // exponential multiplier
  CACHE_TTL:       60 * 1000,     // 1 minute default
  MAX_CACHE_SIZE:  100,            // max cached responses
  RATE_LIMIT:      100,            // requests per minute
  RATE_WINDOW:     60 * 1000,

  ENDPOINTS: {
    /* Dashboard */
    STATS:           '/stats',

    /* Chat */
    CHAT:            '/chat',

    /* Tasks */
    TASKS:           '/tasks',
    TASK_BY_ID:      (id) => `/tasks/${id}`,

    /* Notes */
    NOTES:           '/notes',
    NOTE_BY_ID:      (id) => `/notes/${id}`,

    /* Reminders / Calendar */
    REMINDERS:       '/reminders',
    REMINDER_BY_ID:  (id) => `/reminders/${id}`,

    /* Sync */
    SYNC:            '/sync',

    /* Health */
    HEALTH:          '/health',
  },

  /* HTTP Methods */
  METHODS: {
    GET:    'GET',
    POST:   'POST',
    PUT:    'PUT',
    PATCH:  'PATCH',
    DELETE: 'DELETE',
  },

  /* Default Headers */
  DEFAULT_HEADERS: {
    'Content-Type':  'application/json',
    'Accept':        'application/json',
    'X-App-Version': '2.0.0',
    'X-Client':      'almudir-web',
    'Accept-Language': 'ar',
  },
};

/* ============================================================
   2. REQUEST CACHE
   ============================================================ */
class RequestCache {
  #cache   = new Map();
  #maxSize;
  #defaultTTL;

  constructor(maxSize = 100, defaultTTL = 60000) {
    this.#maxSize    = maxSize;
    this.#defaultTTL = defaultTTL;
  }

  /* Generate cache key */
  #makeKey(method, url, params) {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${method}:${url}:${paramStr}`;
  }

  /* Check if entry is valid */
  #isValid(entry) {
    return Date.now() < entry.expiresAt;
  }

  /* Evict oldest entry if cache is full */
  #evictOldest() {
    let oldestKey  = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.#cache) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldestKey  = key;
      }
    }
    if (oldestKey) this.#cache.delete(oldestKey);
  }

  get(method, url, params) {
    /* Only cache GET requests */
    if (method !== 'GET') return null;

    const key   = this.#makeKey(method, url, params);
    const entry = this.#cache.get(key);

    if (!entry) return null;
    if (!this.#isValid(entry)) {
      this.#cache.delete(key);
      return null;
    }

    entry.hits = (entry.hits ?? 0) + 1;
    return entry.data;
  }

  set(method, url, params, data, ttl = this.#defaultTTL) {
    if (method !== 'GET') return;

    /* Evict if at capacity */
    if (this.#cache.size >= this.#maxSize) {
      this.#evictOldest();
    }

    const key = this.#makeKey(method, url, params);
    this.#cache.set(key, {
      data,
      cachedAt:  Date.now(),
      expiresAt: Date.now() + ttl,
      hits:      0,
    });
  }

  invalidate(urlPattern) {
    for (const key of this.#cache.keys()) {
      if (key.includes(urlPattern)) {
        this.#cache.delete(key);
      }
    }
  }

  clear() {
    this.#cache.clear();
  }

  get size()      { return this.#cache.size; }
  get hitRate()   {
    let hits = 0, total = 0;
    for (const e of this.#cache.values()) {
      hits  += e.hits ?? 0;
      total += 1;
    }
    return total ? (hits / total).toFixed(2) : 0;
  }
}

/* ============================================================
   3. RATE LIMITER
   ============================================================ */
class RateLimiter {
  #requests  = [];
  #limit;
  #window;

  constructor(limit = 100, windowMs = 60000) {
    this.#limit  = limit;
    this.#window = windowMs;
  }

  #cleanup() {
    const cutoff = Date.now() - this.#window;
    this.#requests = this.#requests.filter(t => t > cutoff);
  }

  canMakeRequest() {
    this.#cleanup();
    return this.#requests.length < this.#limit;
  }

  record() {
    this.#requests.push(Date.now());
  }

  get remaining() {
    this.#cleanup();
    return Math.max(0, this.#limit - this.#requests.length);
  }

  get resetIn() {
    if (!this.#requests.length) return 0;
    const oldest = Math.min(...this.#requests);
    return Math.max(0, this.#window - (Date.now() - oldest));
  }
}

/* ============================================================
   4. REQUEST INTERCEPTORS
   ============================================================ */
class InterceptorManager {
  #interceptors = [];

  use(onFulfilled, onRejected) {
    this.#interceptors.push({ onFulfilled, onRejected });
    return this.#interceptors.length - 1;
  }

  eject(id) {
    this.#interceptors[id] = null;
  }

  async run(value, type = 'request') {
    let current = Promise.resolve(value);
    for (const interceptor of this.#interceptors) {
      if (!interceptor) continue;
      current = current.then(
        interceptor.onFulfilled,
        interceptor.onRejected
      );
    }
    return current;
  }
}

/* ============================================================
   5. API ERROR CLASS
   ============================================================ */
class APIError extends Error {
  constructor(message, {
    status      = 0,
    statusText  = '',
    endpoint    = '',
    method      = '',
    data        = null,
    isNetwork   = false,
    isTimeout   = false,
    isAborted   = false,
    isRateLimit = false,
    originalErr = null,
  } = {}) {
    super(message);
    this.name        = 'APIError';
    this.status      = status;
    this.statusText  = statusText;
    this.endpoint    = endpoint;
    this.method      = method;
    this.data        = data;
    this.isNetwork   = isNetwork;
    this.isTimeout   = isTimeout;
    this.isAborted   = isAborted;
    this.isRateLimit = isRateLimit;
    this.isServer    = status >= 500;
    this.isClient    = status >= 400 && status < 500;
    this.isNotFound  = status === 404;
    this.isUnauth    = status === 401;
    this.isForbidden = status === 403;
    this.originalErr = originalErr;
    this.timestamp   = new Date().toISOString();
  }

  /* Arabic user-friendly message */
  get arabicMessage() {
    if (this.isTimeout)   return 'انتهت مهلة الاتصال. تحقق من الخادم.';
    if (this.isNetwork)   return 'لا يوجد اتصال بالإنترنت أو الخادم.';
    if (this.isRateLimit) return 'طلبات كثيرة جداً. يرجى الانتظار.';
    if (this.isAborted)   return 'تم إلغاء الطلب.';
    if (this.isNotFound)  return 'المورد المطلوب غير موجود.';
    if (this.isUnauth)    return 'غير مصرح. يرجى تسجيل الدخول.';
    if (this.isForbidden) return 'ليس لديك صلاحية للوصول.';
    if (this.isServer)    return 'خطأ في الخادم. يرجى المحاولة لاحقاً.';
    if (this.isClient)    return `خطأ في البيانات المرسلة (${this.status}).`;
    return this.message ?? 'حدث خطأ غير متوقع.';
  }

  toJSON() {
    return {
      name:       this.name,
      message:    this.message,
      status:     this.status,
      endpoint:   this.endpoint,
      method:     this.method,
      timestamp:  this.timestamp,
      isNetwork:  this.isNetwork,
      isTimeout:  this.isTimeout,
    };
  }
}

/* ============================================================
   6. HTTP CLIENT (Core)
   ============================================================ */
class HttpClient {
  #cache        = new RequestCache(API_CONFIG.MAX_CACHE_SIZE, API_CONFIG.CACHE_TTL);
  #rateLimiter  = new RateLimiter(API_CONFIG.RATE_LIMIT, API_CONFIG.RATE_WINDOW);
  #reqInterceptors = new InterceptorManager();
  #resInterceptors = new InterceptorManager();
  #activeRequests  = new Map();
  #requestLog      = [];
  #baseURL;
  #defaultHeaders;
  #timeout;
  #retryAttempts;
  #retryDelay;

  constructor(config = {}) {
    this.#baseURL        = config.baseURL        ?? API_CONFIG.BASE_URL;
    this.#defaultHeaders = config.defaultHeaders ?? API_CONFIG.DEFAULT_HEADERS;
    this.#timeout        = config.timeout        ?? API_CONFIG.TIMEOUT;
    this.#retryAttempts  = config.retryAttempts  ?? API_CONFIG.RETRY_ATTEMPTS;
    this.#retryDelay     = config.retryDelay     ?? API_CONFIG.RETRY_DELAY;
  }

  /* ----------------------------------------------------------
     INTERCEPTORS (public)
  ---------------------------------------------------------- */
  get interceptors() {
    return {
      request:  this.#reqInterceptors,
      response: this.#resInterceptors,
    };
  }

  /* ----------------------------------------------------------
     BUILD URL
  ---------------------------------------------------------- */
  #buildURL(endpoint, params = {}) {
    const url = new URL(`${this.#baseURL}${endpoint}`);
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        url.searchParams.append(key, String(val));
      }
    }
    return url.toString();
  }

  /* ----------------------------------------------------------
     SHOULD RETRY
  ---------------------------------------------------------- */
  #shouldRetry(error, attempt) {
    if (attempt >= this.#retryAttempts) return false;
    if (error.isAborted)   return false;
    if (error.isRateLimit) return false;
    if (error.isClient && !error.isUnauth) return false;
    /* Retry on network errors, timeouts, 5xx */
    return error.isNetwork || error.isTimeout || error.isServer;
  }

  /* ----------------------------------------------------------
     CALCULATE RETRY DELAY (exponential backoff + jitter)
  ---------------------------------------------------------- */
  #calcDelay(attempt) {
    const exp    = Math.pow(API_CONFIG.RETRY_BACKOFF, attempt);
    const delay  = this.#retryDelay * exp;
    const jitter = Math.random() * 500;
    return Math.min(delay + jitter, 30000);
  }

  /* ----------------------------------------------------------
     LOG REQUEST
  ---------------------------------------------------------- */
  #logRequest(config, response, duration, fromCache) {
    const entry = {
      id:        `req_${Date.now()}`,
      method:    config.method,
      url:       config.url,
      status:    response?.status ?? 0,
      duration:  `${duration}ms`,
      fromCache,
      timestamp: new Date().toISOString(),
    };

    this.#requestLog.unshift(entry);
    if (this.#requestLog.length > 200) this.#requestLog.pop();

    if (window.location.hostname === 'localhost') {
      const color  = fromCache ? '#feca57' : response?.ok ? '#55efc4' : '#ff6b6b';
      const badge  = fromCache ? '💾 CACHE' : `${entry.status}`;
      console.log(
        `%c[API] ${badge} ${config.method} ${config.url} (${entry.duration})`,
        `color:${color};font-weight:600;`
      );
    }
  }

  /* ----------------------------------------------------------
     CORE REQUEST METHOD
  ---------------------------------------------------------- */
  async #request(config, attempt = 0) {
    const {
      method      = 'GET',
      endpoint    = '',
      params      = {},
      data        = null,
      headers     = {},
      cache       = true,
      cacheTTL    = API_CONFIG.CACHE_TTL,
      signal      = null,
      onUploadProgress = null,
    } = config;

    /* --- Rate Limiting --- */
    if (!this.#rateLimiter.canMakeRequest()) {
      const resetIn = this.#rateLimiter.resetIn;
      throw new APIError('Rate limit exceeded', {
        isRateLimit: true,
        endpoint,
        method,
      });
    }

    /* --- Cache Check (GET only) --- */
    if (cache && method === 'GET') {
      const cached = this.#cache.get(method, endpoint, params);
      if (cached) {
        this.#logRequest({ method, url: endpoint }, { status: 200, ok: true }, 0, true);
        return cached;
      }
    }

    /* --- Build URL & Request Config --- */
    const url         = this.#buildURL(endpoint, params);
    const reqHeaders  = { ...this.#defaultHeaders, ...headers };
    const controller  = new AbortController();
    const reqSignal   = signal ?? controller.signal;

    /* Timeout */
    const timeoutId = setTimeout(
      () => controller.abort('timeout'),
      this.#timeout
    );

    const fetchConfig = {
      method,
      headers: reqHeaders,
      signal:  reqSignal,
    };

    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchConfig.body = JSON.stringify(data);
    }

    /* Track active request */
    const reqKey = `${method}:${endpoint}`;
    this.#activeRequests.set(reqKey, controller);

    /* Record rate limit usage */
    this.#rateLimiter.record();

    /* Run request interceptors */
    await this.#reqInterceptors.run({ url, config: fetchConfig });

    const startTime = performance.now();

    try {
      const response = await fetch(url, fetchConfig);
      clearTimeout(timeoutId);

      const duration = Math.round(performance.now() - startTime);
      this.#logRequest({ method, url: endpoint }, response, duration, false);

      /* Parse response */
      let responseData;
      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else if (contentType.includes('text/')) {
        responseData = await response.text();
      } else {
        responseData = await response.blob();
      }

      /* Handle HTTP errors */
      if (!response.ok) {
        const errMsg = responseData?.message
          ?? responseData?.error
          ?? response.statusText
          ?? 'Request failed';

        const apiError = new APIError(errMsg, {
          status:     response.status,
          statusText: response.statusText,
          endpoint,
          method,
          data:       responseData,
        });

        /* Run error interceptors */
        await this.#resInterceptors.run(apiError, 'error');

        /* Retry? */
        if (this.#shouldRetry(apiError, attempt)) {
          const delay = this.#calcDelay(attempt);
          console.warn(`[API] Retrying (${attempt + 1}/${this.#retryAttempts}) in ${Math.round(delay)}ms...`);
          await this.#sleep(delay);
          return this.#request(config, attempt + 1);
        }

        throw apiError;
      }

      /* Cache successful GET responses */
      if (cache && method === 'GET') {
        this.#cache.set(method, endpoint, params, responseData, cacheTTL);
      }

      /* Invalidate related cache on mutations */
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const basePath = endpoint.split('/').slice(0, 3).join('/');
        this.#cache.invalidate(basePath);
      }

      /* Run success interceptors */
      await this.#resInterceptors.run(responseData, 'success');

      return responseData;

    } catch (err) {
      clearTimeout(timeoutId);
      this.#activeRequests.delete(reqKey);

      /* Already an APIError */
      if (err instanceof APIError) throw err;

      /* Abort errors */
      if (err.name === 'AbortError') {
        const reason  = controller.signal.reason;
        const isTimeout = reason === 'timeout';
        throw new APIError(
          isTimeout ? 'Request timed out' : 'Request aborted',
          { isTimeout, isAborted: !isTimeout, endpoint, method, originalErr: err }
        );
      }

      /* Network errors */
      const networkError = new APIError(err.message, {
        isNetwork:   true,
        endpoint,
        method,
        originalErr: err,
      });

      /* Retry on network error */
      if (this.#shouldRetry(networkError, attempt)) {
        const delay = this.#calcDelay(attempt);
        console.warn(`[API] Network retry (${attempt + 1}/${this.#retryAttempts}) in ${Math.round(delay)}ms...`);
        await this.#sleep(delay);
        return this.#request(config, attempt + 1);
      }

      throw networkError;

    } finally {
      clearTimeout(timeoutId);
      this.#activeRequests.delete(`${method}:${endpoint}`);
    }
  }

  /* ----------------------------------------------------------
     SLEEP HELPER
  ---------------------------------------------------------- */
  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ----------------------------------------------------------
     PUBLIC HTTP METHODS
  ---------------------------------------------------------- */
  async get(endpoint, params = {}, options = {}) {
    return this.#request({ method: 'GET', endpoint, params, ...options });
  }

  async post(endpoint, data = {}, options = {}) {
    return this.#request({ method: 'POST', endpoint, data, cache: false, ...options });
  }

  async put(endpoint, data = {}, options = {}) {
    return this.#request({ method: 'PUT', endpoint, data, cache: false, ...options });
  }

  async patch(endpoint, data = {}, options = {}) {
    return this.#request({ method: 'PATCH', endpoint, data, cache: false, ...options });
  }

  async delete(endpoint, options = {}) {
    return this.#request({ method: 'DELETE', endpoint, cache: false, ...options });
  }

  /* ----------------------------------------------------------
     CANCEL REQUEST
  ---------------------------------------------------------- */
  cancel(method, endpoint) {
    const key        = `${method}:${endpoint}`;
    const controller = this.#activeRequests.get(key);
    if (controller) {
      controller.abort('cancelled');
      this.#activeRequests.delete(key);
      console.log(`[API] ❌ Cancelled: ${key}`);
    }
  }

  cancelAll() {
    for (const [key, controller] of this.#activeRequests) {
      controller.abort('cancelled');
    }
    this.#activeRequests.clear();
  }

  /* ----------------------------------------------------------
     HEALTH CHECK
  ---------------------------------------------------------- */
  async healthCheck() {
    try {
      const res = await this.get(
        API_CONFIG.ENDPOINTS.HEALTH,
        {},
        { cache: false, timeout: 5000 }
      );
      return { healthy: true, data: res };
    } catch {
      return { healthy: false, data: null };
    }
  }

  /* ----------------------------------------------------------
     GETTERS
  ---------------------------------------------------------- */
  get cache()        { return this.#cache; }
  get rateLimiter()  { return this.#rateLimiter; }
  get requestLog()   { return [...this.#requestLog]; }
  get activeCount()  { return this.#activeRequests.size; }
}

/* ============================================================
   7. API SERVICE LAYER
   ============================================================ */
class ApiService {
  #http;

  constructor(httpClient) {
    this.#http = httpClient;
    this.#setupInterceptors();
  }

  /* ----------------------------------------------------------
     INTERCEPTORS SETUP
  ---------------------------------------------------------- */
  #setupInterceptors() {
    /* Request: Add auth token if exists */
    this.#http.interceptors.request.use(
      async (config) => {
        const token = localStorage.getItem('almudir_token');
        if (token) {
          config.config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
      },
      async (err) => Promise.reject(err)
    );

    /* Response: Global error handling */
    this.#http.interceptors.response.use(
      async (data)  => data,
      async (error) => {
        if (error instanceof APIError) {
          /* Show toast for user-facing errors */
          if (!error.isAborted && !error.isNetwork) {
            window.UI?.toast?.error?.(
              'خطأ في الاتصال',
              error.arabicMessage,
              { duration: 5000 }
            );
          }

          /* Queue for offline sync if network error */
          if (error.isNetwork && typeof Actions !== 'undefined') {
            console.log('[API] Network error — will queue for offline sync');
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /* ----------------------------------------------------------
     OFFLINE-AWARE WRAPPER
     Queues request if offline, executes if online
  ---------------------------------------------------------- */
  async #offlineAware(operation, fallbackQueueItem) {
    const isOnline = typeof Selectors !== 'undefined'
      ? Selectors.isOnline()
      : navigator.onLine;

    if (!isOnline) {
      /* Queue for later sync */
      if (typeof Actions !== 'undefined') {
        Actions.offlineQueue.enqueue(fallbackQueueItem);
        Actions.autosave.setSaving();
      }
      console.log('[API] Offline — queued operation:', fallbackQueueItem.type);
      return { queued: true, offline: true };
    }

    return await operation();
  }

  /* ============================================================
     DASHBOARD API
  ============================================================ */

  /**
   * GET /api/stats
   * جلب إحصائيات لوحة التحكم
   */
  async getStats() {
    try {
      const data = await this.#http.get(
        API_CONFIG.ENDPOINTS.STATS,
        {},
        { cacheTTL: 30 * 1000 }  // cache 30 seconds
      );

      if (typeof Actions !== 'undefined') {
        Actions.dashboard.setStats({
          totalTasks:       data.total_tasks      ?? 0,
          completedToday:   data.completed_today  ?? 0,
          totalNotes:       data.total_notes      ?? 0,
          activeReminders:  data.active_reminders ?? 0,
          tasksChange:      data.tasks_change     ?? 0,
          notesChange:      data.notes_change     ?? 0,
          remindersChange:  data.reminders_change ?? 0,
          completedChange:  data.completed_change ?? 0,
        });
        Actions.dashboard.setLastRefreshed();
      }

      return { success: true, data };
    } catch (err) {
      this.#handleError('getStats', err);
      return { success: false, error: err };
    }
  }

  /* ============================================================
     TASKS API
  ============================================================ */

  /**
   * GET /api/tasks
   * جلب جميع المهام
   */
  async getTasks(params = {}) {
    try {
      if (typeof Actions !== 'undefined') {
        Actions.tasks.setLoading(true);
      }

      const data = await this.#http.get(
        API_CONFIG.ENDPOINTS.TASKS,
        params,
        { cacheTTL: 20 * 1000 }
      );

      const tasks = Array.isArray(data)
        ? data.map(this.#normalizeTask)
        : (data.tasks ?? []).map(this.#normalizeTask);

      if (typeof Actions !== 'undefined') {
        Actions.tasks.setAll(tasks);
      }

      return { success: true, data: tasks };
    } catch (err) {
      if (typeof Actions !== 'undefined') {
        Actions.tasks.setLoading(false);
      }
      this.#handleError('getTasks', err);

      /* Return cached state if available */
      const cached = typeof State !== 'undefined'
        ? State.get('tasks.items')
        : [];
      return { success: false, error: err, data: cached };
    }
  }

  /**
   * POST /api/tasks
   * إنشاء مهمة جديدة
   */
  async createTask(taskData) {
    const optimisticTask = typeof Actions !== 'undefined'
      ? Actions.tasks.add(taskData)
      : null;

    return await this.#offlineAware(
      async () => {
        try {
          const data = await this.#http.post(
            API_CONFIG.ENDPOINTS.TASKS,
            this.#serializeTask(taskData)
          );

          /* Replace optimistic with real data */
          if (optimisticTask && typeof Actions !== 'undefined') {
            Actions.tasks.remove(optimisticTask.id);
            Actions.tasks.add(this.#normalizeTask(data));
          }

          Actions.autosave.setSaved();
          Bus.emit('task:created', data);
          return { success: true, data: this.#normalizeTask(data) };
        } catch (err) {
          /* Rollback optimistic update */
          if (optimisticTask && typeof Actions !== 'undefined') {
            Actions.tasks.remove(optimisticTask.id);
          }
          this.#handleError('createTask', err);
          return { success: false, error: err };
        }
      },
      {
        type:     'CREATE_TASK',
        endpoint: API_CONFIG.ENDPOINTS.TASKS,
        method:   'POST',
        payload:  this.#serializeTask(taskData),
      }
    );
  }

  /**
   * PUT /api/tasks/:id
   * تحديث مهمة
   */
  async updateTask(taskId, updates) {
    /* Optimistic update */
    if (typeof Actions !== 'undefined') {
      Actions.tasks.update(taskId, updates);
      Actions.autosave.setSaving();
    }

    return await this.#offlineAware(
      async () => {
        try {
          const data = await this.#http.put(
            API_CONFIG.ENDPOINTS.TASK_BY_ID(taskId),
            this.#serializeTask(updates)
          );

          Actions.autosave.setSaved();
          Bus.emit('task:updated', { taskId, data });
          return { success: true, data: this.#normalizeTask(data) };
        } catch (err) {
          /* Rollback — re-fetch to get real state */
          await this.getTasks();
          this.#handleError('updateTask', err);
          return { success: false, error: err };
        }
      },
      {
        type:     'UPDATE_TASK',
        endpoint: API_CONFIG.ENDPOINTS.TASK_BY_ID(taskId),
        method:   'PUT',
        payload:  this.#serializeTask(updates),
        taskId,
      }
    );
  }

  /**
   * DELETE /api/tasks/:id
   * حذف مهمة
   */
  async deleteTask(taskId) {
    /* Optimistic delete */
    const task = typeof Selectors !== 'undefined'
      ? Selectors.getTaskById(taskId)
      : null;

    if (typeof Actions !== 'undefined') {
      Actions.tasks.remove(taskId);
    }

    return await this.#offlineAware(
      async () => {
        try {
          await this.#http.delete(
            API_CONFIG.ENDPOINTS.TASK_BY_ID(taskId)
          );

          Bus.emit('task:deleted', { taskId });
          return { success: true };
        } catch (err) {
          /* Rollback */
          if (task && typeof Actions !== 'undefined') {
            Actions.tasks.add(task);
          }
          this.#handleError('deleteTask', err);
          return { success: false, error: err };
        }
      },
      {
        type:     'DELETE_TASK',
        endpoint: API_CONFIG.ENDPOINTS.TASK_BY_ID(taskId),
        method:   'DELETE',
        taskId,
      }
    );
  }

  /**
   * PUT /api/tasks/:id (status change)
   * تغيير حالة المهمة (للكانبان)
   */
  async moveTask(taskId, newStatus) {
    if (typeof Actions !== 'undefined') {
      Actions.tasks.moveCard(taskId, newStatus);
    }

    return await this.#offlineAware(
      async () => {
        try {
          const data = await this.#http.put(
            API_CONFIG.ENDPOINTS.TASK_BY_ID(taskId),
            { status: newStatus }
          );

          Bus.emit('task:moved', { taskId, newStatus });
          return { success: true, data };
        } catch (err) {
          await this.getTasks();
          this.#handleError('moveTask', err);
          return { success: false, error: err };
        }
      },
      {
        type:     'MOVE_TASK',
        endpoint: API_CONFIG.ENDPOINTS.TASK_BY_ID(taskId),
        method:   'PUT',
        payload:  { status: newStatus },
        taskId,
      }
    );
  }

  /* ============================================================
     NOTES API
  ============================================================ */

  /**
   * GET /api/notes
   * جلب جميع الملاحظات
   */
  async getNotes(params = {}) {
    try {
      if (typeof Actions !== 'undefined') {
        Actions.notes.setLoading(true);
      }

      const data = await this.#http.get(
        API_CONFIG.ENDPOINTS.NOTES,
        params,
        { cacheTTL: 30 * 1000 }
      );

      const notes = Array.isArray(data)
        ? data.map(this.#normalizeNote)
        : (data.notes ?? []).map(this.#normalizeNote);

      if (typeof Actions !== 'undefined') {
        Actions.notes.setAll(notes);
      }

      return { success: true, data: notes };
    } catch (err) {
      if (typeof Actions !== 'undefined') {
        Actions.notes.setLoading(false);
      }
      this.#handleError('getNotes', err);
      return { success: false, error: err, data: [] };
    }
  }

  /**
   * POST /api/notes (implicit — notes saved locally first)
   * إنشاء ملاحظة
   */
  async createNote(noteData) {
    const optimisticNote = typeof Actions !== 'undefined'
      ? Actions.notes.add(noteData)
      : null;

    return await this.#offlineAware(
      async () => {
        try {
          /* Backend may not have a POST /notes — handle gracefully */
          let data = optimisticNote;
          try {
            const res = await this.#http.post(
              API_CONFIG.ENDPOINTS.NOTES,
              this.#serializeNote(noteData)
            );
            data = this.#normalizeNote(res);

            if (optimisticNote && typeof Actions !== 'undefined') {
              Actions.notes.remove(optimisticNote.id);
              Actions.notes.add(data);
            }
          } catch (postErr) {
            /* If no POST endpoint, keep optimistic */
            console.warn('[API] Notes POST not available, using local storage');
          }

          Actions.autosave.setSaved();
          Bus.emit('note:created', data);
          return { success: true, data };
        } catch (err) {
          if (optimisticNote && typeof Actions !== 'undefined') {
            Actions.notes.remove(optimisticNote.id);
          }
          this.#handleError('createNote', err);
          return { success: false, error: err };
        }
      },
      {
        type:     'CREATE_NOTE',
        endpoint: API_CONFIG.ENDPOINTS.NOTES,
        method:   'POST',
        payload:  this.#serializeNote(noteData),
      }
    );
  }

  /**
   * Save note (PUT or local)
   * حفظ الملاحظة
   */
  async saveNote(noteId, updates) {
    if (typeof Actions !== 'undefined') {
      Actions.notes.update(noteId, updates);
      Actions.autosave.setSaving();
    }

    return await this.#offlineAware(
      async () => {
        try {
          let data = updates;
          try {
            const res = await this.#http.put(
              `${API_CONFIG.ENDPOINTS.NOTES}/${noteId}`,
              this.#serializeNote(updates)
            );
            data = this.#normalizeNote(res);
          } catch (putErr) {
            /* Keep local update if no PUT endpoint */
            console.warn('[API] Notes PUT not available, using local state');
          }

          Actions.autosave.setSaved();
          Bus.emit('note:saved', { noteId, data });
          return { success: true, data };
        } catch (err) {
          Actions.autosave.setError();
          this.#handleError('saveNote', err);
          return { success: false, error: err };
        }
      },
      {
        type:     'SAVE_NOTE',
        endpoint: `${API_CONFIG.ENDPOINTS.NOTES}/${noteId}`,
        method:   'PUT',
        payload:  this.#serializeNote(updates),
        noteId,
      }
    );
  }

  /**
   * DELETE /api/notes/:id
   * حذف ملاحظة
   */
  async deleteNote(noteId) {
    const note = typeof Selectors !== 'undefined'
      ? Selectors.getNoteById(noteId)
      : null;

    if (typeof Actions !== 'undefined') {
      Actions.notes.remove(noteId);
    }

    return await this.#offlineAware(
      async () => {
        try {
          await this.#http.delete(
            `${API_CONFIG.ENDPOINTS.NOTES}/${noteId}`
          );
          Bus.emit('note:deleted', { noteId });
          return { success: true };
        } catch (err) {
          if (note && typeof Actions !== 'undefined') {
            Actions.notes.add(note);
          }
          this.#handleError('deleteNote', err);
          return { success: false, error: err };
        }
      },
      {
        type:     'DELETE_NOTE',
        endpoint: `${API_CONFIG.ENDPOINTS.NOTES}/${noteId}`,
        method:   'DELETE',
        noteId,
      }
    );
  }

  /* ============================================================
     REMINDERS / CALENDAR API
  ============================================================ */

  /**
   * GET /api/reminders
   * جلب التذكيرات
   */
  async getReminders(params = {}) {
    try {
      if (typeof Actions !== 'undefined') {
        Actions.calendar.setLoading(true);
      }

      const data = await this.#http.get(
        API_CONFIG.ENDPOINTS.REMINDERS,
        params,
        { cacheTTL: 60 * 1000 }
      );

      const reminders = Array.isArray(data)
        ? data.map(this.#normalizeReminder)
        : (data.reminders ?? []).map(this.#normalizeReminder);

      if (typeof Actions !== 'undefined') {
        Actions.calendar.setReminders(reminders);

        /* Convert to FullCalendar events */
        const events = reminders.map(r => ({
          id:        r.id,
          title:     r.title,
          start:     r.date,
          allDay:    r.allDay ?? false,
          color:     this.#reminderColor(r.type),
          extendedProps: {
            type:   r.type,
            notes:  r.notes,
            source: 'reminder',
          },
        }));
        Actions.calendar.setEvents(events);
      }

      return { success: true, data: reminders };
    } catch (err) {
      if (typeof Actions !== 'undefined') {
        Actions.calendar.setLoading(false);
      }
      this.#handleError('getReminders', err);
      return { success: false, error: err, data: [] };
    }
  }

  /**
   * POST /api/reminders (via sync endpoint)
   * إنشاء تذكير
   */
  async createReminder(reminderData) {
    const normalized = this.#normalizeReminder(reminderData);

    if (typeof Actions !== 'undefined') {
      Actions.calendar.addEvent({
        ...normalized,
        color: this.#reminderColor(normalized.type),
      });
    }

    return await this.#offlineAware(
      async () => {
        try {
          const data = await this.#http.post(
            API_CONFIG.ENDPOINTS.REMINDERS ?? API_CONFIG.ENDPOINTS.SYNC,
            this.#serializeReminder(reminderData)
          );

          /* Schedule browser notification */
          if (typeof Actions !== 'undefined') {
            Actions.notifications.schedule(normalized);
          }

          Bus.emit('reminder:created', data);
          return { success: true, data };
        } catch (err) {
          this.#handleError('createReminder', err);
          return { success: false, error: err };
        }
      },
      {
        type:     'CREATE_REMINDER',
        endpoint: API_CONFIG.ENDPOINTS.REMINDERS,
        method:   'POST',
        payload:  this.#serializeReminder(reminderData),
      }
    );
  }

  /* ============================================================
     CHAT API
  ============================================================ */

  /**
   * POST /api/chat
   * إرسال رسالة للـ AI
   */
  async sendChatMessage(message, options = {}) {
    const {
      onStream   = null,
      sessionId  = null,
      context    = [],
    } = options;

    /* Add user message to state */
    let userMsg;
    if (typeof Actions !== 'undefined') {
      userMsg = Actions.chat.addMessage('user', message);
      Actions.chat.setTyping(true);
      Actions.chat.setLoading(true);
    }

    try {
      const payload = {
        message,
        session_id:  sessionId ?? State?.get('chat.sessionId'),
        context:     context.slice(-10), // last 10 messages for context
        timestamp:   new Date().toISOString(),
        lang:        'ar',
      };

      const data = await this.#http.post(
        API_CONFIG.ENDPOINTS.CHAT,
        payload,
        { cache: false }
      );

      const aiResponse = data.response
        ?? data.message
        ?? data.reply
        ?? data.content
        ?? 'لم أتمكن من فهم طلبك. يرجى إعادة الصياغة.';

      /* Add AI response to state */
      if (typeof Actions !== 'undefined') {
        Actions.chat.addMessage('assistant', aiResponse, {
          tokens: data.tokens ?? null,
          model:  data.model  ?? null,
        });

        /* Update session ID if provided */
        if (data.session_id) {
          Actions.chat.setSessionId(data.session_id);
        }
      }

      /* Text-to-Speech */
      if (
        State?.get('chat.voiceEnabled') &&
        typeof window.speechSynthesis !== 'undefined'
      ) {
        this.#speak(aiResponse);
      }

      Bus.emit('chat:response', { message, response: aiResponse });
      return { success: true, data: aiResponse, raw: data };

    } catch (err) {
      /* Add error message */
      if (typeof Actions !== 'undefined') {
        Actions.chat.addMessage('assistant', `⚠️ ${err.arabicMessage ?? err.message}`, {
          isError: true,
        });
      }
      this.#handleError('sendChatMessage', err);
      return { success: false, error: err };

    } finally {
      if (typeof Actions !== 'undefined') {
        Actions.chat.setTyping(false);
        Actions.chat.setLoading(false);
      }
    }
  }

  /* ============================================================
     SYNC API
  ============================================================ */

  /**
   * POST /api/sync
   * مزامنة العمليات المعلّقة مع الخادم
   */
  async syncOfflineQueue() {
    const queue = typeof Actions !== 'undefined'
      ? Actions.offlineQueue.getAll()
      : [];

    if (!queue.length) {
      console.log('[API] Sync: Queue is empty, nothing to sync.');
      return { success: true, synced: 0 };
    }

    if (!navigator.onLine) {
      console.log('[API] Sync: Still offline, skipping.');
      return { success: false, synced: 0, reason: 'offline' };
    }

    if (typeof Actions !== 'undefined') {
      Actions.offlineQueue.setSyncing(true);
      Actions.offlineQueue.setLastAttempt();
      Actions.autosave.setSaving();
    }

    const results = { synced: 0, failed: 0, errors: [] };

    console.log(`[API] 🔄 Syncing ${queue.length} offline operations...`);

    for (const operation of queue) {
      try {
        await this.#http.post(API_CONFIG.ENDPOINTS.SYNC, {
          operations: [operation],
        });

        if (typeof Actions !== 'undefined') {
          Actions.offlineQueue.dequeue(operation.id);
        }

        results.synced++;
        console.log(`[API] ✅ Synced: ${operation.type} (${operation.id})`);

      } catch (err) {
        results.failed++;
        results.errors.push({ operation, error: err.message });

        if (typeof Actions !== 'undefined') {
          Actions.offlineQueue.incrementRetry(operation.id);

          /* Remove if max retries exceeded */
          const op = Actions.offlineQueue.getAll()
            .find(o => o.id === operation.id);

          if (op && op.retries >= op.maxRetries) {
            Actions.offlineQueue.dequeue(operation.id);
            console.warn(`[API] ❌ Max retries exceeded for: ${operation.id}`);
          }
        }

        console.error(`[API] ❌ Sync failed for: ${operation.type}`, err.message);
      }
    }

    if (typeof Actions !== 'undefined') {
      Actions.offlineQueue.setSyncing(false);
      if (results.failed === 0) {
        Actions.autosave.setSaved();
      } else {
        Actions.autosave.setError();
      }
    }

    /* Refresh data after sync */
    if (results.synced > 0) {
      await Promise.allSettled([
        this.getTasks(),
        this.getNotes(),
        this.getReminders(),
        this.getStats(),
      ]);
    }

    Bus.emit('sync:complete', results);

    console.log(
      `[API] 🔄 Sync complete: ${results.synced} synced, ${results.failed} failed`
    );

    return { success: results.failed === 0, ...results };
  }

  /**
   * Full data refresh
   * تحديث شامل لجميع البيانات
   */
  async refreshAll() {
    if (typeof Actions !== 'undefined') {
      Actions.app.setLoading(true, 'جاري تحديث البيانات...');
    }

    try {
      const [stats, tasks, notes, reminders] = await Promise.allSettled([
        this.getStats(),
        this.getTasks(),
        this.getNotes(),
        this.getReminders(),
      ]);

      Bus.emit('data:refreshed', {
        stats:     stats.status     === 'fulfilled',
        tasks:     tasks.status     === 'fulfilled',
        notes:     notes.status     === 'fulfilled',
        reminders: reminders.status === 'fulfilled',
      });

      return { success: true };
    } finally {
      if (typeof Actions !== 'undefined') {
        Actions.app.setLoading(false);
      }
    }
  }

  /* ============================================================
     EXPORT API
  ============================================================ */

  /**
   * Export all data as JSON
   * تصدير جميع البيانات
   */
  async exportData() {
    const tasks     = typeof Selectors !== 'undefined' ? Selectors.getAllTasks()   : [];
    const notes     = typeof Selectors !== 'undefined' ? Selectors.getAllNotes()   : [];
    const reminders = typeof Selectors !== 'undefined' ? Selectors.getAllEvents()  : [];
    const stats     = typeof Selectors !== 'undefined' ? Selectors.getStats()     : {};

    const exportObj = {
      meta: {
        exportedAt:  new Date().toISOString(),
        version:     '2.0.0',
        app:         'المدير — Workspace',
        totalTasks:  tasks.length,
        totalNotes:  notes.length,
      },
      tasks,
      notes,
      reminders,
      stats,
    };

    const json     = JSON.stringify(exportObj, null, 2);
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const filename = `almudir-backup-${new Date().toISOString().slice(0, 10)}.json`;

    const link  = document.createElement('a');
    link.href   = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    Bus.emit('data:exported', { filename, size: blob.size });
    return { success: true, filename, size: blob.size };
  }

  /* ============================================================
     DATA NORMALIZATION HELPERS
  ============================================================ */

  #normalizeTask(raw) {
    return {
      id:          raw.id          ?? raw._id       ?? `task_${Date.now()}`,
      title:       raw.title       ?? raw.name      ?? '',
      description: raw.description ?? raw.desc      ?? '',
      status:      raw.status      ?? 'todo',
      priority:    raw.priority    ?? 'medium',
      tags:        raw.tags        ?? [],
      checklist:   (raw.checklist  ?? raw.subtasks ?? []).map(s => ({
        id:    s.id    ?? `sub_${Date.now()}_${Math.random()}`,
        text:  s.text  ?? s.title ?? '',
        done:  s.done  ?? s.completed ?? false,
      })),
      dueDate:     raw.due_date    ?? raw.dueDate   ?? null,
      estimate:    raw.estimate    ?? raw.estimated_time ?? null,
      color:       raw.color       ?? 'default',
      createdAt:   raw.created_at  ?? raw.createdAt ?? new Date().toISOString(),
      updatedAt:   raw.updated_at  ?? raw.updatedAt ?? new Date().toISOString(),
      completedAt: raw.completed_at ?? raw.completedAt ?? null,
    };
  }

  #serializeTask(task) {
    return {
      title:        task.title,
      description:  task.description,
      status:       task.status,
      priority:     task.priority,
      tags:         task.tags,
      checklist:    task.checklist,
      due_date:     task.dueDate,
      estimate:     task.estimate,
      color:        task.color,
    };
  }

  #normalizeNote(raw) {
    return {
      id:         raw.id         ?? raw._id      ?? `note_${Date.now()}`,
      title:      raw.title      ?? 'بدون عنوان',
      content:    raw.content    ?? raw.body     ?? '',
      folder:     raw.folder     ?? raw.category ?? 'general',
      tags:       raw.tags       ?? [],
      links:      raw.links      ?? [],
      wordCount:  raw.word_count ?? raw.wordCount ?? 0,
      charCount:  raw.char_count ?? raw.charCount ?? 0,
      readTime:   raw.read_time  ?? raw.readTime  ?? 0,
      createdAt:  raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
      updatedAt:  raw.updated_at ?? raw.updatedAt ?? new Date().toISOString(),
    };
  }

  #serializeNote(note) {
    return {
      title:      note.title,
      content:    note.content,
      folder:     note.folder,
      tags:       note.tags,
      word_count: note.wordCount,
      char_count: note.charCount,
    };
  }

  #normalizeReminder(raw) {
    return {
      id:         raw.id          ?? raw._id         ?? `rem_${Date.now()}`,
      title:      raw.title       ?? raw.name         ?? '',
      date:       raw.date        ?? raw.due_date
                ?? raw.scheduled_at ?? raw.datetime   ?? null,
      type:       raw.type        ?? 'reminder',
      notes:      raw.notes       ?? raw.description  ?? '',
      allDay:     raw.all_day     ?? raw.allDay        ?? false,
      dismissed:  raw.dismissed   ?? false,
      advance:    raw.advance     ?? 15,
      createdAt:  raw.created_at  ?? raw.createdAt    ?? new Date().toISOString(),
    };
  }

  #serializeReminder(reminder) {
    return {
      title:        reminder.title,
      date:         reminder.date,
      type:         reminder.type,
      notes:        reminder.notes,
      all_day:      reminder.allDay,
      advance:      reminder.advance,
    };
  }

  /* ----------------------------------------------------------
     REMINDER COLOR BY TYPE
  ---------------------------------------------------------- */
  #reminderColor(type) {
    const colors = {
      reminder: '#6c63ff',
      meeting:  '#48dbfb',
      deadline: '#ff6b6b',
      event:    '#55efc4',
    };
    return colors[type] ?? colors.reminder;
  }

  /* ----------------------------------------------------------
     TEXT-TO-SPEECH
  ---------------------------------------------------------- */
  #speak(text, lang = 'ar-EG') {
    if (!('speechSynthesis' in window)) return;

    /* Cancel ongoing speech */
    window.speechSynthesis.cancel();

    /* Strip markdown symbols for cleaner speech */
    const clean = text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/\n+/g, '. ')
      .trim();

    const utterance       = new SpeechSynthesisUtterance(clean);
    utterance.lang        = lang;
    utterance.rate        = State?.get('settings.ttsRate')  ?? 1.0;
    utterance.pitch       = State?.get('settings.ttsPitch') ?? 1.0;
    utterance.volume      = 0.9;

    /* Pick Arabic voice if available */
    const voices     = window.speechSynthesis.getVoices();
    const arabicVoice = voices.find(v =>
      v.lang.startsWith('ar') || v.name.includes('Arabic')
    );
    if (arabicVoice) utterance.voice = arabicVoice;

    window.speechSynthesis.speak(utterance);
  }

  /* ----------------------------------------------------------
     ERROR HANDLER
  ---------------------------------------------------------- */
  #handleError(context, error) {
    const isAPIError = error instanceof APIError;

    console.error(
      `%c[API Error] ${context}: ${error.message}`,
      'color:#ff6b6b;font-weight:600;',
      isAPIError ? error.toJSON() : error
    );

    /* Show toast for non-network errors (network handled by interceptor) */
    if (isAPIError && !error.isNetwork && !error.isAborted) {
      window.UI?.toast?.error?.(
        `خطأ: ${context}`,
        error.arabicMessage,
        { duration: 5000 }
      );
    }

    /* Emit error event */
    if (typeof Bus !== 'undefined') {
      Bus.emit('api:error', { context, error: isAPIError ? error.toJSON() : { message: error.message } });
    }
  }

  /* ----------------------------------------------------------
     GETTERS
  ---------------------------------------------------------- */
  get http()   { return this.#http; }
  get cache()  { return this.#http.cache; }
  get log()    { return this.#http.requestLog; }
}

/* ============================================================
   8. VOICE RECOGNITION SERVICE
   ============================================================ */
class VoiceService {
  #recognition = null;
  #isSupported = false;
  #isListening = false;
  #transcript  = '';
  #onResult    = null;
  #onError     = null;
  #onStart     = null;
  #onEnd       = null;

  constructor() {
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      this.#recognition  = new SpeechRecognition();
      this.#isSupported  = true;
      this.#configure();
    } else {
      console.warn('[Voice] Speech Recognition not supported in this browser.');
    }
  }

  #configure() {
    const r           = this.#recognition;
    r.lang            = State?.get('settings.ttsLang') ?? 'ar-EG';
    r.continuous      = false;
    r.interimResults  = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
      this.#isListening = true;
      this.#transcript  = '';
      if (typeof Actions !== 'undefined') Actions.chat.setRecording(true);
      this.#onStart?.();
      Bus.emit('voice:start');
    };

    r.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript   = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interimTranscript += t;
        }
      }

      this.#transcript = finalTranscript || interimTranscript;
      this.#onResult?.(this.#transcript, !!finalTranscript);
      Bus.emit('voice:transcript', {
        text:    this.#transcript,
        isFinal: !!finalTranscript,
      });
    };

    r.onerror = (event) => {
      console.error('[Voice] Error:', event.error);
      this.#onError?.(event.error);
      this.stop();

      const msgs = {
        'no-speech':        'لم يتم اكتشاف أي كلام. حاول مرة أخرى.',
        'audio-capture':    'لا يمكن الوصول إلى الميكروفون.',
        'not-allowed':      'لم يتم منح إذن الميكروفون.',
        'network':          'خطأ في الشبكة أثناء التعرف على الصوت.',
        'service-not-allowed': 'خدمة التعرف على الكلام غير متاحة.',
      };

      Bus.emit('voice:error', {
        code:    event.error,
        message: msgs[event.error] ?? `خطأ: ${event.error}`,
      });
    };

    r.onend = () => {
      this.#isListening = false;
      if (typeof Actions !== 'undefined') Actions.chat.setRecording(false);
      this.#onEnd?.(this.#transcript);
      Bus.emit('voice:end', { transcript: this.#transcript });
    };
  }

  start(callbacks = {}) {
    if (!this.#isSupported) {
      Bus.emit('voice:error', { message: 'التعرف على الصوت غير مدعوم في هذا المتصفح.' });
      return false;
    }
    if (this.#isListening) this.stop();

    this.#onResult = callbacks.onResult ?? null;
    this.#onError  = callbacks.onError  ?? null;
    this.#onStart  = callbacks.onStart  ?? null;
    this.#onEnd    = callbacks.onEnd    ?? null;

    try {
      this.#recognition.start();
      return true;
    } catch (err) {
      console.error('[Voice] Start failed:', err);
      return false;
    }
  }

  stop() {
    if (this.#recognition && this.#isListening) {
      this.#recognition.stop();
    }
    this.#isListening = false;
  }

  abort() {
    if (this.#recognition) {
      this.#recognition.abort();
    }
    this.#isListening = false;
  }

  get isSupported() { return this.#isSupported; }
  get isListening() { return this.#isListening; }
  get transcript()  { return this.#transcript; }
}

/* ============================================================
   9. NOTIFICATION SERVICE
   ============================================================ */
class NotificationService {
  #scheduledTimers = new Map();

  /* Check and fire due reminders */
  scheduleReminder(reminder) {
    const fireAt = new Date(reminder.date).getTime();
    const advance = (reminder.advance ?? 15) * 60 * 1000;
    const notifyAt = fireAt - advance;
    const delay    = notifyAt - Date.now();

    if (delay < 0) return; // already passed

    const timerId = setTimeout(() => {
      this.#fireNotification(reminder);
      this.#scheduledTimers.delete(reminder.id);

      if (typeof Actions !== 'undefined') {
        Actions.notifications.markFired(reminder.id);
      }
    }, delay);

    this.#scheduledTimers.set(reminder.id, timerId);
    console.log(
      `[Notifications] ⏰ Scheduled "${reminder.title}" in ${Math.round(delay / 1000 / 60)} min`
    );
  }

  #fireNotification(reminder) {
    const title = `⏰ ${reminder.title}`;
    const body  = reminder.notes
      ? reminder.notes.slice(0, 100)
      : `موعدك: ${new Date(reminder.date).toLocaleString('ar-SA')}`;

    /* Browser notification */
    Bus.emit('notification:show', { title, body });

    /* In-app toast */
    Bus.emit('toast:show', {
      type:    'info',
      title,
      message: body,
      duration: 10000,
    });

    /* Audio */
    const sound = document.getElementById('audioBreak');
    if (sound && State?.get('notifications.soundEnabled')) {
      sound.play().catch(() => {});
    }
  }

  cancelReminder(reminderId) {
    const timerId = this.#scheduledTimers.get(reminderId);
    if (timerId) {
      clearTimeout(timerId);
      this.#scheduledTimers.delete(reminderId);
    }
  }

  cancelAll() {
    for (const timerId of this.#scheduledTimers.values()) {
      clearTimeout(timerId);
    }
    this.#scheduledTimers.clear();
  }

  get scheduledCount() { return this.#scheduledTimers.size; }
}

/* ============================================================
   10. AUTOSAVE SERVICE
   ============================================================ */
class AutosaveService {
  #timers    = new Map();
  #delay;

  constructor(delay = 2000) {
    this.#delay = delay;
  }

  /* Debounced save trigger */
  trigger(key, saveFn, delay = this.#delay) {
    if (this.#timers.has(key)) {
      clearTimeout(this.#timers.get(key));
    }

    if (typeof Actions !== 'undefined') {
      Actions.autosave.setSaving();
    }

    const timer = setTimeout(async () => {
      try {
        await saveFn();
        if (typeof Actions !== 'undefined') {
          Actions.autosave.setSaved();
        }
      } catch (err) {
        console.error('[Autosave] Save failed:', err);
        if (typeof Actions !== 'undefined') {
          Actions.autosave.setError();
        }
      } finally {
        this.#timers.delete(key);
      }
    }, delay);

    this.#timers.set(key, timer);
  }

  /* Flush all pending saves immediately */
  async flushAll() {
    for (const [key, timer] of this.#timers) {
      clearTimeout(timer);
    }
    this.#timers.clear();
  }

  cancel(key) {
    if (this.#timers.has(key)) {
      clearTimeout(this.#timers.get(key));
      this.#timers.delete(key);
    }
  }

  get pendingCount() { return this.#timers.size; }
}

/* ============================================================
   11. INITIALIZE SERVICES
   ============================================================ */

/* HTTP Client */
const Http = new HttpClient({
  baseURL:       API_CONFIG.BASE_URL,
  timeout:       API_CONFIG.TIMEOUT,
  retryAttempts: API_CONFIG.RETRY_ATTEMPTS,
  retryDelay:    API_CONFIG.RETRY_DELAY,
});

/* API Service */
const API = new ApiService(Http);

/* Supporting Services */
const Voice        = new VoiceService();
const Notifications = new NotificationService();
const Autosave     = new AutosaveService(
  State?.get('settings.autosaveDelay') ?? 2000
);

/* ============================================================
   12. BUS EVENT BINDINGS
   ============================================================ */

/* Auto-sync when back online */
Bus.on('online:restored', async () => {
  console.log('[API] 🌐 Back online — starting sync...');

  window.UI?.toast?.success?.(
    'تم استعادة الاتصال',
    'جاري مزامنة البيانات المعلقة...',
    { duration: 3000 }
  );

  await API.syncOfflineQueue();
});

/* Toast from bus */
Bus.on('toast:show', ({ type, title, message, duration }) => {
  window.UI?.toast?.[type]?.(title, message, { duration });
});

/* Reminder scheduling on calendar update */
Bus.on('reminder:created', (reminder) => {
  Notifications.scheduleReminder(reminder);
});

/* Sync complete feedback */
Bus.on('sync:complete', ({ synced, failed }) => {
  if (synced > 0) {
    window.UI?.toast?.success?.(
      'تمت المزامنة',
      `تم مزامنة ${synced} عملية بنجاح.`,
      { duration: 3000 }
    );
  }
  if (failed > 0) {
    window.UI?.toast?.warning?.(
      'مزامنة جزئية',
      `فشل مزامنة ${failed} عملية.`,
      { duration: 5000 }
    );
  }
});

/* Voice transcript → Chat input */
Bus.on('voice:end', ({ transcript }) => {
  if (!transcript) return;
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = transcript;
    input.dispatchEvent(new Event('input'));
  }
});

/* ============================================================
   13. PERIODIC SYNC
   ============================================================ */
let syncIntervalId = null;

function startPeriodicSync() {
  if (syncIntervalId) clearInterval(syncIntervalId);

  const interval = State?.get('settings.syncInterval') ?? 30000;

  syncIntervalId = setInterval(async () => {
    if (!navigator.onLine) return;
    if (Actions.offlineQueue.hasItems()) {
      await API.syncOfflineQueue();
    }
    /* Refresh reminders to check for due notifications */
    const reminders = Selectors?.getUpcomingReminders() ?? [];
    for (const r of reminders) {
      if (!Notifications.scheduledCount) {
        Notifications.scheduleReminder(r);
      }
    }
  }, interval);

  console.log(`[API] ⏱️ Periodic sync started (every ${interval / 1000}s)`);
}

/* Start on init */
startPeriodicSync();

/* Restart if interval setting changes */
State?.subscribe('settings.syncInterval', (interval) => {
  startPeriodicSync();
});

/* ============================================================
   14. PAGE LIFECYCLE HANDLERS
   ============================================================ */

/* Save pending work on page unload */
window.addEventListener('beforeunload', async (e) => {
  const hasUnsaved   = State?.get('notes.unsavedChanges');
  const hasPending   = Actions?.offlineQueue.hasItems();
  const activeNote   = Selectors?.getActiveNote();

  /* Flush autosave */
  if (hasUnsaved && activeNote) {
    await Autosave.flushAll();
  }

  /* Warn user about pending offline operations */
  if (hasPending) {
    e.preventDefault();
    e.returnValue = 'لديك تغييرات غير متزامنة. هل تريد المغادرة؟';
  }
});

/* Visibility change — sync when tab becomes visible */
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && navigator.onLine) {
    if (Actions?.offlineQueue.hasItems()) {
      await API.syncOfflineQueue();
    }
    /* Refresh stats silently */
    Http.cache.invalidate('/stats');
    await API.getStats();
  }
});

/* ============================================================
   15. GLOBAL EXPORTS
   ============================================================ */
window.API           = API;
window.Http          = Http;
window.Voice         = Voice;
window.Notifications = Notifications;
window.Autosave      = Autosave;
window.APIError      = APIError;
window.API_CONFIG    = API_CONFIG;

/* Dev tools */
if (window.location.hostname === 'localhost') {
  window.__ALMUDIR_API__ = {
    cache:      () => Http.cache,
    log:        () => Http.requestLog,
    clearCache: () => Http.cache.clear(),
    health:     () => Http.healthCheck(),
    rateLimits: () => ({
      remaining: Http.rateLimiter.remaining,
      resetIn:   Http.rateLimiter.resetIn,
    }),
  };
}

console.log(
  '%c[المدير] 🌐 API Layer Ready — Base URL: ' + API_CONFIG.BASE_URL,
  'color:#48dbfb;font-weight:900;font-size:14px;'
);