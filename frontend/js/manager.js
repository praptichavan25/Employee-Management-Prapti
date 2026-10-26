const employeeSelect = document.getElementById('employee');
const addEmployeeModal = document.getElementById('addEmployeeModal');
const openAddEmployeeBtn = document.getElementById('openAddEmployeeBtn');
const cancelAddEmployeeBtn = document.getElementById('cancelAddEmployeeBtn');
const addEmployeeForm = document.getElementById('addEmployeeForm');
const addEmpFeedback = document.getElementById('addEmpFeedback');

// Centralized API URL resolution (falls back to PHOENIX_CONFIG)
function getApiUrl(endpoint) {
    if (window.PHOENIX_CONFIG && typeof window.PHOENIX_CONFIG.apiUrl === 'function') {
        return window.PHOENIX_CONFIG.apiUrl(endpoint);
    }
    const clean = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    const base = (window.API_BASE_URL || (window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://127.0.0.1:5001' : window.location.origin));
    return base + clean;
}

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

// ─── KPI Loading State Helpers ────────────────────────────────────────────
// Called before any data fetch so users see activity instead of stale dashes.
const KPI_IDS = ['kpiTotalTasks', 'kpiActiveTasks', 'kpiUpcomingDeadlines', 'kpiPastDueTasks', 'kpiCompletedTasks'];

function setKpiLoading() {
    KPI_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '…';
    });
}

function setKpiError() {
    KPI_IDS.forEach(id => {
        const el = document.getElementById(id);
        // Only overwrite if still showing loading; preserve real values on partial success.
        if (el && el.textContent === '…') el.textContent = '—';
    });
}

// ─── Employee Dropdown (UI-only) ───────────────────────────────────────────
// Loads the employee list and populates the assignment dropdown.
// Returns the employee array on success, null on auth failure, [] on other errors.
// DECOUPLED: This function no longer calls loadAllTasks() — that is orchestrated
// by initDashboard() so KPIs load even when the employee list request fails.
async function fetchEmployees(selectedName = '') {
    try {
        const response = await fetch(getApiUrl('/employees'), { credentials: 'include' });

        if (response.status === 401) {
            employeeSelect.innerHTML = '<option value="">Session expired. Redirecting to login...</option>';
            try { localStorage.removeItem('phoenix_user'); } catch (e) {}
            window.location.replace('index.html');
            return null; // Signal auth failure to caller
        }

        if (response.status === 403) {
            employeeSelect.innerHTML = '<option value="">Access forbidden: Project Manager role required</option>';
            return [];
        }

        const data = await response.json();

        if (response.ok && data.success) {
            const employees = data.employees || [];
            allEmployees = employees;
            employeeSelect.innerHTML = '<option value="">Search or select employee...</option>';
            employees.forEach(emp => {
                const opt = document.createElement('option');
                opt.value = emp.name;
                opt.textContent = emp.name;
                if (selectedName && emp.name === selectedName) opt.selected = true;
                employeeSelect.appendChild(opt);
            });
            return employees;
        } else {
            const errMsg = (data && data.message) ? data.message : 'Server error loading employees';
            employeeSelect.innerHTML = `<option value="">${escapeHtml(errMsg)}</option>`;
            // Add a retry link so the user can reload without a full page refresh
            const retryHtml = '<button type="button" id="retryEmployeesBtn" style="margin:6px auto;display:block;padding:4px 12px;font-size:12px;cursor:pointer;border:1px solid #94a3b8;border-radius:4px;background:#f1f5f9;color:#334155;">↺ Retry</button>';
            employeeSelect.insertAdjacentHTML('afterend', retryHtml);
            const retryBtn = document.getElementById('retryEmployeesBtn');
            if (retryBtn) retryBtn.addEventListener('click', () => { retryBtn.remove(); initDashboard(); });
            return [];
        }
    } catch (e) {
        employeeSelect.innerHTML = '<option value="">Unable to connect to PHOENIX server</option>';
        const retryHtml = '<button type="button" id="retryEmployeesBtn" style="margin:6px auto;display:block;padding:4px 12px;font-size:12px;cursor:pointer;border:1px solid #94a3b8;border-radius:4px;background:#f1f5f9;color:#334155;">↺ Retry</button>';
        employeeSelect.insertAdjacentHTML('afterend', retryHtml);
        const retryBtn = document.getElementById('retryEmployeesBtn');
        if (retryBtn) retryBtn.addEventListener('click', () => { retryBtn.remove(); initDashboard(); });
        return [];
    }
}

// ─── Task Aggregation ─────────────────────────────────────────────────────
// Fetches tasks for each employee in allEmployees using Promise.allSettled so
// a failed fetch for one employee does not prevent others from loading.
// Always calls hydrateDashboard() at the end — even on partial failure.
async function loadAllTasks() {
    allTasks = [];

    if (allEmployees.length === 0) {
        // No employees known — still hydrate so KPIs show 0 instead of loading dash.
        hydrateDashboard();
        return;
    }

    const fetchPromises = allEmployees.map(emp =>
        fetch(getApiUrl(`/tasks/${encodeURIComponent(emp.name)}`), { credentials: 'include' })
            .then(r => r.json().then(data => (r.ok && data.success) ? (data.tasks || []) : []))
            .catch(e => { console.warn(`Task fetch failed for ${emp.name}:`, e); return []; })
    );

    const results = await Promise.allSettled(fetchPromises);
    results.forEach(r => {
        if (r.status === 'fulfilled') allTasks.push(...r.value);
    });

    hydrateDashboard();
}

// ─── Decoupled Dashboard Initializer ─────────────────────────────────────
// Runs employee-list fetch and task-data fetch CONCURRENTLY.
// A failure in the employee list (403, 5xx, network error) will NOT prevent
// KPI cards from hydrating — tasks load using whatever employees were resolved.
async function initDashboard(selectedName = '') {
    // Show loading indicator on KPI cards immediately
    setKpiLoading();

    // Step 1: Fetch employees (populates dropdown + allEmployees).
    // If auth failure (null), bail out entirely — redirect already triggered.
    const employees = await fetchEmployees(selectedName);
    if (employees === null) return;

    // Step 2: Fetch tasks for all resolved employees, then hydrate.
    // Even if employees === [], loadAllTasks() will call hydrateDashboard() → shows 0s.
    try {
        await loadAllTasks();
    } catch (e) {
        console.error('loadAllTasks error:', e);
        setKpiError();
    }
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
                <div class="px-timeline-item" onclick="openTaskDetails(${item.task.id})" style="cursor:pointer;" title="Click to view task details">
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
        const escapedTask = (item.task.task || '').replace(/'/g, "\\'");
        const escapedEmp = (item.task.employee_name || '').replace(/'/g, "\\'");
        const taskId = item.task.id;
        const badgeLabel = item.category === 'past_due' ? 'PAST DUE' : item.category === 'due_today' ? 'DUE TODAY' : 'HIGH PRIORITY';
        const badgeClass = item.category === 'past_due' ? 'badge-pastdue' : item.category === 'due_today' ? 'badge-today' : 'badge-high';

        // Extract priority and overdue/time text
        const priorityText = (item.task.priority || 'High') + ' Priority';
        let detailText = item.metaText;
        if (detailText.includes('·')) {
            detailText = detailText.split('·').slice(1).join('·').trim();
        }

        return `
            <div class="px-alert-item ${item.urgency}" data-category="${item.category}" data-priority="${item.priority}">
                <div class="px-alert-body">
                    <div class="px-alert-title-row">
                        <span class="px-alert-badge ${badgeClass}">${badgeLabel}</span>
                        <span class="px-alert-task-name" title="${escapeHtml(item.task.task)}">${escapeHtml(item.task.task)}</span>
                    </div>
                    <div class="px-alert-meta">
                        <span style="font-weight:600; color:#334155;">${escapeHtml(item.task.employee_name)}</span>
                        <span>·</span>
                        <span>${escapeHtml(priorityText)}</span>
                        <span>·</span>
                        <span>${escapeHtml(detailText)}</span>
                    </div>
                </div>
                <div class="px-alert-actions">
                    <button type="button" onclick="openTaskDetails(${taskId})" class="px-btn-view-task" title="View full task details, comments & activity">
                        <span class="material-symbols-outlined">visibility</span>
                        <span>View Task</span>
                    </button>
                    <button type="button" onclick="sendReminder('${escapedEmp}', '${escapedTask}')" class="px-btn-remind" title="Send reminder via Gmail">
                        <span class="material-symbols-outlined">send</span>
                        <span>Send Reminder</span>
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

    // 7. Load Recent Team Activity
    loadRecentTeamActivity();
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

// Initial dashboard load with authentication guard
document.addEventListener('DOMContentLoaded', async function () {
    if (window.PHOENIX_CONFIG && typeof window.PHOENIX_CONFIG.checkAuth === 'function') {
        const authUser = await window.PHOENIX_CONFIG.checkAuth(['project_manager', 'administrator']);
        if (!authUser) return; // Unauthenticated or unauthorized; redirected
    }
    initDashboard();
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
            const response = await fetch(getApiUrl('/add-employee'), {
                method: 'POST',
                credentials: 'include',
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

                // Refresh dropdown and KPIs, then select the new employee
                await initDashboard(name);

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
        const response = await fetch(getApiUrl('/generate-ai-email'), {
            method: 'POST',
            credentials: 'include',
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

        const response = await fetch(getApiUrl('/assign-task'), {
            method: 'POST',
            credentials: 'include',
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
            container.innerHTML = display.map(renderAlertItem).join('');
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


// ============================================================
// PHOENIX - TASK DETAILS CENTERED MODAL & COMMENTS / ACTIVITY ENGINE (MANAGER)
// ============================================================

let currentModalTaskId = null;
let pendingCommentIdToDelete = null;

function getCurrentUser() {
    try {
        const stored = localStorage.getItem('phoenix_user');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.email) return parsed;
        }
    } catch (e) {}
    return {
        name: 'Prapti Chavan',
        email: 'prapti.chavan25@gmail.com',
        role: 'project_manager',
        department: 'Project Management'
    };
}

// Open Task Details Modal
async function openTaskDetails(taskId) {
    if (!taskId) return;
    currentModalTaskId = taskId;

    const backdrop = document.getElementById('pxTaskModalBackdrop');
    if (!backdrop) return;

    document.body.classList.add('px-modal-open');
    backdrop.classList.add('active');

    // Reset fields to loading placeholders
    const titleEl = document.getElementById('pxModalTitle');
    const assigneeEl = document.getElementById('pxModalAssignee');
    const assigneeEmailEl = document.getElementById('pxModalAssigneeEmail');
    const assignedByEl = document.getElementById('pxModalAssignedBy');
    const deadlineEl = document.getElementById('pxModalDeadline');
    const lifecycleEl = document.getElementById('pxModalLifecycleText');
    const lifecycleSubEl = document.getElementById('pxModalLifecycleSub');
    const descEl = document.getElementById('pxModalDescription');
    const commentsListEl = document.getElementById('pxModalCommentsList');
    const activityTimelineEl = document.getElementById('pxModalActivityTimeline');

    if (titleEl) titleEl.textContent = 'Loading task...';
    if (assigneeEl) assigneeEl.textContent = '...';
    if (assigneeEmailEl) assigneeEmailEl.textContent = '...';
    if (assignedByEl) assignedByEl.textContent = 'Prapti Chavan';
    if (deadlineEl) deadlineEl.textContent = '...';
    if (lifecycleEl) lifecycleEl.textContent = '...';
    if (descEl) descEl.textContent = 'Loading description...';
    if (commentsListEl) commentsListEl.innerHTML = '<div style="text-align:center; padding:16px; color:#94A3B8; font-size:12.5px;">Loading comments...</div>';
    if (activityTimelineEl) activityTimelineEl.innerHTML = '<div style="text-align:center; padding:16px; color:#94A3B8; font-size:12.5px;">Loading activity timeline...</div>';

    const user = getCurrentUser();

    try {
        const resp = await fetch(getApiUrl(`/tasks/id/${taskId}?user_email=${encodeURIComponent(user.email)}`), { credentials: 'include' });
        const data = await resp.json();

        if (resp.ok && data.success && data.task) {
            const t = data.task;
            if (titleEl) titleEl.textContent = t.task || 'Untitled Task';
            if (assigneeEl) assigneeEl.textContent = t.employee_name || 'Unassigned';
            
            // Look up employee email from loaded directory
            const matchedEmp = (allEmployees || []).find(e => (e.name || '').toLowerCase() === (t.employee_name || '').toLowerCase());
            const empEmail = matchedEmp ? matchedEmp.email : (t.employee_name ? `${t.employee_name.toLowerCase().replace(/\s+/g, '.')}@phoenix.com` : '—');
            if (assigneeEmailEl) assigneeEmailEl.textContent = empEmail;

            if (assignedByEl) assignedByEl.textContent = t.assigned_by || 'Prapti Chavan';
            if (descEl) descEl.textContent = t.task || 'No detailed description provided.';

            // Format deadline nicely: "05 Sep 2026 · 6:00 PM IST"
            let formattedDeadline = t.deadline || '—';
            if (t.deadline) {
                const dt = parseDeadlineDate(t.deadline);
                if (dt && !isNaN(dt)) {
                    formattedDeadline = dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' +
                                        dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST';
                }
            }
            if (deadlineEl) deadlineEl.textContent = formattedDeadline;

            const priority = (t.priority || 'High').toUpperCase();
            const rawStatus = (t.status || 'Assigned').trim();
            const isOverdue = isTaskOverdue(t);

            const prioBadge = document.getElementById('pxModalPriorityBadge');
            if (prioBadge) {
                prioBadge.textContent = priority;
                prioBadge.className = `px-badge-tag ${priority === 'HIGH' ? 'px-badge-high' : priority === 'MEDIUM' ? 'px-badge-medium' : 'px-badge-low'}`;
            }

            const statusBadge = document.getElementById('pxModalStatusBadge');
            if (statusBadge) {
                if (isOverdue) {
                    statusBadge.textContent = 'PAST DUE';
                    statusBadge.className = 'px-badge-tag px-badge-pastdue';
                } else if (rawStatus.toLowerCase() === 'completed') {
                    statusBadge.textContent = 'COMPLETED';
                    statusBadge.className = 'px-badge-tag px-badge-completed';
                } else if (rawStatus.toLowerCase() === 'in progress') {
                    statusBadge.textContent = 'IN PROGRESS';
                    statusBadge.className = 'px-badge-tag px-badge-progress';
                } else {
                    statusBadge.textContent = 'ASSIGNED';
                    statusBadge.className = 'px-badge-tag px-badge-assigned';
                }
            }

            // Lifecycle indicator
            if (lifecycleEl && lifecycleSubEl) {
                if (rawStatus.toLowerCase() === 'completed') {
                    lifecycleEl.textContent = 'Assigned → In Progress → Completed';
                    lifecycleSubEl.textContent = 'Task successfully finished';
                } else if (rawStatus.toLowerCase() === 'in progress') {
                    lifecycleEl.textContent = 'Assigned → In Progress';
                    lifecycleSubEl.textContent = 'Currently in progress';
                } else {
                    lifecycleEl.textContent = 'Assigned';
                    lifecycleSubEl.textContent = 'Pending acceptance/start';
                }
            }
        } else {
            if (titleEl) titleEl.textContent = 'Task Not Found';
        }
    } catch (e) {
        console.error('Error fetching task details:', e);
    }

    await Promise.all([
        loadTaskComments(taskId),
        loadTaskActivity(taskId)
    ]);
}

// Close Task Details Modal
function closeTaskDetails() {
    currentModalTaskId = null;
    const backdrop = document.getElementById('pxTaskModalBackdrop');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('px-modal-open');
}

// Load Task Comments
async function loadTaskComments(taskId) {
    const listEl = document.getElementById('pxModalCommentsList');
    const countEl = document.getElementById('pxModalCommentsCount');
    if (!listEl) return;

    const user = getCurrentUser();

    try {
        const resp = await fetch(getApiUrl(`/tasks/${taskId}/comments?user_email=${encodeURIComponent(user.email)}`), { credentials: 'include' });
        const data = await resp.json();

        if (resp.ok && data.success) {
            const comments = data.comments || [];
            if (countEl) countEl.textContent = comments.length;

            if (comments.length === 0) {
                listEl.innerHTML = '<div style="text-align:center; padding:14px; color:#94A3B8; font-size:12.5px;">No comments yet. Start the conversation about this task.</div>';
                return;
            }

            listEl.innerHTML = comments.map(c => {
                const isAuthor = (c.user_email || '').toLowerCase() === (user.email || '').toLowerCase();
                const initials = getInitials(c.user_name);
                const roleLabel = (c.user_role || '').toLowerCase() === 'project_manager' ? 'Project Manager' : 'Employee';
                const avatarClass = (c.user_role || '').toLowerCase() === 'project_manager' ? '' : 'emp-avatar';
                const timeFormatted = formatTimestamp(c.created_at);

                return `
                    <div class="px-comment-item" id="comment-item-${c.id}">
                        <div class="px-comment-avatar ${avatarClass}">${initials}</div>
                        <div class="px-comment-content">
                            <div class="px-comment-header">
                                <div class="px-comment-user-info">
                                    <span class="px-comment-user-name">${escapeHtml(c.user_name)}</span>
                                    <span class="px-comment-role-tag">${roleLabel}</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span class="px-comment-time">${timeFormatted}</span>
                                    ${isAuthor ? `
                                        <div class="px-comment-menu-wrap">
                                            <button type="button" class="px-comment-menu-btn" onclick="toggleCommentMenu(${c.id}, event)" title="Comment options">•••</button>
                                            <div id="comment-dropdown-${c.id}" class="px-comment-dropdown">
                                                <button type="button" class="px-comment-dropdown-item" onclick="startEditComment(${c.id}, '${escapeHtml(c.comment).replace(/'/g, "\\'")}')">
                                                    <span class="material-symbols-outlined" style="font-size:13px;">edit</span> Edit
                                                </button>
                                                <button type="button" class="px-comment-dropdown-item delete" onclick="promptDeleteComment(${c.id})">
                                                    <span class="material-symbols-outlined" style="font-size:13px;">delete</span> Delete
                                                </button>
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                            <div id="comment-text-${c.id}" class="px-comment-text">${escapeHtml(c.comment)}</div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            listEl.innerHTML = '<div style="text-align:center; padding:12px; color:#E11D48; font-size:12.5px;">Unable to load comments. Try again.</div>';
        }
    } catch (e) {
        console.error('Error loading comments:', e);
        listEl.innerHTML = '<div style="text-align:center; padding:12px; color:#E11D48; font-size:12.5px;">Unable to load comments. Try again.</div>';
    }
}

// Load Task Activity
async function loadTaskActivity(taskId) {
    const timelineEl = document.getElementById('pxModalActivityTimeline');
    if (!timelineEl) return;

    const user = getCurrentUser();

    try {
        const resp = await fetch(getApiUrl(`/tasks/${taskId}/activity?user_email=${encodeURIComponent(user.email)}`), { credentials: 'include' });
        const data = await resp.json();

        if (resp.ok && data.success) {
            const activities = data.activity || [];
            if (activities.length === 0) {
                timelineEl.innerHTML = '<div style="text-align:center; padding:14px; color:#94A3B8; font-size:12.5px;">No activity recorded yet.</div>';
                return;
            }

            timelineEl.innerHTML = activities.map(a => {
                const timeFormatted = formatTimestamp(a.created_at);
                return `
                    <div class="px-tmodal-activity-item">
                        <div class="px-tmodal-activity-dot"></div>
                        <div class="px-tmodal-activity-desc">${escapeHtml(a.activity_description)}</div>
                        <div class="px-tmodal-activity-time">${timeFormatted}</div>
                    </div>
                `;
            }).join('');
        } else {
            timelineEl.innerHTML = '<div style="text-align:center; padding:12px; color:#94A3B8; font-size:12.5px;">Unable to load activity. Try again.</div>';
        }
    } catch (e) {
        console.error('Error loading task activity:', e);
    }
}

// Send Comment
async function submitComment() {
    if (!currentModalTaskId) return;

    const input = document.getElementById('pxNewCommentInput');
    const sendBtn = document.getElementById('pxSendCommentBtn');
    const text = input ? input.value.trim() : '';

    if (!text) return;

    const user = getCurrentUser();
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:15px;">hourglass_empty</span> Posting...';
    }

    try {
        const resp = await fetch(getApiUrl(`/tasks/${currentModalTaskId}/comments`), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment: text,
                user_email: user.email,
                user_name: user.name,
                user_role: user.role
            })
        });

        const data = await resp.json();
        if (resp.ok && data.success) {
            if (input) input.value = '';
            await loadTaskComments(currentModalTaskId);
            await loadTaskActivity(currentModalTaskId);
            if (typeof loadRecentTeamActivity === 'function') {
                loadRecentTeamActivity();
            }
        } else {
            alert(data.message || 'Unable to post comment. Please try again.');
        }
    } catch (e) {
        alert('Unable to post comment. Please try again.');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<span class="material-symbols-outlined">send</span> <span>Post Comment</span>';
        }
    }
}

// Dropdown Action Menu Toggle
function toggleCommentMenu(commentId, event) {
    if (event) event.stopPropagation();
    document.querySelectorAll('.px-comment-dropdown').forEach(d => {
        if (d.id !== `comment-dropdown-${commentId}`) d.classList.remove('show');
    });
    const dropdown = document.getElementById(`comment-dropdown-${commentId}`);
    if (dropdown) dropdown.classList.toggle('show');
}

// Start Inline Comment Editing
function startEditComment(commentId, currentText) {
    document.querySelectorAll('.px-comment-dropdown').forEach(d => d.classList.remove('show'));

    const textEl = document.getElementById(`comment-text-${commentId}`);
    if (!textEl) return;

    textEl.innerHTML = `
        <div class="px-comment-edit-box">
            <textarea id="edit-textarea-${commentId}" class="px-comment-edit-textarea">${escapeHtml(currentText)}</textarea>
            <div class="px-comment-edit-actions">
                <button type="button" class="px-modal-btn-cancel" onclick="cancelEditComment(${commentId}, '${escapeHtml(currentText).replace(/'/g, "\\'")}')">Cancel</button>
                <button type="button" class="px-btn-post-comment" onclick="saveEditComment(${commentId})">Save</button>
            </div>
        </div>
    `;
}

function cancelEditComment(commentId, originalText) {
    const textEl = document.getElementById(`comment-text-${commentId}`);
    if (textEl) textEl.textContent = originalText;
}

async function saveEditComment(commentId) {
    const textarea = document.getElementById(`edit-textarea-${commentId}`);
    if (!textarea) return;
    const newText = textarea.value.trim();
    if (!newText) return;

    const user = getCurrentUser();
    try {
        const resp = await fetch(getApiUrl(`/tasks/${currentModalTaskId}/comments/${commentId}`), {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment: newText,
                user_email: user.email
            })
        });

        const data = await resp.json();
        if (resp.ok && data.success) {
            await loadTaskComments(currentModalTaskId);
            await loadTaskActivity(currentModalTaskId);
            if (typeof loadRecentTeamActivity === 'function') loadRecentTeamActivity();
        } else {
            alert(data.message || 'Failed to update comment.');
        }
    } catch (e) {
        alert('Network error updating comment.');
    }
}

// Delete Comment Confirmation Modal
function promptDeleteComment(commentId) {
    document.querySelectorAll('.px-comment-dropdown').forEach(d => d.classList.remove('show'));
    pendingCommentIdToDelete = commentId;
    const modal = document.getElementById('pxDeleteCommentModal');
    if (modal) modal.classList.add('active');
}

function cancelDeleteComment() {
    pendingCommentIdToDelete = null;
    const modal = document.getElementById('pxDeleteCommentModal');
    if (modal) modal.classList.remove('active');
}

async function confirmDeleteComment() {
    if (!pendingCommentIdToDelete || !currentModalTaskId) return;

    const commentId = pendingCommentIdToDelete;
    const user = getCurrentUser();

    try {
        const resp = await fetch(getApiUrl(`/tasks/${currentModalTaskId}/comments/${commentId}`), {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_email: user.email })
        });

        const data = await resp.json();
        cancelDeleteComment();

        if (resp.ok && data.success) {
            await loadTaskComments(currentModalTaskId);
            await loadTaskActivity(currentModalTaskId);
            if (typeof loadRecentTeamActivity === 'function') loadRecentTeamActivity();
        } else {
            alert(data.message || 'Failed to delete comment.');
        }
    } catch (e) {
        cancelDeleteComment();
        alert('Network error deleting comment.');
    }
}

// Manager Dashboard - Load Recent Team Activity
async function loadRecentTeamActivity() {
    const container = document.getElementById('recentActivityContainer');
    if (!container) return;

    try {
        const resp = await fetch(getApiUrl('/activity/recent'), { credentials: 'include' });
        const data = await resp.json();

        if (resp.ok && data.success) {
            const activities = data.activities || [];
            if (activities.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:14px; color:#94A3B8; font-size:12.5px;">No recent activity recorded yet.</div>';
                return;
            }

            container.innerHTML = activities.map(a => {
                const icon = a.activity_type.includes('COMMENT') ? 'chat_bubble' : 'published_with_changes';
                const timeFormatted = formatTimestamp(a.created_at);
                return `
                    <div class="px-recent-activity-item" onclick="openTaskDetails(${a.task_id})">
                        <div class="px-recent-activity-icon">
                            <span class="material-symbols-outlined">${icon}</span>
                        </div>
                        <div class="px-recent-activity-content">
                            <div class="px-recent-activity-actor">${escapeHtml(a.actor_name)}</div>
                            <div class="px-recent-activity-text">${escapeHtml(a.activity_description)}</div>
                            <div class="px-recent-activity-time">${timeFormatted} · "${escapeHtml(a.task_title)}"</div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = '<div style="text-align:center; padding:12px; color:#94A3B8; font-size:12.5px;">Unable to load recent activity</div>';
        }
    } catch (e) {
        console.error('Error loading recent team activity:', e);
    }
}

// Utility Helpers
function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatTimestamp(isoStr) {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr.includes('T') ? isoStr : isoStr.replace(' ', 'T'));
        if (isNaN(d)) return isoStr;
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffHrs < 24 && d.toDateString() === now.toDateString()) {
            return 'Today · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
        return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) + ' · ' +
               d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
        return isoStr;
    }
}

// Bind Global Task Details Modal Event Listeners
document.addEventListener('DOMContentLoaded', function () {
    const backdrop = document.getElementById('pxTaskModalBackdrop');
    const closeBtn = document.getElementById('pxCloseTaskModalBtn');
    const sendBtn = document.getElementById('pxSendCommentBtn');
    const commentInput = document.getElementById('pxNewCommentInput');
    const refreshActBtn = document.getElementById('refreshActivityBtn');
    const cancelDelBtn = document.getElementById('pxCancelDeleteCommentBtn');
    const confirmDelBtn = document.getElementById('pxConfirmDeleteCommentBtn');
    const deleteModal = document.getElementById('pxDeleteCommentModal');

    if (backdrop) {
        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) closeTaskDetails();
        });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeTaskDetails);
    if (sendBtn) sendBtn.addEventListener('click', submitComment);
    if (refreshActBtn) refreshActBtn.addEventListener('click', loadRecentTeamActivity);
    if (cancelDelBtn) cancelDelBtn.addEventListener('click', cancelDeleteComment);
    if (confirmDelBtn) confirmDelBtn.addEventListener('click', confirmDeleteComment);

    if (deleteModal) {
        deleteModal.addEventListener('click', function (e) {
            if (e.target === deleteModal) cancelDeleteComment();
        });
    }

    if (commentInput) {
        commentInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitComment();
            }
        });
    }

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.px-comment-menu-wrap')) {
            document.querySelectorAll('.px-comment-dropdown').forEach(d => d.classList.remove('show'));
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeTaskDetails();
            cancelDeleteComment();
        }
    });
});
