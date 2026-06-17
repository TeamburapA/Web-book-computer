// =============================================
// Machines — ระบบเช่าเครื่องคอมพิวเตอร์
// =============================================

let allMachines = [];
let selectedMachineId = null;
let selectedDuration = null;
let countdownIntervals = {};

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
    grid.innerHTML = `<div class="col-span-full text-center py-20 text-gray-500">📭 ไม่พบเครื่องในหมวดหมู่นี้</div>`;
    return;
  }

  // ล้าง countdown intervals เดิม
  Object.values(countdownIntervals).forEach(clearInterval);
  countdownIntervals = {};

  const currentUser = getCachedUser();

  grid.innerHTML = machines.map((m, idx) => {
    const isMyMachine = currentUser && m.current_user_id === currentUser.id;
    const gradientClass = m.category === 'gaming'
      ? 'from-pink-500/20 to-purple-500/20'
      : 'from-yellow-500/20 to-orange-500/20';
    const categoryIcon = m.category === 'gaming' ? '🎮' : '🤖';

    return `
      <div class="cyber-card animate-slide-up" style="animation-delay: ${idx * 0.05}s" id="machine-card-${m.id}">
        <!-- Header gradient -->
        <div class="h-32 bg-gradient-to-br ${gradientClass} relative flex items-center justify-center">
          <span class="text-5xl opacity-50">${categoryIcon}</span>
          <div class="absolute top-3 right-3">${statusBadge(m.status)}</div>
          <div class="absolute top-3 left-3">${categoryLabel(m.category)}</div>
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
              <span class="text-yellow-400 font-bold text-lg">฿${formatCurrency(m.price_per_hour)}</span>
              <span class="text-gray-500 text-xs">/ชม.</span>
            </div>
            <div class="text-right">
              <span class="text-pink-400 font-bold">฿${formatCurrency(m.price_per_day)}</span>
              <span class="text-gray-500 text-xs">/วัน</span>
            </div>
          </div>

          ${m.status === 'in_use' && isMyMachine ? `
            <!-- Countdown + RDP (for current renter) -->
            <div class="mt-3 p-3 rounded-lg bg-yellow-400/5 border border-yellow-400/20">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-gray-400">⏰ เหลือเวลา</span>
                <span class="countdown" id="countdown-${m.id}" data-end="${m.session_end_time}">--:--:--</span>
              </div>
              <div id="rdp-info-${m.id}" class="mt-2">
                <button onclick="loadRdpInfo(${m.id})" class="text-xs text-yellow-400 hover:underline">📡 แสดงข้อมูล RDP</button>
              </div>
            </div>
            <button onclick="releaseMachine(${m.id})" class="mt-3 w-full btn-outline text-sm !py-2 border-red-500/30 text-red-400 hover:!border-red-500 hover:!text-red-400">🔓 คืนเครื่อง</button>
          ` : m.status === 'in_use' ? `
            <!-- In use by someone else -->
            <div class="mt-3 p-3 rounded-lg bg-yellow-400/5 border border-yellow-400/20 text-center">
              <span class="text-xs text-gray-400">⏰ เหลือเวลา</span>
              <div class="countdown mt-1" id="countdown-${m.id}" data-end="${m.session_end_time}">--:--:--</div>
            </div>
          ` : m.status === 'available' ? `
            <!-- Available — Rent button -->
            <button onclick="openRentalModal(${m.id})" class="mt-3 w-full btn-neon text-sm !py-2.5">⚡ เช่าเครื่องนี้</button>
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
  selectedDuration = null;

  // อัปเดต Modal content
  document.getElementById('rentalMachineName').textContent = `⚡ เช่าเครื่อง ${machine.name}`;
  document.getElementById('rentalMachineSpec').textContent = `${machine.cpu} • ${machine.ram} • ${machine.gpu}`;

  // Duration options
  const durations = [
    { hours: 1, label: '1 ชม.' },
    { hours: 2, label: '2 ชม.' },
    { hours: 3, label: '3 ชม.' },
    { hours: 6, label: '6 ชม.' },
    { hours: 12, label: '12 ชม.' },
    { hours: 24, label: '1 วัน' },
    { hours: 48, label: '2 วัน' },
    { hours: 72, label: '3 วัน' }
  ];

  document.getElementById('durationOptions').innerHTML = durations.map(d => {
    const price = calculatePrice(machine, d.hours);
    return `
      <div class="duration-option" onclick="selectDuration(${d.hours}, ${machineId})" data-hours="${d.hours}">
        <p class="text-white font-semibold text-sm">${d.label}</p>
        <p class="text-yellow-400 text-xs mt-1">฿${formatCurrency(price)}</p>
      </div>
    `;
  }).join('');

  // Reset
  document.getElementById('rentalTotalPrice').textContent = '฿ 0.00';
  document.getElementById('acceptRules').checked = false;

  // User credit
  const user = getCachedUser();
  document.getElementById('rentalUserCredit').textContent = user ? `฿ ${formatCurrency(user.credit)}` : '฿ 0.00';

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

// --- เลือกระยะเวลา ---
function selectDuration(hours, machineId) {
  selectedDuration = hours;
  const machine = allMachines.find(m => m.id === machineId);
  const price = calculatePrice(machine, hours);

  // อัปเดต UI
  document.querySelectorAll('.duration-option').forEach(el => el.classList.remove('selected'));
  document.querySelector(`.duration-option[data-hours="${hours}"]`).classList.add('selected');
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
      body: { machine_id: selectedMachineId, duration_hours: selectedDuration }
    });

    hideModal('rentalModal');
    showToast(data.message, 'success');

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

// --- โหลด RDP Info ---
async function loadRdpInfo(machineId) {
  const container = document.getElementById(`rdp-info-${machineId}`);
  if (!container) return;

  try {
    const data = await apiFetch(`/api/machines/${machineId}/rdp`);
    container.innerHTML = `
      <div class="space-y-2 text-xs">
        <div class="flex justify-between items-center p-2 bg-black/30 rounded">
          <span class="text-gray-400">IP:</span>
          <span class="text-white font-mono">${data.rdp_ip}</span>
        </div>
        <div class="flex justify-between items-center p-2 bg-black/30 rounded">
          <span class="text-gray-400">User:</span>
          <span class="text-white font-mono">${data.rdp_username}</span>
        </div>
        <div class="flex justify-between items-center p-2 bg-black/30 rounded">
          <span class="text-gray-400">Pass:</span>
          <span class="text-white font-mono rdp-password" id="rdp-pass-${machineId}">••••••••</span>
          <button onclick="toggleRdpPass(${machineId}, '${data.rdp_password}')" class="text-yellow-400 hover:text-yellow-300 ml-2">👁</button>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p class="text-xs text-red-400">${err.error || 'ไม่สามารถโหลดข้อมูล RDP'}</p>`;
  }
}

// --- Toggle RDP Password ---
function toggleRdpPass(machineId, realPass) {
  const el = document.getElementById(`rdp-pass-${machineId}`);
  if (el.textContent === '••••••••') {
    el.textContent = realPass;
  } else {
    el.textContent = '••••••••';
  }
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
