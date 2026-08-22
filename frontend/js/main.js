document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
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

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';
    }

    try {
        const response = await fetch('http://127.0.0.1:5001/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email })
        });

        const data = await response.json();

        if (response.ok && data.success && data.user) {
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
