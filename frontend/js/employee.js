const employeeGreeting = document.getElementById('employeeGreeting');
const tasksContainer = document.getElementById('tasksContainer');

async function loadTasks(employeeName) {
    if (employeeGreeting) {
        employeeGreeting.textContent = `Hello, ${employeeName}`;
    }
    tasksContainer.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Loading tasks...</div>';

    try {
        const response = await fetch(`http://127.0.0.1:5001/tasks/${encodeURIComponent(employeeName)}`);
        const data = await response.json();

        if (response.ok && data.success) {
            const tasks = data.tasks || [];

            if (tasks.length === 0) {
                tasksContainer.innerHTML = `
                    <div class="employee-card" style="text-align: center; color: #666; padding: 30px;">
                        <p>No tasks assigned yet.</p>
                    </div>
                `;
                return;
            }

            let html = '';
            tasks.forEach(task => {
                html += `
                    <div class="employee-card" style="margin-bottom: 20px;">
                        <h2 class="employee-card-title">Assigned Tasks</h2>
                        <div class="employee-task-info">
                            <div class="employee-task-item">
                                <span class="employee-label">Task:</span>
                                <p class="employee-value">${escapeHtml(task.task)}</p>
                            </div>
                            <div class="employee-task-item">
                                <span class="employee-label">Assigned By:</span>
                                <p class="employee-value">${escapeHtml(task.assigned_by || 'Prapti Chavan')}</p>
                            </div>
                            <div class="employee-task-item">
                                <span class="employee-label">Deadline:</span>
                                <p class="employee-value">${escapeHtml(task.deadline)}</p>
                            </div>
                            <div class="employee-task-item">
                                <span class="employee-label">Status:</span>
                                <p class="employee-status">● ${escapeHtml(task.status)}</p>
                            </div>
                        </div>
                    </div>
                `;
            });
            tasksContainer.innerHTML = html;
        } else {
            tasksContainer.innerHTML = `
                <div class="employee-card" style="text-align: center; color: #c41e3a; padding: 20px;">
                    <p>${escapeHtml(data.message || 'Unable to load tasks.')}</p>
                </div>
            `;
        }
    } catch (error) {
        tasksContainer.innerHTML = `
            <div class="employee-card" style="text-align: center; color: #c41e3a; padding: 20px;">
                <p>Unable to load tasks. Please make sure the PHOENIX server is running.</p>
            </div>
        `;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initial load on page ready: read logged in user from localStorage
document.addEventListener('DOMContentLoaded', function() {
    let employeeName = 'Sanjana Chavan';
    try {
        const stored = localStorage.getItem('phoenix_user');
        if (stored) {
            const user = JSON.parse(stored);
            if (user && user.name) {
                employeeName = user.name;
            }
        }
    } catch (e) {
        console.error('Error reading logged in user:', e);
    }
    loadTasks(employeeName);
});
