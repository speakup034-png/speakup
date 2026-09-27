// Small fetch wrapper shared by every page. Attaches the JWT and normalizes errors.
const API_BASE = '/api';

function getToken() { return localStorage.getItem('speakup_token'); }
function setToken(t) { localStorage.setItem('speakup_token', t); }
function clearToken() { localStorage.removeItem('speakup_token'); }

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) {
    const err = new Error(data.error?.message || 'Something went wrong');
    err.code = data.error?.code;
    throw err;
  }
  return data.data ?? data;
}

function showToast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function requireLogin() {
  if (!getToken()) window.location.href = '/login.html';
}
