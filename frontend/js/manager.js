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

    empStats.forEach(stat => {
        const initials = stat.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        
        // Pick dynamic avatar color background class
        const bgColors = ['bg-soft-lavender', 'bg-soft-mint', 'bg-pale-peach', 'bg-powder-blue', 'bg-pale-yellow'];
        const randomColor = bgColors[Math.abs(stat.name.hashCode()) % bgColors.length];

        const rowHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white/40 rounded-xl hover:bg-white/60 transition-colors gap-4">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full ${randomColor} flex items-center justify-center text-primary-container font-headline-card font-bold">${initials}</div>
                    <div>
                        <h4 class="font-headline-card text-headline-card text-on-surface font-semibold">${stat.name}</h4>
                        <div class="flex flex-wrap gap-2 mt-1 font-label-sm text-label-sm text-tertiary">
                            <span>${stat.total} Total</span> • 
                            <span>${stat.completed} Completed</span> • 
                            <span>${stat.active} Active</span>${stat.pastDue > 0 ? ` • <span class="text-error font-medium">${stat.pastDue} Past Due</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="w-full sm:w-48 flex items-center gap-3">
                    <div class="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
                        <div class="h-full bg-deep-teal rounded-full" style="width: ${stat.rate}%;"></div>
                    </div>
                    <span class="font-label-md text-label-md text-deep-teal w-8 font-semibold">${stat.rate}%</span>
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
            <div class="flex flex-col items-center gap-2 group cursor-pointer w-16">
                <div class="w-8 bg-powder-blue rounded-t-md relative transition-all group-hover:opacity-85" style="height: ${totalHeight}%; min-height: 20px;">
                    <div class="absolute bottom-0 w-full bg-deep-teal rounded-t-md" style="height: ${completedRatio}%;"></div>
                </div>
                <span class="font-label-sm text-label-sm text-tertiary truncate w-full text-center" title="${stat.name}">${stat.name.split(' ')[0]}</span>
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
    document.getElementById('donutDoneLegend').textContent = `Done ${donePercent}%`;
    document.getElementById('donutAssignedLegend').textContent = `Assigned ${assignedPercent}%`;
    document.getElementById('donutProgressLegend').textContent = `In Prog ${progressPercent}%`;
    document.getElementById('donutPastDueLegend').textContent = `Past Due ${pastDuePercent}%`;

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
        upcomingContainer.innerHTML = `<div class="text-tertiary text-center py-4">No upcoming deadlines</div>`;
    } else {
        upcomingTasksList.forEach(item => {
            const diffMs = item.date - new Date();
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            let badgeText = `Due in ${diffDays} days`;
            let badgeClass = 'text-secondary bg-secondary-fixed/30';
            
            if (diffDays === 0) {
                badgeText = 'Due today';
                badgeClass = 'text-error bg-error-container/30';
            } else if (diffDays === 1) {
                badgeText = 'Due tomorrow';
            }

            const upcomingHTML = `
                <div class="p-3 bg-white/60 rounded-lg border-l-4 border-secondary-fixed shadow-sm">
                    <h4 class="font-headline-card text-headline-card text-on-surface font-semibold truncate" title="${item.task.task}">${item.task.task}</h4>
                    <div class="flex justify-between items-center mt-2">
                        <span class="font-label-sm text-label-sm text-tertiary">${item.task.employee_name}</span>
                        <span class="font-label-sm text-label-sm px-2 py-0.5 rounded-md ${badgeClass}">${badgeText}</span>
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
        pastDueContainer.parentElement.style.display = 'flex';
        const oldestOverdue = overdueTasksList[0];
        const diffMs = new Date() - oldestOverdue.date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        const remHours = diffHours % 24;
        
        let overdueTimeStr = `${diffDays} days, ${remHours} hours`;
        if (diffDays === 0) {
            overdueTimeStr = `${remHours} hours`;
        }

        pastDueContainer.innerHTML = `
            <h4 class="font-headline-card text-headline-card text-on-surface font-semibold truncate" title="${oldestOverdue.task.task}">${oldestOverdue.task.task}</h4>
            <p class="font-body-sm text-body-sm text-tertiary mt-1">Assignee: ${oldestOverdue.task.employee_name}</p>
            <div class="mt-3 inline-block px-3 py-1 bg-error/10 text-error font-label-md text-label-md rounded-full font-medium">
                Overdue by ${overdueTimeStr}
            </div>
            <button onclick="sendReminder('${oldestOverdue.task.employee_name}', '${oldestOverdue.task.task.replace(/'/g, "\\'")}')" class="mt-4 text-primary font-label-md text-label-md hover:underline w-full text-left font-semibold">Send Reminder →</button>
        `;
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
        addEmpFeedback.className = 'text-sm font-medium mt-2';
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
        addEmpFeedback.className = 'text-sm font-medium mt-2';

        if (!name || !email || !department) {
            addEmpFeedback.textContent = 'Please enter the employee name, Gmail, and department.';
            addEmpFeedback.classList.add('text-error');
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
                addEmpFeedback.classList.add('text-primary-container');

                // Refresh dropdown immediately and select the new employee
                await fetchEmployees(name);

                setTimeout(function () {
                    addEmployeeModal.classList.add('hidden');
                    addEmployeeForm.reset();
                    addEmpFeedback.textContent = '';
                    addEmpFeedback.className = 'text-sm font-medium mt-2';
                }, 1500);
            } else {
                addEmpFeedback.textContent = data.message || 'Failed to add employee.';
                addEmpFeedback.classList.add('text-error');
            }
        } catch (error) {
            addEmpFeedback.textContent = 'Unable to connect to the PHOENIX server. Please make sure the backend is running.';
            addEmpFeedback.classList.add('text-error');
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
    feedbackMessage.className = 'hidden text-sm font-medium mt-2 py-2 px-3 rounded-lg';

    // Validate all fields
    if (!employee || !task || !deadlineDate || !deadlineTime) {
        feedbackMessage.textContent = 'Please fill in all fields.';
        feedbackMessage.classList.add('block', 'bg-error-container/30', 'text-error');
        feedbackMessage.classList.remove('hidden');
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
            feedbackMessage.classList.add('block', 'bg-soft-mint', 'text-primary-container');
            feedbackMessage.classList.remove('hidden');

            // Refresh KPIs & List
            await loadAllTasks();

            // Reset form after delay
            setTimeout(function () {
                document.getElementById('taskForm').reset();
                feedbackMessage.textContent = '';
                feedbackMessage.className = 'hidden text-sm font-medium mt-2 py-2 px-3 rounded-lg';
            }, 4000);
        } else {
            feedbackMessage.textContent = data.message || 'Failed to assign task.';
            feedbackMessage.classList.add('block', 'bg-error-container/30', 'text-error');
            feedbackMessage.classList.remove('hidden');
        }
    } catch (error) {
        feedbackMessage.textContent = 'Unable to connect to the PHOENIX server. Please make sure the backend is running.';
        feedbackMessage.classList.add('block', 'bg-error-container/30', 'text-error');
        feedbackMessage.classList.remove('hidden');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Assign Task <span class="material-symbols-outlined text-[20px]">arrow_forward</span>';
        }
    }
});
