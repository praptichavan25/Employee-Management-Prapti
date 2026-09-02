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

    // 2. Hydrate Team Performance — Horizontal Bar Chart
    const performanceContainer = document.getElementById('teamPerformanceContainer');
    performanceContainer.innerHTML = ''; // kept hidden, used for modal compat

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

    // Sort: highest completion rate first; ties broken by completed count, then total
    empStats.sort((a, b) => {
        if (b.rate !== a.rate) return b.rate - a.rate;
        if (b.completed !== a.completed) return b.completed - a.completed;
        return b.total - a.total;
    });

    // Build horizontal bar row HTML
    function renderHbarRow(stat, index) {
        const isZero = stat.rate === 0;
        const fillClass = isZero ? 'pct-zero' : (stat.rate >= 75 ? 'pct-high' : (stat.rate >= 40 ? 'pct-medium' : 'pct-low'));
        const initials = stat.name.split(' ').map(n => n[0]).filter(Boolean).join('').toUpperCase().substring(0, 2) || stat.name.substring(0, 2).toUpperCase();
        const rankBadge = (index === 0 && stat.rate > 0) ? '<span class="px-hbar-rank-pill">Top Performer</span>' : '';

        const tooltipLines = [
            `<strong>${stat.name}</strong>`,
            `Total: ${stat.total} &nbsp;·&nbsp; Completed: ${stat.completed}`,
            `Active: ${stat.active} &nbsp;·&nbsp; Past Due: ${stat.pastDue}`,
            `Completion Rate: ${stat.rate}%`
        ].join('<br>');

        return `
            <div class="px-hbar-item">
                <div class="px-hbar-item-top">
                    <div class="px-hbar-user-wrap">
                        <div class="px-hbar-avatar">${initials}</div>
                        <div class="px-hbar-user-info">
                            <div class="px-hbar-name-row">
                                <span class="px-hbar-name" title="${stat.name}">${stat.name}</span>
                                ${rankBadge}
                            </div>
                            <div class="px-hbar-summary">
                                <span>${stat.total} Task${stat.total !== 1 ? 's' : ''}</span>
                                <span class="px-hbar-sep">·</span>
                                <span>${stat.completed} Done</span>
                                <span class="px-hbar-sep">·</span>
                                <span>${stat.active} Active</span>
                                ${stat.pastDue > 0 ? `<span class="px-hbar-sep">·</span><span class="px-hbar-pastdue">${stat.pastDue} Past Due</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="px-hbar-rate-wrap">
                        <span class="px-hbar-rate ${isZero ? 'zero' : ''}">${stat.rate}%</span>
                    </div>
                </div>
                <div class="px-hbar-track">
                    <div class="px-hbar-fill ${fillClass}" style="width:0%;" data-width="${stat.rate}%"></div>
                </div>
                <div class="px-hbar-tooltip">${tooltipLines}</div>
            </div>
        `;
    }

    // Render horizontal bar chart — show top 6 on dashboard, all in modal
    const hbarChart = document.getElementById('hbarChart');
    if (hbarChart) {
        hbarChart.innerHTML = '';
        const top6 = empStats.slice(0, 6);
        top6.forEach((stat, idx) => {
            hbarChart.insertAdjacentHTML('beforeend', renderHbarRow(stat, idx));
        });
        // Animate bars smoothly after DOM insertion
        setTimeout(() => {
            hbarChart.querySelectorAll('.px-hbar-fill:not(.pct-zero)').forEach(el => {
                el.style.width = el.getAttribute('data-width');
            });
        }, 50);
    }

    // Populate the full team modal with all employees
    const allTeamModalContainer = document.getElementById('allTeamModalContainer');
    if (allTeamModalContainer) {
        allTeamModalContainer.innerHTML = '';
        empStats.forEach((stat, idx) => {
            allTeamModalContainer.insertAdjacentHTML('beforeend', renderHbarRow(stat, idx));
        });
        requestAnimationFrame(() => {
            allTeamModalContainer.querySelectorAll('.px-hbar-fill:not(.pct-zero)').forEach(el => {
                el.style.width = el.getAttribute('data-width');
            });
        });
    }

    // 3. Skip old vertical bar chart (barChartContainer is now hidden)

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
        
        donut.style.background = `conic-gradient(from 0deg, #1F5F5B 0% ${slice1}%, #64748B ${slice1}% ${slice2}%, #D4882C ${slice2}% ${slice3}%, #D35454 ${slice3}% 100%)`;
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

// ============================================================
// PHOENIX AI EMAIL ASSISTANT LOGIC
// ============================================================
const generateAIEmailBtn = document.getElementById('generateAIEmailBtn');
const generateAIEmailBtnText = document.getElementById('generateAIEmailBtnText');
const aiEmailPanel = document.getElementById('aiEmailPanel');
const aiSubjectInput = document.getElementById('aiSubjectInput');
const aiBodyTextarea = document.getElementById('aiBodyTextarea');
const aiErrorBanner = document.getElementById('aiErrorBanner');
const aiErrorMessage = document.getElementById('aiErrorMessage');
const closeAIPanelBtn = document.getElementById('closeAIPanelBtn');
const copyAIEmailBtn = document.getElementById('copyAIEmailBtn');
const reDraftAIBtn = document.getElementById('reDraftAIBtn');
const sendAIEmailBtn = document.getElementById('sendAIEmailBtn');
const aiSendFeedback = document.getElementById('aiSendFeedback');

async function generateAIEmail() {
    const employee = document.getElementById('employee').value.trim();
    const task = document.getElementById('task').value.trim();
    const deadlineDate = document.getElementById('deadline_date').value;
    const deadlineTime = document.getElementById('deadline_time').value;
    const priorityEl = document.querySelector('input[name="priority"]:checked');
    const priority = priorityEl ? priorityEl.value : 'Medium';

    if (!employee) {
        alert('Please select an employee first.');
        document.getElementById('employee').focus();
        return;
    }
    if (!task) {
        alert('Please enter a task description first.');
        document.getElementById('task').focus();
        return;
    }

    // Determine manager identity
    let managerName = 'Prapti Chavan';
    try {
        const stored = localStorage.getItem('phoenix_user');
        if (stored) {
            const user = JSON.parse(stored);
            if (user && user.name) managerName = user.name;
        }
    } catch (e) {
        console.error('Error reading manager:', e);
    }

    // Set UI loading state
    if (generateAIEmailBtn) {
        generateAIEmailBtn.disabled = true;
        generateAIEmailBtn.classList.add('loading');
    }
    if (generateAIEmailBtnText) {
        generateAIEmailBtnText.textContent = 'Generating with OpenAI...';
    }
    if (aiErrorBanner) aiErrorBanner.style.display = 'none';

    try {
        const response = await fetch('http://127.0.0.1:5001/generate-ai-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_name: employee,
                task: task,
                deadline_date: deadlineDate,
                deadline_time: deadlineTime,
                priority: priority,
                assigned_by: managerName
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Build editable body from structured components
            const parts = [
                data.greeting || `Dear ${employee},`,
                data.intro || '',
                data.details || '',
                data.action || '',
                data.closing || '',
                data.signature || `Regards,\n${managerName}\nProject Manager — PHOENIX`
            ];
            const fullBody = parts.filter(Boolean).join('\n\n');

            if (aiSubjectInput) aiSubjectInput.value = data.subject || `[PHOENIX] New Task Assignment: ${task}`;
            if (aiBodyTextarea) aiBodyTextarea.value = fullBody;

            if (aiEmailPanel) {
                aiEmailPanel.classList.add('visible');
                aiEmailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            if (aiErrorMessage) {
                aiErrorMessage.textContent = data.message || 'Failed to generate AI email.';
            }
            if (aiErrorBanner) aiErrorBanner.style.display = 'flex';
            if (aiEmailPanel) aiEmailPanel.classList.add('visible');
        }
    } catch (err) {
        console.error('AI generation request failed:', err);
        if (aiErrorMessage) {
            aiErrorMessage.textContent = 'Unable to reach backend server. Please ensure Flask app is running.';
        }
        if (aiErrorBanner) aiErrorBanner.style.display = 'flex';
        if (aiEmailPanel) aiEmailPanel.classList.add('visible');
    } finally {
        if (generateAIEmailBtn) {
            generateAIEmailBtn.disabled = false;
            generateAIEmailBtn.classList.remove('loading');
        }
        if (generateAIEmailBtnText) {
            generateAIEmailBtnText.textContent = 'Generate Email with AI';
        }
    }
}

// Generate button click handlers
generateAIEmailBtn?.addEventListener('click', generateAIEmail);
reDraftAIBtn?.addEventListener('click', generateAIEmail);

// Close AI preview panel
closeAIPanelBtn?.addEventListener('click', () => {
    aiEmailPanel?.classList.remove('visible');
});

// Copy AI email to clipboard
copyAIEmailBtn?.addEventListener('click', async () => {
    const subj = aiSubjectInput ? aiSubjectInput.value.trim() : '';
    const body = aiBodyTextarea ? aiBodyTextarea.value.trim() : '';
    const fullEmailText = `Subject: ${subj}\n\n${body}`;

    try {
        await navigator.clipboard.writeText(fullEmailText);
        const originalHtml = copyAIEmailBtn.innerHTML;
        copyAIEmailBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px;">check</span><span>Copied!</span>';
        setTimeout(() => {
            copyAIEmailBtn.innerHTML = originalHtml;
        }, 2200);
    } catch (e) {
        alert('Could not copy to clipboard.');
    }
});

// "Assign & Send This Email" button click handler
sendAIEmailBtn?.addEventListener('click', () => {
    const submitBtn = document.querySelector('#taskForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.click();
    }
});

// Existing Task Assignment Form Handler (supports AI approved draft dispatch)
document.getElementById('taskForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const employee = document.getElementById('employee').value.trim();
    const task = document.getElementById('task').value.trim();
    const deadlineDate = document.getElementById('deadline_date').value;
    const deadlineTime = document.getElementById('deadline_time').value;
    const feedbackMessage = document.getElementById('feedbackMessage');
    const submitBtn = document.querySelector('#taskForm button[type="submit"]');

    // Check if AI preview panel is active and has custom text
    const isAIPanelOpen = aiEmailPanel && aiEmailPanel.classList.contains('visible');
    const customSubject = isAIPanelOpen && aiSubjectInput ? aiSubjectInput.value.trim() : '';
    const customBody = isAIPanelOpen && aiBodyTextarea ? aiBodyTextarea.value.trim() : '';

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
    if (sendAIEmailBtn) {
        sendAIEmailBtn.disabled = true;
        sendAIEmailBtn.innerHTML = '<span class="material-symbols-outlined">sync</span> Sending...';
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
        const payload = {
            employee_name: employee,
            task: task,
            deadline_date: deadlineDate,
            deadline_time: deadlineTime,
            assigned_by: managerName
        };

        // Attach approved AI email content if customized
        if (customSubject) payload.custom_subject = customSubject;
        if (customBody) payload.custom_body = customBody;

        const response = await fetch('http://127.0.0.1:5001/assign-task', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            const emailTypeNote = (customSubject && customBody) ? 'AI-customized email' : 'email';
            feedbackMessage.textContent = `✓ Task assigned successfully! ${emailTypeNote} sent to ${employee}.`;
            feedbackMessage.className = 'px-feedback show success';

            // Refresh KPIs & List
            await loadAllTasks();

            // Reset form and close AI panel after brief delay
            setTimeout(function () {
                document.getElementById('taskForm').reset();
                if (aiEmailPanel) aiEmailPanel.classList.remove('visible');
                if (aiSubjectInput) aiSubjectInput.value = '';
                if (aiBodyTextarea) aiBodyTextarea.value = '';
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
        if (sendAIEmailBtn) {
            sendAIEmailBtn.disabled = false;
            sendAIEmailBtn.innerHTML = '<span class="material-symbols-outlined">send</span> Assign &amp; Send This Email';
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
document.getElementById('openAllTeamBtn')?.addEventListener('click', () => {
    openModal('allTeamModal');
    setTimeout(() => {
        document.querySelectorAll('#allTeamModalContainer .px-hbar-fill:not(.pct-zero)').forEach(el => {
            el.style.width = el.getAttribute('data-width');
        });
    }, 60);
});
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
