// =============================================
// Utilities — Modal, Toast, Helpers
// =============================================

// --- Modal ---
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function hideAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.classList.remove('active');
  });
  document.body.style.overflow = '';
}

// คลิกที่ overlay ปิด modal
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
    document.body.style.overflow = '';
  }
});

// --- Toast Notification ---
let toastTimeout;
function showToast(message, type = 'info') {
  // ลบ toast เดิมถ้ามี
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="flex items-center gap-3">
      <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
      <span>${message}</span>
    </div>
  `;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('show'));

  // Auto-hide after 4 seconds
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// --- Format Helpers ---
function formatCurrency(amount) {
  return parseFloat(amount).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatCountdown(seconds) {
  if (seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- Status Badge ---
function statusBadge(status) {
  const map = {
    available: { text: 'ว่าง', class: 'badge-available' },
    in_use: { text: 'กำลังใช้งาน', class: 'badge-in-use' },
    maintenance: { text: 'ปิดซ่อม', class: 'badge-maintenance' },
    clearing: { text: 'กำลังเคลียร์ข้อมูล', class: 'badge-clearing' },
    pending: { text: 'รอตรวจสอบ', class: 'badge-pending' },
    approved: { text: 'อนุมัติ', class: 'badge-approved' },
    rejected: { text: 'ปฏิเสธ', class: 'badge-rejected' },
    active: { text: 'กำลังเช่า', class: 'badge-in-use' },
    completed: { text: 'เสร็จสิ้น', class: 'badge-approved' }
  };
  const info = map[status] || { text: status, class: '' };
  return `<span class="badge ${info.class}">${info.text}</span>`;
}

// --- Category Label ---
function categoryLabel(cat) {
  return cat === 'gaming'
    ? '<span class="text-pink-400 font-semibold">🎮 สายเกมมิ่ง</span>'
    : '<span class="text-yellow-400 font-semibold">🤖 สายเปิดบอท</span>';
}

// --- Loading State ---
function showLoading(containerId) {
  const el = document.getElementById(containerId);
  if (el) {
    el.innerHTML = `
      <div class="flex flex-col items-center justify-center py-20 gap-4">
        <div class="spinner"></div>
        <p class="text-gray-500 text-sm">กำลังโหลดข้อมูล...</p>
      </div>
    `;
  }
}

function showEmpty(containerId, message = 'ไม่พบข้อมูล') {
  const el = document.getElementById(containerId);
  if (el) {
    el.innerHTML = `
      <div class="text-center py-20 text-gray-500">
        <p class="text-4xl mb-4">📭</p>
        <p>${message}</p>
      </div>
    `;
  }
}

// --- Check Login Required ---
function requireLogin(action) {
  if (!getToken()) {
    showModal('authModal');
    showToast('กรุณาเข้าสู่ระบบก่อนใช้งาน', 'info');
    return false;
  }
  return true;
}

// --- Load and Bind Contact Links ---
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await apiFetch('/api/settings');
    const fbLink = document.getElementById('contact_facebook_link');
    const dcLink = document.getElementById('contact_discord_link');
    if (fbLink && data.facebook_url) {
      fbLink.href = data.facebook_url;
    }
    if (dcLink && data.discord_url) {
      dcLink.href = data.discord_url;
    }
  } catch (err) {
    console.error('Failed to load contact settings:', err);
  }
});
