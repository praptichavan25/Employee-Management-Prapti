// Centralized API URL resolution (falls back to PHOENIX_CONFIG)
function getApiUrl(endpoint) {
    if (window.PHOENIX_CONFIG && typeof window.PHOENIX_CONFIG.apiUrl === 'function') {
        return window.PHOENIX_CONFIG.apiUrl(endpoint);
    }
    const clean = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    const base = (window.API_BASE_URL || (window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://127.0.0.1:5001' : window.location.origin));
    return base + clean;
}

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    const submitBtn = document.querySelector('.btn-sign-in') || document.querySelector('.btn');

    // Clear previous error message
    errorMessage.textContent = '';
    errorMessage.classList.remove('show');

    if (!email) {
        errorMessage.textContent = 'Please enter your work email.';
        errorMessage.classList.add('show');
        return;
    }

    if (!password) {
        errorMessage.textContent = 'Please enter your password.';
        errorMessage.classList.add('show');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';
    }

    try {
        const response = await fetch(getApiUrl('/login'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ email: email, password: password })
        });

        const data = await response.json();

        if (response.ok && data.success && data.user) {
            // Save JWT token for cross-origin Bearer auth (primary auth method)
            if (data.token && window.PHOENIX_CONFIG && window.PHOENIX_CONFIG.setToken) {
                window.PHOENIX_CONFIG.setToken(data.token);
            }

            // Save user info to localStorage
            localStorage.setItem('phoenix_user', JSON.stringify({
                name: data.user.name,
                email: data.user.email,
                role: data.user.role,
                department: data.user.department || 'Engineering'
            }));

            // Redirect based on role
            if (data.user.role === 'project_manager') {
                window.location.href = 'manager.html';
            } else if (data.user.role === 'employee') {
                window.location.href = 'employee.html';
            } else if (data.user.role === 'administrator') {
                window.location.href = 'manager.html';
            } else {
                errorMessage.textContent = 'Invalid PHOENIX email address.';
                errorMessage.classList.add('show');
            }
        } else {
            errorMessage.textContent = data.message || 'Invalid PHOENIX email address.';
            errorMessage.classList.add('show');
        }
    } catch (error) {
        errorMessage.textContent = 'Unable to connect to the PHOENIX server. Please make sure the backend is running.';
        errorMessage.classList.add('show');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
        }
    }
});
