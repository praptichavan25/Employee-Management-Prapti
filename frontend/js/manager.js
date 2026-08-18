const employeeSelect = document.getElementById('employee');
const addEmployeeModal = document.getElementById('addEmployeeModal');
const openAddEmployeeBtn = document.getElementById('openAddEmployeeBtn');
const cancelAddEmployeeBtn = document.getElementById('cancelAddEmployeeBtn');
const addEmployeeForm = document.getElementById('addEmployeeForm');
const addEmpFeedback = document.getElementById('addEmpFeedback');

// Load employees dynamically from backend
async function fetchEmployees(selectedName = '') {
    try {
        const response = await fetch('http://127.0.0.1:5001/employees');
        const data = await response.json();

        if (response.ok && data.success) {
            const employees = data.employees || [];
            employeeSelect.innerHTML = '<option value="">Select Employee</option>';

            employees.forEach(emp => {
                const opt = document.createElement('option');
                opt.value = emp.name;
                opt.textContent = emp.name;
                if (selectedName && emp.name === selectedName) {
                    opt.selected = true;
                }
                employeeSelect.appendChild(opt);
            });
        } else {
            employeeSelect.innerHTML = '<option value="">Error loading employees</option>';
        }
    } catch (e) {
        employeeSelect.innerHTML = '<option value="">Unable to connect to server</option>';
    }
}

// Initial load of employees
document.addEventListener('DOMContentLoaded', function () {
    fetchEmployees();
});

// Modal open/close handlers
if (openAddEmployeeBtn) {
    openAddEmployeeBtn.addEventListener('click', function () {
        addEmpFeedback.textContent = '';
        addEmpFeedback.className = 'manager-feedback';
        addEmployeeForm.reset();
        addEmployeeModal.style.display = 'flex';
    });
}

if (cancelAddEmployeeBtn) {
    cancelAddEmployeeBtn.addEventListener('click', function () {
        addEmployeeModal.style.display = 'none';
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
        addEmpFeedback.className = 'manager-feedback';

        if (!name || !email || !department) {
            addEmpFeedback.textContent = 'Please enter the employee name, Gmail, and department.';
            addEmpFeedback.classList.add('error');
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
                addEmpFeedback.classList.add('success');

                // Refresh dropdown immediately and select the new employee
                await fetchEmployees(name);

                setTimeout(function () {
                    addEmployeeModal.style.display = 'none';
                    addEmployeeForm.reset();
                    addEmpFeedback.textContent = '';
                    addEmpFeedback.className = 'manager-feedback';
                }, 1500);
            } else {
                addEmpFeedback.textContent = data.message || 'Failed to add employee.';
                addEmpFeedback.classList.add('error');
            }
        } catch (error) {
            addEmpFeedback.textContent = 'Unable to connect to the PHOENIX server. Please make sure the backend is running.';
            addEmpFeedback.classList.add('error');
        }
    });
}

// Existing Task Assignment Form Handler
document.getElementById('taskForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const employee = document.getElementById('employee').value.trim();
    const task = document.getElementById('task').value.trim();
    const deadline = document.getElementById('deadline').value;
    const feedbackMessage = document.getElementById('feedbackMessage');
    const statusText = document.getElementById('statusText');
    const submitBtn = document.querySelector('.manager-btn');

    // Clear previous feedback
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'manager-feedback';

    // Validate all fields
    if (!employee || !task || !deadline) {
        feedbackMessage.textContent = 'Please fill in all fields.';
        feedbackMessage.classList.add('error');
        statusText.textContent = '● Ready';
        return;
    }

    // Indicate in-progress state
    statusText.textContent = '● Sending email...';
    if (submitBtn) submitBtn.disabled = true;

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
                deadline: deadline,
                assigned_by: managerName
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            feedbackMessage.textContent = `✓ Task assigned successfully! Email sent to ${employee}.`;
            feedbackMessage.classList.add('success');
            statusText.textContent = '● Task assigned';

            // Reset form after delay
            setTimeout(function () {
                document.getElementById('taskForm').reset();
                feedbackMessage.textContent = '';
                feedbackMessage.className = 'manager-feedback';
                statusText.textContent = '● Ready';
            }, 4000);
        } else {
            feedbackMessage.textContent = data.message || 'Failed to assign task.';
            feedbackMessage.classList.add('error');
            statusText.textContent = '● Error occurred';
        }
    } catch (error) {
        feedbackMessage.textContent = 'Unable to connect to the PHOENIX server. Please make sure the backend is running.';
        feedbackMessage.classList.add('error');
        statusText.textContent = '● Server unreachable';
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
});
