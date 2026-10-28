/**
 * PHOENIX Employee Management System — Centralized API & Runtime Configuration
 * ============================================================================
 * Provides a single source of truth for the backend API base URL and network
 * settings across all frontend interfaces (index.html, manager.html, employee.html).
 *
 * Auth Strategy (JWT — cross-origin safe):
 *   - On login the backend returns a JWT token in the JSON response body.
 *   - The token is stored in localStorage under 'phoenix_token'.
 *   - Every API call sends:  Authorization: Bearer <token>
 *   - This works on any deployment regardless of cross-origin cookie policies.
 *
 * Supports:
 *   1. Local development (defaults to http://127.0.0.1:5001)
 *   2. Separately hosted frontend & backend deployments (e.g. Render, Vercel)
 *   3. Dynamic overrides via:
 *        - window.__PHOENIX_API_URL__ (injected by runtime / server template)
 *        - <meta name="phoenix-api-base" content="https://api.yourdomain.com">
 *        - localStorage.getItem('phoenix_api_base_url') (for dev / QA testing)
 *        - Same-origin fallback when served behind a reverse proxy
 */

(function (global) {
    'use strict';

    // -----------------------------------------------------------------------
    // Token helpers
    // -----------------------------------------------------------------------
    var TOKEN_KEY = 'phoenix_token';

    function getToken() {
        try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }

    function setToken(token) {
        try { if (token) localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
    }

    function removeToken() {
        try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    }

    // -----------------------------------------------------------------------
    // Default URLs
    // -----------------------------------------------------------------------
    var DEFAULT_PROD_API_URL = 'https://employee-management-b.onrender.com';
    var DEFAULT_DEV_API_URL = 'http://127.0.0.1:5001';
    // .onrender.com covers both Render Static Sites and Web Services.
    // The meta tag is always the preferred override; this list is a safety net.
    var KNOWN_STATIC_HOSTS = ['.netlify.app', '.vercel.app', '.github.io', '.pages.dev', '.surge.sh', '.onrender.com'];

    // -----------------------------------------------------------------------
    // API base URL resolution
    // -----------------------------------------------------------------------
    function resolveApiBaseUrl() {
        // 1. Explicit global runtime variable override
        if (typeof global !== 'undefined' && global.__PHOENIX_API_URL__) {
            return String(global.__PHOENIX_API_URL__).trim().replace(/\/+$/, '');
        }

        // 2. HTML <meta name="phoenix-api-base" content="..."> tag
        if (typeof document !== 'undefined') {
            var metaTag = document.querySelector('meta[name="phoenix-api-base"]');
            if (metaTag && metaTag.content && metaTag.content.trim() &&
                metaTag.content.trim() !== 'REPLACE_WITH_YOUR_BACKEND_URL') {
                return metaTag.content.trim().replace(/\/+$/, '');
            }
        }

        // 3. LocalStorage override (useful for QA / dev environments)
        try {
            if (typeof localStorage !== 'undefined') {
                var stored = localStorage.getItem('phoenix_api_base_url');
                if (stored && stored.trim()) {
                    return stored.trim().replace(/\/+$/, '');
                }
            }
        } catch (e) {
            // LocalStorage might be disabled in private browsing; ignore cleanly
        }

        // 4. Local development detection
        if (typeof window !== 'undefined' && window.location) {
            var host = (window.location.hostname || '').toLowerCase();
            if (host === 'localhost' || host === '127.0.0.1') {
                if (global && global.__PHOENIX_DEV_API_URL__) {
                    return String(global.__PHOENIX_DEV_API_URL__).trim().replace(/\/+$/, '');
                }
                try {
                    var devStored = localStorage.getItem('phoenix_dev_api_url');
                    if (devStored && devStored.trim()) {
                        return devStored.trim().replace(/\/+$/, '');
                    }
                } catch (e) {}
                return DEFAULT_DEV_API_URL;
            }

            // 5. Static hosting guard:
            // When hosted on Netlify, Vercel, GitHub Pages, etc., the frontend MUST NEVER
            // send API requests to its own origin (which only hosts static files and returns 404).
            var isStaticHost = KNOWN_STATIC_HOSTS.some(function (suffix) {
                return host.endsWith(suffix);
            });
            if (isStaticHost) {
                return DEFAULT_PROD_API_URL;
            }

            // 6. Reverse-proxy / same-origin deployment fallback
            return window.location.origin.replace(/\/+$/, '');
        }

        return DEFAULT_PROD_API_URL;
    }

    var API_BASE_URL = resolveApiBaseUrl();

    // -----------------------------------------------------------------------
    // PHOENIX_CONFIG
    // -----------------------------------------------------------------------
    var PHOENIX_CONFIG = {
        API_BASE_URL: API_BASE_URL,
        DEFAULT_PROD_API_URL: DEFAULT_PROD_API_URL,
        DEFAULT_DEV_API_URL: DEFAULT_DEV_API_URL,

        /**
         * Resolves a relative endpoint path against the configured API_BASE_URL.
         * Guarantees clean joining without missing or duplicated slashes.
         * @param {string} endpoint - The path to append, e.g. '/login' or 'tasks/123'
         * @returns {string} - The full URL
         */
        apiUrl: function (endpoint) {
            if (!endpoint) return this.API_BASE_URL;
            var cleanEndpoint = '/' + String(endpoint).replace(/^\/+/, '');
            return this.API_BASE_URL.replace(/\/+$/, '') + cleanEndpoint;
        },

        /**
         * Returns standard fetch options with JWT Authorization header.
         * Uses Bearer token from localStorage — works across all origins without cookies.
         * @param {object} [customOptions] - Optional fetch overrides
         * @returns {object} - Merged fetch options
         */
        defaultFetchOptions: function (customOptions) {
            var opts = customOptions || {};
            var token = getToken();
            var headers = Object.assign(
                { 'Content-Type': 'application/json' },
                token ? { 'Authorization': 'Bearer ' + token } : {},
                opts.headers || {}
            );
            return Object.assign({}, opts, {
                credentials: 'include',   // kept for same-origin / local dev fallback
                headers: headers
            });
        },

        /**
         * Validates the active session via GET /auth/me using JWT Bearer auth.
         * Enforces role requirements and safely redirects unauthenticated users to index.html.
         *
         * @param {string|string[]} [requiredRoles] - Allowed role(s), e.g. 'project_manager'
         * @returns {Promise<object|null>} - Authenticated user info on success, null on redirect/failure.
         */
        checkAuth: async function (requiredRoles) {
            var token = getToken();
            if (!token) {
                // No token stored — redirect to login immediately
                var path = (window.location && window.location.pathname) || '';
                if (!path.endsWith('index.html') && path !== '/' && path !== '') {
                    window.location.replace('index.html');
                }
                return null;
            }

            try {
                var response = await fetch(this.apiUrl('/auth/me'), {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    }
                });

                if (response.status === 401) {
                    removeToken();
                    try { localStorage.removeItem('phoenix_user'); } catch (e) {}
                    var path2 = (window.location && window.location.pathname) || '';
                    if (!path2.endsWith('index.html') && path2 !== '/' && path2 !== '') {
                        window.location.replace('index.html');
                    }
                    return null;
                }

                var data = await response.json();
                if (response.ok && data.success && data.user) {
                    var user = data.user;
                    try { localStorage.setItem('phoenix_user', JSON.stringify(user)); } catch (e) {}

                    if (requiredRoles) {
                        var allowed = Array.isArray(requiredRoles)
                            ? requiredRoles.map(function (r) { return r.toLowerCase(); })
                            : [String(requiredRoles).toLowerCase()];
                        var role = (user.role || '').toLowerCase();

                        if (!allowed.includes(role) && role !== 'administrator') {
                            if (role === 'project_manager') {
                                window.location.replace('manager.html');
                            } else {
                                window.location.replace('employee.html');
                            }
                            return null;
                        }
                    }
                    return user;
                } else {
                    removeToken();
                    try { localStorage.removeItem('phoenix_user'); } catch (e) {}
                    var path3 = (window.location && window.location.pathname) || '';
                    if (!path3.endsWith('index.html') && path3 !== '/' && path3 !== '') {
                        window.location.replace('index.html');
                    }
                    return null;
                }
            } catch (err) {
                console.error('Session validation network error:', err);
                // Network error — don't redirect (could be a transient issue)
                return null;
            }
        },

        // Token management helpers exposed for use by login/logout flows
        setToken: setToken,
        getToken: getToken,
        removeToken: removeToken,

        /**
         * Standardized UI error presentation helper for API and network failures.
         * @param {Error|object|string} error - The caught error or failure response
         * @param {string} [contextMessage] - Optional action description
         * @returns {string} - User-friendly message safe to render
         */
        formatErrorMessage: function (error, contextMessage) {
            if (!error) return contextMessage || 'An unexpected error occurred. Please try again.';
            if (typeof error === 'string') return error;
            if (error.message && error.message.includes('Failed to fetch')) {
                return 'Unable to connect to the PHOENIX server. Please verify your internet connection or backend status.';
            }
            return error.message || contextMessage || 'An unexpected error occurred. Please try again.';
        }
    };

    // Expose globally
    global.PHOENIX_CONFIG = PHOENIX_CONFIG;

    // Convenience alias for scripts referencing API_BASE_URL directly
    if (typeof global.API_BASE_URL === 'undefined') {
        global.API_BASE_URL = API_BASE_URL;
    }

    // -----------------------------------------------------------------------
    // Global fetch interceptor — auto-attaches JWT to every backend API call.
    // Handles both plain object headers and standard Headers instances.
    // This ensures manager.js, employee.js, and inline scripts send the Bearer
    // token automatically without requiring manual header injection at each call.
    // -----------------------------------------------------------------------
    if (typeof global.fetch === 'function') {
        var _originalFetch = global.fetch.bind(global);
        global.fetch = function (resource, options) {
            var url = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
            // Only inject header for requests going to our backend API
            if (url && (url.startsWith(API_BASE_URL) || url.startsWith('/'))) {
                var token = getToken();
                if (token) {
                    options = options || {};
                    if (typeof Headers !== 'undefined' && options.headers instanceof Headers) {
                        if (!options.headers.has('Authorization')) {
                            options.headers.set('Authorization', 'Bearer ' + token);
                        }
                    } else {
                        var existingHeaders = options.headers || {};
                        if (!existingHeaders['Authorization'] && !existingHeaders['authorization']) {
                            options.headers = Object.assign({}, existingHeaders, {
                                'Authorization': 'Bearer ' + token
                            });
                        }
                    }
                }
            }
            return _originalFetch(resource, options);
        };
    }

})(typeof window !== 'undefined' ? window : this);
