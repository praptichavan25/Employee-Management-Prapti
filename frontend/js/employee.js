// PHOENIX - Employee Workspace Client Script
// 100% Dynamic data integration with existing Flask backend (/tasks/<employeeName>) and employees.json
// Automatic Past Due vs Upcoming Deadlines calculation for currently logged-in employee

const employeeGreeting = document.getElementById('employeeGreeting');
const tasksContainer = document.getElementById('tasksContainer');
const realDeadlinesContainer = document.getElementById('realDeadlinesContainer');
const pastDueTasksContainer = document.getElementById('pastDueTasksContainer');
let allEmployeeTasks = [];

// Department role profiles mapping to reflect real roles from data/employees.json
const DEPARTMENT_PROFILES = {
    'Design': {
        title: 'UI/UX Designer',
        about: 'Creating intuitive user interfaces, scalable design systems, and seamless digital product interactions across PHOENIX platforms.',
        tags: ['Product Design', 'Figma Systems', 'User Research', 'Prototyping'],
        skills: [
            { name: 'UI/UX Design', pct: '92%', class: 'fill-teal' },
            { name: 'Figma & Prototyping', pct: '95%', class: 'fill-teal' },
            { name: 'Design Systems', pct: '88%', class: 'fill-gold' },
            { name: 'User Testing', pct: '90%', class: 'fill-teal' }
        ]
    },
    'Engineering': {
        title: 'Software Engineer',
        about: 'Building resilient full-stack systems, optimizing backend services, and shipping reliable enterprise modules for PHOENIX.',
        tags: ['Full Stack', 'API Architecture', 'Python & DBs', 'System Reliability'],
        skills: [
            { name: 'Backend Architecture', pct: '94%', class: 'fill-teal' },
            { name: 'Frontend Integration', pct: '90%', class: 'fill-teal' },
            { name: 'Database & ORM', pct: '88%', class: 'fill-gold' },
            { name: 'Code Quality & CI', pct: '92%', class: 'fill-teal' }
        ]
    },
    'Data & Analytics': {
        title: 'Data & Analytics Specialist',
        about: 'Transforming complex datasets into actionable business intelligence, KPI reporting, and predictive analytics models.',
        tags: ['Data Pipelines', 'SQL Analytics', 'Visualization', 'Statistical Modeling'],
        skills: [
            { name: 'Data Pipeline Design', pct: '93%', class: 'fill-teal' },
            { name: 'SQL & Query Optimization', pct: '96%', class: 'fill-teal' },
            { name: 'BI Dashboards', pct: '90%', class: 'fill-gold' },
            { name: 'Data Reliability', pct: '89%', class: 'fill-teal' }
        ]
    },
    'Quality Assurance': {
        title: 'QA & Automation Engineer',
        about: 'Ensuring bulletproof application stability through rigorous end-to-end testing, bug triage, and automated regression suites.',
        tags: ['Test Automation', 'API Testing', 'Bug Triage', 'Performance Audits'],
        skills: [
            { name: 'Automation Testing', pct: '95%', class: 'fill-teal' },
            { name: 'Regression Testing', pct: '92%', class: 'fill-teal' },
            { name: 'Test Coverage', pct: '88%', class: 'fill-gold' },
            { name: 'Release Readiness', pct: '91%', class: 'fill-teal' }
        ]
    },
    'Infrastructure': {
        title: 'Infrastructure & Cloud Specialist',
        about: 'Maintaining high-availability servers, container networks, deployment pipelines, and security configurations.',
        tags: ['Cloud Infrastructure', 'Network Security', 'Monitoring', 'Server Ops'],
        skills: [
            { name: 'Server Reliability', pct: '96%', class: 'fill-teal' },
            { name: 'Cloud Architecture', pct: '91%', class: 'fill-teal' },
            { name: 'Security & Access', pct: '90%', class: 'fill-gold' },
            { name: 'System Monitoring', pct: '94%', class: 'fill-teal' }
        ]
    },
    'Research & Development': {
        title: 'R&D Specialist',
        about: 'Investigating next-generation automation algorithms, prototyping experimental architectures, and driving innovation.',
        tags: ['Emerging Tech', 'Algorithmic Research', 'Prototyping', 'Feasibility'],
        skills: [
            { name: 'Algorithm Research', pct: '94%', class: 'fill-teal' },
            { name: 'Rapid Prototyping', pct: '92%', class: 'fill-teal' },
            { name: 'System Innovation', pct: '90%', class: 'fill-gold' },
            { name: 'Technical Docs', pct: '88%', class: 'fill-teal' }
        ]
    },
    'R&D': {
        title: 'R&D Engineer',
        about: 'Driving technical exploration, proof-of-concepts, and innovative automation features across PHOENIX ecosystems.',
        tags: ['Research', 'Proof of Concept', 'Tech Exploration', 'Modular Design'],
        skills: [
            { name: 'Experimental Design', pct: '93%', class: 'fill-teal' },
            { name: 'Modular Dev', pct: '91%', class: 'fill-teal' },
            { name: 'Tech Evaluation', pct: '89%', class: 'fill-gold' },
            { name: 'Implementation', pct: '92%', class: 'fill-teal' }
        ]
    },
    'Operations': {
        title: 'Operations Coordinator',
        about: 'Orchestrating cross-functional workflows, operational resource tracking, and ensuring smooth project milestone delivery.',
        tags: ['Process Optimization', 'Resource Planning', 'Workflow Auditing', 'Delivery'],
        skills: [
            { name: 'Process Management', pct: '95%', class: 'fill-teal' },
            { name: 'Workflow Tracking', pct: '92%', class: 'fill-teal' },
            { name: 'Resource Allocation', pct: '90%', class: 'fill-gold' },
            { name: 'Team Alignment', pct: '93%', class: 'fill-teal' }
        ]
    },
    'Ai/Ml': {
        title: 'AI/ML Engineer',
        about: 'Developing intelligent data processing models, NLP pipelines, and machine learning automations.',
        tags: ['Machine Learning', 'Model Deployment', 'NLP Pipelines', 'Python ML'],
        skills: [
            { name: 'ML Model Building', pct: '94%', class: 'fill-teal' },
            { name: 'Model Optimization', pct: '91%', class: 'fill-teal' },
            { name: 'Data Wrangling', pct: '93%', class: 'fill-gold' },
            { name: 'Inference Pipelines', pct: '89%', class: 'fill-teal' }
        ]
    }
};

// Helper to parse deadline string into Date object
function parseDeadlineDate(deadlineStr) {
    if (!deadlineStr) return null;
    let str = deadlineStr.trim();

    // Safely replace space with T if it matches YYYY-MM-DD HH:MM:00
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
        str = str.replace(' ', 'T');
    }

    // 1. If standard YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
    const isoDate = new Date(str);
    if (!isNaN(isoDate.getTime())) {
        // If no time is specified (e.g., "2026-08-20"), set deadline to end of that day (23:59:59)
        if (str.length === 10 && str.indexOf('-') === 4) {
            isoDate.setHours(23, 59, 59, 999);
        }
        return isoDate;
    }

    // 2. Custom date string formats (e.g., "20 August 2026, 5:00 PM")
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
        return new Date(parsed);
    }

    return null;
}

// Format exact deadline (e.g., "20 Aug 2026 · 5:30 PM")
function formatExactDeadline(dateObj) {
    if (!dateObj) return 'No deadline specified';
    const day = dateObj.getDate();
    const month = dateObj.toLocaleString('en-US', { month: 'short' });
    const year = dateObj.getFullYear();
    const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    // e.g. "20 Aug 2026 · 5:30 PM"
    return `${day} ${month} ${year} · ${timeStr}`;
}

// Format relative deadline message (e.g., "Due in 3 days", "Overdue by 2 hours")
function getRelativeDeadlineText(dateObj) {
    if (!dateObj) return '';
    const now = new Date();
    const diffMs = dateObj.getTime() - now.getTime();
    const isPast = diffMs < 0;
    const absMs = Math.abs(diffMs);
    
    const mins = Math.floor(absMs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (isPast) {
        if (mins < 60) return `Overdue by ${mins} minute${mins !== 1 ? 's' : ''}`;
        if (hours < 24) return `Overdue by ${hours} hour${hours !== 1 ? 's' : ''}`;
        return `Overdue by ${days} day${days !== 1 ? 's' : ''}`;
    } else {
        // Due today?
        if (dateObj.toDateString() === now.toDateString()) {
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return `Due today · ${timeStr}`;
        }
        
        // Due tomorrow?
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (dateObj.toDateString() === tomorrow.toDateString()) {
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return `Due tomorrow · ${timeStr}`;
        }

        if (days < 7) {
            return `Due in ${days} day${days !== 1 ? 's' : ''}`;
        }
        
        return formatExactDeadline(dateObj);
    }
}

// Logic: if currentDateTime > deadline AND task.status !== "Completed" -> Past Due
function isTaskOverdue(task) {
    const isCompleted = (task.status || '').trim().toLowerCase() === 'completed';
    if (isCompleted) return false;

    const deadlineDate = parseDeadlineDate(task.deadline);
    if (!deadlineDate) return false;

    const now = new Date();
    return now.getTime() > deadlineDate.getTime();
}

// Initialize dynamic workspace date
function initWorkspaceDate() {
    const dateEl = document.getElementById('currentDateDisplay');
    if (dateEl) {
        const options = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('en-US', options);
    }
}

// Main task fetcher: reads real data from backend SQLite via existing endpoint for current employee
async function loadTasks(employeeName) {
    if (employeeGreeting) {
        employeeGreeting.textContent = `Personal workspace & professional profile for ${employeeName}`;
    }

    populateEmployeeProfile(employeeName);

    if (tasksContainer) {
        tasksContainer.innerHTML = '<div style="text-align: center; color: #798887; padding: 28px; font-size: 13.5px;">Loading assigned tasks from PHOENIX server...</div>';
    }

    try {
        const response = await fetch(`http://127.0.0.1:5001/tasks/${encodeURIComponent(employeeName)}`);
        const data = await response.json();

        if (response.ok && data.success) {
            allEmployeeTasks = data.tasks || [];
            updateFilterPillCounts(allEmployeeTasks);
            applyTaskFilterAndSearch();
            renderPastDueTasks(allEmployeeTasks);
            renderUpcomingDeadlines(allEmployeeTasks);
            updateKPICounters(allEmployeeTasks);
        } else {
            if (tasksContainer) {
                tasksContainer.innerHTML = `
                    <div style="text-align: center; color: #dc2626; padding: 18px; background: #FEF2F2; border-radius: 8px;">
                        <p style="margin: 0; font-size: 13px;">${escapeHtml(data.message || 'Unable to load tasks.')}</p>
                    </div>
                `;
            }
        }
    } catch (error) {
        if (tasksContainer) {
            tasksContainer.innerHTML = `
                <div style="text-align: center; color: #dc2626; padding: 18px; background: #FEF2F2; border-radius: 8px;">
                    <p style="margin: 0; font-size: 13px;">Unable to reach PHOENIX server. Please ensure backend is running on port 5001.</p>
                </div>
            `;
        }
    }
}

// Task Filtering & Search State
let currentFilter = 'all';
let currentSearchQuery = '';

// Check if a task is due today
function isTaskDueToday(task) {
    const isCompleted = (task.status || '').trim().toLowerCase() === 'completed';
    if (isCompleted) return false;

    const deadlineDate = parseDeadlineDate(task.deadline);
    if (!deadlineDate) return false;

    const now = new Date();
    return deadlineDate.getFullYear() === now.getFullYear() &&
           deadlineDate.getMonth() === now.getMonth() &&
           deadlineDate.getDate() === now.getDate();
}

// Check if a task is upcoming in the future (not completed and not overdue)
function isTaskUpcoming(task) {
    const isCompleted = (task.status || '').trim().toLowerCase() === 'completed';
    if (isCompleted) return false;
    return !isTaskOverdue(task);
}

// Check if a task is active (not completed and not past due)
function isTaskActive(task) {
    const isCompleted = (task.status || '').trim().toLowerCase() === 'completed';
    if (isCompleted) return false;
    return !isTaskOverdue(task);
}

// Set active task filter
function setTaskFilter(filterName) {
    currentFilter = filterName;

    // Update active class on filter tabs
    const filterTabs = document.querySelectorAll('.px-filter-tab');
    filterTabs.forEach(tab => {
        if (tab.getAttribute('data-filter') === filterName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    applyTaskFilterAndSearch();
}

// Handle real-time search typing
function handleTaskSearch(event) {
    currentSearchQuery = (event.target.value || '').trim().toLowerCase();
    
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
        clearBtn.style.display = currentSearchQuery.length > 0 ? 'flex' : 'none';
    }

    applyTaskFilterAndSearch();
}

// Clear search input
function clearTaskSearch() {
    const input = document.getElementById('taskSearchInput');
    if (input) {
        input.value = '';
    }
    currentSearchQuery = '';

    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }

    applyTaskFilterAndSearch();
}

// Reset both search and filter to default
function resetAllFilters() {
    clearTaskSearch();
    setTaskFilter('all');
}

// Smart Task Sorting
function sortTasks(tasks, filterType) {
    return [...tasks].sort((a, b) => {
        const aCompleted = (a.status || '').toLowerCase() === 'completed';
        const bCompleted = (b.status || '').toLowerCase() === 'completed';
        const aOverdue = isTaskOverdue(a);
        const bOverdue = isTaskOverdue(b);
        const aDate = parseDeadlineDate(a.deadline);
        const bDate = parseDeadlineDate(b.deadline);

        if (filterType === 'past_due') {
            // Sort by most overdue first (oldest deadline first)
            if (aDate && bDate) return aDate.getTime() - bDate.getTime();
            return 0;
        }

        if (filterType === 'upcoming') {
            // Sort by nearest deadline first (closest upcoming date)
            if (aDate && bDate) return aDate.getTime() - bDate.getTime();
            if (aDate) return -1;
            if (bDate) return 1;
            return 0;
        }

        // Default 'All' sorting:
        // 1. Past due tasks (incomplete)
        // 2. In Progress tasks
        // 3. Assigned tasks by nearest deadline
        // 4. Completed tasks
        if (aCompleted !== bCompleted) {
            return aCompleted ? 1 : -1; // Completed goes to the bottom
        }

        if (!aCompleted && !bCompleted) {
            if (aOverdue !== bOverdue) {
                return aOverdue ? -1 : 1; // Overdue goes to the very top
            }
            const aInProg = (a.status || '').toLowerCase() === 'in progress';
            const bInProg = (b.status || '').toLowerCase() === 'in progress';
            if (aInProg !== bInProg) {
                return aInProg ? -1 : 1; // In progress precedes assigned
            }
            if (aDate && bDate) {
                return aDate.getTime() - bDate.getTime();
            }
        }

        return 0;
    });
}

// Apply active filter tab + search query simultaneously
function applyTaskFilterAndSearch() {
    if (!tasksContainer) return;

    let filtered = [...allEmployeeTasks];

    // 1. Apply category filter
    if (currentFilter === 'all') {
        // All Tasks = incomplete tasks only (exclude completed)
        filtered = filtered.filter(t => (t.status || '').trim().toLowerCase() !== 'completed');
    } else if (currentFilter === 'upcoming') {
        filtered = filtered.filter(t => isTaskUpcoming(t));
    } else if (currentFilter === 'past_due') {
        filtered = filtered.filter(t => isTaskOverdue(t));
    } else if (currentFilter === 'completed') {
        filtered = filtered.filter(t => (t.status || '').trim().toLowerCase() === 'completed');
    }

    // 2. Apply search query (matches title, manager, deadline, or status)
    if (currentSearchQuery) {
        filtered = filtered.filter(t => {
            const title = (t.task || '').toLowerCase();
            const manager = (t.assigned_by || '').toLowerCase();
            const deadline = (t.deadline || '').toLowerCase();
            const status = (t.status || '').toLowerCase();
            return title.includes(currentSearchQuery) ||
                   manager.includes(currentSearchQuery) ||
                   deadline.includes(currentSearchQuery) ||
                   status.includes(currentSearchQuery);
        });
    }

    // 3. Sort tasks
    filtered = sortTasks(filtered, currentFilter);

    // 4. Render tasks
    renderTasks(filtered);
}

// Update filter tabs counts based on current full task list (4 tabs only)
function updateFilterPillCounts(tasks) {
    // All Tasks = incomplete only
    const countAll = tasks.filter(t => (t.status || '').trim().toLowerCase() !== 'completed').length;
    const countUpcoming = tasks.filter(t => isTaskUpcoming(t)).length;
    const countPastDue = tasks.filter(t => isTaskOverdue(t)).length;
    const countCompleted = tasks.filter(t => (t.status || '').toLowerCase() === 'completed').length;

    const elAll = document.getElementById('countFilterAll');
    const elUpcoming = document.getElementById('countFilterUpcoming');
    const elPastDue = document.getElementById('countFilterPastDue');
    const elCompleted = document.getElementById('countFilterCompleted');

    if (elAll) elAll.textContent = countAll;
    if (elUpcoming) elUpcoming.textContent = countUpcoming;
    if (elPastDue) elPastDue.textContent = countPastDue;
    if (elCompleted) elCompleted.textContent = countCompleted;
}

// Modal State for Completion Confirmation
let pendingStatusChange = null;

function requestStatusChange(taskId, newStatus, prevStatus) {
    if (newStatus === 'Completed' && prevStatus !== 'Completed') {
        const task = allEmployeeTasks.find(t => t.id === taskId);
        pendingStatusChange = { taskId, newStatus, prevStatus };
        
        const modal = document.getElementById('completeConfirmModal');
        const desc = document.getElementById('confirmTaskTitle');
        if (desc && task) {
            desc.textContent = `Are you sure you want to mark "${task.task}" as completed?`;
        }
        if (modal) modal.style.display = 'flex';
        return;
    }

    // Direct update for Assigned <-> In Progress
    applyTaskStatusUpdate(taskId, newStatus, prevStatus);
}

function cancelCompleteModal() {
    const modal = document.getElementById('completeConfirmModal');
    if (modal) modal.style.display = 'none';

    if (pendingStatusChange) {
        // Revert select dropdown to previous status
        const selectEl = document.getElementById(`status-select-${pendingStatusChange.taskId}`);
        if (selectEl) selectEl.value = pendingStatusChange.prevStatus;
        pendingStatusChange = null;
    }
}

function executeCompleteModal() {
    const modal = document.getElementById('completeConfirmModal');
    if (modal) modal.style.display = 'none';

    if (pendingStatusChange) {
        applyTaskStatusUpdate(pendingStatusChange.taskId, pendingStatusChange.newStatus, pendingStatusChange.prevStatus);
        pendingStatusChange = null;
    }
}

// Safe backend call via PATCH /tasks/<task_id>/status
async function applyTaskStatusUpdate(taskId, newStatus, prevStatus) {
    const selectEl = document.getElementById(`status-select-${taskId}`);
    if (selectEl) selectEl.disabled = true;

    let loggedInName = '';
    try {
        const stored = localStorage.getItem('phoenix_user');
        if (stored) {
            const u = JSON.parse(stored);
            if (u && u.name) loggedInName = u.name;
        }
    } catch (e) {}

    try {
        const response = await fetch(`http://127.0.0.1:5001/tasks/${taskId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: newStatus,
                employee_name: loggedInName
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Update local state
            const targetTask = allEmployeeTasks.find(t => t.id === taskId);
            if (targetTask) {
                targetTask.status = newStatus;
            }

            updateFilterPillCounts(allEmployeeTasks);
            applyTaskFilterAndSearch();
            renderPastDueTasks(allEmployeeTasks);
            renderUpcomingDeadlines(allEmployeeTasks);
            updateKPICounters(allEmployeeTasks);
        } else {
            alert(data.message || 'Failed to update task status.');
            if (selectEl) selectEl.value = prevStatus;
        }
    } catch (err) {
        alert('Unable to reach server. Status change reverted.');
        if (selectEl) selectEl.value = prevStatus;
    } finally {
        if (selectEl) selectEl.disabled = false;
    }
}

// Render dynamic task rows for Assigned Tasks section with status selector
function renderTasks(tasks) {
    if (!tasksContainer) return;

    const taskCountBadge = document.getElementById('taskCountBadge');
    if (taskCountBadge) {
        taskCountBadge.textContent = `${tasks.length} ${tasks.length === 1 ? 'Task' : 'Tasks'}`;
    }

    if (tasks.length === 0) {
        let emptyIcon = 'task_alt';
        let emptyTitle = 'No tasks found';
        let emptySub = 'When a Project Manager assigns a new task, it will appear here.';

        if (currentSearchQuery) {
            emptyIcon = 'search_off';
            emptyTitle = `No tasks matching "${escapeHtml(currentSearchQuery)}"`;
            emptySub = 'Try clearing your search or switching to another filter category.';
        } else if (currentFilter === 'past_due') {
            emptyIcon = 'verified';
            emptyTitle = 'No past due tasks';
            emptySub = 'Great work! You are currently up to date with your assignments.';
        } else if (currentFilter === 'upcoming') {
            emptyIcon = 'event_available';
            emptyTitle = 'No upcoming deadlines';
            emptySub = 'You have no future upcoming deliverables scheduled.';
        } else if (currentFilter === 'completed') {
            emptyIcon = 'playlist_add_check';
            emptyTitle = 'No completed tasks yet';
            emptySub = 'Mark tasks as completed when you finish your assignments.';
        }

        tasksContainer.innerHTML = `
            <div class="px-filter-empty-state">
                <span class="material-symbols-outlined px-filter-empty-icon">${emptyIcon}</span>
                <p class="px-filter-empty-title">${emptyTitle}</p>
                <p class="px-filter-empty-sub">${emptySub}</p>
                ${(currentSearchQuery || currentFilter !== 'all') ? '<button type="button" class="px-btn-reset-filter" onclick="resetAllFilters()">Reset Filters</button>' : ''}
            </div>
        `;
        return;
    }

    let html = '';
    tasks.forEach((task, index) => {
        const rawStatus = (task.status || 'Assigned').trim();
        const isCompleted = rawStatus.toLowerCase() === 'completed';
        const isInProgress = rawStatus.toLowerCase() === 'in progress';
        const isOverdue = isTaskOverdue(task);
        const assignedBy = task.assigned_by || 'Prapti Chavan';
        const dateObj = parseDeadlineDate(task.deadline);
        const deadline = formatExactDeadline(dateObj);

        let statusClass = 'status-assigned';
        if (isCompleted) statusClass = 'status-completed';
        else if (isInProgress) statusClass = 'status-inprogress';

        let priorityBadge = '';
        if (isCompleted) {
            priorityBadge = '<span class="px-priority-badge badge-done">Completed</span>';
        } else if (isOverdue) {
            priorityBadge = '<span class="px-priority-badge badge-overdue">Past Due</span>';
        } else if (isInProgress) {
            priorityBadge = '<span class="px-priority-badge badge-inprogress">In Progress</span>';
        } else if (isTaskDueToday(task)) {
            priorityBadge = '<span class="px-priority-badge badge-orange">Due Today</span>';
        } else {
            priorityBadge = '<span class="px-priority-badge badge-blue">Assigned</span>';
        }

        const taskId = task.id || index;

        html += `
            <div class="px-task-row ${isOverdue ? 'row-overdue' : ''}" id="task-row-${taskId}">
                <div class="px-checkbox-box ${isCompleted ? 'checked' : ''}" onclick="toggleTaskStatusDirect(${taskId})" title="Toggle completion">
                    ${isCompleted ? '<span class="material-symbols-outlined">check</span>' : ''}
                </div>

                <div class="px-task-main">
                    <h4 class="px-t-heading ${isCompleted ? 'completed' : ''}">${escapeHtml(task.task)}</h4>
                    <p class="px-t-sub">Assigned by <strong>${escapeHtml(assignedBy)}</strong></p>
                </div>

                <div class="px-task-right-meta">
                    ${priorityBadge}
                    
                    <div class="px-task-time">
                        <span class="material-symbols-outlined">schedule</span>
                        <span>${escapeHtml(deadline)}</span>
                    </div>

                    <!-- Clean Status Selector Dropdown -->
                    <div class="px-status-select-wrap">
                        <select id="status-select-${taskId}" class="px-status-select ${statusClass}" onchange="handleStatusDropdownChange(${taskId}, this.value, '${escapeHtml(rawStatus)}')">
                            <option value="Assigned" ${rawStatus.toLowerCase() === 'assigned' ? 'selected' : ''}>Assigned</option>
                            <option value="In Progress" ${rawStatus.toLowerCase() === 'in progress' ? 'selected' : ''}>In Progress</option>
                            <option value="Completed" ${isCompleted ? 'selected' : ''}>Completed</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    });

    tasksContainer.innerHTML = html;
}

// Dropdown change handler
function handleStatusDropdownChange(taskId, newStatus, prevStatus) {
    requestStatusChange(taskId, newStatus, prevStatus);
}

// Checkbox quick-toggle handler
function toggleTaskStatusDirect(taskId) {
    const task = allEmployeeTasks.find(t => t.id === taskId);
    if (!task) return;

    const currentStatus = (task.status || 'Assigned').trim();
    const newStatus = currentStatus.toLowerCase() === 'completed' ? 'Assigned' : 'Completed';
    requestStatusChange(taskId, newStatus, currentStatus);
}

// Render PAST DUE TASKS section (overdue & not completed for logged-in employee in a compact, elegant list)
function renderPastDueTasks(tasks) {
    if (!pastDueTasksContainer) return;

    const overdueTasks = tasks.filter(t => isTaskOverdue(t));
    const pastDueBadge = document.getElementById('pastDueCountBadge');

    if (pastDueBadge) {
        pastDueBadge.textContent = `${overdueTasks.length} ${overdueTasks.length === 1 ? 'Overdue' : 'Overdue'}`;
    }

    if (overdueTasks.length === 0) {
        pastDueTasksContainer.innerHTML = `
            <div class="px-pd-empty-state">
                <div class="px-pd-empty-icon-wrap">
                    <span class="material-symbols-outlined">check_circle</span>
                </div>
                <div class="px-pd-empty-text">
                    <h5 class="px-pd-empty-title">No overdue tasks</h5>
                    <p class="px-pd-empty-sub">Great work! You are currently up to date with all your deliverables.</p>
                </div>
            </div>
        `;
        return;
    }

    let html = '<div class="px-pd-table-wrap">';
    overdueTasks.forEach((task) => {
        const assignedBy = task.assigned_by || 'Prapti Chavan';
        const deadlineDate = parseDeadlineDate(task.deadline);
        
        let deadlineFormatted = task.deadline || 'Past Due';
        let daysOverdueText = 'Overdue';

        if (deadlineDate) {
            deadlineFormatted = formatExactDeadline(deadlineDate);
            daysOverdueText = getRelativeDeadlineText(deadlineDate);
        }

        html += `
            <div class="px-pd-row">
                <div class="px-pd-row-icon">
                    <span class="material-symbols-outlined">warning</span>
                </div>

                <div class="px-pd-row-main">
                    <h4 class="px-pd-row-title">${escapeHtml(task.task)}</h4>
                    <span class="px-pd-row-assigned">Assigned by: <strong>${escapeHtml(assignedBy)}</strong></span>
                </div>

                <div class="px-pd-row-meta">
                    <div class="px-pd-meta-deadline">
                        <span class="material-symbols-outlined">event_busy</span>
                        <span>${escapeHtml(deadlineFormatted)}</span>
                    </div>
                    <span class="px-pd-overdue-tag">• ${daysOverdueText}</span>
                </div>

                <div class="px-pd-row-badge-wrap">
                    <span class="px-pd-pill-overdue">OVERDUE</span>
                </div>
            </div>
        `;
    });
    html += '</div>';

    pastDueTasksContainer.innerHTML = html;
}

// Render UPCOMING DEADLINES (future deadline + not completed for logged-in employee)
function renderUpcomingDeadlines(tasks) {
    if (!realDeadlinesContainer) return;

    // Filter: not completed AND deadline is in the future
    const upcomingTasks = tasks.filter(t => {
        const isCompleted = (t.status || '').trim().toLowerCase() === 'completed';
        if (isCompleted) return false;
        return !isTaskOverdue(t);
    });

    if (upcomingTasks.length === 0) {
        realDeadlinesContainer.innerHTML = `
            <div class="px-glass-empty-state">
                <span class="material-symbols-outlined px-empty-icon">event_available</span>
                <p class="px-empty-main">No pending future deadlines</p>
                <p class="px-empty-sub">All assigned deliverables are completed or on track.</p>
            </div>
        `;
        return;
    }

    let html = '';
    upcomingTasks.forEach((task, idx) => {
        const deadlineDate = parseDeadlineDate(task.deadline);
        let dateFormatted = task.deadline || 'Pending';
        let daysLeftStr = 'Upcoming';

        if (deadlineDate) {
            dateFormatted = formatExactDeadline(deadlineDate);
            daysLeftStr = getRelativeDeadlineText(deadlineDate);
        }

        const assignedBy = task.assigned_by || 'Prapti Chavan';
        const progressWidth = Math.max(30, 90 - (idx * 18));
        const accentGradient = idx === 0 ? 'gradient-primary' : 'gradient-secondary';

        html += `
            <div class="px-glass-deadline-card ${accentGradient}">
                <div class="px-gdc-header">
                    <div class="px-gdc-title-wrap">
                        <h4 class="px-gdc-title">${escapeHtml(task.task)}</h4>
                        <span class="px-gdc-manager">By ${escapeHtml(assignedBy)}</span>
                    </div>
                    <span class="px-gdc-pill ${idx === 0 ? 'pill-urgent' : 'pill-normal'}">${daysLeftStr}</span>
                </div>

                <div class="px-gdc-footer">
                    <div class="px-gdc-date-box">
                        <span class="material-symbols-outlined">calendar_month</span>
                        <span>${escapeHtml(dateFormatted)}</span>
                    </div>
                    <div class="px-gdc-status-indicator">
                        <span class="px-gdc-dot"></span>
                        <span>On Track</span>
                    </div>
                </div>

                <div class="px-gdc-track">
                    <div class="px-gdc-fill" style="width: ${progressWidth}%;"></div>
                </div>
            </div>
        `;
    });

    realDeadlinesContainer.innerHTML = html;
}

// Update KPI Stats based on real database task records
function updateKPICounters(tasks) {
    const kpiActive = document.getElementById('kpiActiveTasks');
    const kpiDeadlines = document.getElementById('kpiDeadlines');
    const kpiPastDue = document.getElementById('kpiPastDueTasks');
    const kpiCompleted = document.getElementById('kpiCompletedTasks');

    // 1. Active: Not completed
    const totalActive = tasks.filter(t => (t.status || '').toLowerCase() !== 'completed').length;
    
    // 2. Past Due: Overdue + Not completed
    const totalPastDue = tasks.filter(t => isTaskOverdue(t)).length;

    // 3. Upcoming Deadlines: Future + Not completed
    const totalUpcoming = tasks.filter(t => {
        const isCompleted = (t.status || '').toLowerCase() === 'completed';
        return !isCompleted && !isTaskOverdue(t);
    }).length;

    // 4. Completed
    const totalCompleted = tasks.filter(t => (t.status || '').toLowerCase() === 'completed').length;

    if (kpiActive) kpiActive.textContent = totalActive;
    if (kpiDeadlines) kpiDeadlines.textContent = totalUpcoming;
    if (kpiPastDue) kpiPastDue.textContent = totalPastDue;
    if (kpiCompleted) kpiCompleted.textContent = totalCompleted;
}

// Interactive check toggle (client state update)
function toggleTaskStatus(index) {
    if (allEmployeeTasks[index]) {
        const current = (allEmployeeTasks[index].status || 'Assigned').toLowerCase();
        allEmployeeTasks[index].status = current === 'completed' ? 'Assigned' : 'Completed';
        updateFilterPillCounts(allEmployeeTasks);
        applyTaskFilterAndSearch();
        renderPastDueTasks(allEmployeeTasks);
        renderUpcomingDeadlines(allEmployeeTasks);
        updateKPICounters(allEmployeeTasks);
    }
}

// Populate user profile info dynamically based on logged-in user and department
function populateEmployeeProfile(name) {
    const initial = (name || 'S').charAt(0).toUpperCase();

    const empAvatarLetter = document.getElementById('empAvatarLetter');
    const empNameDisplay = document.getElementById('empNameDisplay');
    const empWelcomeHeading = document.getElementById('empWelcomeHeading');

    if (empAvatarLetter) empAvatarLetter.textContent = initial;
    if (empNameDisplay) empNameDisplay.textContent = name;
    if (empWelcomeHeading) empWelcomeHeading.textContent = `${name}'s Workspace`;

    // Read stored user from localStorage (set during /login)
    let department = 'Research & Development';
    let userEmail = 'sanjanachavan2809@gmail.com';

    try {
        const stored = localStorage.getItem('phoenix_user');
        if (stored) {
            const user = JSON.parse(stored);
            if (user.department) department = user.department;
            if (user.email) userEmail = user.email;
        }
    } catch (e) {}

    const empDeptDisplay = document.getElementById('empDeptDisplay');
    const empEmailDisplay = document.getElementById('empEmailDisplay');

    if (empDeptDisplay) empDeptDisplay.textContent = department;
    if (empEmailDisplay) empEmailDisplay.textContent = userEmail;

    const profile = DEPARTMENT_PROFILES[department] || DEPARTMENT_PROFILES['Engineering'];

    const empRoleDisplay = document.getElementById('empRoleDisplay');
    const timelineCurrentRole = document.getElementById('timelineCurrentRole');
    const empAboutPara = document.getElementById('empAboutPara');

    if (empRoleDisplay) empRoleDisplay.textContent = profile.title;
    if (timelineCurrentRole) timelineCurrentRole.textContent = profile.title;
    if (empAboutPara) empAboutPara.textContent = profile.about;

    // Populate Tags
    const tagsContainer = document.getElementById('empPillTags');
    if (tagsContainer && profile.tags) {
        const tagClasses = ['tag-sky', 'tag-peach', 'tag-lilac', 'tag-mint'];
        let tagsHtml = '';
        profile.tags.forEach((tag, idx) => {
            tagsHtml += `<span class="px-tag ${tagClasses[idx % tagClasses.length]}">${escapeHtml(tag)}</span>`;
        });
        tagsContainer.innerHTML = tagsHtml;
    }

    // Populate Skills Matrix
    const skillsGrid = document.getElementById('empSkillsGrid');
    if (skillsGrid && profile.skills) {
        let skillsHtml = '';
        profile.skills.forEach(skill => {
            const pctClass = skill.class === 'fill-gold' ? 'pct-gold' : 'pct-teal';
            skillsHtml += `
                <div class="px-skill-item">
                    <div class="px-skill-top">
                        <span class="px-skill-name">${escapeHtml(skill.name)}</span>
                        <span class="px-skill-pct ${pctClass}">${escapeHtml(skill.pct)}</span>
                    </div>
                    <div class="px-bar-track">
                        <div class="px-bar-fill ${skill.class}" style="width: ${escapeHtml(skill.pct)};"></div>
                    </div>
                </div>
            `;
        });
        skillsGrid.innerHTML = skillsHtml;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initial load on page ready
document.addEventListener('DOMContentLoaded', function() {
    initWorkspaceDate();
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
