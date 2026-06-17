// =============================================
// Config — API Base URL
// =============================================
const API_BASE = window.location.origin;

// ดึง JWT token จาก localStorage
function getToken() {
  return localStorage.getItem('cyber_token');
}

// บันทึก JWT token
function setToken(token) {
  localStorage.setItem('cyber_token', token);
}

// ลบ JWT token
function removeToken() {
  localStorage.removeItem('cyber_token');
  localStorage.removeItem('cyber_user');
}

// ดึงข้อมูล user จาก localStorage
function getCachedUser() {
  const u = localStorage.getItem('cyber_user');
  return u ? JSON.parse(u) : null;
}

// บันทึกข้อมูล user
function setCachedUser(user) {
  localStorage.setItem('cyber_user', JSON.stringify(user));
}

// API helper — ส่ง request พร้อม auth header
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // ถ้าไม่ใช่ FormData ให้ set Content-Type เป็น JSON
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    if (typeof options.body === 'object') {
      options.body = JSON.stringify(options.body);
    }
  }

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw { status: res.status, ...data };
  }

  return data;
}
