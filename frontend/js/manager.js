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

    // Sort by completion rate descending for leaderboard
    empStats.sort((a, b) => b.rate - a.rate);

    const top5 = empStats.slice(0, 5);
    const avPalette = ['av-teal','av-blue','av-amber','av-rose','av-violet','av-lime'];

    function renderEmpRow(stat, index, showBadge) {
        const initials = stat.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const avColor = avPalette[Math.abs(stat.name.hashCode()) % avPalette.length];
        const starBadge = (showBadge && index === 0 && stat.rate > 0) ? `<span class="px-best-badge">⭐</span>` : '';

        return `
            <div class="px-emp-row">
                <div class="px-emp-avatar-wrap">
                    <div class="px-emp-avatar ${avColor}">${initials}</div>
                    ${starBadge}
                </div>
                <div class="px-emp-info">
                    <div class="px-emp-name">${stat.name}</div>
                    <div class="px-emp-summary">
                        <span>${stat.total} Tasks</span> · <span>${stat.completed} Done</span> · <span>${stat.active} Active</span>${stat.pastDue > 0 ? ` · <span style="color:var(--phoenix-coral)">${stat.pastDue} Past Due</span>` : ''}
                    </div>
                </div>
                <div class="px-emp-progress-wrap">
                    <div class="px-progress-bar">
                        <div class="px-progress-fill" data-width="${stat.rate}%" style="width:0%;"></div>
                    </div>
                    <span class="px-emp-rate">${stat.rate}%</span>
                </div>
            </div>
        `;
    }

    // Render top 5 on dashboard
    top5.forEach((stat, idx) => {
        performanceContainer.insertAdjacentHTML('beforeend', renderEmpRow(stat, idx, true));
    });

    // Populate the full team modal
    const allTeamModalContainer = document.getElementById('allTeamModalContainer');
    if (allTeamModalContainer) {
        allTeamModalContainer.innerHTML = '';
        empStats.forEach((stat, idx) => {
            allTeamModalContainer.insertAdjacentHTML('beforeend', renderEmpRow(stat, idx, true));
        });
    }

    // 3. Hydrate Bar Chart (Relative Task Performance)
    const barChartContainer = document.getElementById('barChartContainer');
    barChartContainer.innerHTML = '';

    const maxTasks = Math.max(...empStats.map(s => s.total), 5); // Fallback to at least 5 for height mapping
    
    empStats.forEach(stat => {
        const totalHeight = Math.max(Math.round((stat.total / maxTasks) * 100), 5); // Min 5% height to display bar
        const completedRatio = stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0;
        
        const barHTML = `
            <div class="px-bar-column" title="${stat.name}: ${stat.total} tasks, ${stat.completed} completed">
                <div class="px-bar-outer" style="height:${totalHeight}%;">
                    <div class="px-bar-inner" style="height:${completedRatio}%;"></div>
                </div>
                <span class="px-bar-label" title="${stat.name}">${stat.name.split(' ')[0]}</span>
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
        
        donut.style.background = `conic-gradient(from 0deg, #3E9B7A 0% ${slice1}%, #5B6EE1 ${slice1}% ${slice2}%, #E6A23C ${slice2}% ${slice3}%, #E57373 ${slice3}% 100%)`;
    }
    
    document.getElementById('donutPercentText').textContent = `${donePercent}%`;
    document.getElementById('donutDoneLegend').textContent = completedTasks;
    document.getElementById('donutAssignedLegend').textContent = assignedTasks;
    document.getElementById('donutProgressLegend').textContent = progressTasks;
    document.getElementById('donutPastDueLegend').textContent = pastDueTasks;

    // 5. Hydrate Upcoming Deadlines Container (Timeline View)
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
        .slice(0, 5);

    // Store for calendar use
    window._allUpcomingTasks = allTasks
        .filter(t => (t.status || '').toLowerCase() !== 'completed')
        .map(t => ({ task: t, date: parseDeadlineDate(t.deadline) }))
        .filter(x => x.date !== null);

    if (upcomingTasksList.length === 0) {
        upcomingContainer.innerHTML = `<div class="px-empty">No upcoming deadlines 🎉</div>`;
    } else {
        const now = new Date();
        const todayStr = now.toDateString();
        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toDateString();

        let lastGroupLabel = '';

        upcomingTasksList.forEach(item => {
            const itemDateStr = item.date.toDateString();

            // Determine group label
            let groupLabel;
            if (itemDateStr === todayStr) {
                groupLabel = 'TODAY';
            } else if (itemDateStr === tomorrowStr) {
                groupLabel = 'TOMORROW';
            } else {
                groupLabel = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
            }

            // Insert group header if new group
            if (groupLabel !== lastGroupLabel) {
                upcomingContainer.insertAdjacentHTML('beforeend', `<div class="px-timeline-group-label">${groupLabel}</div>`);
                lastGroupLabel = groupLabel;
            }

            // Determine urgency dot class and countdown
            const diffMs = item.date - now;
            const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            let dotClass, countdownClass, countdownText;

            if (diffHrs < 2) {
                dotClass = 'node-red';
                countdownClass = 'urgent';
                countdownText = diffHrs <= 0 ? `⏱ Due in ${Math.max(diffMins, 0)}m` : `⏱ Due in ${diffHrs}h ${diffMins}m`;
            } else if (itemDateStr === todayStr) {
                dotClass = 'node-amber';
                countdownClass = 'today';
                countdownText = `⏱ Due in ${diffHrs}h ${diffMins}m`;
            } else if (itemDateStr === tomorrowStr) {
                dotClass = 'node-indigo';
                countdownClass = 'soon';
                countdownText = `⏱ Due tomorrow`;
            } else {
                dotClass = 'node-teal';
                countdownClass = 'future';
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                countdownText = `⏱ Due in ${diffDays} days`;
            }

            const deadlineTimeStr = item.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

            const timelineHTML = `
                <div class="px-timeline-item">
                    <div class="px-timeline-dot ${dotClass}"></div>
                    <div class="px-timeline-body">
                        <div class="px-timeline-time">${deadlineTimeStr}</div>
                        <div class="px-timeline-task-name" title="${item.task.task}">${item.task.task}</div>
                        <div class="px-timeline-assignee">${item.task.employee_name}</div>
                        <div class="px-timeline-countdown ${countdownClass}">${countdownText}</div>
                    </div>
                </div>
            `;
            upcomingContainer.insertAdjacentHTML('beforeend', timelineHTML);
        });
    }

    // 6. Hydrate Needs Attention (Priority Alert Feed)
    const pastDueContainer = document.getElementById('pastDueContainer');
    const attentionCountBadge = document.getElementById('attentionCount');
    
    // Build combined alert list: overdue tasks + tasks approaching deadline (< 12h)
    const now2 = new Date();
    const alertItems = [];

    allTasks.forEach(t => {
        if ((t.status || '').toLowerCase() === 'completed') return;
        const date = parseDeadlineDate(t.deadline);
        if (!date) return;

        const diffMs = date - now2;
        const diffHrs = diffMs / (1000 * 60 * 60);
        const overdueMs = now2 - date;
        const overdueHrs = overdueMs / (1000 * 60 * 60);
        const overdueDays = Math.floor(overdueHrs / 24);

        if (isTaskOverdue(t)) {
            // Past due task
            let urgency, urgencyDot, overdueText;
            if (overdueHrs > 24) {
                urgency = 'urgency-red';
                urgencyDot = '🔴';
            } else {
                urgency = 'urgency-orange';
                urgencyDot = '🟠';
            }
            const remHours = Math.floor(overdueHrs) % 24;
            overdueText = overdueDays === 0 ? `Overdue by ${Math.floor(overdueHrs)} hours` : `Overdue by ${overdueDays} days`;

            alertItems.push({
                task: t,
                date: date,
                urgency: urgency,
                urgencyDot: urgencyDot,
                metaText: `${t.employee_name} · ${overdueText}`,
                sortKey: -overdueMs, // Most overdue first (largest negative)
                category: 'past_due',
                priority: (t.priority || '').toLowerCase()
            });
        } else if (diffHrs > 0 && diffHrs <= 12) {
            // Approaching deadline
            const hrsLeft = Math.floor(diffHrs);
            const minsLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            alertItems.push({
                task: t,
                date: date,
                urgency: 'urgency-yellow',
                urgencyDot: '🟡',
                metaText: `${t.employee_name} · Due in ${hrsLeft}h ${minsLeft}m`,
                sortKey: diffMs, // Soonest first
                category: 'due_today',
                priority: (t.priority || '').toLowerCase()
            });
        }
    });

    // Sort: red first, then orange, then yellow, and within each by severity
    alertItems.sort((a, b) => {
        const urgencyOrder = { 'urgency-red': 0, 'urgency-orange': 1, 'urgency-yellow': 2 };
        const diff = (urgencyOrder[a.urgency] || 0) - (urgencyOrder[b.urgency] || 0);
        if (diff !== 0) return diff;
        return a.sortKey - b.sortKey;
    });

    // Store globally for filtering
    window._allAlertItems = alertItems;

    // Update badge count
    if (attentionCountBadge) {
        attentionCountBadge.textContent = alertItems.length;
    }

    // Render alert items helper
    function renderAlertItem(item) {
        const escapedTask = item.task.task.replace(/'/g, "\\'");
        const escapedEmp = item.task.employee_name.replace(/'/g, "\\'");
        return `
            <div class="px-alert-item ${item.urgency}" data-category="${item.category}" data-priority="${item.priority}">
                <span class="px-alert-dot">${item.urgencyDot}</span>
                <div class="px-alert-body">
                    <div class="px-alert-task-name" title="${item.task.task}">${item.task.task}</div>
                    <div class="px-alert-meta">${item.metaText}</div>
                </div>
                <div class="px-alert-actions">
                    <button onclick="sendReminder('${escapedEmp}', '${escapedTask}')" class="px-btn-remind">
                        <span class="material-symbols-outlined">send</span>
                        Send Reminder
                    </button>
                </div>
            </div>
        `;
    }

    // Show/hide attention card
    const attentionCard = document.getElementById('attentionCard');
    const viewAllAttentionContainer = document.getElementById('viewAllAttentionContainer');

    if (alertItems.length === 0) {
        if (attentionCard) attentionCard.style.display = 'none';
    } else {
        if (attentionCard) attentionCard.style.display = '';
        // Dashboard: show top 4
        const dashboardItems = alertItems.slice(0, 4);
        pastDueContainer.innerHTML = dashboardItems.map(renderAlertItem).join('');

        // Show/hide View All button
        if (viewAllAttentionContainer) {
            viewAllAttentionContainer.style.display = alertItems.length > 4 ? '' : 'none';
        }

        // Populate full attention modal
        const allAttentionModalContainer = document.getElementById('allAttentionModalContainer');
        if (allAttentionModalContainer) {
            allAttentionModalContainer.innerHTML = alertItems.map(renderAlertItem).join('');
        }
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

// ============================================================
// FILTER TABS — Needs Attention
// ============================================================
document.querySelectorAll('.px-filter-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        // Toggle active class
        document.querySelectorAll('.px-filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        const filter = this.getAttribute('data-filter');
        const items = window._allAlertItems || [];
        let filtered;

        if (filter === 'all') {
            filtered = items;
        } else if (filter === 'past_due') {
            filtered = items.filter(i => i.category === 'past_due');
        } else if (filter === 'due_today') {
            filtered = items.filter(i => i.category === 'due_today');
        } else if (filter === 'high') {
            filtered = items.filter(i => i.priority === 'high');
        } else {
            filtered = items;
        }

        const container = document.getElementById('pastDueContainer');
        if (filtered.length === 0) {
            container.innerHTML = '<div class="px-empty">No tasks match this filter.</div>';
        } else {
            const display = filtered.slice(0, 4);
            container.innerHTML = display.map(item => {
                const escapedTask = item.task.task.replace(/'/g, "\\'");
                const escapedEmp = item.task.employee_name.replace(/'/g, "\\'");
                return `
                    <div class="px-alert-item ${item.urgency}" data-category="${item.category}" data-priority="${item.priority}">
                        <span class="px-alert-dot">${item.urgencyDot}</span>
                        <div class="px-alert-body">
                            <div class="px-alert-task-name" title="${item.task.task}">${item.task.task}</div>
                            <div class="px-alert-meta">${item.metaText}</div>
                        </div>
                        <div class="px-alert-actions">
                            <button onclick="sendReminder('${escapedEmp}', '${escapedTask}')" class="px-btn-remind">
                                <span class="material-symbols-outlined">send</span>
                                Send Reminder
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Update View All button visibility
        const viewAllBtn = document.getElementById('viewAllAttentionContainer');
        if (viewAllBtn) {
            viewAllBtn.style.display = filtered.length > 4 ? '' : 'none';
        }
    });
});

// ============================================================
// MODAL OPEN/CLOSE HANDLERS
// ============================================================
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('hidden');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
}

// View All Team
document.getElementById('openAllTeamBtn')?.addEventListener('click', () => openModal('allTeamModal'));
document.getElementById('closeAllTeamBtn')?.addEventListener('click', () => closeModal('allTeamModal'));

// View All Attention
document.getElementById('openAllAttentionBtn')?.addEventListener('click', () => openModal('allAttentionModal'));
document.getElementById('closeAllAttentionBtn')?.addEventListener('click', () => closeModal('allAttentionModal'));

// Calendar
document.getElementById('openCalendarBtn')?.addEventListener('click', () => {
    openModal('calendarModal');
    renderCalendar();
});
document.getElementById('closeCalendarBtn')?.addEventListener('click', () => closeModal('calendarModal'));

// Close modals on backdrop click
['allTeamModal', 'allAttentionModal', 'calendarModal'].forEach(modalId => {
    document.getElementById(modalId)?.addEventListener('click', function (e) {
        if (e.target === this) closeModal(modalId);
    });
});

// ============================================================
// INTERACTIVE CALENDAR
// ============================================================
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();

document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
    currentCalendarMonth--;
    if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
    }
    renderCalendar();
});

document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
    currentCalendarMonth++;
    if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
    }
    renderCalendar();
});

function renderCalendar() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    const titleEl = document.getElementById('calendarMonthYear');
    if (titleEl) titleEl.textContent = `${monthNames[currentCalendarMonth]} ${currentCalendarYear}`;

    const grid = document.getElementById('calendarDaysGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1).getDay();
    const daysInMonth = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();
    const today = new Date();

    // Build task date lookup for this month
    const allTasksWithDates = (window._allUpcomingTasks || []).concat(
        (window._allAlertItems || []).map(a => ({ task: a.task, date: a.date }))
    );
    const tasksByDay = {};
    allTasksWithDates.forEach(item => {
        if (!item.date) return;
        if (item.date.getMonth() === currentCalendarMonth && item.date.getFullYear() === currentCalendarYear) {
            const day = item.date.getDate();
            if (!tasksByDay[day]) tasksByDay[day] = [];
            // Deduplicate by task description
            if (!tasksByDay[day].some(t => t.task.task === item.task.task && t.task.employee_name === item.task.employee_name)) {
                tasksByDay[day].push(item);
            }
        }
    });

    // Empty cells for days before the first
    for (let i = 0; i < firstDay; i++) {
        grid.insertAdjacentHTML('beforeend', '<div class="px-calendar-day empty"></div>');
    }

    // Actual day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const isToday = (d === today.getDate() && currentCalendarMonth === today.getMonth() && currentCalendarYear === today.getFullYear());
        const hasTasks = tasksByDay[d] && tasksByDay[d].length > 0;
        let classes = 'px-calendar-day';
        if (isToday) classes += ' today';
        if (hasTasks) classes += ' has-tasks';

        const dayEl = document.createElement('div');
        dayEl.className = classes;
        dayEl.textContent = d;
        dayEl.setAttribute('data-day', d);
        dayEl.addEventListener('click', () => selectCalendarDay(d, tasksByDay[d] || []));
        grid.appendChild(dayEl);
    }

    // Hide tasks panel initially
    const panel = document.getElementById('calendarDayTasksPanel');
    if (panel) panel.classList.add('hidden');
}

function selectCalendarDay(day, tasks) {
    // Highlight selected day
    document.querySelectorAll('.px-calendar-day').forEach(el => el.classList.remove('selected'));
    const dayEl = document.querySelector(`.px-calendar-day[data-day="${day}"]`);
    if (dayEl) dayEl.classList.add('selected');

    const panel = document.getElementById('calendarDayTasksPanel');
    const label = document.getElementById('selectedDayLabel');
    const list = document.getElementById('calendarDayTasksList');

    if (!panel || !list) return;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (label) label.textContent = `Tasks on ${monthNames[currentCalendarMonth]} ${day}, ${currentCalendarYear}`;

    if (tasks.length === 0) {
        list.innerHTML = '<div class="px-empty" style="padding:12px 0;">No tasks on this day.</div>';
    } else {
        list.innerHTML = tasks.map(item => {
            const timeStr = item.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
            return `
                <div class="px-calendar-task-item">
                    <span class="px-cal-task-time">${timeStr}</span>
                    <span class="px-cal-task-name">${item.task.task}</span>
                    <span class="px-cal-task-assignee">${item.task.employee_name}</span>
                </div>
            `;
        }).join('');
    }

    panel.classList.remove('hidden');
}
