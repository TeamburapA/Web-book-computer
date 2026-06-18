// =============================================
// Machines — ระบบเช่าเครื่องคอมพิวเตอร์
// =============================================

let allMachines = [];
let selectedMachineId = null;
let selectedDuration = null;
let countdownIntervals = {};
let currentRentUnit = 'day';
let currentRentQuantity = 1;
let selectedExtendMachineId = null;
let currentExtendUnit = 'day';
let currentExtendQuantity = 1;
let selectedExtendDuration = null;


document.addEventListener('DOMContentLoaded', () => {
  loadMachines();
  // Refresh machines ทุก 30 วินาทีเพื่อ sync สถานะ
  setInterval(loadMachines, 30000);
});

// --- โหลดเครื่องทั้งหมด ---
async function loadMachines(category = 'all') {
  const grid = document.getElementById('machineGrid');
  if (!grid) return;

  try {
    const params = category !== 'all' ? `?category=${category}` : '';
    const data = await apiFetch(`/api/machines${params}`);
    allMachines = data.machines;
    renderMachines(allMachines);
  } catch (err) {
    grid.innerHTML = `<div class="col-span-full text-center py-20 text-gray-500">❌ ไม่สามารถโหลดข้อมูลเครื่องได้</div>`;
  }
}

// --- Filter ---
function filterMachines(category) {
  // อัปเดตปุ่ม filter
  document.querySelectorAll('#filterBar .filter-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  loadMachines(category);
}

// --- Render การ์ดเครื่อง ---
function renderMachines(machines) {
  const grid = document.getElementById('machineGrid');
  if (!machines || machines.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center py-20 text-gray-500">📭 ไม่พบเครื่องคอมพิวเตอร์ในขณะนี้</div>`;
    return;
  }

  // ล้าง countdown intervals เดิม
  Object.values(countdownIntervals).forEach(clearInterval);
  countdownIntervals = {};

  const currentUser = getCachedUser();

  grid.innerHTML = machines.map((m, idx) => {
    const isMyMachine = currentUser && m.current_user_id === currentUser.id;
    const gradientClass = 'from-yellow-500/20 to-purple-500/20';

    return `
      <div class="cyber-card animate-slide-up" style="animation-delay: ${idx * 0.05}s" id="machine-card-${m.id}">
        <!-- Header gradient -->
        <div class="h-32 bg-gradient-to-br ${gradientClass} relative flex items-center justify-center">
          <span class="text-5xl opacity-50">🖥️</span>
          <div class="absolute top-3 right-3">${statusBadge(m.status)}</div>
        </div>

        <!-- Content -->
        <div class="p-5">
          <h3 class="text-lg font-bold text-white mb-3">${m.name}</h3>

          <!-- Specs -->
          <div class="space-y-1 mb-4">
            <div class="spec-item"><span class="spec-icon">⚙️</span><span>${m.cpu || '-'}</span></div>
            <div class="spec-item"><span class="spec-icon">🧠</span><span>${m.ram || '-'}</span></div>
            <div class="spec-item"><span class="spec-icon">💾</span><span>${m.ssd || '-'}</span></div>
            <div class="spec-item"><span class="spec-icon">🎨</span><span>${m.gpu || '-'}</span></div>
            <div class="spec-item"><span class="spec-icon">💻</span><span>${m.os || '-'}</span></div>
          </div>

          <!-- Price -->
          <div class="flex items-center justify-between py-3 border-t border-white/5">
            <div>
              <span class="text-pink-400 font-bold text-lg">฿${formatCurrency(m.price_per_day)}</span>
              <span class="text-gray-500 text-xs">/วัน</span>
            </div>
          </div>

          ${m.status === 'in_use' && isMyMachine ? `
            <!-- Countdown + AnyDesk (for current renter) -->
            <div class="mt-3 p-3 rounded-lg bg-yellow-400/5 border border-yellow-400/20">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-gray-400">⏰ เหลือเวลา</span>
                <span class="countdown" id="countdown-${m.id}" data-end="${m.session_end_time}">--:--:--</span>
              </div>
              <div id="anydesk-info-${m.id}" class="mt-2">
                <button onclick="loadAnydeskInfo(${m.id})" class="text-xs text-cyan-400 hover:underline">🖥️ แสดงข้อมูล AnyDesk</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-3">
              <button onclick="openExtendModal(${m.id})" class="btn-neon text-sm !py-2">➕ ต่อเวลา</button>
              <button onclick="releaseMachine(${m.id})" class="btn-outline text-sm !py-2 border-red-500/30 text-red-400 hover:!border-red-500 hover:!text-red-400">🔓 คืนเครื่อง</button>
            </div>
          ` : m.status === 'in_use' ? `
            <!-- In use by someone else -->
            <div class="mt-3 p-3 rounded-lg bg-yellow-400/5 border border-yellow-400/20 text-center">
              <span class="text-xs text-gray-400">⏰ เหลือเวลา</span>
              <div class="countdown mt-1" id="countdown-${m.id}" data-end="${m.session_end_time}">--:--:--</div>
            </div>
          ` : m.status === 'available' ? `
            <!-- Available — Rent button -->
            <button onclick="openRentalModal(${m.id})" class="mt-3 w-full btn-neon text-sm !py-2.5">⚡ เช่าเครื่องนี้</button>
          ` : m.status === 'clearing' ? `
            <!-- Clearing data -->
            <div class="mt-3 text-center py-2 text-yellow-400/80 text-sm font-semibold animate-pulse">⏳ กำลังเคลียข้อมูล...</div>
          ` : `
            <!-- Maintenance -->
            <div class="mt-3 text-center py-2 text-gray-500 text-sm">🔧 ปิดให้บริการชั่วคราว</div>
          `}
        </div>
      </div>
    `;
  }).join('');

  // เริ่ม countdown สำหรับเครื่องที่ in_use
  machines.filter(m => m.status === 'in_use' && m.session_end_time).forEach(m => {
    startCountdown(m.id, m.session_end_time);
  });
}

// --- Countdown Timer ---
function startCountdown(machineId, endTimeStr) {
  const el = document.getElementById(`countdown-${machineId}`);
  if (!el) return;

  const endTime = new Date(endTimeStr).getTime();

  // ล้าง interval เดิม
  if (countdownIntervals[machineId]) clearInterval(countdownIntervals[machineId]);

  function update() {
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((endTime - now) / 1000));

    el.textContent = formatCountdown(remaining);

    if (remaining <= 300) { // น้อยกว่า 5 นาที
      el.classList.add('warning');
    }

    if (remaining <= 0) {
      clearInterval(countdownIntervals[machineId]);
      el.textContent = '00:00:00';
      // Auto reload
      setTimeout(() => loadMachines(), 2000);
    }
  }

  update();
  countdownIntervals[machineId] = setInterval(update, 1000);
}

// --- เปิด Modal เช่าเครื่อง ---
function openRentalModal(machineId) {
  if (!requireLogin()) return;

  const machine = allMachines.find(m => m.id === machineId);
  if (!machine) return;

  selectedMachineId = machineId;

  // อัปเดต Modal content
  document.getElementById('rentalMachineName').textContent = `⚡ เช่าเครื่อง ${machine.name}`;
  document.getElementById('rentalMachineSpec').textContent = `${machine.cpu} • ${machine.ram} • ${machine.gpu}`;

  // Reset inputs
  currentRentUnit = 'day';
  currentRentQuantity = 1;
  document.getElementById('rentQuantity').value = 1;
  document.getElementById('quantityUnitLabel').textContent = 'วัน';
  updateUnitButtonsHighlight();

  // Reset rules checkbox
  document.getElementById('acceptRules').checked = false;

  // User credit
  const user = getCachedUser();
  document.getElementById('rentalUserCredit').textContent = user ? `฿ ${formatCurrency(user.credit)}` : '฿ 0.00';

  // Calculate default price
  updateRentCalculation(machine);

  showModal('rentalModal');
}

// --- คำนวณราคา ---
function calculatePrice(machine, hours) {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return (days * parseFloat(machine.price_per_day)) + (remainingHours * parseFloat(machine.price_per_hour));
  }
  return hours * parseFloat(machine.price_per_hour);
}

// --- เปลี่ยนหน่วยเวลาเช่า ---
function selectRentUnit(unit) {
  currentRentUnit = unit;
  
  const labelMap = {
    'day': 'วัน',
    'week': 'สัปดาห์',
    'month': 'เดือน'
  };
  document.getElementById('quantityUnitLabel').textContent = labelMap[unit] || 'วัน';
  
  updateUnitButtonsHighlight();
  
  const machine = allMachines.find(m => m.id === selectedMachineId);
  updateRentCalculation(machine);
}

// --- อัปเดตการเลือกปุ่มหน่วยเช่า ---
function updateUnitButtonsHighlight() {
  const units = ['day', 'week', 'month'];
  units.forEach(u => {
    const btn = document.getElementById(`unit-${u}`);
    if (!btn) return;
    if (u === currentRentUnit) {
      btn.className = "py-2.5 text-sm font-semibold rounded-md transition duration-200 text-yellow-400 bg-white/5 border border-yellow-400/20";
    } else {
      btn.className = "py-2.5 text-sm font-semibold rounded-md transition duration-200 text-gray-400 hover:text-white";
    }
  });
}

// --- เพิ่ม/ลดจำนวนเวลาเช่า ---
function adjustQuantity(amount) {
  const input = document.getElementById('rentQuantity');
  if (!input) return;
  let val = parseInt(input.value) || 1;
  val += amount;
  if (val < 1) val = 1;
  input.value = val;
  currentRentQuantity = val;
  
  const machine = allMachines.find(m => m.id === selectedMachineId);
  updateRentCalculation(machine);
}

// --- เมื่อผู้ใช้กรอกจำนวนเอง ---
function onQuantityChange() {
  const input = document.getElementById('rentQuantity');
  if (!input) return;
  let val = parseInt(input.value);
  if (isNaN(val) || val < 1) {
    val = 1;
  }
  currentRentQuantity = val;
  
  const machine = allMachines.find(m => m.id === selectedMachineId);
  updateRentCalculation(machine);
}

// --- อัปเดตราคาและระยะเวลาทั้งหมด ---
function updateRentCalculation(machine) {
  if (!machine) return;
  
  let factor = 1;
  if (currentRentUnit === 'day') {
    factor = 24;
  } else if (currentRentUnit === 'week') {
    factor = 7 * 24;
  } else if (currentRentUnit === 'month') {
    factor = 30 * 24;
  }
  
  selectedDuration = currentRentQuantity * factor;
  
  let price = 0;
  if (currentRentUnit === 'day') {
    price = currentRentQuantity * parseFloat(machine.price_per_day);
  } else if (currentRentUnit === 'week') {
    const weekPrice = parseFloat(machine.price_per_week);
    price = currentRentQuantity * (weekPrice > 0 ? weekPrice : parseFloat(machine.price_per_day) * 7);
  } else if (currentRentUnit === 'month') {
    const monthPrice = parseFloat(machine.price_per_month);
    price = currentRentQuantity * (monthPrice > 0 ? monthPrice : parseFloat(machine.price_per_day) * 30);
  }
  
  document.getElementById('rentalTotalPrice').textContent = `฿ ${formatCurrency(price)}`;
}

// --- ยืนยันเช่า ---
async function confirmRental() {
  if (!selectedMachineId || !selectedDuration) {
    showToast('กรุณาเลือกระยะเวลาเช่า', 'error');
    return;
  }

  if (!document.getElementById('acceptRules').checked) {
    showToast('กรุณายอมรับกฎการใช้งานก่อน', 'error');
    return;
  }

  const btn = document.getElementById('confirmRentalBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

  try {
    const data = await apiFetch('/api/rent', {
      method: 'POST',
      body: { 
        machine_id: selectedMachineId, 
        duration_hours: selectedDuration,
        rent_unit: currentRentUnit,
        rent_quantity: currentRentQuantity
      }
    });

    hideModal('rentalModal');
    showModal('rentSuccessModal');
    showToast('เช่าคอมพิวเตอร์เรียบร้อยแล้ว!', 'success');

    // อัปเดตเครดิตใน cache
    const user = getCachedUser();
    if (user) {
      user.credit = data.rental.new_credit;
      setCachedUser(user);
      updateNavbar(user);
    }

    // Reload machines
    await loadMachines();

  } catch (err) {
    if (err.status === 400 && err.required) {
      // เครดิตไม่พอ
      hideModal('rentalModal');
      document.getElementById('creditRequired').textContent = `฿ ${formatCurrency(err.required)}`;
      document.getElementById('creditCurrent').textContent = `฿ ${formatCurrency(err.current)}`;
      showModal('creditModal');
    } else {
      showToast(err.error || 'เกิดข้อผิดพลาด', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ ยืนยันเช่าเครื่อง';
  }
}

// --- โหลด AnyDesk Info ---
async function loadAnydeskInfo(machineId) {
  const container = document.getElementById(`anydesk-info-${machineId}`);
  if (!container) return;

  try {
    const data = await apiFetch(`/api/machines/${machineId}/anydesk`);
    container.innerHTML = `
      <div class="space-y-2 text-xs">
        <div class="flex justify-between items-center p-2 bg-black/30 rounded">
          <span class="text-gray-400">AnyDesk ID:</span>
          <div class="flex items-center gap-1">
            <span class="text-white font-mono font-bold">${data.anydesk_id || '-'}</span>
            ${data.anydesk_id ? `<button onclick="copyToClipboard('${data.anydesk_id}', 'คัดลอกเลข AnyDesk แล้ว!')" class="text-cyan-400 hover:text-cyan-300 text-xs ml-1" title="คัดลอก">📋</button>` : ''}
          </div>
        </div>
        <div class="flex justify-between items-center p-2 bg-black/30 rounded">
          <span class="text-gray-400">AnyDesk Pass:</span>
          <div class="flex items-center gap-1">
            <span class="text-white font-mono" id="anydesk-pass-${machineId}">••••••••</span>
            <button onclick="toggleAnydeskPass(${machineId}, '${data.anydesk_password || ''}')" class="text-cyan-400 hover:text-cyan-300 ml-1">👁</button>
            ${data.anydesk_password ? `<button onclick="copyToClipboard('${data.anydesk_password}', 'คัดลอกรหัส AnyDesk แล้ว!')" class="text-cyan-400 hover:text-cyan-300 text-xs ml-1" title="คัดลอก">📋</button>` : ''}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p class="text-xs text-red-400">${err.error || 'ไม่สามารถโหลดข้อมูล AnyDesk'}</p>`;
  }
}

// --- Toggle AnyDesk Password ---
function toggleAnydeskPass(machineId, realPass) {
  const el = document.getElementById(`anydesk-pass-${machineId}`);
  if (el.textContent === '••••••••') {
    el.textContent = realPass;
  } else {
    el.textContent = '••••••••';
  }
}

// คัดลอกข้อความไปยัง Clipboard
function copyToClipboard(text, successMsg) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMsg || 'คัดลอกแล้ว!', 'success');
  }).catch(() => {
    // Fallback for non-secure contexts
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(successMsg || 'คัดลอกแล้ว!', 'success');
    } catch (err) {
      showToast('ไม่สามารถคัดลอกได้', 'error');
    }
    document.body.removeChild(textArea);
  });
}

// --- คืนเครื่อง ---
async function releaseMachine(machineId) {
  if (!confirm('คุณต้องการคืนเครื่องนี้ใช่หรือไม่?')) return;

  try {
    const data = await apiFetch(`/api/release/${machineId}`, { method: 'POST' });
    showToast(data.message, 'success');
    await loadMachines();
    // Refresh user credit
    await checkSession();
  } catch (err) {
    showToast(err.error || 'เกิดข้อผิดพลาด', 'error');
  }
}

// =============================================
// RENTAL EXTENSION FUNCTIONS (ต่อเวลาเช่า)
// =============================================
function openExtendModal(machineId) {
  if (!requireLogin()) return;

  const machine = allMachines.find(m => m.id === machineId);
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
  
  const machine = allMachines.find(m => m.id === selectedExtendMachineId);
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
  
  const machine = allMachines.find(m => m.id === selectedExtendMachineId);
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
  
  const machine = allMachines.find(m => m.id === selectedExtendMachineId);
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

    // โหลดเครื่องคอมพิวเตอร์ใหม่เพื่อแสดงผลเวลาต่อเช่าที่อัปเดต
    await loadMachines();
    // Refresh user credit
    await checkSession();

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

