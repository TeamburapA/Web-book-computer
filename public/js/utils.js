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

// --- Tuya Power Badge ---
function tuyaPowerBadge(powerState) {
  if (powerState === true) {
    return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 backdrop-blur-md flex items-center gap-1 shadow-sm font-mono"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>⚡ เครื่องเปิดอยู่</span>`;
  }
  if (powerState === false) {
    return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-300 border border-red-500/40 backdrop-blur-md flex items-center gap-1 shadow-sm font-mono"><span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>🔌 เครื่องปิดอยู่</span>`;
  }
  return '';
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

// --- Display Pricing Savings Tips ---
function updateSavingsTips(machine, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isDailyAllowed = machine.allow_daily !== false && machine.allow_daily !== 'false' && machine.allow_daily !== 0 && machine.allow_daily !== '0';
  const isWeeklyAllowed = machine.allow_weekly !== false && machine.allow_weekly !== 'false' && machine.allow_weekly !== 0 && machine.allow_weekly !== '0';
  const isMonthlyAllowed = machine.allow_monthly !== false && machine.allow_monthly !== 'false' && machine.allow_monthly !== 0 && machine.allow_monthly !== '0';

  let tips = [];

  if (isDailyAllowed) {
    const pricePerDay = parseFloat(machine.price_per_day);
    if (pricePerDay > 0) {
      if (isWeeklyAllowed) {
        const pricePerWeek = parseFloat(machine.price_per_week);
        const normalWeeklyPrice = pricePerDay * 7;
        const actualWeeklyPrice = pricePerWeek > 0 ? pricePerWeek : normalWeeklyPrice;
        if (actualWeeklyPrice < normalWeeklyPrice) {
          const pct = Math.round((1 - (actualWeeklyPrice / normalWeeklyPrice)) * 100);
          const saved = normalWeeklyPrice - actualWeeklyPrice;
          tips.push(`
            <div class="flex items-center justify-between p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
              <div class="flex items-center gap-2">
                <span class="text-emerald-400 font-bold text-sm">⚡</span>
                <span class="text-zinc-300 font-semibold">รายสัปดาห์ (ประหยัดกว่ารายวัน)</span>
              </div>
              <div class="text-right flex flex-col items-end gap-1">
                <span class="px-2 py-0.5 text-[10px] font-black bg-emerald-500 text-black rounded font-mono shadow-[0_0_8px_rgba(16,185,129,0.4)]">ประหยัด ${pct}%</span>
                <p class="text-[10px] text-yellow-400 font-bold font-mono">เซฟได้ ฿${formatCurrency(saved).split('.')[0]}</p>
              </div>
            </div>
          `);
        }
      }
      if (isMonthlyAllowed) {
        const pricePerMonth = parseFloat(machine.price_per_month);
        const normalMonthlyPrice = pricePerDay * 30;
        const actualMonthlyPrice = pricePerMonth > 0 ? pricePerMonth : normalMonthlyPrice;
        if (actualMonthlyPrice < normalMonthlyPrice) {
          const pct = Math.round((1 - (actualMonthlyPrice / normalMonthlyPrice)) * 100);
          const saved = normalMonthlyPrice - actualMonthlyPrice;
          tips.push(`
            <div class="flex items-center justify-between p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
              <div class="flex items-center gap-2">
                <span class="text-emerald-400 font-bold text-sm">⚡</span>
                <span class="text-zinc-300 font-semibold">รายเดือน (ประหยัดกว่ารายวัน)</span>
              </div>
              <div class="text-right flex flex-col items-end gap-1">
                <span class="px-2 py-0.5 text-[10px] font-black bg-emerald-500 text-black rounded font-mono shadow-[0_0_8px_rgba(16,185,129,0.4)]">ประหยัด ${pct}%</span>
                <p class="text-[10px] text-yellow-400 font-bold font-mono">เซฟได้ ฿${formatCurrency(saved).split('.')[0]}</p>
              </div>
            </div>
          `);
        }
      }
    }
  } else {
    if (isWeeklyAllowed && isMonthlyAllowed) {
      const pricePerWeek = parseFloat(machine.price_per_week);
      const pricePerMonth = parseFloat(machine.price_per_month);
      if (pricePerWeek > 0 && pricePerMonth > 0) {
        const weeklyEquivalent = (pricePerWeek / 7) * 30;
        if (pricePerMonth < weeklyEquivalent) {
          const pct = Math.round((1 - (pricePerMonth / weeklyEquivalent)) * 100);
          const saved = weeklyEquivalent - pricePerMonth;
          tips.push(`
            <div class="flex items-center justify-between p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
              <div class="flex items-center gap-2">
                <span class="text-emerald-400 font-bold text-sm">⚡</span>
                <span class="text-zinc-300 font-semibold">รายเดือน (ประหยัดกว่ารายสัปดาห์)</span>
              </div>
              <div class="text-right flex flex-col items-end gap-1">
                <span class="px-2 py-0.5 text-[10px] font-black bg-emerald-500 text-black rounded font-mono shadow-[0_0_8px_rgba(16,185,129,0.4)]">ประหยัด ${pct}%</span>
                <p class="text-[10px] text-yellow-400 font-bold font-mono">เซฟได้ ฿${formatCurrency(saved).split('.')[0]}</p>
              </div>
            </div>
          `);
        }
      }
    }
  }

  if (tips.length > 0) {
    container.innerHTML = `
      <div class="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 text-xs text-gray-300 space-y-2 mt-3 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
        <p class="text-emerald-400 font-extrabold flex items-center gap-2 mb-2 text-[12px] tracking-wide uppercase font-mono">
          <span>🔥</span> ดีลสุดคุ้มสำหรับเครื่องนี้
        </p>
        <div class="space-y-2">
          ${tips.join('')}
        </div>
      </div>
    `;
    container.classList.remove('hidden');
  } else {
    container.innerHTML = '';
    container.classList.add('hidden');
  }
}


// --- Load and Bind Contact Links & Check Ad Popup ---
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

    // ตรวจสอบและแสดงหน้าต่างโฆษณา/ประกาศ Pop-up
    const adPopupModal = document.getElementById('adPopupModal');
    if (adPopupModal && data.popup_enabled === 'true' && data.popup_image_url) {
      const dismissedUrl = localStorage.getItem('popup_dismissed_url');

      // แสดงป๊อปอัพถ้ายังไม่ได้กดปิดรูปภาพนี้แบบถาวร
      if (dismissedUrl !== data.popup_image_url) {
        const adPopupImage = document.getElementById('adPopupImage');
        if (adPopupImage) {
          adPopupImage.src = data.popup_image_url;
          adPopupImage.setAttribute('data-src', data.popup_image_url);
        }
        showModal('adPopupModal');
      }
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
});

// ฟังก์ชันปิดหน้าต่างโฆษณา Pop-up
function closeAdPopup(permanent = false) {
  const adPopupModal = document.getElementById('adPopupModal');
  if (adPopupModal) {
    const adPopupImage = document.getElementById('adPopupImage');
    const imageUrl = adPopupImage ? (adPopupImage.getAttribute('data-src') || adPopupImage.src) : '';
    
    if (permanent) {
      if (imageUrl) {
        localStorage.setItem('popup_dismissed_url', imageUrl);
      }
    }
    hideModal('adPopupModal');
  }
}

// --- Pagination Controls Helper ---
function renderPaginationControls(currentPage, totalPages, changePageFuncName) {
  if (totalPages <= 1) return '';
  
  const btnClass = "px-3 py-1.5 text-xs bg-white/5 text-gray-300 rounded border border-white/5 hover:bg-yellow-400/10 hover:text-yellow-400 hover:border-yellow-400/30 transition disabled:opacity-30 disabled:pointer-events-none font-semibold";

  return `
    <div class="flex items-center justify-between mt-4 p-2 bg-white/5 rounded-lg border border-white/5 flex-col sm:flex-row gap-3">
      <div class="text-xs text-gray-400 font-medium">
        แสดงหน้า <span class="text-white font-bold">${currentPage}</span> / <span class="text-white font-bold">${totalPages}</span>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="${changePageFuncName}(1)" ${currentPage === 1 ? 'disabled' : ''} class="${btnClass}">
          หน้าแรก
        </button>
        <button onclick="${changePageFuncName}(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} class="${btnClass}">
          ย้อนกลับ
        </button>
        <button onclick="${changePageFuncName}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} class="${btnClass}">
          ถัดไป
        </button>
        <button onclick="${changePageFuncName}(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''} class="${btnClass}">
          หน้าสุดท้าย
        </button>
      </div>
    </div>
  `;
}

