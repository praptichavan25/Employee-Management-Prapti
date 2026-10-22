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
        const response = await fetch(`http://127.0.0.1:5001/tasks/${encodeURIComponent(employeeName)}`, { credentials: 'include' });
        const data = await response.json();

        if (response.ok && data.success) {
            allEmployeeTasks = data.tasks || [];
            updateFilterPillCounts(allEmployeeTasks);
            applyTaskFilterAndSearch();
            renderPastDueTasks(allEmployeeTasks);
            renderUpcomingDeadlines(allEmployeeTasks);
            updateKPICounters(allEmployeeTasks);

            // Populate the standalone Comments & Updates task dropdown with ALL tasks
            populateCuTaskDropdown(allEmployeeTasks);

            // Also load meetings for the employee
            loadMeetings(employeeName);
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

let currentMeetingInterval = null;

async function loadMeetings(employeeName) {
    try {
        const response = await fetch(`http://127.0.0.1:5001/meetings/${encodeURIComponent(employeeName)}`, { credentials: 'include' });
        const data = await response.json();

        if (response.ok && data.success) {
            renderMeeting(data.meetings || []);
        }
    } catch (e) {
        console.error("Failed to load meetings:", e);
    }
}

function renderMeeting(meetings) {
    if (currentMeetingInterval) {
        clearInterval(currentMeetingInterval);
        currentMeetingInterval = null;
    }

    const container = document.getElementById('meetingWidgetContainer');
    const titleEl = document.getElementById('meetingTitle');
    const subEl = document.getElementById('meetingSub');
    const statusBadge = document.getElementById('meetingStatusBadge');
    const detailsBox = document.getElementById('meetingDetailsBox');
    const dateEl = document.getElementById('meetingDate');
    const timeEl = document.getElementById('meetingTime');
    const durEl = document.getElementById('meetingDuration');
    const hostEl = document.getElementById('meetingHost');
    const partEl = document.getElementById('meetingParticipants');
    const descEl = document.getElementById('meetingDescription');
    const addCalEl = document.getElementById('meetingAddToCalendar');
    const joinBtn = document.getElementById('joinMeetingBtn');

    if (!container) return; // not initialized yet or wrong page

    // Filter to only upcoming or currently live meetings
    const now = new Date();
    const activeMeetings = meetings.filter(m => {
        const end = new Date(m.end_time.replace(' ', 'T'));
        return end > now;
    });

    if (activeMeetings.length === 0) {
        // No Meeting
        titleEl.textContent = 'Join Meeting';
        subEl.textContent = 'No upcoming team meeting scheduled';
        statusBadge.style.display = 'none';
        detailsBox.style.display = 'none';
        addCalEl.style.display = 'none';

        joinBtn.style.pointerEvents = 'none';
        joinBtn.style.opacity = '0.5';
        joinBtn.textContent = 'Join Now';
        joinBtn.removeAttribute('href');
        return;
    }

    // Sort by nearest start time
    activeMeetings.sort((a, b) => new Date(a.start_time.replace(' ', 'T')) - new Date(b.start_time.replace(' ', 'T')));
    const nearest = activeMeetings[0];

    const start = new Date(nearest.start_time.replace(' ', 'T'));
    const end = new Date(nearest.end_time.replace(' ', 'T'));

    titleEl.textContent = nearest.title;

    // Set details
    const dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (dateEl) dateEl.textContent = start.toLocaleDateString('en-US', dateOpts);

    timeEl.textContent = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' - ' + end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const diffMins = Math.round((end - start) / 60000);
    durEl.textContent = diffMins >= 60 ? `${(diffMins / 60).toFixed(1)} hrs` : `${diffMins} mins`;

    hostEl.textContent = nearest.host;
    partEl.textContent = nearest.participants_count + (nearest.participants_count === 1 ? ' Participant' : ' Participants');

    if (nearest.description) {
        descEl.textContent = nearest.description;
        descEl.style.display = 'block';
    } else {
        descEl.style.display = 'none';
    }

    detailsBox.style.display = 'flex';

    // Setup Add to Calendar
    addCalEl.href = generateICS(nearest);
    addCalEl.style.display = 'inline-flex';

    // Link
    if (nearest.link) {
        joinBtn.href = nearest.link;
    } else {
        joinBtn.removeAttribute('href');
    }

    // Countdown and Status Loop
    const updateStatus = () => {
        const curr = new Date();

        if (curr >= start && curr <= end) {
            // Live
            subEl.textContent = 'Meeting is currently in progress';
            statusBadge.textContent = '🟢 LIVE NOW';
            statusBadge.style.backgroundColor = '#d1fae5';
            statusBadge.style.color = '#065f46';
            statusBadge.style.display = 'inline-block';

            if (nearest.link) {
                joinBtn.style.pointerEvents = 'auto';
                joinBtn.style.opacity = '1';
                // Highlight Join Now when active
                joinBtn.style.backgroundColor = '#0d9488'; // Teal
                joinBtn.style.color = '#ffffff';
                joinBtn.style.boxShadow = '0 4px 12px rgba(13, 148, 136, 0.3)';
                joinBtn.style.border = 'none';
            }
            joinBtn.textContent = 'Join Now';
        } else if (curr < start) {
            // Upcoming
            statusBadge.style.display = 'none';
            joinBtn.style.pointerEvents = 'none';
            joinBtn.style.opacity = '0.5';

            // Reset button styles
            joinBtn.style.backgroundColor = '';
            joinBtn.style.color = '';
            joinBtn.style.boxShadow = '';
            joinBtn.style.border = '';

            const diff = start - curr;
            const m = Math.floor(diff / 60000);
            const h = Math.floor(m / 60);
            const d = Math.floor(h / 24);

            if (d > 1) {
                subEl.textContent = `Starts in ${d} days`;
            } else if (d === 1) {
                subEl.textContent = `Starts tomorrow`;
            } else if (h > 0) {
                subEl.textContent = `Starts in ${h} hour${h > 1 ? 's' : ''}`;
            } else if (m > 15) {
                subEl.textContent = `Starts in ${m} minutes`;
            } else {
                subEl.textContent = `Starting soon`;
            }
        } else {
            // Ended
            subEl.textContent = 'Meeting Ended';
            statusBadge.style.display = 'none';
            joinBtn.style.pointerEvents = 'none';
            joinBtn.style.opacity = '0.5';

            // Reset button styles
            joinBtn.style.backgroundColor = '';
            joinBtn.style.color = '';
            joinBtn.style.boxShadow = '';
            joinBtn.style.border = '';
            clearInterval(currentMeetingInterval);
        }
    };

    updateStatus();
    currentMeetingInterval = setInterval(updateStatus, 60000); // Check every minute
}

function generateICS(meeting) {
    const start = new Date(meeting.start_time.replace(' ', 'T'));
    const end = new Date(meeting.end_time.replace(' ', 'T'));

    // Format to YYYYMMDDTHHMMSSZ (UTC)
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const icsContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        `DTSTART:${fmt(start)}`,
        `DTEND:${fmt(end)}`,
        `SUMMARY:${meeting.title}`,
        `DESCRIPTION:${meeting.description || ''}`,
        `LOCATION:${meeting.link || ''}`,
        "END:VEVENT",
        "END:VCALENDAR"
    ].join("\n");

    return "data:text/calendar;charset=utf8," + encodeURIComponent(icsContent);
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
let pendingCompleteTaskId = null;
let currentModalTaskId = null;
let currentProgressTaskId = null;
let selectedProgressValue = 0;

function promptCompleteTask(taskId) {
    const task = allEmployeeTasks.find(t => t.id === taskId);
    if (!task) return;

    pendingCompleteTaskId = taskId;
    const modal = document.getElementById('completeConfirmModal');
    const desc = document.getElementById('confirmTaskTitle');
    if (desc) {
        desc.textContent = `Are you sure you want to mark "${task.task}" as completed?`;
    }
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
}

function cancelCompleteModal() {
    const modal = document.getElementById('completeConfirmModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    pendingCompleteTaskId = null;
}

function executeCompleteModal() {
    const modal = document.getElementById('completeConfirmModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    if (pendingCompleteTaskId) {
        applyTaskStatusUpdate(pendingCompleteTaskId, 'Completed');
        pendingCompleteTaskId = null;
    }
}

// ============================================================
// ADD COMMENT MODAL LOGIC
// ============================================================
function openAddCommentModal(taskId) {
    const task = allEmployeeTasks.find(t => t.id === taskId);
    if (!task) return;

    currentModalTaskId = taskId;
    const titleBadge = document.getElementById('empCommentModalTaskTitle');
    const textarea = document.getElementById('empCommentModalTextarea');
    const modal = document.getElementById('empAddCommentModal');

    if (titleBadge) titleBadge.textContent = `Task: ${task.task}`;
    if (textarea) textarea.value = '';

    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
        setTimeout(() => { if (textarea) textarea.focus(); }, 50);
    }
}

function closeAddCommentModal() {
    currentModalTaskId = null;
    const modal = document.getElementById('empAddCommentModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

async function submitEmployeeComment() {
    if (!currentModalTaskId) return;

    const textarea = document.getElementById('empCommentModalTextarea');
    const submitBtn = document.getElementById('empPostCommentSubmitBtn');
    const commentText = textarea ? textarea.value.trim() : '';

    if (!commentText) {
        alert('Please enter a comment before submitting.');
        return;
    }

    const user = getCurrentUser();
    const taskId = currentModalTaskId;

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">hourglass_empty</span> Posting...';
    }

    try {
        const resp = await fetch(`http://127.0.0.1:5001/tasks/${taskId}/comments`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment: commentText,
                user_email: user.email,
                user_name: user.name,
                user_role: user.role || 'employee'
            })
        });

        const data = await resp.json();

        if (resp.ok && data.success) {
            // Update in-memory comment count
            const task = allEmployeeTasks.find(t => t.id === taskId);
            if (task) {
                task.comment_count = (task.comment_count || 0) + 1;
            }

            closeAddCommentModal();

            // Update comment count button text immediately
            const countBtnText = document.getElementById(`task-comment-count-text-${taskId}`);
            if (countBtnText && task) {
                countBtnText.textContent = `${task.comment_count} ${task.comment_count === 1 ? 'Comment' : 'Comments'}`;
            }

            // If inline comments collapsible exists and is open, reload comments immediately
            const coll = document.getElementById(`task-comments-${taskId}`);
            if (coll) {
                if (!coll.classList.contains('open')) {
                    toggleTaskComments(taskId);
                } else {
                    loadInlineTaskComments(taskId);
                }
            }
        } else {
            alert(data.message || 'Failed to post comment.');
        }
    } catch (e) {
        console.error('Error posting comment:', e);
        alert('Unable to connect to server. Please try again.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">send</span> Post Comment';
        }
    }
}

// ============================================================
// UPDATE PROGRESS MODAL LOGIC
// ============================================================
function openUpdateProgressModal(taskId) {
    const task = allEmployeeTasks.find(t => t.id === taskId);
    if (!task) return;

    currentProgressTaskId = taskId;
    const titleBadge = document.getElementById('empProgressModalTaskTitle');
    const modal = document.getElementById('empUpdateProgressModal');

    if (titleBadge) titleBadge.textContent = `Task: ${task.task}`;

    const currentPct = task.progress !== undefined ? parseInt(task.progress) : (task.status === 'Completed' ? 100 : 0);
    selectProgressOption(currentPct);

    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
}

function selectProgressOption(pct) {
    selectedProgressValue = pct;

    const optButtons = document.querySelectorAll('.px-progress-opt-btn');
    optButtons.forEach(btn => {
        const btnProg = parseInt(btn.getAttribute('data-progress'));
        if (btnProg === pct) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const fillBar = document.getElementById('empProgressModalFill');
    const textVal = document.getElementById('empProgressModalValText');

    if (fillBar) fillBar.style.width = `${pct}%`;
    if (textVal) textVal.textContent = `${pct}% Complete`;
}

function closeUpdateProgressModal() {
    currentProgressTaskId = null;
    const modal = document.getElementById('empUpdateProgressModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

async function saveEmployeeProgress() {
    if (!currentProgressTaskId) return;

    const taskId = currentProgressTaskId;
    const saveBtn = document.getElementById('empSaveProgressBtn');
    const user = getCurrentUser();

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">hourglass_empty</span> Saving...';
    }

    try {
        const resp = await fetch(`http://127.0.0.1:5001/tasks/${taskId}/progress`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                progress: selectedProgressValue,
                employee_name: user.name,
                user_email: user.email,
                actor_email: user.email
            })
        });

        const data = await resp.json();

        if (resp.ok && data.success) {
            const task = allEmployeeTasks.find(t => t.id === taskId);
            if (task && data.task) {
                task.progress = data.task.progress;
                task.status = data.task.status;
            }

            closeUpdateProgressModal();

            // Refresh view components immediately without reload
            updateFilterPillCounts(allEmployeeTasks);
            applyTaskFilterAndSearch();
            renderPastDueTasks(allEmployeeTasks);
            renderUpcomingDeadlines(allEmployeeTasks);
            updateKPICounters(allEmployeeTasks);
            populateCuTaskDropdown(allEmployeeTasks);
        } else {
            alert(data.message || 'Failed to update task progress.');
        }
    } catch (e) {
        console.error('Error updating progress:', e);
        alert('Network error while saving progress.');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">check</span> Save Progress';
        }
    }
}

// ============================================================
// INLINE TASK COMMENTS TOGGLE & DISPLAY
// ============================================================
async function toggleTaskComments(taskId) {
    const coll = document.getElementById(`task-comments-${taskId}`);
    const caret = document.getElementById(`comment-caret-${taskId}`);
    if (!coll) return;

    const isOpen = coll.classList.contains('open');
    if (isOpen) {
        coll.classList.remove('open');
        if (caret) caret.style.transform = 'rotate(0deg)';
    } else {
        coll.classList.add('open');
        if (caret) caret.style.transform = 'rotate(180deg)';
        loadInlineTaskComments(taskId);
    }
}

async function loadInlineTaskComments(taskId) {
    const listEl = document.getElementById(`task-comments-list-${taskId}`);
    if (!listEl) return;

    listEl.innerHTML = '<div style="text-align:center; padding:10px; color:#94A3B8; font-size:12px;">Loading comments...</div>';

    const user = getCurrentUser();

    try {
        const resp = await fetch(`http://127.0.0.1:5001/tasks/${taskId}/comments?user_email=${encodeURIComponent(user.email)}`, { credentials: 'include' });
        const data = await resp.json();

        if (resp.ok && data.success) {
            const comments = data.comments || [];
            const task = allEmployeeTasks.find(t => t.id === taskId);
            if (task) task.comment_count = comments.length;

            const countBtnText = document.getElementById(`task-comment-count-text-${taskId}`);
            if (countBtnText) {
                countBtnText.textContent = `${comments.length} ${comments.length === 1 ? 'Comment' : 'Comments'}`;
            }

            if (comments.length === 0) {
                listEl.innerHTML = '<div class="px-task-comments-empty">No comments on this task yet. Click "Add Comment" to start the conversation.</div>';
                return;
            }

            listEl.innerHTML = comments.map(c => {
                const role = (c.user_role || '').toLowerCase() === 'project_manager' ? 'Project Manager' : 'Employee';
                const roleClass = (c.user_role || '').toLowerCase() === 'project_manager' ? 'pm' : '';
                const relativeTime = formatTimestamp(c.created_at);

                return `
                    <div class="px-task-comment-card">
                        <div class="px-task-comment-card-top">
                            <div class="px-task-comment-author-group">
                                <span class="px-task-comment-author">${escapeHtml(c.user_name)}</span>
                                <span class="px-task-comment-role-tag ${roleClass}">${role}</span>
                            </div>
                            <span class="px-task-comment-timestamp">${escapeHtml(relativeTime)}</span>
                        </div>
                        <div class="px-task-comment-body">"${escapeHtml(c.comment)}"</div>
                    </div>
                `;
            }).join('');
        } else {
            listEl.innerHTML = `<div class="px-task-comments-empty" style="color:#E11D48;">${escapeHtml(data.message || 'Error loading comments')}</div>`;
        }
    } catch (e) {
        listEl.innerHTML = '<div class="px-task-comments-empty" style="color:#E11D48;">Network error loading comments</div>';
    }
}

// Safe backend call via PATCH /tasks/<task_id>/status
async function applyTaskStatusUpdate(taskId, newStatus) {
    let loggedInName = '';
    let loggedInEmail = '';
    try {
        const stored = localStorage.getItem('phoenix_user');
        if (stored) {
            const u = JSON.parse(stored);
            if (u && u.name) loggedInName = u.name;
            if (u && u.email) loggedInEmail = u.email;
        }
    } catch (e) { }

    try {
        const response = await fetch(`http://127.0.0.1:5001/tasks/${taskId}/status`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: newStatus,
                employee_name: loggedInName,
                actor_email: loggedInEmail,
                user_email: loggedInEmail
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Update local state
            const targetTask = allEmployeeTasks.find(t => t.id === taskId);
            if (targetTask) {
                targetTask.status = newStatus;
                if (newStatus === 'Completed') {
                    targetTask.progress = 100;
                }
            }

            updateFilterPillCounts(allEmployeeTasks);
            applyTaskFilterAndSearch();
            renderPastDueTasks(allEmployeeTasks);
            renderUpcomingDeadlines(allEmployeeTasks);
            updateKPICounters(allEmployeeTasks);
            populateCuTaskDropdown(allEmployeeTasks);
        } else {
            alert(data.message || 'Failed to update task status.');
        }
    } catch (err) {
        alert('Unable to reach server. Status change failed.');
    }
}

// ============================================================
// RENDER INTERACTIVE TASK WORKSPACE CARDS
// ============================================================
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
        const deadlineFormatted = formatExactDeadline(dateObj);
        const relativeDeadline = getRelativeDeadlineText(dateObj);
        const progress = task.progress !== undefined ? parseInt(task.progress) : (isCompleted ? 100 : 0);
        const commentCount = task.comment_count !== undefined ? parseInt(task.comment_count) : 0;
        const taskId = task.id || index;

        // Status styling
        let statusBadgeClass = 'px-status-assigned';
        let statusLabel = 'Assigned';
        if (isCompleted) {
            statusBadgeClass = 'px-status-completed';
            statusLabel = 'Completed';
        } else if (isInProgress) {
            statusBadgeClass = 'px-status-inprogress';
            statusLabel = 'In Progress';
        }

        // Indicator
        let indicatorHtml = '';
        if (isCompleted) {
            indicatorHtml = `
                <span class="px-task-ws-due-badge completed">
                    <span class="material-symbols-outlined" style="font-size:13px;">check_circle</span>
                    Completed
                </span>
            `;
        } else if (isOverdue) {
            indicatorHtml = `
                <span class="px-task-ws-due-badge overdue">
                    <span class="material-symbols-outlined" style="font-size:13px;">error</span>
                    Past Due
                </span>
            `;
        } else {
            indicatorHtml = `
                <span class="px-task-ws-due-badge upcoming">
                    <span class="material-symbols-outlined" style="font-size:13px;">schedule</span>
                    Upcoming
                </span>
            `;
        }

        html += `
            <div class="px-task-workspace-card ${isOverdue ? 'card-overdue' : ''} ${isCompleted ? 'card-completed' : ''}" id="task-card-${taskId}">
                <!-- Top Row: Title & Status Badge -->
                <div class="px-task-card-top">
                    <div class="px-task-title-wrap">
                        <h4 class="px-task-card-title ${isCompleted ? 'completed' : ''}" title="${escapeHtml(task.task)}">${escapeHtml(task.task)}</h4>
                        <p class="px-task-card-assigned">Assigned by <strong>${escapeHtml(assignedBy)}</strong></p>
                    </div>
                    <span class="px-task-status-pill ${statusBadgeClass}">${statusLabel}</span>
                </div>

                <!-- Bottom Row: Deadline & Indicator (Left) + Progress & Compact Actions (Right) -->
                <div class="px-task-card-bottom">
                    <div class="px-task-due-wrap">
                        ${indicatorHtml}
                        <span class="px-task-exact-deadline">${escapeHtml(deadlineFormatted)}</span>
                        ${relativeDeadline ? `<span class="px-task-ws-relative-text">• ${escapeHtml(relativeDeadline)}</span>` : ''}
                    </div>

                    <div class="px-task-meta-right">
                        <!-- Progress bar & pct -->
                        <div class="px-task-mini-prog" title="Progress: ${progress}%">
                            <div class="px-task-mini-prog-label">
                                <span>Progress</span>
                                <strong id="task-prog-text-${taskId}">${progress}%</strong>
                            </div>
                            <div class="px-task-mini-prog-track">
                                <div class="px-task-mini-prog-fill ${progress === 100 ? 'fill-complete' : ''}" id="task-prog-fill-${taskId}" style="width: ${progress}%;"></div>
                            </div>
                        </div>

                        <!-- Compact Actions (Update Progress & Mark Complete) -->
                        <div class="px-task-mini-actions">
                            <button type="button" class="px-btn-mini-action" onclick="openUpdateProgressModal(${taskId})" title="Update task progress">
                                <span class="material-symbols-outlined" style="font-size: 13px;">trending_up</span>
                                <span>Update Progress</span>
                            </button>
                            ${isCompleted ? `
                                <span class="px-badge-mini-done" title="Task Completed">
                                    <span class="material-symbols-outlined" style="font-size: 13px;">check_circle</span>
                                    <span>Completed</span>
                                </span>
                            ` : `
                                <button type="button" class="px-btn-mini-complete" onclick="promptCompleteTask(${taskId})" title="Mark task as complete">
                                    <span class="material-symbols-outlined" style="font-size: 13px;">check_circle</span>
                                    <span>Mark Complete</span>
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    tasksContainer.innerHTML = html;
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

                <div class="px-pd-row-main" onclick="openTaskDetails(${task.id})" style="cursor:pointer;" title="Click to view task details">
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
    } catch (e) { }

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

// ============================================================
// STANDALONE COMMENTS & UPDATES SECTION LOGIC
// ============================================================

let cuToastTimer = null;

/**
 * Show a toast notification at the bottom of the page.
 * @param {string} message - The message to display.
 * @param {'success'|'error'|'warning'} type - The type of toast.
 * @param {number} duration - How long to show in ms (default 3500).
 */
function showCuToast(message, type, duration) {
    duration = duration || 3500;
    const toast = document.getElementById('cuToast');
    if (!toast) return;
    if (cuToastTimer) clearTimeout(cuToastTimer);

    toast.textContent = message;
    toast.className = 'px-cu-toast toast-' + type;
    toast.style.display = 'block';

    // Force reflow before adding show class for transition
    void toast.offsetWidth;
    toast.classList.add('show');

    cuToastTimer = setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () {
            toast.style.display = 'none';
        }, 350);
    }, duration);
}

/**
 * Populate the Comments & Updates task dropdown with ALL tasks (not filtered by status).
 * @param {Array} tasks - Array of task objects from allEmployeeTasks.
 */
function populateCuTaskDropdown(tasks) {
    const select = document.getElementById('cuTaskSelect');
    if (!select) return;

    // Preserve current selection if any
    const currentVal = select.value;

    // Clear all options except the placeholder
    select.innerHTML = '<option value="">-- Select a task --</option>';

    if (!tasks || tasks.length === 0) return;

    tasks.forEach(function (task) {
        const option = document.createElement('option');
        option.value = task.id;
        // Truncate long task names for the dropdown display
        const taskName = task.task.length > 60 ? task.task.substring(0, 57) + '...' : task.task;
        option.textContent = taskName;
        select.appendChild(option);
    });

    // Restore previous selection if it still exists
    if (currentVal) {
        const optionExists = Array.from(select.options).some(function (opt) {
            return opt.value === currentVal;
        });
        if (optionExists) {
            select.value = currentVal;
        }
    }
}

/**
 * Handle task selection change in the Comments & Updates dropdown.
 * Loads recent comments for the selected task.
 */
function handleCuTaskChange() {
    const select = document.getElementById('cuTaskSelect');
    const taskId = select ? select.value : '';

    if (taskId) {
        loadCuRecentComments(parseInt(taskId, 10));
    } else {
        // No task selected — show placeholder
        const listEl = document.getElementById('cuRecentCommentsList');
        const countEl = document.getElementById('cuRecentCount');
        if (listEl) {
            listEl.innerHTML = '<div class="px-cu-empty-comments">Select a task above to view its recent comments.</div>';
        }
        if (countEl) countEl.textContent = '0';
    }
}

/**
 * Fetch and render recent comments for a specific task in the Comments & Updates section.
 * @param {number} taskId - The task ID to fetch comments for.
 */
async function loadCuRecentComments(taskId) {
    const listEl = document.getElementById('cuRecentCommentsList');
    const countEl = document.getElementById('cuRecentCount');
    if (!listEl) return;

    listEl.innerHTML = '<div style="text-align:center; padding:12px; color:#94A3B8; font-size:12px;">Loading comments...</div>';

    const user = getCurrentUser();

    try {
        const resp = await fetch(
            'http://127.0.0.1:5001/tasks/' + taskId + '/comments?user_email=' + encodeURIComponent(user.email),
            { credentials: 'include' }
        );
        const data = await resp.json();

        if (resp.ok && data.success) {
            const comments = data.comments || [];

            if (countEl) countEl.textContent = comments.length;

            // Also update in-memory comment_count
            const task = allEmployeeTasks.find(function (t) { return t.id === taskId; });
            if (task) task.comment_count = comments.length;

            if (comments.length === 0) {
                listEl.innerHTML = '<div class="px-cu-empty-comments">No comments yet for this task.</div>';
                return;
            }

            // Show most recent comments first (reverse chronological)
            var reversed = comments.slice().reverse();

            listEl.innerHTML = reversed.map(function (c) {
                var roleLbl = c.user_role === 'manager' ? 'Project Manager' : 'Employee';
                var timeStr = formatTimestamp(c.created_at);
                return (
                    '<div class="px-cu-comment-card">' +
                        '<div class="px-cu-comment-top">' +
                            '<span class="px-cu-author-role">' + escapeHtml(c.user_name) + ' <span class="px-cu-role-sub">· ' + roleLbl + '</span></span>' +
                            '<span class="px-cu-time">' + escapeHtml(timeStr) + '</span>' +
                        '</div>' +
                        '<div class="px-cu-comment-text">' + escapeHtml(c.comment) + '</div>' +
                    '</div>'
                );
            }).join('');
        } else {
            listEl.innerHTML = '<div class="px-cu-empty-comments">Unable to load comments.</div>';
            if (countEl) countEl.textContent = '0';
        }
    } catch (err) {
        console.error('Error loading standalone comments:', err);
        listEl.innerHTML = '<div class="px-cu-empty-comments">Unable to reach server.</div>';
        if (countEl) countEl.textContent = '0';
    }
}

/**
 * Submit a comment from the standalone Comments & Updates section.
 * Validates inputs, POSTs to backend, and refreshes the recent comments list.
 */
async function submitStandaloneComment() {
    var select = document.getElementById('cuTaskSelect');
    var textarea = document.getElementById('cuCommentInput');
    var submitBtn = document.getElementById('cuAddCommentBtn');
    var taskId = select ? select.value : '';
    var commentText = textarea ? textarea.value.trim() : '';

    // Validation
    if (!taskId) {
        showCuToast('Please select a task before adding a comment.', 'warning');
        if (select) select.focus();
        return;
    }

    if (!commentText) {
        showCuToast('Please enter a comment before sending.', 'warning');
        if (textarea) textarea.focus();
        return;
    }

    var user = getCurrentUser();

    // Disable button while submitting
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">hourglass_top</span> <span>Sending...</span>';
    }

    try {
        var resp = await fetch('http://127.0.0.1:5001/tasks/' + parseInt(taskId, 10) + '/comments', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment: commentText,
                user_email: user.email,
                user_name: user.name
            })
        });

        var data = await resp.json();

        if (resp.ok && data.success) {
            showCuToast('✓ Comment added successfully.', 'success');

            // Clear textarea but keep the task selected
            if (textarea) textarea.value = '';

            // Update in-memory comment count
            var task = allEmployeeTasks.find(function (t) { return t.id === parseInt(taskId, 10); });
            if (task) task.comment_count = (task.comment_count || 0) + 1;

            // Update inline comment count button if visible
            var countBtnText = document.getElementById('task-comment-count-text-' + taskId);
            if (countBtnText && task) {
                countBtnText.textContent = task.comment_count + ' ' + (task.comment_count === 1 ? 'Comment' : 'Comments');
            }

            // Refresh the Recent Comments section
            loadCuRecentComments(parseInt(taskId, 10));

            // Also refresh inline comments if they're open
            var coll = document.getElementById('task-comments-' + taskId);
            if (coll && coll.style.display !== 'none') {
                loadInlineTaskComments(parseInt(taskId, 10));
            }
        } else {
            showCuToast(data.message || 'Unable to add comment. Please try again.', 'error');
        }
    } catch (err) {
        console.error('Error submitting standalone comment:', err);
        showCuToast('Unable to add comment. Please try again.', 'error');
    } finally {
        // Re-enable button
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">send</span> <span>Add Comment</span>';
        }
    }
}

// Initial load on page ready
document.addEventListener('DOMContentLoaded', function () {
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

    // Wire up standalone Comments & Updates section event listeners
    const cuTaskSelect = document.getElementById('cuTaskSelect');
    const cuAddCommentBtn = document.getElementById('cuAddCommentBtn');

    if (cuTaskSelect) {
        cuTaskSelect.addEventListener('change', handleCuTaskChange);
    }
    if (cuAddCommentBtn) {
        cuAddCommentBtn.addEventListener('click', submitStandaloneComment);
    }
});


// ============================================================
// PHOENIX - TASK DETAILS DRAWER & COMMENTS / ACTIVITY ENGINE (EMPLOYEE)
// ============================================================

let currentDrawerTaskId = null;
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
        name: 'Sanjana Chavan',
        email: 'sanjanachavan2809@gmail.com',
        role: 'employee',
        department: 'Research & Development'
    };
}

// Open Task Details Drawer
async function openTaskDetails(taskId) {
    if (!taskId) return;
    currentDrawerTaskId = taskId;

    const backdrop = document.getElementById('pxDrawerBackdrop');
    const drawer = document.getElementById('pxTaskDrawer');
    if (!drawer || !backdrop) return;

    backdrop.classList.add('active');
    drawer.classList.add('active');

    document.getElementById('pxDrawerTitle').textContent = 'Loading task...';
    document.getElementById('pxDrawerAssignee').textContent = '...';
    document.getElementById('pxDrawerAssignedBy').textContent = '...';
    document.getElementById('pxDrawerDeadline').textContent = '...';
    document.getElementById('pxDrawerDescription').textContent = 'Loading description...';
    document.getElementById('pxDrawerCommentsList').innerHTML = '<div style="text-align:center; padding:16px; color:#94A3B8; font-size:13px;">Loading comments...</div>';
    document.getElementById('pxDrawerActivityTimeline').innerHTML = '<div style="text-align:center; padding:16px; color:#94A3B8; font-size:13px;">Loading activity timeline...</div>';

    const user = getCurrentUser();

    try {
        const resp = await fetch(`http://127.0.0.1:5001/tasks/id/${taskId}?user_email=${encodeURIComponent(user.email)}`, { credentials: 'include' });
        const data = await resp.json();

        if (resp.ok && data.success && data.task) {
            const t = data.task;
            document.getElementById('pxDrawerTitle').textContent = t.task || 'Untitled Task';
            document.getElementById('pxDrawerAssignee').textContent = t.employee_name || 'Unassigned';
            document.getElementById('pxDrawerAssignedBy').textContent = t.assigned_by || 'Prapti Chavan';
            document.getElementById('pxDrawerDescription').textContent = t.task || 'No detailed description provided.';

            let formattedDeadline = t.deadline;
            if (t.deadline) {
                const dt = parseDeadlineDate(t.deadline);
                if (dt && !isNaN(dt)) {
                    formattedDeadline = dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' +
                                        dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST';
                }
            }
            document.getElementById('pxDrawerDeadline').textContent = formattedDeadline;

            const priority = (t.priority || 'High').toUpperCase();
            const rawStatus = (t.status || 'Assigned').trim();
            const isOverdue = isTaskOverdue(t);

            const prioBadge = document.getElementById('pxDrawerPriorityBadge');
            prioBadge.textContent = priority;
            prioBadge.className = `px-badge-tag ${priority === 'HIGH' ? 'px-badge-high' : priority === 'MEDIUM' ? 'px-badge-medium' : 'px-badge-low'}`;

            const statusBadge = document.getElementById('pxDrawerStatusBadge');
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
        } else {
            document.getElementById('pxDrawerTitle').textContent = 'Task Not Found or Unauthorized';
        }
    } catch (e) {
        console.error('Error fetching task details:', e);
    }

    await Promise.all([
        loadTaskComments(taskId),
        loadTaskActivity(taskId)
    ]);
}

// Close Drawer
function closeTaskDetails() {
    currentDrawerTaskId = null;
    const backdrop = document.getElementById('pxDrawerBackdrop');
    const drawer = document.getElementById('pxTaskDrawer');
    if (backdrop) backdrop.classList.remove('active');
    if (drawer) drawer.classList.remove('active');
}

// Load Task Comments
async function loadTaskComments(taskId) {
    const listEl = document.getElementById('pxDrawerCommentsList');
    const countEl = document.getElementById('pxDrawerCommentsCount');
    if (!listEl) return;

    const user = getCurrentUser();

    try {
        const resp = await fetch(`http://127.0.0.1:5001/tasks/${taskId}/comments?user_email=${encodeURIComponent(user.email)}`, { credentials: 'include' });
        const data = await resp.json();

        if (resp.ok && data.success) {
            const comments = data.comments || [];
            if (countEl) countEl.textContent = comments.length;

            if (comments.length === 0) {
                listEl.innerHTML = '<div style="text-align:center; padding:16px; color:#94A3B8; font-size:13px;">No comments yet. Be the first to write a comment!</div>';
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
                                            <button type="button" class="px-comment-menu-btn" onclick="toggleCommentMenu(${c.id}, event)">•••</button>
                                            <div id="comment-dropdown-${c.id}" class="px-comment-dropdown">
                                                <button type="button" class="px-comment-dropdown-item" onclick="startEditComment(${c.id}, '${escapeHtml(c.comment).replace(/'/g, "\\'")}')">
                                                    <span class="material-symbols-outlined" style="font-size:14px;">edit</span> Edit
                                                </button>
                                                <button type="button" class="px-comment-dropdown-item delete" onclick="promptDeleteComment(${c.id})">
                                                    <span class="material-symbols-outlined" style="font-size:14px;">delete</span> Delete
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
            listEl.innerHTML = `<div style="text-align:center; padding:12px; color:#E11D48; font-size:13px;">${escapeHtml(data.message || 'Failed to load comments')}</div>`;
        }
    } catch (e) {
        console.error('Error loading comments:', e);
        listEl.innerHTML = '<div style="text-align:center; padding:12px; color:#E11D48; font-size:13px;">Error loading comments</div>';
    }
}

// Load Task Activity
async function loadTaskActivity(taskId) {
    const timelineEl = document.getElementById('pxDrawerActivityTimeline');
    if (!timelineEl) return;

    const user = getCurrentUser();

    try {
        const resp = await fetch(`http://127.0.0.1:5001/tasks/${taskId}/activity?user_email=${encodeURIComponent(user.email)}`, { credentials: 'include' });
        const data = await resp.json();

        if (resp.ok && data.success) {
            const activities = data.activity || [];
            if (activities.length === 0) {
                timelineEl.innerHTML = '<div style="text-align:center; padding:16px; color:#94A3B8; font-size:13px;">No recorded activity history yet.</div>';
                return;
            }

            timelineEl.innerHTML = activities.map(a => {
                const timeFormatted = formatTimestamp(a.created_at);
                return `
                    <div class="px-activity-item">
                        <div class="px-activity-dot"></div>
                        <div class="px-activity-desc">${escapeHtml(a.activity_description)}</div>
                        <div class="px-activity-time">${timeFormatted}</div>
                    </div>
                `;
            }).join('');
        } else {
            timelineEl.innerHTML = '<div style="text-align:center; padding:12px; color:#94A3B8; font-size:13px;">No activity available</div>';
        }
    } catch (e) {
        console.error('Error loading task activity:', e);
    }
}

// Send Comment
async function submitComment() {
    if (!currentDrawerTaskId) return;

    const input = document.getElementById('pxNewCommentInput');
    const sendBtn = document.getElementById('pxSendCommentBtn');
    const text = input ? input.value.trim() : '';

    if (!text) return;

    const user = getCurrentUser();
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">hourglass_empty</span> Sending...';
    }

    try {
        const resp = await fetch(`http://127.0.0.1:5001/tasks/${currentDrawerTaskId}/comments`, {
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
            await loadTaskComments(currentDrawerTaskId);
            await loadTaskActivity(currentDrawerTaskId);
        } else {
            alert(data.message || 'Failed to submit comment.');
        }
    } catch (e) {
        alert('Network error while posting comment.');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">send</span> Send';
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
                <button type="button" class="px-btn-send-comment" onclick="saveEditComment(${commentId})">Save</button>
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
        const resp = await fetch(`http://127.0.0.1:5001/tasks/${currentDrawerTaskId}/comments/${commentId}`, {
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
            await loadTaskComments(currentDrawerTaskId);
            await loadTaskActivity(currentDrawerTaskId);
        } else {
            alert(data.message || 'Failed to update comment.');
        }
    } catch (e) {
        alert('Network error updating comment.');
    }
}

// Delete Comment Confirmation
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
    if (!pendingCommentIdToDelete || !currentDrawerTaskId) return;

    const commentId = pendingCommentIdToDelete;
    const user = getCurrentUser();

    try {
        const resp = await fetch(`http://127.0.0.1:5001/tasks/${currentDrawerTaskId}/comments/${commentId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_email: user.email })
        });

        const data = await resp.json();
        cancelDeleteComment();

        if (resp.ok && data.success) {
            await loadTaskComments(currentDrawerTaskId);
            await loadTaskActivity(currentDrawerTaskId);
        } else {
            alert(data.message || 'Failed to delete comment.');
        }
    } catch (e) {
        cancelDeleteComment();
        alert('Network error deleting comment.');
    }
}

// Utility Helpers
function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
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

// Bind Global Drawer Event Listeners once DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    const backdrop = document.getElementById('pxDrawerBackdrop');
    const closeBtn = document.getElementById('pxCloseDrawerBtn');
    const sendBtn = document.getElementById('pxSendCommentBtn');
    const commentInput = document.getElementById('pxNewCommentInput');
    const cancelDelBtn = document.getElementById('pxCancelDeleteCommentBtn');
    const confirmDelBtn = document.getElementById('pxConfirmDeleteCommentBtn');

    if (backdrop) backdrop.addEventListener('click', closeTaskDetails);
    if (closeBtn) closeBtn.addEventListener('click', closeTaskDetails);
    if (sendBtn) sendBtn.addEventListener('click', submitComment);
    if (cancelDelBtn) cancelDelBtn.addEventListener('click', cancelDeleteComment);
    if (confirmDelBtn) confirmDelBtn.addEventListener('click', confirmDeleteComment);

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
