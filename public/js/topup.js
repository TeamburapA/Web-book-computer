// =============================================
// Topup — ระบบเติมเงินอัตโนมัติ
// =============================================

let selectedSlipFile = null;

document.addEventListener('DOMContentLoaded', () => {
  initTopup();
});

async function initTopup() {
  const token = getToken();
  if (!token) {
    document.getElementById('loginRequired').classList.remove('hidden');
    document.getElementById('topupContent').classList.add('hidden');
    return;
  }

  document.getElementById('loginRequired').classList.add('hidden');
  document.getElementById('topupContent').classList.remove('hidden');

  loadCurrentCredit();
  loadTopupHistory();
  setupDragDrop();
}

// ถ้า login สำเร็จจากหน้า topup ให้ reload
const origCheckSession = checkSession;
checkSession = async function() {
  await origCheckSession();
  if (getToken()) {
    initTopup();
  }
};


// --- แสดงเครดิตปัจจุบัน ---
async function loadCurrentCredit() {
  if (!getToken()) return;
  try {
    const data = await apiFetch('/api/me');
    document.getElementById('currentCredit').textContent = `฿ ${formatCurrency(data.user.credit)}`;
  } catch (err) { /* ignore */ }
}

// --- Preview สลิป ---
function previewSlip(event) {
  const file = event.target.files[0];
  if (!file) return;

  selectedSlipFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('uploadContent').classList.add('hidden');
    document.getElementById('previewContent').classList.remove('hidden');
    document.getElementById('slipPreview').src = e.target.result;
    document.getElementById('slipFileName').textContent = file.name;
  };
  reader.readAsDataURL(file);
}

// --- Drag & Drop ---
function setupDragDrop() {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;

  ['dragenter', 'dragover'].forEach(evt => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
    });
  });

  zone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      document.getElementById('slipFile').files = files;
      previewSlip({ target: { files } });
    }
  });
}

// --- ส่งสลิปตรวจสอบ ---
async function submitSlip() {
  if (!requireLogin()) return;

  if (!selectedSlipFile) {
    showToast('กรุณาเลือกรูปสลิปก่อน', 'error');
    return;
  }

  const btn = document.getElementById('submitSlipBtn');
  const resultDiv = document.getElementById('slipResult');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

  try {
    const formData = new FormData();
    formData.append('slip', selectedSlipFile);

    const data = await apiFetch('/api/verify-slip', {
      method: 'POST',
      body: formData
    });

    resultDiv.classList.remove('hidden');
    if (data.success) {
      resultDiv.innerHTML = `
        <div class="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xl">✅</span>
            <span class="text-green-400 font-bold">${data.message}</span>
          </div>
          <p class="text-gray-400 text-sm">เครดิตใหม่: <span class="text-yellow-400 font-bold">฿ ${formatCurrency(data.new_credit)}</span></p>
        </div>
      `;
      document.getElementById('currentCredit').textContent = `฿ ${formatCurrency(data.new_credit)}`;

      // อัปเดต cache
      const user = getCachedUser();
      if (user) { user.credit = data.new_credit; setCachedUser(user); updateNavbar(user); }

      // รีเซ็ต upload
      resetUpload();
      loadTopupHistory();
    } else {
      resultDiv.innerHTML = `
        <div class="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <p class="text-yellow-400">⚠️ ${data.message}</p>
        </div>
      `;
    }

  } catch (err) {
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `
      <div class="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
        <p class="text-red-400">❌ ${err.error || 'เกิดข้อผิดพลาดในการตรวจสอบสลิป'}</p>
      </div>
    `;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 ส่งสลิปตรวจสอบ';
  }
}

// --- Reset Upload ---
function resetUpload() {
  selectedSlipFile = null;
  document.getElementById('slipFile').value = '';
  document.getElementById('uploadContent').classList.remove('hidden');
  document.getElementById('previewContent').classList.add('hidden');
}

// --- ประวัติเติมเงิน ---
async function loadTopupHistory() {
  if (!getToken()) return;

  const container = document.getElementById('topupHistory');
  try {
    const data = await apiFetch('/api/my-topups');

    if (!data.topups || data.topups.length === 0) {
      container.innerHTML = `<div class="text-center py-10 text-gray-500">📭 ยังไม่มีประวัติเติมเงิน</div>`;
      return;
    }

    container.innerHTML = `
      <table class="cyber-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>จำนวนเงิน</th>
            <th>Ref</th>
            <th>สถานะ</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${data.topups.map(t => `
            <tr>
              <td class="whitespace-nowrap">${formatDate(t.created_at)}</td>
              <td class="font-bold text-yellow-400">฿ ${formatCurrency(t.amount)}</td>
              <td class="text-xs font-mono text-gray-500">${t.transaction_ref || '-'}</td>
              <td>${statusBadge(t.status)}</td>
              <td class="text-xs text-gray-500">${t.note || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="text-center py-10 text-red-400">❌ โหลดข้อมูลไม่สำเร็จ</div>`;
  }
}
