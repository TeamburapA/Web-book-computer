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
    const isDailyAllowed = m.allow_daily !== false && m.allow_daily !== 'false' && m.allow_daily !== 0 && m.allow_daily !== '0';
    const isWeeklyAllowed = m.allow_weekly !== false && m.allow_weekly !== 'false' && m.allow_weekly !== 0 && m.allow_weekly !== '0';
    const isMonthlyAllowed = m.allow_monthly !== false && m.allow_monthly !== 'false' && m.allow_monthly !== 0 && m.allow_monthly !== '0';

    const allowedPricesCount = [isDailyAllowed, isWeeklyAllowed, isMonthlyAllowed].filter(Boolean).length;
    const priceClass = allowedPricesCount > 1 ? 'text-xl font-extrabold text-[#facc15]' : 'text-2xl font-extrabold text-[#facc15]';

    // Calculate maximum discount percentage for the card badge
    let maxDiscountPct = 0;
    if (isDailyAllowed) {
      const pricePerDay = parseFloat(m.price_per_day);
      if (pricePerDay > 0) {
        if (isWeeklyAllowed) {
          const pricePerWeek = parseFloat(m.price_per_week);
          const normalWeeklyPrice = pricePerDay * 7;
          const actualWeeklyPrice = pricePerWeek > 0 ? pricePerWeek : normalWeeklyPrice;
          if (actualWeeklyPrice < normalWeeklyPrice) {
            const pct = Math.round((1 - (actualWeeklyPrice / normalWeeklyPrice)) * 100);
            if (pct > maxDiscountPct) maxDiscountPct = pct;
          }
        }
        if (isMonthlyAllowed) {
          const pricePerMonth = parseFloat(m.price_per_month);
          const normalMonthlyPrice = pricePerDay * 30;
          const actualMonthlyPrice = pricePerMonth > 0 ? pricePerMonth : normalMonthlyPrice;
          if (actualMonthlyPrice < normalMonthlyPrice) {
            const pct = Math.round((1 - (actualMonthlyPrice / normalMonthlyPrice)) * 100);
            if (pct > maxDiscountPct) maxDiscountPct = pct;
          }
        }
      }
    } else {
      if (isWeeklyAllowed && isMonthlyAllowed) {
        const pricePerWeek = parseFloat(m.price_per_week);
        const pricePerMonth = parseFloat(m.price_per_month);
        if (pricePerWeek > 0 && pricePerMonth > 0) {
          const weeklyEquivalent = (pricePerWeek / 7) * 30;
          if (pricePerMonth < weeklyEquivalent) {
            const pct = Math.round((1 - (pricePerMonth / weeklyEquivalent)) * 100);
            if (pct > maxDiscountPct) maxDiscountPct = pct;
          }
        }
      }
    }

    return `
      <div class="cyber-card animate-slide-up group" style="animation-delay: ${idx * 0.05}s" id="machine-card-${m.id}">
        <!-- Header flat image area -->
        <div class="h-32 bg-[#09090d] border-b border-[#1f1f27] relative flex items-center justify-center overflow-hidden">
          <!-- Owner Badge on Top Left -->
          <div class="absolute top-3 left-3 z-10">
            ${m.owner_type === 'partner' ? `
              <span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/25 text-purple-300 border border-purple-500/40 backdrop-blur-md flex items-center gap-1 shadow-sm font-mono">
                พาร์ทเนอร์
              </span>
            ` : `
              <span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-yellow-500/25 text-yellow-300 border border-yellow-500/40 backdrop-blur-md flex items-center gap-1 shadow-sm font-mono">
                เครื่องร้านหลัก 
              </span>
            `}
          </div>

          ${m.image_url ? `
            <img src="${m.image_url}" alt="${m.name}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">
          ` : `
            <span class="text-5xl opacity-40 transition-transform duration-500 group-hover:scale-110">🖥️</span>
          `}
          <div class="absolute top-3 right-3 z-10 flex flex-col items-end gap-1">
            ${m.is_power_out ? '<span class="badge bg-red-500/20 text-red-400 border border-red-500/30">🔌 ไฟดับ</span>' : statusBadge(m.status)}
            ${tuyaPowerBadge(m.tuya_power)}
          </div>
        </div>

        <!-- Content -->
        <div class="p-5">
          <h3 class="text-md font-bold text-white mb-3 tracking-wide">${m.name}</h3>

          <!-- Specs -->
          <div class="grid grid-cols-1 gap-2 my-4 bg-[#050508] p-3 rounded-md border border-[#14141a]">
            <div class="flex items-center gap-2 text-xs">
              <span class="w-10 text-[9px] tracking-wider text-center font-bold py-0.5 rounded bg-[#13131a] text-[#facc15] border border-white/5 font-mono">CPU</span>
              <span class="truncate text-zinc-300 font-medium">${m.cpu || '-'}</span>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="w-10 text-[9px] tracking-wider text-center font-bold py-0.5 rounded bg-[#13131a] text-[#ec4899] border border-white/5 font-mono">RAM</span>
              <span class="truncate text-zinc-300 font-medium">${m.ram || '-'}</span>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="w-10 text-[9px] tracking-wider text-center font-bold py-0.5 rounded bg-[#13131a] text-cyan-400 border border-white/5 font-mono">DISK</span>
              <span class="truncate text-zinc-300 font-medium">${m.ssd || '-'}</span>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="w-10 text-[9px] tracking-wider text-center font-bold py-0.5 rounded bg-[#13131a] text-purple-400 border border-white/5 font-mono">GPU</span>
              <span class="truncate text-zinc-300 font-medium">${m.gpu || '-'}</span>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="w-10 text-[9px] tracking-wider text-center font-bold py-0.5 rounded bg-[#13131a] text-emerald-400 border border-white/5 font-mono">OS</span>
              <span class="truncate text-zinc-300 font-medium">${m.os || '-'}</span>
            </div>
          </div>

          ${m.test_result ? `
            <div class="my-3 text-xs bg-yellow-400/5 border border-yellow-400/10 p-2.5 rounded text-gray-400">
              <span class="block font-bold text-[#facc15] mb-1">📋 ผลการทดสอบ:</span>
              <span class="whitespace-pre-line">${m.test_result}</span>
            </div>
          ` : ''}

          <!-- Price -->
          <div class="flex items-center justify-between py-3 border-t border-[#1f1f27]">
            <div class="flex flex-col w-full">
              <span class="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold font-mono">ราคาเช่า</span>
              <div class="flex items-center justify-between w-full mt-0.5">
                <div class="flex flex-col gap-1">
                  ${isDailyAllowed ? `
                    <div class="flex items-baseline gap-0.5">
                      <span class="${priceClass}">฿${formatCurrency(m.price_per_day).split('.')[0]}</span>
                      <span class="text-zinc-500 text-xs font-semibold">/วัน</span>
                    </div>
                  ` : ''}
                  ${isWeeklyAllowed ? `
                    <div class="flex items-baseline gap-0.5">
                      <span class="${priceClass}">฿${formatCurrency(m.price_per_week > 0 ? m.price_per_week : parseFloat(m.price_per_day) * 7).split('.')[0]}</span>
                      <span class="text-zinc-500 text-xs font-semibold">/สัปดาห์</span>
                    </div>
                  ` : ''}
                  ${isMonthlyAllowed ? `
                    <div class="flex items-baseline gap-0.5">
                      <span class="${priceClass}">฿${formatCurrency(m.price_per_month > 0 ? m.price_per_month : parseFloat(m.price_per_day) * 30).split('.')[0]}</span>
                      <span class="text-zinc-500 text-xs font-semibold">/เดือน</span>
                    </div>
                  ` : ''}
                  ${(!isDailyAllowed && !isWeeklyAllowed && !isMonthlyAllowed) ? `
                    <div class="flex items-baseline gap-0.5">
                      <span class="text-sm font-bold text-gray-500">ไม่ได้เปิดเช่า</span>
                    </div>
                  ` : ''}
                </div>
                ${maxDiscountPct > 0 ? `
                  <span class="px-2.5 py-1 text-xs font-black bg-gradient-to-r from-red-500 via-rose-500 to-[#ff0055] text-white rounded shadow-[0_0_10px_rgba(239,68,68,0.5)] uppercase tracking-wider font-mono self-center">ลดสูงสุด ${maxDiscountPct}%</span>
                ` : ''}
              </div>
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
                <button onclick="loadAnydeskInfo(${m.id})" class="text-xs text-gray-400 hover:text-yellow-400 hover:underline transition">🖥️ แสดงข้อมูล AnyDesk</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-3">
              <button onclick="openExtendModal(${m.id})" ${m.is_power_out ? 'disabled' : ''} class="btn-neon text-sm !py-2 ${m.is_power_out ? 'opacity-50 cursor-not-allowed' : ''}">➕ ต่อเวลา</button>
              <button onclick="releaseMachine(${m.id})" ${m.is_power_out ? 'disabled' : ''} class="btn-outline text-sm !py-2 border-red-500/30 text-red-400 hover:!border-red-500 hover:!text-red-400 ${m.is_power_out ? 'opacity-50 cursor-not-allowed' : ''}">🔓 คืนเครื่อง</button>
            </div>
          ` : m.status === 'in_use' ? `
            <!-- In use by someone else -->
            <div class="mt-3 p-3 rounded-lg bg-yellow-400/5 border border-yellow-400/20 text-center">
              <span class="text-xs text-gray-400">⏰ เหลือเวลา</span>
              <div class="countdown mt-1" id="countdown-${m.id}" data-end="${m.session_end_time}">--:--:--</div>
            </div>
          ` : m.status === 'available' ? `
            <!-- Available — Rent button -->
            <button onclick="openRentalModal(${m.id})" ${m.is_power_out ? 'disabled' : ''} class="mt-3 w-full btn-neon text-sm !py-2.5 ${m.is_power_out ? 'opacity-50 cursor-not-allowed' : ''}">${m.is_power_out ? '🔌 ไฟดับ (งดเช่า)' : '⚡ เช่าเครื่องนี้'}</button>
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
    startCountdown(m.id, m.session_end_time, m.is_power_out);
  });
}

// --- Countdown Timer ---
function startCountdown(machineId, endTimeStr, isPowerOut) {
  const el = document.getElementById(`countdown-${machineId}`);
  if (!el) return;

  const endTime = new Date(endTimeStr).getTime();

  // ล้าง interval เดิม
  if (countdownIntervals[machineId]) clearInterval(countdownIntervals[machineId]);

  function update() {
    if (isPowerOut) {
      el.textContent = 'ระงับเวลา (ไฟดับ)';
      el.classList.add('text-red-400', 'font-bold');
      el.classList.remove('countdown');
      return;
    }
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((endTime - now) / 1000));

    el.textContent = formatCountdown(remaining);
    el.classList.remove('text-red-400', 'font-bold');
    el.classList.add('countdown');

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

  // Reset inputs and adjust pricing options based on machine allowance
  const btnDay = document.getElementById('unit-day');
  const btnWeek = document.getElementById('unit-week');
  const btnMonth = document.getElementById('unit-month');

  const isDailyAllowed = machine.allow_daily !== false && machine.allow_daily !== 'false' && machine.allow_daily !== 0 && machine.allow_daily !== '0';
  const isWeeklyAllowed = machine.allow_weekly !== false && machine.allow_weekly !== 'false' && machine.allow_weekly !== 0 && machine.allow_weekly !== '0';
  const isMonthlyAllowed = machine.allow_monthly !== false && machine.allow_monthly !== 'false' && machine.allow_monthly !== 0 && machine.allow_monthly !== '0';

  if (isDailyAllowed) {
    btnDay.classList.remove('hidden');
  } else {
    btnDay.classList.add('hidden');
  }

  if (isWeeklyAllowed) {
    btnWeek.classList.remove('hidden');
  } else {
    btnWeek.classList.add('hidden');
  }

  if (isMonthlyAllowed) {
    btnMonth.classList.remove('hidden');
  } else {
    btnMonth.classList.add('hidden');
  }

  const allowedCount = [isDailyAllowed, isWeeklyAllowed, isMonthlyAllowed].filter(Boolean).length;
  const parentContainer = btnDay.parentElement;
  if (parentContainer) {
    parentContainer.className = `grid gap-2 bg-cyber-dark p-1 rounded-lg border border-cyber-border grid-cols-${allowedCount || 1}`;
  }

  if (isDailyAllowed) {
    currentRentUnit = 'day';
  } else if (isWeeklyAllowed) {
    currentRentUnit = 'week';
  } else if (isMonthlyAllowed) {
    currentRentUnit = 'month';
  } else {
    currentRentUnit = 'day';
  }

  currentRentQuantity = 1;
  document.getElementById('rentQuantity').value = 1;

  const labelMap = {
    'day': 'วัน',
    'week': 'สัปดาห์',
    'month': 'เดือน'
  };
  document.getElementById('quantityUnitLabel').textContent = labelMap[currentRentUnit] || 'วัน';
  updateUnitButtonsHighlight();

  // Reset rules checkbox
  document.getElementById('acceptRules').checked = false;

  // User credit & partner choice
  const user = getCachedUser();
  document.getElementById('rentalUserCredit').textContent = user ? `฿ ${formatCurrency(user.credit)}` : '฿ 0.00';

  const partnerChoiceEl = document.getElementById('partnerPaymentChoice');
  if (partnerChoiceEl) {
    if (user && user.role === 'partner') {
      partnerChoiceEl.classList.remove('hidden');
      const payCreditBal = document.getElementById('payCreditBal');
      const payPartnerBal = document.getElementById('payPartnerCreditBal');
      if (payCreditBal) payCreditBal.textContent = `฿ ${formatCurrency(user.credit || 0)}`;
      if (payPartnerBal) payPartnerBal.textContent = `฿ ${formatCurrency(user.partner_credit || 0)}`;
    } else {
      partnerChoiceEl.classList.add('hidden');
    }
  }

  // Calculate default price
  updateRentCalculation(machine);
  updateSavingsTips(machine, 'rentalSavingsTips');

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
  const machine = allMachines.find(m => m.id === selectedMachineId);
  if (!machine) return;

  const isDailyAllowed = machine.allow_daily !== false && machine.allow_daily !== 'false' && machine.allow_daily !== 0 && machine.allow_daily !== '0';
  const isWeeklyAllowed = machine.allow_weekly !== false && machine.allow_weekly !== 'false' && machine.allow_weekly !== 0 && machine.allow_weekly !== '0';
  const isMonthlyAllowed = machine.allow_monthly !== false && machine.allow_monthly !== 'false' && machine.allow_monthly !== 0 && machine.allow_monthly !== '0';

  if (unit === 'day' && !isDailyAllowed) return;
  if (unit === 'week' && !isWeeklyAllowed) return;
  if (unit === 'month' && !isMonthlyAllowed) return;

  currentRentUnit = unit;
  
  const labelMap = {
    'day': 'วัน',
    'week': 'สัปดาห์',
    'month': 'เดือน'
  };
  document.getElementById('quantityUnitLabel').textContent = labelMap[unit] || 'วัน';
  
  updateUnitButtonsHighlight();
  updateRentCalculation(machine);
}

// --- อัปเดตการเลือกปุ่มหน่วยเช่า ---
function updateUnitButtonsHighlight() {
  const units = ['day', 'week', 'month'];
  units.forEach(u => {
    const btn = document.getElementById(`unit-${u}`);
    if (!btn) return;
    if (u === currentRentUnit) {
      btn.classList.add('text-yellow-400', 'bg-white/5', 'border', 'border-yellow-400/20');
      btn.classList.remove('text-gray-400', 'hover:text-white');
    } else {
      btn.classList.remove('text-yellow-400', 'bg-white/5', 'border', 'border-yellow-400/20');
      btn.classList.add('text-gray-400', 'hover:text-white');
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
    const payment_method = document.querySelector('input[name="rentalPaymentMethod"]:checked')?.value || 'credit';

    const data = await apiFetch('/api/rent', {
      method: 'POST',
      body: { 
        machine_id: selectedMachineId, 
        duration_hours: selectedDuration,
        rent_unit: currentRentUnit,
        rent_quantity: currentRentQuantity,
        payment_method: payment_method
      }
    });

    hideModal('rentalModal');
    showModal('rentSuccessModal');
    showToast('เช่าคอมพิวเตอร์เรียบร้อยแล้ว!', 'success');

    // อัปเดตเครดิตใน cache
    const user = getCachedUser();
    if (user) {
      if (data.rental.new_credit !== undefined) user.credit = data.rental.new_credit;
      if (data.rental.new_partner_credit !== undefined) user.partner_credit = data.rental.new_partner_credit;
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
        <div class="flex justify-between items-center p-2 bg-black/40 border border-white/5 rounded-lg">
          <span class="text-gray-400">AnyDesk ID:</span>
          <div class="flex items-center gap-1">
            <span class="text-white font-mono font-bold">${data.anydesk_id || '-'}</span>
            ${data.anydesk_id ? `<button onclick="copyToClipboard('${data.anydesk_id}', 'คัดลอกเลข AnyDesk แล้ว!')" class="text-gray-400 hover:text-yellow-400 text-xs ml-1 transition" title="คัดลอก">📋</button>` : ''}
          </div>
        </div>
        <div class="flex justify-between items-center p-2 bg-black/40 border border-white/5 rounded-lg">
          <span class="text-gray-400">AnyDesk Pass:</span>
          <div class="flex items-center gap-1">
            <span class="text-white font-mono" id="anydesk-pass-${machineId}">••••••••</span>
            <button onclick="toggleAnydeskPass(${machineId}, '${data.anydesk_password || ''}')" class="text-gray-400 hover:text-yellow-400 ml-1 transition">👁</button>
            ${data.anydesk_password ? `<button onclick="copyToClipboard('${data.anydesk_password}', 'คัดลอกรหัส AnyDesk แล้ว!')" class="text-gray-400 hover:text-yellow-400 text-xs ml-1 transition" title="คัดลอก">📋</button>` : ''}
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

  // Reset inputs and adjust pricing options based on machine allowance
  const btnDay = document.getElementById('ext-unit-day');
  const btnWeek = document.getElementById('ext-unit-week');
  const btnMonth = document.getElementById('ext-unit-month');

  const isDailyAllowed = machine.allow_daily !== false && machine.allow_daily !== 'false' && machine.allow_daily !== 0 && machine.allow_daily !== '0';
  const isWeeklyAllowed = machine.allow_weekly !== false && machine.allow_weekly !== 'false' && machine.allow_weekly !== 0 && machine.allow_weekly !== '0';
  const isMonthlyAllowed = machine.allow_monthly !== false && machine.allow_monthly !== 'false' && machine.allow_monthly !== 0 && machine.allow_monthly !== '0';

  if (isDailyAllowed) {
    btnDay.classList.remove('hidden');
  } else {
    btnDay.classList.add('hidden');
  }

  if (isWeeklyAllowed) {
    btnWeek.classList.remove('hidden');
  } else {
    btnWeek.classList.add('hidden');
  }

  if (isMonthlyAllowed) {
    btnMonth.classList.remove('hidden');
  } else {
    btnMonth.classList.add('hidden');
  }

  const allowedCount = [isDailyAllowed, isWeeklyAllowed, isMonthlyAllowed].filter(Boolean).length;
  const parentContainer = btnDay.parentElement;
  if (parentContainer) {
    parentContainer.className = `grid gap-2 bg-cyber-dark p-1 rounded-lg border border-cyber-border grid-cols-${allowedCount || 1}`;
  }

  if (isDailyAllowed) {
    currentExtendUnit = 'day';
  } else if (isWeeklyAllowed) {
    currentExtendUnit = 'week';
  } else if (isMonthlyAllowed) {
    currentExtendUnit = 'month';
  } else {
    currentExtendUnit = 'day';
  }

  currentExtendQuantity = 1;
  document.getElementById('extendQuantity').value = 1;

  const labelMap = {
    'day': 'วัน',
    'week': 'สัปดาห์',
    'month': 'เดือน'
  };
  document.getElementById('extendQuantityUnitLabel').textContent = labelMap[currentExtendUnit] || 'วัน';
  updateExtendUnitButtonsHighlight();

  // User credit
  const user = getCachedUser();
  document.getElementById('extendUserCredit').textContent = user ? `฿ ${formatCurrency(user.credit)}` : '฿ 0.00';

  // Calculate default price
  updateExtendCalculation(machine);
  updateSavingsTips(machine, 'extendSavingsTips');

  showModal('extendModal');
}

function selectExtendUnit(unit) {
  const machine = allMachines.find(m => m.id === selectedExtendMachineId);
  if (!machine) return;

  const isDailyAllowed = machine.allow_daily !== false && machine.allow_daily !== 'false' && machine.allow_daily !== 0 && machine.allow_daily !== '0';
  const isWeeklyAllowed = machine.allow_weekly !== false && machine.allow_weekly !== 'false' && machine.allow_weekly !== 0 && machine.allow_weekly !== '0';
  const isMonthlyAllowed = machine.allow_monthly !== false && machine.allow_monthly !== 'false' && machine.allow_monthly !== 0 && machine.allow_monthly !== '0';

  if (unit === 'day' && !isDailyAllowed) return;
  if (unit === 'week' && !isWeeklyAllowed) return;
  if (unit === 'month' && !isMonthlyAllowed) return;

  currentExtendUnit = unit;
  
  const labelMap = {
    'day': 'วัน',
    'week': 'สัปดาห์',
    'month': 'เดือน'
  };
  document.getElementById('extendQuantityUnitLabel').textContent = labelMap[unit] || 'วัน';
  
  updateExtendUnitButtonsHighlight();
  updateExtendCalculation(machine);
}

function updateExtendUnitButtonsHighlight() {
  const units = ['day', 'week', 'month'];
  units.forEach(u => {
    const btn = document.getElementById(`ext-unit-${u}`);
    if (!btn) return;
    if (u === currentExtendUnit) {
      btn.classList.add('text-yellow-400', 'bg-white/5', 'border', 'border-yellow-400/20');
      btn.classList.remove('text-gray-400', 'hover:text-white');
    } else {
      btn.classList.remove('text-yellow-400', 'bg-white/5', 'border', 'border-yellow-400/20');
      btn.classList.add('text-gray-400', 'hover:text-white');
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

