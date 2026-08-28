const employeeSelect = document.getElementById('employee');
const addEmployeeModal = document.getElementById('addEmployeeModal');
const openAddEmployeeBtn = document.getElementById('openAddEmployeeBtn');
const cancelAddEmployeeBtn = document.getElementById('cancelAddEmployeeBtn');
const addEmployeeForm = document.getElementById('addEmployeeForm');
const addEmpFeedback = document.getElementById('addEmpFeedback');

let allEmployees = [];
let allTasks = [];

// Helper to parse dates correctly
function parseDeadlineDate(deadlineStr) {
    if (!deadlineStr) return null;
    
    // Check if ISO format (YYYY-MM-DD HH:MM:SS)
    if (deadlineStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        return new Date(deadlineStr.replace(' ', 'T'));
    }
    
    let cleaned = deadlineStr.replace(/at/i, '').replace(/ist/i, '').trim();
    return new Date(cleaned);
}

// Helper to check if task is overdue
function isTaskOverdue(task) {
    const isCompleted = (task.status || '').trim().toLowerCase() === 'completed';
    if (isCompleted) return false;

    const deadlineDate = parseDeadlineDate(task.deadline);
    if (!deadlineDate) return false;

    const now = new Date();
    return now.getTime() > deadlineDate.getTime();
}

// Load employees dynamically from backend
async function fetchEmployees(selectedName = '') {
    try {
        const response = await fetch('http://127.0.0.1:5001/employees');
        const data = await response.json();

        if (response.ok && data.success) {
            allEmployees = data.employees || [];
            employeeSelect.innerHTML = '<option value="">Search or select employee...</option>';

            allEmployees.forEach(emp => {
                const opt = document.createElement('option');
                opt.value = emp.name;
                opt.textContent = emp.name;
                if (selectedName && emp.name === selectedName) {
                    opt.selected = true;
                }
                employeeSelect.appendChild(opt);
            });

            // After loading employees, load tasks to hydrate dashboard
            await loadAllTasks();
        } else {
            employeeSelect.innerHTML = '<option value="">Error loading employees</option>';
        }
    } catch (e) {
        employeeSelect.innerHTML = '<option value="">Unable to connect to server</option>';
    }
}

// Load all tasks for all employees
async function loadAllTasks() {
    allTasks = [];
    
    // Call GET /tasks/<employee> for each employee to aggregate
    const fetchPromises = allEmployees.map(async (emp) => {
        try {
            const response = await fetch(`http://127.0.0.1:5001/tasks/${encodeURIComponent(emp.name)}`);
            const data = await response.json();
            if (response.ok && data.success) {
                return data.tasks || [];
            }
        } catch (e) {
            console.error(`Failed to fetch tasks for ${emp.name}`, e);
        }
        return [];
    });

    const results = await Promise.all(fetchPromises);
    results.forEach(tasksList => {
        allTasks.push(...tasksList);
    });

    hydrateDashboard();
}

// Hydrate KPIs, lists, and charts
function hydrateDashboard() {
    // 1. Calculate KPIs
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => (t.status || '').toLowerCase() === 'completed').length;
    const activeTasks = allTasks.filter(t => (t.status || '').toLowerCase() !== 'completed').length;
    
    const pastDueTasks = allTasks.filter(t => isTaskOverdue(t)).length;
    // Upcoming deadlines: active tasks that are NOT past due
    const upcomingDeadlines = allTasks.filter(t => {
        const isCompleted = (t.status || '').toLowerCase() === 'completed';
        return !isCompleted && !isTaskOverdue(t);
    }).length;

    // Update KPI UI
    document.getElementById('kpiTotalTasks').textContent = totalTasks;
    document.getElementById('kpiActiveTasks').textContent = activeTasks;
    document.getElementById('kpiUpcomingDeadlines').textContent = upcomingDeadlines;
    document.getElementById('kpiPastDueTasks').textContent = pastDueTasks;
    document.getElementById('kpiCompletedTasks').textContent = completedTasks;

    // 2. Hydrate Team Performance List
    const performanceContainer = document.getElementById('teamPerformanceContainer');
    performanceContainer.innerHTML = '';

    // Group tasks by employee
    const empStats = allEmployees.map(emp => {
        const empTasks = allTasks.filter(t => t.employee_name.toLowerCase() === emp.name.toLowerCase());
        const total = empTasks.length;
        const completed = empTasks.filter(t => (t.status || '').toLowerCase() === 'completed').length;
        const active = empTasks.filter(t => (t.status || '').toLowerCase() !== 'completed' && !isTaskOverdue(t)).length;
        const pastDue = empTasks.filter(t => isTaskOverdue(t)).length;
        const assigned = empTasks.filter(t => (t.status || '').toLowerCase() === 'assigned' && !isTaskOverdue(t)).length;
        
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { name: emp.name, total, completed, active, pastDue, assigned, rate };
    });

    const avPalette = ['av-teal','av-blue','av-amber','av-rose','av-violet','av-lime'];

    empStats.forEach(stat => {
        const initials = stat.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        
        // Pick avatar color from palette based on name hash
        const avColor = avPalette[Math.abs(stat.name.hashCode()) % avPalette.length];

        const rowHTML = `
            <div class="px-emp-row">
                <div class="px-emp-avatar ${avColor}">${initials}</div>
                <div class="px-emp-info">
                    <div class="px-emp-name">${stat.name}</div>
                    <div class="px-emp-chips">
                        <span class="px-chip px-chip-total">${stat.total} Total</span>
                        <span class="px-chip px-chip-done">✓ ${stat.completed} Done</span>
                        <span class="px-chip px-chip-active">◷ ${stat.active} Active</span>
                        ${stat.pastDue > 0 ? `<span class="px-chip px-chip-due">⚠ ${stat.pastDue} Past Due</span>` : ''}
                    </div>
                </div>
                <div class="px-emp-progress-wrap">
                    <div class="px-progress-bar">
                        <div class="px-progress-fill" data-width="${stat.rate}%" style="width:0%;"></div>
                    </div>
                    <span class="px-emp-pct">${stat.rate}%</span>
                </div>
            </div>
        `;
        performanceContainer.insertAdjacentHTML('beforeend', rowHTML);
    });

    // 3. Hydrate Bar Chart (Relative Task Performance)
    const barChartContainer = document.getElementById('barChartContainer');
    barChartContainer.innerHTML = '';

    const maxTasks = Math.max(...empStats.map(s => s.total), 5); // Fallback to at least 5 for height mapping
    
    empStats.forEach(stat => {
        const totalHeight = Math.max(Math.round((stat.total / maxTasks) * 100), 5); // Min 5% height to display bar
        const completedRatio = stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0;
        
        const barHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;flex:1;max-width:64px;min-width:36px;" title="${stat.name}: ${stat.total} tasks, ${stat.completed} completed">
                <div style="width:26px;background:#BFDBFE;border-radius:6px 6px 0 0;position:relative;height:${totalHeight}%;min-height:18px;transition:opacity 0.15s;" onmouseenter="this.style.opacity='.75'" onmouseleave="this.style.opacity='1'">
                    <div style="position:absolute;bottom:0;width:100%;background:#1F5F5B;border-radius:6px 6px 0 0;height:${completedRatio}%;"></div>
                </div>
                <span style="font-size:10px;color:#7A8C8B;font-family:'Poppins',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:56px;text-align:center;" title="${stat.name}">${stat.name.split(' ')[0]}</span>
            </div>
        `;
        barChartContainer.insertAdjacentHTML('beforeend', barHTML);
    });

    // 4. Hydrate Donut Chart
    const assignedTasks = allTasks.filter(t => (t.status || '').toLowerCase() === 'assigned' && !isTaskOverdue(t)).length;
    const progressTasks = allTasks.filter(t => (t.status || '').toLowerCase() === 'in progress' && !isTaskOverdue(t)).length;

    const donePercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const assignedPercent = totalTasks > 0 ? Math.round((assignedTasks / totalTasks) * 100) : 0;
    const progressPercent = totalTasks > 0 ? Math.round((progressTasks / totalTasks) * 100) : 0;
    const pastDuePercent = totalTasks > 0 ? Math.round((pastDueTasks / totalTasks) * 100) : 0;

    const donut = document.getElementById('donutChartGraphic');
    if (donut) {
        // Build conic gradient slices
        const slice1 = donePercent;
        const slice2 = slice1 + assignedPercent;
        const slice3 = slice2 + progressPercent;
        
        donut.style.background = `conic-gradient(from 0deg, #1f5e5b 0% ${slice1}%, #cbdde6 ${slice1}% ${slice2}%, #ebc162 ${slice2}% ${slice3}%, #ffdad6 ${slice3}% 100%)`;
    }
    
    document.getElementById('donutPercentText').textContent = `${donePercent}%`;
    document.getElementById('donutDoneLegend').textContent = completedTasks;
    document.getElementById('donutAssignedLegend').textContent = assignedTasks;
    document.getElementById('donutProgressLegend').textContent = progressTasks;
    document.getElementById('donutPastDueLegend').textContent = pastDueTasks;

    // 5. Hydrate Upcoming Deadlines Container
    const upcomingContainer = document.getElementById('upcomingDeadlinesContainer');
    upcomingContainer.innerHTML = '';

    const upcomingTasksList = allTasks
        .filter(t => (t.status || '').toLowerCase() !== 'completed' && !isTaskOverdue(t))
        .map(t => {
            const date = parseDeadlineDate(t.deadline);
            return { task: t, date };
        })
        .filter(x => x.date !== null)
        .sort((a, b) => a.date - b.date)
        .slice(0, 3);

    if (upcomingTasksList.length === 0) {
        upcomingContainer.innerHTML = `<div class="px-empty">No upcoming deadlines 🎉</div>`;
    } else {
        upcomingTasksList.forEach(item => {
            const diffMs = item.date - new Date();
            const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            let badgeText;
            let badgeCls = 'badge-upcoming';

            if (diffDays <= 0 && diffHrs >= 0) {
                const hrsLeft = Math.max(diffHrs, 0);
                badgeText = hrsLeft === 0 ? 'Due now' : `Due in ${hrsLeft}h`;
                badgeCls = 'badge-today';
            } else if (diffDays === 1) {
                badgeText = 'Due tomorrow';
                badgeCls = 'badge-tomorrow';
            } else {
                badgeText = `Due in ${diffDays} days`;
            }

            const deadlineDateStr = item.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            const deadlineTimeStr = item.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

            const upcomingHTML = `
                <div class="px-deadline-item">
                    <div class="px-deadline-icon-col">
                        <span class="material-symbols-outlined">calendar_month</span>
                    </div>
                    <div class="px-deadline-body">
                        <div class="px-deadline-title" title="${item.task.task}">${item.task.task}</div>
                        <div class="px-deadline-meta">${item.task.employee_name} &middot; ${deadlineDateStr}, ${deadlineTimeStr}</div>
                        <span class="px-deadline-badge ${badgeCls}">${badgeText}</span>
                    </div>
                </div>
            `;
            upcomingContainer.insertAdjacentHTML('beforeend', upcomingHTML);
        });
    }

    // 6. Hydrate Past Due Alert Card (Needs Attention)
    const pastDueContainer = document.getElementById('pastDueContainer');
    
    const overdueTasksList = allTasks
        .filter(t => isTaskOverdue(t))
        .map(t => {
            const date = parseDeadlineDate(t.deadline);
            return { task: t, date };
        })
        .filter(x => x.date !== null)
        .sort((a, b) => a.date - b.date); // Oldest first

    if (overdueTasksList.length === 0) {
        pastDueContainer.parentElement.style.display = 'none';
    } else {
        pastDueContainer.parentElement.style.display = '';
        // Show all overdue tasks as a premium stacked list
        let overdueHTML = '';
        overdueTasksList.forEach(item => {
            const diffMs = new Date() - item.date;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffHours / 24);
            const remHours = diffHours % 24;
            const overdueTimeStr = diffDays === 0 ? `${remHours} hours` : `${diffDays} days, ${remHours} hours`;
            const escapedTask = item.task.task.replace(/'/g, "\\'");
            const escapedEmp = item.task.employee_name.replace(/'/g, "\\'");

            overdueHTML += `
                <div class="px-overdue-item">
                    <div class="px-overdue-task" title="${item.task.task}">${item.task.task}</div>
                    <div class="px-overdue-assignee">Assigned to: ${item.task.employee_name}</div>
                    <span class="px-overdue-badge">⏱ Overdue by ${overdueTimeStr}</span>
                    <div>
                        <button onclick="sendReminder('${escapedEmp}', '${escapedTask}')" class="px-reminder-btn">
                            <span class="material-symbols-outlined" style="font-size:13px;">send</span>
                            Send Reminder
                        </button>
                    </div>
                </div>
            `;
        });
        pastDueContainer.innerHTML = overdueHTML;
    }
}

// Simple hash function to generate consistent colors based on strings
String.prototype.hashCode = function() {
    let hash = 0;
    for (let i = 0; i < this.length; i++) {
        const char = this.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return hash;
};

// Send email reminder
async function sendReminder(empName, taskDesc) {
    alert(`Reminder notification request triggered for ${empName} regarding: "${taskDesc}".`);
}

// Initial load of employees
document.addEventListener('DOMContentLoaded', function () {
    fetchEmployees();
});

// Modal open/close handlers
if (openAddEmployeeBtn) {
    openAddEmployeeBtn.addEventListener('click', function () {
        addEmpFeedback.textContent = '';
        addEmpFeedback.className = 'px-modal-feedback';
        addEmployeeForm.reset();
        addEmployeeModal.classList.remove('hidden');
    });
}

if (cancelAddEmployeeBtn) {
    cancelAddEmployeeBtn.addEventListener('click', function () {
        addEmployeeModal.classList.add('hidden');
    });
}

// Add employee submission
if (addEmployeeForm) {
    addEmployeeForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const name = document.getElementById('empName').value.trim();
        const email = document.getElementById('empEmail').value.trim();
        const department = document.getElementById('empDept').value.trim();

        addEmpFeedback.textContent = '';
        addEmpFeedback.className = 'px-modal-feedback';

        if (!name || !email || !department) {
            addEmpFeedback.textContent = 'Please enter the employee name, Gmail, and department.';
            addEmpFeedback.className = 'px-modal-feedback show error';
            return;
        }

        try {
            const response = await fetch('http://127.0.0.1:5001/add-employee', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    email: email,
                    department: department
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                addEmpFeedback.textContent = 'Employee added successfully.';
                addEmpFeedback.className = 'px-modal-feedback show success';

                // Refresh dropdown immediately and select the new employee
                await fetchEmployees(name);

                setTimeout(function () {
                    addEmployeeModal.classList.add('hidden');
                    addEmployeeForm.reset();
                    addEmpFeedback.className = 'px-modal-feedback';
                    addEmpFeedback.textContent = '';
                }, 1500);
            } else {
                addEmpFeedback.textContent = data.message || 'Failed to add employee.';
                addEmpFeedback.className = 'px-modal-feedback show error';
            }
        } catch (error) {
            addEmpFeedback.textContent = 'Unable to connect to the PHOENIX server. Please make sure the backend is running.';
            addEmpFeedback.className = 'px-modal-feedback show error';
        }
    });
}

// Existing Task Assignment Form Handler
document.getElementById('taskForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const employee = document.getElementById('employee').value.trim();
    const task = document.getElementById('task').value.trim();
    const deadlineDate = document.getElementById('deadline_date').value;
    const deadlineTime = document.getElementById('deadline_time').value;
    const feedbackMessage = document.getElementById('feedbackMessage');
    const submitBtn = document.querySelector('#taskForm button[type="submit"]');

    // Clear previous feedback
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'px-feedback';

    // Validate all fields
    if (!employee || !task || !deadlineDate || !deadlineTime) {
        feedbackMessage.textContent = 'Please fill in all fields.';
        feedbackMessage.className = 'px-feedback show error';
        return;
    }

    // Indicate in-progress state
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Assigning...';
    }

    // Determine logged-in manager name
    let managerName = 'Prapti Chavan';
    try {
        const stored = localStorage.getItem('phoenix_user');
        if (stored) {
            const user = JSON.parse(stored);
            if (user && user.name) {
                managerName = user.name;
            }
        }
    } catch (e) {
        console.error('Error reading manager from localStorage:', e);
    }

    try {
        const response = await fetch('http://127.0.0.1:5001/assign-task', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                employee_name: employee,
                task: task,
                deadline_date: deadlineDate,
                deadline_time: deadlineTime,
                assigned_by: managerName
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            feedbackMessage.textContent = `✓ Task assigned successfully! Email sent to ${employee}.`;
            feedbackMessage.className = 'px-feedback show success';

            // Refresh KPIs & List
            await loadAllTasks();

            // Reset form after delay
            setTimeout(function () {
                document.getElementById('taskForm').reset();
                feedbackMessage.className = 'px-feedback';
                feedbackMessage.textContent = '';
            }, 4000);
        } else {
            feedbackMessage.textContent = data.message || 'Failed to assign task.';
            feedbackMessage.className = 'px-feedback show error';
        }
    } catch (error) {
        feedbackMessage.textContent = 'Unable to connect to the PHOENIX server. Please make sure the backend is running.';
        feedbackMessage.className = 'px-feedback show error';
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Assign Task <span class="material-symbols-outlined" style="font-size:17px;">arrow_forward</span>';
        }
    }
});
