// =============================================
// Topup — ระบบเติมเงินอัตโนมัติ
// =============================================

let selectedSlipFile = null;
let settings = null;
let pollingInterval = null;

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

  // ดึงค่าตั้งค่าเพื่อเปิด/ปิดช่องทางต่างๆ
  try {
    settings = await apiFetch('/api/settings');
    applyTopupSettings();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function applyTopupSettings() {
  if (!settings) return;

  const isRestricted = isTopupTimeRestricted(settings);
  const banner = document.getElementById('timeRestrictionBanner');

  if (isRestricted) {
    if (banner) {
      banner.innerHTML = `⚠️ ช่องทาง PromptPay Auto ปิดปรับปรุงชั่วคราวในช่วงเวลา <span class="font-bold text-yellow-400">${settings.topup_restricted_start} - ${settings.topup_restricted_end}</span> น. (ช่องทางอื่นยังใช้งานได้ปกติ)`;
      banner.classList.remove('hidden');
    }

    // Disable PromptPay Auto confirm button
    const btn = document.getElementById('generateQrBtn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    // Disable PromptPay Auto input
    const input = document.getElementById('ppAutoAmountInput');
    if (input) {
      input.disabled = true;
      input.classList.add('opacity-50', 'cursor-not-allowed');
    }

    // Disable quick select buttons for PromptPay Auto
    const quickBtns = document.querySelectorAll('#panel-promptpay-auto button[type="button"]');
    quickBtns.forEach(btn => {
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    });
  } else {
    if (banner) banner.classList.add('hidden');

    // Enable elements in case they were previously disabled
    const btn = document.getElementById('generateQrBtn');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    const input = document.getElementById('ppAutoAmountInput');
    if (input) {
      input.disabled = false;
      input.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    const quickBtns = document.querySelectorAll('#panel-promptpay-auto button[type="button"]');
    quickBtns.forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
    });
  }

  const promptpayAutoBtn = document.getElementById('method-promptpay-auto');
  const promptpaySlipBtn = document.getElementById('method-promptpay-slip');
  const truemoneyBtn = document.getElementById('method-truemoney');

  const autoEnabled = settings.topup_promptpay_enabled === 'true';
  const slipEnabled = settings.topup_slip_enabled === 'true';
  const walletEnabled = settings.topup_wallet_enabled === 'true';

  if (promptpayAutoBtn) promptpayAutoBtn.classList.toggle('hidden', !autoEnabled);
  if (promptpaySlipBtn) promptpaySlipBtn.classList.toggle('hidden', !slipEnabled);
  if (truemoneyBtn) truemoneyBtn.classList.toggle('hidden', !walletEnabled);

  // กำหนดแท็บแรกเริ่มที่เปิดใช้งาน
  let activeTab = null;
  if (autoEnabled) {
    activeTab = 'promptpay-auto';
  } else if (slipEnabled) {
    activeTab = 'promptpay-slip';
  } else if (walletEnabled) {
    activeTab = 'truemoney';
  }

  if (activeTab) {
    switchTopupMethod(activeTab);
  } else {
    // กรณีปิดหมดทุกช่องทาง
    const container = document.getElementById('topupTabsContainer');
    if (container) {
      container.innerHTML = `
        <div class="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-center w-full">
          ⚠️ ช่องทางการเติมเงินทั้งหมดปิดปรับปรุงชั่วคราว กรุณาติดต่อแอดมิน
        </div>
      `;
    }
  }
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
    const creditText = `฿ ${formatCurrency(data.user.credit)}`;
    const mainCredit = document.getElementById('currentCredit');
    const tmCredit = document.getElementById('currentCreditTrueMoney');
    const ppAutoCredit = document.getElementById('currentCreditPpAuto');
    if (mainCredit) mainCredit.textContent = creditText;
    if (tmCredit) tmCredit.textContent = creditText;
    if (ppAutoCredit) ppAutoCredit.textContent = creditText;
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

let topupHistoryList = [];
let topupHistoryPage = 1;

// --- ประวัติเติมเงิน ---
async function loadTopupHistory() {
  if (!getToken()) return;

  const container = document.getElementById('topupHistory');
  try {
    const data = await apiFetch('/api/my-topups');
    topupHistoryList = data.topups || [];
    topupHistoryPage = 1;
    renderTopupHistory();
  } catch (err) {
    container.innerHTML = `<div class="text-center py-10 text-red-400">❌ โหลดข้อมูลไม่สำเร็จ</div>`;
  }
}

function changeTopupHistoryPage(page) {
  topupHistoryPage = page;
  renderTopupHistory();
}

function renderTopupHistory() {
  const container = document.getElementById('topupHistory');
  if (!container) return;
  if (topupHistoryList.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-gray-500">📭 ยังไม่มีประวัติเติมเงิน</div>`;
    return;
  }

  const itemsPerPage = 10;
  const totalPages = Math.ceil(topupHistoryList.length / itemsPerPage);
  if (topupHistoryPage > totalPages) topupHistoryPage = totalPages;
  if (topupHistoryPage < 1) topupHistoryPage = 1;

  const startIdx = (topupHistoryPage - 1) * itemsPerPage;
  const paginatedItems = topupHistoryList.slice(startIdx, startIdx + itemsPerPage);

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
        ${paginatedItems.map(t => `
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
    ${renderPaginationControls(topupHistoryPage, totalPages, 'changeTopupHistoryPage')}
  `;
}

// --- ฟังก์ชันอัปเดตสถานะปุ่มแท็บโดยไม่กระทบต่อ class 'hidden' ---
function updateTabButtonState(btn, isActive) {
  if (!btn) return;
  if (isActive) {
    btn.classList.add('text-yellow-400', 'border-yellow-400');
    btn.classList.remove('text-gray-500', 'border-transparent', 'hover:text-white');
  } else {
    btn.classList.remove('text-yellow-400', 'border-yellow-400');
    btn.classList.add('text-gray-500', 'border-transparent', 'hover:text-white');
  }
}

// --- สลับช่องทางการเติมเงิน ---
function switchTopupMethod(method) {
  // เคลียร์การเช็กสถานะการจ่ายเงิน (Polling) หากมีการเปลี่ยนแท็บ
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  const isAuto = method === 'promptpay-auto';
  const isSlip = method === 'promptpay-slip';
  const isTm = method === 'truemoney';
  
  // จัดการการแสดงผลแผงหน้าจอเติมเงิน (Panels)
  const panelAuto = document.getElementById('panel-promptpay-auto');
  const panelSlip = document.getElementById('panel-promptpay-slip');
  const panelTm = document.getElementById('panel-truemoney');

  if (panelAuto) panelAuto.classList.toggle('hidden', !isAuto);
  if (panelSlip) panelSlip.classList.toggle('hidden', !isSlip);
  if (panelTm) panelTm.classList.toggle('hidden', !isTm);
  
  // จัดการการแสดงผลปุ่มสลับแท็บ (Tab Buttons Styling)
  const btnAuto = document.getElementById('method-promptpay-auto');
  const btnSlip = document.getElementById('method-promptpay-slip');
  const btnTm = document.getElementById('method-truemoney');
  
  updateTabButtonState(btnAuto, isAuto);
  updateTabButtonState(btnSlip, isSlip);
  updateTabButtonState(btnTm, isTm);

  // เคลียร์ผลลัพธ์ค้างเก่า
  const slipResult = document.getElementById('slipResult');
  const angpaoResult = document.getElementById('angpaoResult');
  const ppAutoResult = document.getElementById('ppAutoResult');

  if (slipResult) slipResult.classList.add('hidden');
  if (angpaoResult) angpaoResult.classList.add('hidden');
  if (ppAutoResult) ppAutoResult.classList.add('hidden');

  // รีเซ็ตการแสดงผล PromptPay Auto กลับไปขั้นตอนกรอกยอดเงินเริ่มต้น
  cancelPromptPayQR();
}

// --- ฟังก์ชันช่วยเหลือเกี่ยวกับ PromptPay Auto ---
function setPpAutoAmount(val) {
  const input = document.getElementById('ppAutoAmountInput');
  if (input) input.value = val;
}

async function generatePromptPayQR() {
  if (!requireLogin()) return;

  if (isTopupTimeRestricted(settings)) {
    showToast(`ระบบเติมเงินปิดให้บริการชั่วคราวระหว่างเวลา ${settings.topup_restricted_start} - ${settings.topup_restricted_end} น.`, 'error');
    return;
  }

  const amountInput = document.getElementById('ppAutoAmountInput');
  const amount = parseFloat(amountInput.value);
  if (isNaN(amount) || amount <= 0) {
    showToast('กรุณาระบุจำนวนเงินที่ต้องการเติม (มากกว่า 0 บาท)', 'error');
    return;
  }

  const btn = document.getElementById('generateQrBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

  try {
    const data = await apiFetch('/api/topup/promptpay/generate', {
      method: 'POST',
      body: { amount }
    });

    if (data.success) {
      // สลับไปแสดงรูปภาพ QR และซ่อนฟอร์มกรอกจำนวนเงิน
      document.getElementById('pp-auto-input-step').classList.add('hidden');
      document.getElementById('pp-auto-qr-step').classList.remove('hidden');

      const qrImg = document.getElementById('ppAutoQRImage');
      if (qrImg) qrImg.src = data.qr_url;

      const showAmt = document.getElementById('ppAutoShowAmount');
      if (showAmt) showAmt.textContent = `฿ ${formatCurrency(data.amount)}`;

      const showRef = document.getElementById('ppAutoShowRef');
      if (showRef) showRef.textContent = data.reference;

      // เริ่มต้นดึงข้อมูลสถานะการโอนเงิน
      startPollingStatus(data.reference);
    }
  } catch (err) {
    showToast(err.error || 'เกิดข้อผิดพลาดในการสร้าง QR Code', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ สร้าง QR Code ชำระเงิน';
  }
}

function startPollingStatus(ref) {
  if (pollingInterval) clearInterval(pollingInterval);

  pollingInterval = setInterval(async () => {
    try {
      const data = await apiFetch(`/api/topup/promptpay/status/${ref}`);
      if (data.success && data.status === 'approved') {
        clearInterval(pollingInterval);
        pollingInterval = null;

        // แสดงกล่องสำเร็จ
        const resultDiv = document.getElementById('ppAutoResult');
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = `
          <div class="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
            <div class="flex items-center justify-center gap-2 mb-2">
              <span class="text-xl">✅</span>
              <span class="text-green-400 font-bold">เติมเงินสำเร็จ ฿ ${formatCurrency(data.amount)} บาท</span>
            </div>
            <p class="text-gray-400 text-xs">ระบบตรวจสอบพบยอดเงินโอนเรียบร้อยแล้ว เครดิตได้รับการบวกเข้าบัญชีเรียบร้อย</p>
          </div>
        `;

        // โหลดข้อมูลเครดิตใหม่
        loadCurrentCredit();

        // รีเฟรชข้อมูล User Cache ฝั่งหน้าบ้าน
        const user = getCachedUser();
        if (user) {
          const freshMe = await apiFetch('/api/me');
          user.credit = freshMe.user.credit;
          setCachedUser(user);
          updateNavbar(user);
        }

        // โหลดประวัติการเติมเงินใหม่
        loadTopupHistory();

        // ไปที่สถานะเดิมหลังจาก 4 วินาที
        setTimeout(() => {
          cancelPromptPayQR();
        }, 4000);
      }
    } catch (err) {
      console.error('Polling status error:', err);
    }
  }, 3000); // เช็กสถานะการโอนทุกๆ 3 วินาที
}

function cancelPromptPayQR() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  const inputStep = document.getElementById('pp-auto-input-step');
  const qrStep = document.getElementById('pp-auto-qr-step');
  const resultDiv = document.getElementById('ppAutoResult');
  const amountInput = document.getElementById('ppAutoAmountInput');

  if (inputStep) inputStep.classList.remove('hidden');
  if (qrStep) qrStep.classList.add('hidden');
  if (resultDiv) resultDiv.classList.add('hidden');
  if (amountInput) amountInput.value = '';
}

// --- ส่งซองของขวัญตรวจสอบ ---
async function submitAngpao() {
  if (!requireLogin()) return;

  const urlInput = document.getElementById('angpaoUrl');
  const voucher_url = urlInput.value.trim();

  if (!voucher_url) {
    showToast('กรุณากรอกลิงก์ซองของขวัญก่อน', 'error');
    return;
  }

  const btn = document.getElementById('submitAngpaoBtn');
  const resultDiv = document.getElementById('angpaoResult');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

  try {
    const data = await apiFetch('/api/verify-angpao', {
      method: 'POST',
      body: { voucher_url }
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
      
      const creditText = `฿ ${formatCurrency(data.new_credit)}`;
      const mainCredit = document.getElementById('currentCredit');
      const tmCredit = document.getElementById('currentCreditTrueMoney');
      if (mainCredit) mainCredit.textContent = creditText;
      if (tmCredit) tmCredit.textContent = creditText;

      // อัปเดต cache
      const user = getCachedUser();
      if (user) { user.credit = data.new_credit; setCachedUser(user); updateNavbar(user); }

      // รีเซ็ตฟอร์ม
      urlInput.value = '';
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
        <p class="text-red-400">❌ ${err.error || 'เกิดข้อผิดพลาดในการตรวจสอบซองของขวัญ'}</p>
      </div>
    `;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🧧</span> ยืนยันการเติมเงิน';
  }
}

function isTopupTimeRestricted(settings) {
  if (!settings || settings.topup_time_restriction_enabled !== 'true') {
    return false;
  }
  const startTime = settings.topup_restricted_start;
  const endTime = settings.topup_restricted_end;
  if (!startTime || !endTime) return false;

  let now;
  try {
    now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  } catch (e) {
    now = new Date();
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes === endMinutes) return false;

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}
