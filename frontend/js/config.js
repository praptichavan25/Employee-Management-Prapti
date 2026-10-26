/**
 * PHOENIX Employee Management System — Centralized API & Runtime Configuration
 * ============================================================================
 * Provides a single source of truth for the backend API base URL and network
 * settings across all frontend interfaces (index.html, manager.html, employee.html).
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

    function resolveApiBaseUrl() {
        // 1. Explicit global variable override
        if (typeof global !== 'undefined' && global.__PHOENIX_API_URL__) {
            return String(global.__PHOENIX_API_URL__).trim().replace(/\/+$/, '');
        }

        // 2. HTML <meta name="phoenix-api-base" content="..."> tag
        if (typeof document !== 'undefined') {
            const metaTag = document.querySelector('meta[name="phoenix-api-base"]');
            if (metaTag && metaTag.content && metaTag.content.trim()) {
                return metaTag.content.trim().replace(/\/+$/, '');
            }
        }

        // 3. LocalStorage override (useful for QA / dev environments)
        try {
            if (typeof localStorage !== 'undefined') {
                const stored = localStorage.getItem('phoenix_api_base_url');
                if (stored && stored.trim()) {
                    return stored.trim().replace(/\/+$/, '');
                }
            }
        } catch (e) {
            // LocalStorage might be disabled in private browsing; ignore cleanly
        }

        // 4. Local development detection
        if (typeof window !== 'undefined' && window.location) {
            const host = window.location.hostname;
            if (host === 'localhost' || host === '127.0.0.1') {
                return 'http://127.0.0.1:5001';
            }
            // 5. Production same-origin or reverse-proxy fallback
            return window.location.origin;
        }

        return 'http://127.0.0.1:5001';
    }

    const API_BASE_URL = resolveApiBaseUrl();

    const PHOENIX_CONFIG = {
        API_BASE_URL: API_BASE_URL,

        /**
         * Resolves a relative endpoint path against the configured API_BASE_URL.
         * @param {string} endpoint - The path to append, e.g. '/login' or 'tasks/123'
         * @returns {string} - The full URL
         */
        apiUrl: function (endpoint) {
            if (!endpoint) return this.API_BASE_URL;
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
            return this.API_BASE_URL + cleanEndpoint;
        },

        /**
         * Returns standard fetch options configured with credentials: 'include'.
         * @param {object} [customOptions] - Optional fetch overrides
         * @returns {object} - Merged fetch options
         */
        defaultFetchOptions: function (customOptions) {
            const opts = customOptions || {};
            const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
            return Object.assign({}, opts, {
                credentials: 'include',
                headers: headers
            });
        },

        /**
         * Validates the active server session via GET /auth/me.
         * Enforces role requirements and safely redirects unauthenticated users to index.html.
         * Avoids redirect loops and does not trust localStorage for authorization.
         *
         * @param {string|string[]} [requiredRoles] - Allowed role(s), e.g. 'project_manager'
         * @returns {Promise<object|null>} - Authenticated user info on success, null on redirect/failure.
         */
        checkAuth: async function (requiredRoles) {
            try {
                const response = await fetch(this.apiUrl('/auth/me'), {
                    method: 'GET',
                    credentials: 'include'
                });

                if (response.status === 401) {
                    try { localStorage.removeItem('phoenix_user'); } catch (e) {}
                    const path = (window.location && window.location.pathname) || '';
                    if (!path.endsWith('index.html') && path !== '/' && path !== '') {
                        window.location.replace('index.html');
                    }
                    return null;
                }

                const data = await response.json();
                if (response.ok && data.success && data.user) {
                    const user = data.user;
                    try {
                        localStorage.setItem('phoenix_user', JSON.stringify(user));
                    } catch (e) {}

                    if (requiredRoles) {
                        const allowed = Array.isArray(requiredRoles)
                            ? requiredRoles.map(function (r) { return r.toLowerCase(); })
                            : [String(requiredRoles).toLowerCase()];
                        const role = (user.role || '').toLowerCase();

                        // Administrators have broad operational oversight
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
                    try { localStorage.removeItem('phoenix_user'); } catch (e) {}
                    const path = (window.location && window.location.pathname) || '';
                    if (!path.endsWith('index.html') && path !== '/' && path !== '') {
                        window.location.replace('index.html');
                    }
                    return null;
                }
            } catch (err) {
                console.error('Session validation network error:', err);
                return null;
            }
        }
    };

    // Expose globally
    global.PHOENIX_CONFIG = PHOENIX_CONFIG;

    // Convenience alias for scripts referencing API_BASE_URL directly
    if (typeof global.API_BASE_URL === 'undefined') {
        global.API_BASE_URL = API_BASE_URL;
    }
})(typeof window !== 'undefined' ? window : this);
