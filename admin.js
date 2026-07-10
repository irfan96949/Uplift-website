const API_URL = "https://uplift-backend-kpwi.onrender.com";
const loginPanel = document.getElementById('login-panel');
const dashboardPanel = document.getElementById('dashboard-panel');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const loginMessage = document.getElementById('login-message');
const formMessage = document.getElementById('admin-form-message');
const homeworkForm = document.getElementById('admin-homework-form');
const homeworkList = document.getElementById('admin-homework-list');
const filters = document.querySelectorAll('.homework-filter');
let activeFilter = 'all';

function formatDate(value) {
  if (!value) return 'No date';
  return new Date(value + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function escapeText(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function showDashboard(show) {
  loginPanel.hidden = show;
  dashboardPanel.hidden = !show;
}

async function checkSession() {
  const response = await fetch(API_URL + '/api/session', {credentials: 'include'});
  const data = await response.json();
  showDashboard(data.loggedIn);
  if (data.loggedIn) loadHomework();
}

async function login() {
  loginMessage.textContent = '';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const response = await fetch(API_URL + '/api/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    loginMessage.textContent = 'Invalid username or password.';
    return;
  }
  showDashboard(true);
  loadHomework();
}

async function logout() {
  await fetch(API_URL + '/api/logout', { method: 'POST',credentials: 'include' });
  showDashboard(false);
}

function renderHomework(items) {
  const visibleItems = activeFilter === 'all' ? items : items.filter(item => item.classGroup === activeFilter);
  if (!visibleItems.length) {
    homeworkList.innerHTML = '<p class="homework-empty">No homework found for this class.</p>';
    return;
  }
  homeworkList.innerHTML = visibleItems.map(item => `
    <article class="homework-card" data-class="${escapeText(item.classGroup)}">
      <div class="homework-card-top">
        <span class="homework-class">${escapeText(item.classLabel)}</span>
        <span class="homework-date">${formatDate(item.givenDate)}</span>
      </div>
      <h3>${escapeText(item.title)}</h3>
      <p>${escapeText(item.details)}</p>
      <div class="homework-meta">
        <span>Subject: ${escapeText(item.subject)}</span>
        <span>Due: ${formatDate(item.dueDate)}</span>
        <span>Status: ${escapeText(item.status || 'New')}</span>
      </div>
      ${item.attachmentUrl ? `<a href="${escapeText(item.attachmentUrl)}" class="homework-link" target="_blank">Open Attachment</a>` : ''}
      <button class="homework-delete" type="button" data-id="${escapeText(item.id)}">Delete</button>
    </article>
  `).join('');
}

async function loadHomework() {
  const response = await fetch(API_URL + '/api/homework', {credentials: 'include'});
  const items = await response.json();
  renderHomework(items);
}

homeworkForm.addEventListener('submit', async event => {
  event.preventDefault();
  formMessage.textContent = 'Uploading...';
  const response = await fetch(API_URL + '/api/homework', {
    method: 'POST',
    credentials: 'include',
    body: new FormData(homeworkForm)
  });
  const data = await response.json();
  if (!response.ok) {
    formMessage.textContent = data.error || 'Upload failed.';
    return;
  }
  homeworkForm.reset();
  formMessage.textContent = 'Homework uploaded successfully.';
  loadHomework();
});

homeworkList.addEventListener('click', async event => {
  const button = event.target.closest('.homework-delete');
  if (!button) return;
  if (!confirm('Delete this homework?')) return;
  await fetch(`${API_URL}/api/homework/${button.dataset.id}`, {
  method: 'DELETE'
});
  loadHomework();
});

filters.forEach(button => {
  button.addEventListener('click', () => {
    filters.forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    activeFilter = button.dataset.class;
    loadHomework();
  });
});

loginButton.addEventListener('click', login);
logoutButton.addEventListener('click', logout);
document.getElementById('login-password').addEventListener('keydown', event => {
  if (event.key === 'Enter') login();
});

checkSession();
