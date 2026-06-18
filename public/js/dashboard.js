// =============================================
// Dashboard — แดชบอร์ดผู้ใช้
// =============================================

let dashCountdownIntervals = {};
let activeMachines = [];
let selectedExtendMachineId = null;
let currentExtendUnit = 'day';
let currentExtendQuantity = 1;
let selectedExtendDuration = null;


document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});

async function initDashboard() {
  const token = getToken();
  if (!token) {
    document.getElementById('loginRequired').classList.remove('hidden');
    document.getElementById('dashboardContent').classList.add('hidden');
    return;
  }

  document.getElementById('loginRequired').classList.add('hidden');
  document.getElementById('dashboardContent').classList.remove('hidden');

  await Promise.all([
    loadDashProfile(),
    loadActiveRentals(),
    loadRentalHistory(),
    loadDashTopupHistory()
  ]);
}

// ถ้า login สำเร็จจากหน้า dashboard ให้ reload
const origCheckSession = checkSession;
checkSession = async function() {
  await origCheckSession();
  if (getToken()) {
    initDashboard();
  }
};

// --- ข้อมูลโปรไฟล์ ---
async function loadDashProfile() {
  try {
    const data = await apiFetch('/api/me');
    const user = data.user;
    document.getElementById('dashCredit').textContent = `฿ ${formatCurrency(user.credit)}`;
    document.getElementById('dashJoinDate').textContent = new Date(user.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (err) { /* handled by checkSession */ }
}

// --- เครื่องที่กำลังเช่า ---
async function loadActiveRentals() {
  const container = document.getElementById('activeRentals');
  try {
    const data = await apiFetch('/api/my-active-machines');
    const machines = data.machines;
    activeMachines = machines;


    document.getElementById('dashActiveMachines').textContent = machines.length;

    if (machines.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-gray-500">
          <p class="text-3xl mb-2">🖥️</p>
          <p>คุณยังไม่ได้เช่าเครื่องใดๆ</p>
          <a href="/" class="inline-block mt-3 text-yellow-400 text-sm hover:underline">ไปเช่าเครื่องเลย →</a>
        </div>
      `;
      return;
    }

    // Clear old intervals
    Object.values(dashCountdownIntervals).forEach(clearInterval);
    dashCountdownIntervals = {};

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${machines.map(m => `
          <div class="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-yellow-400/20 transition">
            <div class="flex items-start justify-between mb-3">
              <div>
                <h3 class="font-bold text-white">${m.name}</h3>
              </div>
              <span class="badge badge-in-use">กำลังใช้งาน</span>
            </div>

            <!-- Specs mini -->
            <div class="grid grid-cols-2 gap-1 text-xs text-gray-400 mb-3">
              <span>⚙️ ${m.cpu || '-'}</span>
              <span>🧠 ${m.ram || '-'}</span>
              <span>💾 ${m.ssd || '-'}</span>
              <span>🎨 ${m.gpu || '-'}</span>
            </div>

            <!-- Countdown -->
            <div class="p-3 rounded-lg bg-yellow-400/5 border border-yellow-400/20 mb-3">
              <div class="flex items-center justify-between">
                <span class="text-xs text-gray-400">⏰ เหลือเวลา</span>
                <span class="countdown" id="dash-countdown-${m.id}" data-end="${m.session_end_time}">--:--:--</span>
              </div>
            </div>

            <!-- AnyDesk Info — แสดงเลข AnyDesk และรหัสผ่าน -->
            <div class="mb-3 p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30">
              <p class="text-xs text-cyan-400 font-bold uppercase tracking-wider mb-2">🖥️ AnyDesk Remote</p>
              <div class="space-y-2">
                <!-- AnyDesk ID -->
                <div class="flex justify-between items-center p-2 rounded-lg bg-cyan-900/30 border border-cyan-500/20">
                  <span class="text-xs text-gray-400">เลข AnyDesk</span>
                  <div class="flex items-center gap-2">
                    <span class="text-cyan-300 font-mono font-bold text-base tracking-widest">${m.anydesk_id || '-'}</span>
                    ${m.anydesk_id ? `<button onclick="copyToClipboard('${m.anydesk_id}', 'คัดลอกเลข AnyDesk แล้ว!')"
                            class="text-cyan-500 hover:text-cyan-300 transition text-xs" title="คัดลอก">📋</button>` : ''}
                  </div>
                </div>
                <!-- AnyDesk Password -->
                <div class="flex justify-between items-center p-2 rounded-lg bg-cyan-900/30 border border-cyan-500/20">
                  <span class="text-xs text-gray-400">รหัสผ่าน AnyDesk</span>
                  <div class="flex items-center gap-2">
                    <span class="text-cyan-300 font-mono text-sm" id="dash-ad-pass-${m.id}">••••••••</span>
                    <button onclick="toggleDashAnyDeskPass(${m.id}, '${m.anydesk_password || ''}')"
                            class="text-cyan-400 hover:text-cyan-300 transition" title="แสดง/ซ่อน">👁</button>
                    ${m.anydesk_password ? `<button onclick="copyToClipboard('${m.anydesk_password || ''}', 'คัดลอกรหัส AnyDesk แล้ว!')"
                            class="text-cyan-500 hover:text-cyan-300 transition text-xs" title="คัดลอก">📋</button>` : ''}
                  </div>
                </div>
              </div>
            </div>

            <!-- Power Control Buttons — เปิด/ปิดผ่าน Tuya -->
            ${m.tuya_device_id ? `
            <div class="mb-3 p-3 rounded-xl bg-white/5 border border-white/10" id="power-control-${m.id}">
              <p class="text-xs text-gray-400 font-semibold mb-2">⚡ ควบคุมเครื่อง (Tuya Smart)</p>
              <div class="grid grid-cols-2 gap-2">
                <button onclick="dashPowerMachine(${m.id}, 'on', this)" id="btn-power-on-${m.id}"
                        class="flex flex-col items-center gap-1 py-2 px-1 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 hover:border-green-500 transition text-xs font-semibold">
                  <span class="text-lg">🟢</span>
                  <span>เปิดเครื่อง</span>
                </button>
                <button onclick="dashPowerMachine(${m.id}, 'off', this)" id="btn-power-off-${m.id}"
                        class="flex flex-col items-center gap-1 py-2 px-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500 transition text-xs font-semibold">
                  <span class="text-lg">🔴</span>
                  <span>ปิดเครื่อง</span>
                </button>
              </div>
            </div>
            ` : ''}

            <div class="grid grid-cols-2 gap-2 mt-2">
              <button onclick="openExtendModal(${m.id})" class="btn-neon text-xs !py-2 flex items-center justify-center gap-1">➕ ต่อเวลา</button>
              <button onclick="dashReleaseMachine(${m.id})" class="btn-outline text-xs !py-2 border-red-500/30 text-red-400 hover:!border-red-500 flex items-center justify-center gap-1">🔓 คืนเครื่อง</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Start countdowns
    machines.forEach(m => {
      if (m.session_end_time) {
        startDashCountdown(m.id, m.session_end_time);
      }
      // Resume power lock if active in localStorage
      const lockUntil = parseInt(localStorage.getItem(`power_lock_until_${m.id}`) || '0', 10);
      if (lockUntil > Date.now()) {
        runPowerButtonsTimer(m.id);
      }
    });

  } catch (err) {
    container.innerHTML = `<div class="text-center py-8 text-red-400">❌ ไม่สามารถโหลดข้อมูลได้</div>`;
  }
}

function startDashCountdown(machineId, endTimeStr) {
  const el = document.getElementById(`dash-countdown-${machineId}`);
  if (!el) return;

  const endTime = new Date(endTimeStr).getTime();
  if (dashCountdownIntervals[machineId]) clearInterval(dashCountdownIntervals[machineId]);

  function update() {
    const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    el.textContent = formatCountdown(remaining);
    if (remaining <= 300) el.classList.add('warning');
    if (remaining <= 0) {
      clearInterval(dashCountdownIntervals[machineId]);
      setTimeout(() => loadActiveRentals(), 2000);
    }
  }
  update();
  dashCountdownIntervals[machineId] = setInterval(update, 1000);
}



function toggleDashAnyDeskPass(machineId, realPass) {
  const el = document.getElementById('dash-ad-pass-' + machineId);
  if (el.dataset.hidden !== 'false') { el.textContent = realPass; el.dataset.hidden = 'false'; }
  else { el.textContent = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'; el.dataset.hidden = 'true'; }
}


// คัดลอกข้อความไปยัง Clipboard
function copyToClipboard(text, successMsg) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMsg || 'คัดลอกแล้ว!', 'success');
  }).catch(() => {
    showToast('ไม่สามารถคัดลอกได้', 'error');
  });
}

// ควบคุมเปิด/ปิด/รีสตาร์ทเครื่องผ่าน Tuya
async function dashPowerMachine(machineId, action, btn) {
  const actionLabel = { on: 'เปิดเครื่อง', off: 'ปิดเครื่อง', restart: 'รีสตาร์ทเครื่อง' }[action];
  const confirmMsg = action === 'restart'
    ? `ต้องการรีสตาร์ทเครื่องใช่หรือไม่?\n(เครื่องจะปิดแล้วเปิดใหม่ใน 3 วินาที)`
    : `ต้องการ${actionLabel}ใช่หรือไม่?`;

  if (!confirm(confirmMsg)) return;

  const originalHTML = btn.innerHTML;

  try {
    // Lock all power buttons for this machine for 2 minutes (120000 ms) immediately to prevent spamming
    startPowerLock(machineId, 120000);

    const data = await apiFetch(`/api/machines/${machineId}/power-user`, {
      method: 'POST',
      body: { action }
    });
    showToast(data.message || `${actionLabel}สำเร็จ`, 'success');
  } catch (err) {
    showToast(err.error || `ไม่สามารถ${actionLabel}ได้`, 'error');
    // On failure, release the lock immediately so user can retry
    localStorage.removeItem(`power_lock_until_${machineId}`);
    if (powerLockIntervals[machineId]) {
      clearInterval(powerLockIntervals[machineId]);
      delete powerLockIntervals[machineId];
    }
  } finally {
    // Only restore button state if the button is not locked
    const lockUntil = parseInt(localStorage.getItem(`power_lock_until_${machineId}`) || '0', 10);
    if (lockUntil <= Date.now()) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }
}

async function dashReleaseMachine(machineId) {
  if (!confirm('คุณต้องการคืนเครื่องนี้ใช่หรือไม่?')) return;
  try {
    const data = await apiFetch(`/api/release/${machineId}`, { method: 'POST' });
    showToast(data.message, 'success');
    await loadActiveRentals();
    await loadDashProfile();
    updateNavbar(getCachedUser());
  } catch (err) {
    showToast(err.error || 'เกิดข้อผิดพลาด', 'error');
  }
}

// --- ประวัติการเช่า ---
async function loadRentalHistory() {
  const container = document.getElementById('rentalHistory');
  try {
    const data = await apiFetch('/api/my-rentals');
    if (!data.rentals || data.rentals.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-gray-500">📭 ยังไม่มีประวัติการเช่า</div>`;
      return;
    }

    container.innerHTML = `
      <table class="cyber-table">
        <thead>
          <tr>
            <th>เครื่อง</th>
            <th>ระยะเวลา</th>
            <th>ราคา</th>
            <th>เริ่มเช่า</th>
            <th>สิ้นสุด</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${data.rentals.map(r => `
            <tr>
              <td class="font-semibold text-white whitespace-nowrap">${r.machine_name}</td>
              <td>${
                r.duration_hours % 720 === 0 ? (r.duration_hours / 720) + ' เดือน' :
                r.duration_hours % 168 === 0 ? (r.duration_hours / 168) + ' สัปดาห์' :
                r.duration_hours >= 24 ? Math.floor(r.duration_hours / 24) + ' วัน' :
                r.duration_hours + ' ชม.'
              }</td>
              <td class="text-yellow-400 font-bold">฿ ${formatCurrency(r.total_price)}</td>
              <td class="text-xs whitespace-nowrap">${formatDate(r.started_at)}</td>
              <td class="text-xs whitespace-nowrap">${formatDate(r.ended_at)}</td>
              <td>${statusBadge(r.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="text-center py-8 text-red-400">❌ โหลดข้อมูลไม่สำเร็จ</div>`;
  }
}

// --- ประวัติเติมเงิน ---
async function loadDashTopupHistory() {
  const container = document.getElementById('dashTopupHistory');
  try {
    const data = await apiFetch('/api/my-topups');
    if (!data.topups || data.topups.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-gray-500">📭 ยังไม่มีประวัติเติมเงิน</div>`;
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
    container.innerHTML = `<div class="text-center py-8 text-red-400">❌ โหลดข้อมูลไม่สำเร็จ</div>`;
  }
}

// --- ระบบล็อกปุ่มเปิด/ปิด/รีสตาร์ท (ป้องกันการกดซ้ำ) ---
let powerLockIntervals = {};

function startPowerLock(machineId, durationMs = 120000) {
  const lockUntil = Date.now() + durationMs;
  localStorage.setItem(`power_lock_until_${machineId}`, lockUntil);
  runPowerButtonsTimer(machineId);
}

function runPowerButtonsTimer(machineId) {
  if (powerLockIntervals[machineId]) {
    clearInterval(powerLockIntervals[machineId]);
  }

  function update() {
    const lockUntil = parseInt(localStorage.getItem(`power_lock_until_${machineId}`) || '0', 10);
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((lockUntil - now) / 1000));

    const btnOn = document.getElementById(`btn-power-on-${machineId}`);
    const btnOff = document.getElementById(`btn-power-off-${machineId}`);
    const btnRestart = document.getElementById(`btn-power-restart-${machineId}`);
    
    if (remaining > 0) {
      // Disable buttons
      [btnOn, btnOff, btnRestart].forEach(btn => {
        if (btn) {
          btn.disabled = true;
          btn.classList.add('opacity-50', 'cursor-not-allowed');
          // Remove hover styles
          btn.classList.remove(
            'hover:bg-green-500/20', 'hover:border-green-500',
            'hover:bg-red-500/20', 'hover:border-red-500',
            'hover:bg-orange-500/20', 'hover:border-orange-500'
          );
        }
      });

      // Update timer message in the header
      const headerEl = document.querySelector(`#power-control-${machineId} p`);
      if (headerEl) {
        let span = document.getElementById(`power-lock-label-${machineId}`);
        if (!span) {
          span = document.createElement('span');
          span.className = 'lock-timer-text text-red-400 font-bold ml-2 text-xs';
          span.id = `power-lock-label-${machineId}`;
          headerEl.appendChild(span);
        }
        span.textContent = `(ล็อกชั่วคราวอีก ${remaining} วิ)`;
      }
    } else {
      // Lock expired
      clearInterval(powerLockIntervals[machineId]);
      delete powerLockIntervals[machineId];
      localStorage.removeItem(`power_lock_until_${machineId}`);

      // Enable and restore buttons
      if (btnOn) {
        btnOn.disabled = false;
        btnOn.classList.remove('opacity-50', 'cursor-not-allowed');
        btnOn.classList.add('hover:bg-green-500/20', 'hover:border-green-500');
      }
      if (btnOff) {
        btnOff.disabled = false;
        btnOff.classList.remove('opacity-50', 'cursor-not-allowed');
        btnOff.classList.add('hover:bg-red-500/20', 'hover:border-red-500');
      }
      if (btnRestart) {
        btnRestart.disabled = false;
        btnRestart.classList.remove('opacity-50', 'cursor-not-allowed');
        btnRestart.classList.add('hover:bg-orange-500/20', 'hover:border-orange-500');
      }

      // Remove label
      const label = document.getElementById(`power-lock-label-${machineId}`);
      if (label) {
        label.remove();
      }
    }
  }

  update();
  powerLockIntervals[machineId] = setInterval(update, 1000);
}

// =============================================
// RENTAL EXTENSION FUNCTIONS (ต่อเวลาเช่า)
// =============================================
function openExtendModal(machineId) {
  if (!requireLogin()) return;

  const machine = activeMachines.find(m => m.id === machineId);
  if (!machine) return;

  selectedExtendMachineId = machineId;

  // Update Modal content
  document.getElementById('extendMachineName').textContent = `➕ ต่อเวลาเช่าเครื่อง ${machine.name}`;
  document.getElementById('extendMachineSpec').textContent = `${machine.cpu || ''} • ${machine.ram || ''} • ${machine.gpu || ''}`;

  // Reset inputs
  currentExtendUnit = 'day';
  currentExtendQuantity = 1;
  document.getElementById('extendQuantity').value = 1;
  document.getElementById('extendQuantityUnitLabel').textContent = 'วัน';
  updateExtendUnitButtonsHighlight();

  // User credit
  const user = getCachedUser();
  document.getElementById('extendUserCredit').textContent = user ? `฿ ${formatCurrency(user.credit)}` : '฿ 0.00';

  // Calculate default price
  updateExtendCalculation(machine);

  showModal('extendModal');
}

function selectExtendUnit(unit) {
  currentExtendUnit = unit;
  
  const labelMap = {
    'day': 'วัน',
    'week': 'สัปดาห์',
    'month': 'เดือน'
  };
  document.getElementById('extendQuantityUnitLabel').textContent = labelMap[unit] || 'วัน';
  
  updateExtendUnitButtonsHighlight();
  
  const machine = activeMachines.find(m => m.id === selectedExtendMachineId);
  updateExtendCalculation(machine);
}

function updateExtendUnitButtonsHighlight() {
  const units = ['day', 'week', 'month'];
  units.forEach(u => {
    const btn = document.getElementById(`ext-unit-${u}`);
    if (!btn) return;
    if (u === currentExtendUnit) {
      btn.className = "py-2.5 text-sm font-semibold rounded-md transition duration-200 text-yellow-400 bg-white/5 border border-yellow-400/20";
    } else {
      btn.className = "py-2.5 text-sm font-semibold rounded-md transition duration-200 text-gray-400 hover:text-white";
    }
  });
}

function adjustExtendQuantity(amount) {
  const input = document.getElementById('extendQuantity');
  if (!input) return;
  let val = parseInt(input.value) || 1;
  val += amount;
  if (val < 1) val = 1;
  input.value = val;
  currentExtendQuantity = val;
  
  const machine = activeMachines.find(m => m.id === selectedExtendMachineId);
  updateExtendCalculation(machine);
}

function onExtendQuantityChange() {
  const input = document.getElementById('extendQuantity');
  if (!input) return;
  let val = parseInt(input.value);
  if (isNaN(val) || val < 1) {
    val = 1;
  }
  currentExtendQuantity = val;
  
  const machine = activeMachines.find(m => m.id === selectedExtendMachineId);
  updateExtendCalculation(machine);
}

function updateExtendCalculation(machine) {
  if (!machine) return;
  
  let factor = 1;
  if (currentExtendUnit === 'day') {
    factor = 24;
  } else if (currentExtendUnit === 'week') {
    factor = 7 * 24;
  } else if (currentExtendUnit === 'month') {
    factor = 30 * 24;
  }
  
  selectedExtendDuration = currentExtendQuantity * factor;
  
  let price = 0;
  if (currentExtendUnit === 'day') {
    price = currentExtendQuantity * parseFloat(machine.price_per_day);
  } else if (currentExtendUnit === 'week') {
    const weekPrice = parseFloat(machine.price_per_week);
    price = currentExtendQuantity * (weekPrice > 0 ? weekPrice : parseFloat(machine.price_per_day) * 7);
  } else if (currentExtendUnit === 'month') {
    const monthPrice = parseFloat(machine.price_per_month);
    price = currentExtendQuantity * (monthPrice > 0 ? monthPrice : parseFloat(machine.price_per_day) * 30);
  }
  
  document.getElementById('extendTotalPrice').textContent = `฿ ${formatCurrency(price)}`;
}

async function confirmExtend() {
  if (!selectedExtendMachineId || !selectedExtendDuration) {
    showToast('กรุณาเลือกเวลาต่ออายุ', 'error');
    return;
  }

  const btn = document.getElementById('confirmExtendBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

  try {
    const data = await apiFetch('/api/rent/extend', {
      method: 'POST',
      body: { 
        machine_id: selectedExtendMachineId, 
        rent_unit: currentExtendUnit,
        rent_quantity: currentExtendQuantity
      }
    });

    hideModal('extendModal');
    showToast(data.message, 'success');

    // อัปเดตเครดิตใน cache
    const user = getCachedUser();
    if (user) {
      user.credit = data.rental.new_credit;
      setCachedUser(user);
      updateNavbar(user);
    }

    // โหลดข้อมูลแดชบอร์ดใหม่
    await initDashboard();

  } catch (err) {
    if (err.status === 400 && err.required) {
      // เครดิตไม่พอ
      hideModal('extendModal');
      document.getElementById('creditRequired').textContent = `฿ ${formatCurrency(err.required)}`;
      document.getElementById('creditCurrent').textContent = `฿ ${formatCurrency(err.current)}`;
      showModal('creditModal');
    } else {
      showToast(err.error || 'เกิดข้อผิดพลาด', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ ยืนยันต่อเวลา';
  }
}

