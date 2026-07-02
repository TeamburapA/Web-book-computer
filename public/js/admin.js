// =============================================
// Admin — ระบบจัดการหลังบ้าน
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  initAdmin();
});

async function initAdmin() {
  const token = getToken();
  if (!token) {
    document.getElementById('accessDenied').classList.remove('hidden');
    document.getElementById('adminContent').classList.add('hidden');
    return;
  }

  try {
    const data = await apiFetch('/api/me');
    if (data.user.role !== 'admin') {
      document.getElementById('accessDenied').classList.remove('hidden');
      document.getElementById('adminContent').classList.add('hidden');
      return;
    }

    document.getElementById('accessDenied').classList.add('hidden');
    document.getElementById('adminContent').classList.remove('hidden');

    await Promise.all([
      loadAdminStats(),
      loadAdminMachines(),
      loadAdminRentals(),
      loadAdminTopups(),
      loadAdminUsers(),
      loadAdminSettings(),
      loadAdminFinance()
    ]);

    setupMachineForm();
    setupUserCreditForm();
    setupUserTimeForm();
    setupSettingsForm();
    setupElectricityForm();
    setupShopAccountForm();
    setupSlipSettingsForm();
    await loadShopAccounts();
  } catch (err) {
    document.getElementById('accessDenied').classList.remove('hidden');
    document.getElementById('adminContent').classList.add('hidden');
  }
}

// --- Tab Switching ---
function switchAdminTab(tab) {
  ['machines', 'rentals', 'topups', 'users', 'settings', 'finance'].forEach(t => {
    document.getElementById(`panel-${t}`).classList.toggle('hidden', t !== tab);
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
  });
}

// --- Stats ---
async function loadAdminStats() {
  try {
    const data = await apiFetch('/api/admin/stats');
    document.getElementById('adminStats').innerHTML = `
      <div class="cyber-card p-4 text-center">
        <p class="text-2xl font-bold text-white">${data.totalMachines}</p>
        <p class="text-xs text-gray-500 mt-1">เครื่องทั้งหมด</p>
      </div>
      <div class="cyber-card p-4 text-center">
        <p class="text-2xl font-bold neon-text-yellow">${data.activeMachines}</p>
        <p class="text-xs text-gray-500 mt-1">กำลังใช้งาน</p>
      </div>
      <div class="cyber-card p-4 text-center">
        <p class="text-2xl font-bold text-white">${data.totalUsers}</p>
        <p class="text-xs text-gray-500 mt-1">สมาชิก</p>
      </div>
      <div class="cyber-card p-4 text-center">
        <p class="text-2xl font-bold text-white">${data.totalRentals}</p>
        <p class="text-xs text-gray-500 mt-1">การเช่าทั้งหมด</p>
      </div>
      <div class="cyber-card p-4 text-center">
        <p class="text-2xl font-bold text-green-400">฿${formatCurrency(data.totalRevenue)}</p>
        <p class="text-xs text-gray-500 mt-1">รายได้จากเช่า</p>
      </div>
      <div class="cyber-card p-4 text-center">
        <p class="text-2xl font-bold neon-text-pink">฿${formatCurrency(data.totalTopups)}</p>
        <p class="text-xs text-gray-500 mt-1">ยอดเติมเงิน</p>
      </div>
    `;
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// --- Machine Management ---
async function loadAdminMachines() {
  const container = document.getElementById('adminMachineList');
  try {
    const data = await apiFetch('/api/admin/machines');
    if (!data.machines || data.machines.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-gray-500">📭 ยังไม่มีเครื่องในระบบ</div>`;
      return;
    }

    container.innerHTML = `
      <table class="cyber-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>ชื่อเครื่อง</th>
            <th>สเปก</th>
            <th>ราคา</th>
            <th>สถานะ</th>
            <th>AnyDesk</th>
            <th>ไฟฟ้า (Tuya)</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${data.machines.map(m => `
            <tr>
              <td class="text-gray-500 font-mono text-xs">#${m.id}</td>
              <td class="font-semibold text-white whitespace-nowrap">${m.name}</td>
              <td class="text-xs text-gray-400">
                <span class="block">${m.cpu || '-'}</span>
                <span class="block">${m.ram || '-'} / ${m.gpu || '-'}</span>
              </td>
              <td class="whitespace-nowrap">
                <span class="text-pink-400 font-bold">฿${formatCurrency(m.price_per_day)}</span><span class="text-gray-500 text-xs">/วัน</span>
              </td>
              <td>${m.is_power_out ? `<span class="badge bg-red-500/20 text-red-400 border border-red-500/30">🔌 ไฟดับ (หยุดเวลา)</span>` : statusBadge(m.status)}</td>
              <td class="text-xs font-mono text-cyan-400">${m.anydesk_id || '-'}</td>
              <td class="whitespace-nowrap">
                ${m.tuya_device_id ? `
                  <div class="flex gap-1">
                    <button onclick="powerMachine(${m.id}, 'on')" class="px-2 py-1 text-xs bg-green-500/10 text-green-400 rounded border border-green-500/20 hover:bg-green-500/20 transition" title="เปิดเครื่อง">⚡เปิด</button>
                    <button onclick="powerMachine(${m.id}, 'off')" class="px-2 py-1 text-xs bg-red-500/10 text-red-400 rounded border border-red-500/20 hover:bg-red-500/20 transition" title="ปิดเครื่อง">❌ปิด</button>
                  </div>
                ` : '<span class="text-gray-600 text-xs">ยังไม่ตั้งค่า</span>'}
              </td>
              <td class="whitespace-nowrap">
                <div class="flex gap-1">
                  <button onclick="editMachine(${m.id})" class="px-2 py-1 text-xs bg-blue-500/10 text-blue-400 rounded border border-blue-500/20 hover:bg-blue-500/20 transition" title="แก้ไข">✏️</button>
                  ${m.is_power_out ? `
                    <button onclick="toggleMachinePowerOutage(${m.id}, 'deactivate')" class="px-2 py-1 text-xs bg-green-500/10 text-green-400 rounded border border-green-500/20 hover:bg-green-500/20 transition" title="ไฟกลับมาปกติ">🔌ไฟปกติ</button>
                  ` : `
                    <button onclick="toggleMachinePowerOutage(${m.id}, 'activate')" class="px-2 py-1 text-xs bg-red-500/10 text-red-400 rounded border border-red-500/20 hover:bg-red-500/20 transition" title="เปิดโหมดไฟดับ">🔌ไฟดับ</button>
                  `}
                  ${m.status === 'available' ? `
                    <button onclick="changeMachineStatus(${m.id}, 'maintenance')" class="px-2 py-1 text-xs bg-orange-500/10 text-orange-400 rounded border border-orange-500/20 hover:bg-orange-500/20 transition" title="ปิดซ่อม">🔧</button>
                  ` : m.status === 'maintenance' ? `
                    <button onclick="changeMachineStatus(${m.id}, 'available')" class="px-2 py-1 text-xs bg-green-500/10 text-green-400 rounded border border-green-500/20 hover:bg-green-500/20 transition" title="เปิดใช้งาน">✅</button>
                  ` : m.status === 'clearing' ? `
                    <button onclick="changeMachineStatus(${m.id}, 'available')" class="px-2 py-1 text-xs bg-green-500/10 text-green-400 rounded border border-green-500/20 hover:bg-green-500/20 transition" title="เสร็จสิ้นการเคลียข้อมูล (เปลี่ยนเป็นว่าง)">🔓</button>
                  ` : `
                    <button onclick="changeMachineStatus(${m.id}, 'available')" class="px-2 py-1 text-xs bg-green-500/10 text-green-400 rounded border border-green-500/20 hover:bg-green-500/20 transition" title="คืนเครื่อง">🔓</button>
                  `}
                  <button onclick="deleteMachine(${m.id}, '${m.name}')" class="px-2 py-1 text-xs bg-red-500/10 text-red-400 rounded border border-red-500/20 hover:bg-red-500/20 transition" title="ลบ">🗑️</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="text-center py-8 text-red-400">❌ โหลดข้อมูลไม่สำเร็จ</div>`;
  }
}

let adminMachinesCache = [];

async function fetchAdminMachinesCache() {
  try {
    const data = await apiFetch('/api/admin/machines');
    adminMachinesCache = data.machines || [];
  } catch (e) { adminMachinesCache = []; }
}

function showAddMachineModal() {
  document.getElementById('machineFormTitle').textContent = '➕ เพิ่มเครื่องใหม่';
  document.getElementById('machineFormSubmitBtn').textContent = '💾 เพิ่มเครื่อง';
  document.getElementById('machineForm').reset();
  document.getElementById('mf_id').value = '';
  document.getElementById('mf_allow_daily').checked = true;
  document.getElementById('mf_allow_weekly').checked = true;
  document.getElementById('mf_allow_monthly').checked = true;
  document.getElementById('mf_test_result').value = '';
  showModal('machineFormModal');
}

async function editMachine(id) {
  await fetchAdminMachinesCache();
  const m = adminMachinesCache.find(x => x.id === id);
  if (!m) { showToast('ไม่พบข้อมูลเครื่อง', 'error'); return; }

  document.getElementById('machineFormTitle').textContent = `✏️ แก้ไขเครื่อง ${m.name}`;
  document.getElementById('machineFormSubmitBtn').textContent = '💾 บันทึกการแก้ไข';
  document.getElementById('mf_id').value = m.id;
  document.getElementById('mf_name').value = m.name;
  document.getElementById('mf_category').value = m.category;
  document.getElementById('mf_cpu').value = m.cpu || '';
  document.getElementById('mf_ram').value = m.ram || '';
  document.getElementById('mf_ssd').value = m.ssd || '';
  document.getElementById('mf_gpu').value = m.gpu || '';
  document.getElementById('mf_os').value = m.os || '';
  document.getElementById('mf_price_hour').value = m.price_per_hour;
  document.getElementById('mf_price_day').value = m.price_per_day;
  document.getElementById('mf_price_week').value = m.price_per_week || '';
  document.getElementById('mf_price_month').value = m.price_per_month || '';
  document.getElementById('mf_anydesk_id').value = m.anydesk_id || '';
  document.getElementById('mf_anydesk_pass').value = m.anydesk_password || '';
  document.getElementById('mf_tuya_id').value = m.tuya_device_id || '';
  document.getElementById('mf_image').value = m.image_url || '';
  document.getElementById('mf_allow_daily').checked = m.allow_daily !== false;
  document.getElementById('mf_allow_weekly').checked = m.allow_weekly !== false;
  document.getElementById('mf_allow_monthly').checked = m.allow_monthly !== false;
  document.getElementById('mf_test_result').value = m.test_result || '';
  showModal('machineFormModal');
}

function setupMachineForm() {
  const form = document.getElementById('machineForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('machineFormSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

    const id = document.getElementById('mf_id').value;
    const body = {
      name: document.getElementById('mf_name').value,
      category: document.getElementById('mf_category').value,
      cpu: document.getElementById('mf_cpu').value,
      ram: document.getElementById('mf_ram').value,
      ssd: document.getElementById('mf_ssd').value,
      gpu: document.getElementById('mf_gpu').value,
      os: document.getElementById('mf_os').value,
      price_per_hour: document.getElementById('mf_price_hour').value,
      price_per_day: document.getElementById('mf_price_day').value,
      price_per_week: document.getElementById('mf_price_week').value || 0,
      price_per_month: document.getElementById('mf_price_month').value || 0,
      anydesk_id: document.getElementById('mf_anydesk_id').value,
      anydesk_password: document.getElementById('mf_anydesk_pass').value,
      tuya_device_id: document.getElementById('mf_tuya_id').value,
      image_url: document.getElementById('mf_image').value,
      allow_daily: document.getElementById('mf_allow_daily').checked,
      allow_weekly: document.getElementById('mf_allow_weekly').checked,
      allow_monthly: document.getElementById('mf_allow_monthly').checked,
      test_result: document.getElementById('mf_test_result').value
    };

    try {
      if (id) {
        await apiFetch(`/api/admin/machines/${id}`, { method: 'PUT', body });
        showToast('แก้ไขเครื่องสำเร็จ', 'success');
      } else {
        await apiFetch('/api/admin/machines', { method: 'POST', body });
        showToast('เพิ่มเครื่องใหม่สำเร็จ', 'success');
      }
      hideModal('machineFormModal');
      await loadAdminMachines();
      await loadAdminStats();
    } catch (err) {
      showToast(err.error || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = id ? '💾 บันทึกการแก้ไข' : '💾 เพิ่มเครื่อง';
    }
  });
}

async function changeMachineStatus(id, newStatus) {
  const statusText = { available: 'เปิดให้บริการ', maintenance: 'ปิดซ่อม' };
  if (!confirm(`ต้องการเปลี่ยนสถานะเครื่องเป็น "${statusText[newStatus] || newStatus}" ใช่หรือไม่?`)) return;

  try {
    await apiFetch(`/api/admin/machines/${id}/status`, {
      method: 'PATCH',
      body: { status: newStatus }
    });
    showToast('เปลี่ยนสถานะสำเร็จ', 'success');
    await loadAdminMachines();
    await loadAdminStats();
  } catch (err) {
    showToast(err.error || 'เกิดข้อผิดพลาด', 'error');
  }
}

async function deleteMachine(id, name) {
  if (!confirm(`⚠️ ต้องการลบเครื่อง "${name}" ใช่หรือไม่?\nการกระทำนี้ไม่สามารถย้อนกลับได้!`)) return;

  try {
    await apiFetch(`/api/admin/machines/${id}`, { method: 'DELETE' });
    showToast('ลบเครื่องสำเร็จ', 'success');
    await loadAdminMachines();
    await loadAdminStats();
  } catch (err) {
    showToast(err.error || 'ไม่สามารถลบเครื่องได้', 'error');
  }
}

// --- Power Control via Tuya ---
async function powerMachine(id, action) {
  const actionLabel = { on: 'เปิดเครื่อง', off: 'ปิดเครื่อง', restart: 'บังคับรีสตาร์ท (Force Reset)' }[action];
  if (!confirm(`⚡ ต้องการ "${actionLabel}" ใช่หรือไม่?`)) return;

  try {
    showToast(`กำลังสั่ง ${actionLabel}...`, 'info');
    const data = await apiFetch(`/api/machines/${id}/power`, {
      method: 'POST',
      body: { action }
    });
    showToast(data.message || `${actionLabel} สำเร็จ`, 'success');
  } catch (err) {
    showToast(err.error || `ไม่สามารถ${actionLabel}ได้`, 'error');
  }
}

// --- Rental History (Admin) ---
async function loadAdminRentals() {
  const container = document.getElementById('adminRentalList');
  try {
    const data = await apiFetch('/api/admin/rentals');
    if (!data.rentals || data.rentals.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-gray-500">📭 ยังไม่มีประวัติการเช่า</div>`;
      return;
    }

    container.innerHTML = `
      <table class="cyber-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>ผู้เช่า</th>
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
              <td class="font-mono text-xs text-gray-500">#${r.id}</td>
              <td class="font-semibold text-pink-400">${r.users?.username || '-'}</td>
              <td class="text-white whitespace-nowrap">${r.machine_name || '-'}</td>
              <td>${
                r.duration_hours % 720 === 0 ? (r.duration_hours / 720) + ' เดือน' :
                r.duration_hours % 168 === 0 ? (r.duration_hours / 168) + ' สัปดาห์' :
                r.duration_hours >= 24 ? Math.floor(r.duration_hours / 24) + ' วัน' :
                r.duration_hours + ' ชม.'
              }</td>
              <td class="text-yellow-400 font-bold">฿${formatCurrency(r.total_price)}</td>
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

// --- Topup History (Admin) ---
async function loadAdminTopups() {
  const container = document.getElementById('adminTopupList');
  try {
    const data = await apiFetch('/api/admin/topups');
    if (!data.topups || data.topups.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-gray-500">📭 ยังไม่มีประวัติเติมเงิน</div>`;
      return;
    }

    container.innerHTML = `
      <table class="cyber-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>ผู้ใช้</th>
            <th>จำนวนเงิน</th>
            <th>Transaction Ref</th>
            <th>สถานะ</th>
            <th>หมายเหตุ</th>
            <th>วันที่</th>
          </tr>
        </thead>
        <tbody>
          ${data.topups.map(t => `
            <tr>
              <td class="font-mono text-xs text-gray-500">#${t.id}</td>
              <td class="font-semibold text-pink-400">${t.users?.username || '-'}</td>
              <td class="text-yellow-400 font-bold">฿${formatCurrency(t.amount)}</td>
              <td class="text-xs font-mono text-gray-500">${t.transaction_ref || '-'}</td>
              <td>${statusBadge(t.status)}</td>
              <td class="text-xs text-gray-500 max-w-[200px] truncate">${t.note || '-'}</td>
              <td class="text-xs whitespace-nowrap">${formatDate(t.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="text-center py-8 text-red-400">❌ โหลดข้อมูลไม่สำเร็จ</div>`;
  }
}

// --- User Management (Admin) ---
let adminCountdownIntervals = {};

function startAdminCountdown(userId, endTimeStr, isPowerOut) {
  const el = document.getElementById(`admin-countdown-${userId}`);
  if (!el) return;

  const endTime = new Date(endTimeStr).getTime();
  if (adminCountdownIntervals[userId]) clearInterval(adminCountdownIntervals[userId]);

  function update() {
    if (isPowerOut) {
      el.textContent = 'ระงับเวลา (ไฟดับ)';
      el.className = 'text-red-400 font-bold';
      return;
    }

    const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    el.textContent = formatCountdown(remaining);
    el.className = remaining <= 300 ? 'text-red-400 font-bold animate-pulse' : 'text-gray-300 font-mono';
    
    if (remaining <= 0) {
      clearInterval(adminCountdownIntervals[userId]);
      setTimeout(() => loadAdminUsers(), 2000);
    }
  }
  update();
  adminCountdownIntervals[userId] = setInterval(update, 1000);
}

async function loadAdminUsers() {
  const container = document.getElementById('adminUserList');
  try {
    const data = await apiFetch('/api/admin/users');
    if (!data.users || data.users.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-gray-500">📭 ยังไม่มีผู้ใช้ในระบบ</div>`;
      return;
    }

    // Clear old countdowns
    Object.values(adminCountdownIntervals).forEach(clearInterval);
    adminCountdownIntervals = {};

    container.innerHTML = `
      <table class="cyber-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>ชื่อผู้ใช้</th>
            <th>เครื่องที่เช่า</th>
            <th>เวลาที่เหลือ</th>
            <th>ยอดเงินคงเหลือ</th>
            <th>บทบาท</th>
            <th>วันที่สมัคร</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${data.users.map(u => `
            <tr>
              <td class="font-mono text-xs text-gray-500">${u.id}</td>
              <td class="font-semibold text-white whitespace-nowrap">${u.username}</td>
              <td>
                ${u.active_machine 
                  ? (u.active_machine.is_power_out
                    ? `<span class="badge bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">🔌 ไฟดับ: ${u.active_machine.name}</span>`
                    : `<span class="badge badge-in-use">${u.active_machine.name}</span>`
                  )
                  : `<span class="text-gray-500 text-sm">ว่าง</span>`
                }
              </td>
              <td>
                ${u.active_machine 
                  ? `<span class="admin-countdown font-mono text-xs" id="admin-countdown-${u.id}" data-end="${u.active_machine.session_end_time}">--:--:--</span>`
                  : `<span class="text-gray-500 text-sm">-</span>`
                }
              </td>
              <td class="text-yellow-400 font-bold">฿${formatCurrency(u.credit)}</td>
              <td>
                <span class="px-2 py-0.5 text-xs rounded-full ${
                  u.role === 'admin'
                    ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                }">
                  ${u.role}
                </span>
              </td>
              <td class="text-xs whitespace-nowrap">${formatDate(u.created_at)}</td>
              <td class="whitespace-nowrap">
                <div class="flex gap-2">
                  <button onclick="openUserCreditModal('${u.id}', '${u.username}', ${u.credit})"
                          class="px-2 py-1 text-xs bg-yellow-500/10 text-yellow-400 rounded border border-yellow-500/20 hover:bg-yellow-500/20 transition flex items-center gap-1 font-semibold">
                    💰 จัดการเงิน
                  </button>
                  ${u.active_machine 
                    ? `<button onclick="openUserTimeModal('${u.id}', '${u.username}', '${u.active_machine.name}', '${u.active_machine.session_end_time}')"
                               class="px-2 py-1 text-xs bg-green-500/10 text-green-400 rounded border border-green-500/20 hover:bg-green-500/20 transition flex items-center gap-1 font-semibold">
                         ⏰ เพิ่มเวลา
                       </button>`
                    : ''
                  }
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Start countdowns
    data.users.forEach(u => {
      if (u.active_machine && u.active_machine.session_end_time) {
        startAdminCountdown(u.id, u.active_machine.session_end_time, u.active_machine.is_power_out);
      }
    });

  } catch (err) {
    container.innerHTML = `<div class="text-center py-8 text-red-400">❌ โหลดข้อมูลผู้ใช้ไม่สำเร็จ</div>`;
  }
}

function openUserCreditModal(userId, username, currentCredit) {
  document.getElementById('uc_user_id').value = userId;
  document.getElementById('uc_username').textContent = username;
  document.getElementById('uc_current_credit').textContent = formatCurrency(currentCredit);
  document.getElementById('uc_amount').value = '';
  document.getElementById('uc_note').value = '';
  document.getElementById('uc_action').value = 'add';
  showModal('userCreditModal');
}

function setupUserCreditForm() {
  const form = document.getElementById('userCreditForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('userCreditSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

    const userId = document.getElementById('uc_user_id').value;
    const amount = document.getElementById('uc_amount').value;
    const action = document.getElementById('uc_action').value;
    const note = document.getElementById('uc_note').value;

    try {
      const response = await apiFetch(`/api/admin/users/${userId}/credit`, {
        method: 'PUT',
        body: { amount, action, note }
      });

      showToast(response.message || 'ปรับปรุงยอดเงินสำเร็จ', 'success');
      hideModal('userCreditModal');
      await Promise.all([
        loadAdminUsers(),
        loadAdminStats(),
        loadAdminTopups()
      ]);
    } catch (err) {
      showToast(err.error || 'เกิดข้อผิดพลาดในการปรับปรุงยอดเงิน', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 ยืนยัน';
    }
  });
}

function openUserTimeModal(userId, username, machineName, sessionEndTime) {
  document.getElementById('ut_user_id').value = userId;
  document.getElementById('ut_username').textContent = username;
  document.getElementById('ut_machinename').textContent = machineName;
  document.getElementById('ut_current_end').textContent = formatDate(sessionEndTime);
  document.getElementById('ut_duration').value = '';
  document.getElementById('ut_unit').value = 'hours';
  showModal('userTimeModal');
}

function setupUserTimeForm() {
  const form = document.getElementById('userTimeForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('userTimeSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

    const userId = document.getElementById('ut_user_id').value;
    const duration = document.getElementById('ut_duration').value;
    const unit = document.getElementById('ut_unit').value;

    try {
      const response = await apiFetch(`/api/admin/users/${userId}/extend-session`, {
        method: 'POST',
        body: { duration, unit }
      });

      showToast(response.message || 'เพิ่มเวลาเช่าเครื่องสำเร็จ', 'success');
      hideModal('userTimeModal');
      await Promise.all([
        loadAdminUsers(),
        loadAdminStats()
      ]);
    } catch (err) {
      showToast(err.error || 'เกิดข้อผิดพลาดในการเพิ่มเวลาเช่าเครื่อง', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 ยืนยันเพิ่มเวลา';
    }
  });
}

// --- Settings Management (Facebook, Discord URL & TrueMoney Phone) ---
async function loadAdminSettings() {
  try {
    const data = await apiFetch('/api/settings');
    const fbInput = document.getElementById('setting_facebook_url');
    const dcInput = document.getElementById('setting_discord_url');
    const tmInput = document.getElementById('setting_truemoney_phone');
    
    const walletCheckbox = document.getElementById('setting_topup_wallet_enabled');
    const promptPayCheckbox = document.getElementById('setting_topup_promptpay_enabled');
    const slipCheckbox = document.getElementById('setting_topup_slip_enabled');

    if (fbInput) fbInput.value = data.facebook_url || '';
    if (dcInput) dcInput.value = data.discord_url || '';
    if (tmInput) tmInput.value = data.truemoney_phone || '';
    
    if (walletCheckbox) walletCheckbox.checked = data.topup_wallet_enabled === 'true';
    if (promptPayCheckbox) promptPayCheckbox.checked = data.topup_promptpay_enabled === 'true';
    if (slipCheckbox) slipCheckbox.checked = data.topup_slip_enabled === 'true';

    // โหลดค่าอายุสลิปสูงสุด
    const slipMaxAgeInput = document.getElementById('setting_slip_max_age');
    if (slipMaxAgeInput) slipMaxAgeInput.value = data.slip_max_age_minutes || '5';
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

function setupSettingsForm() {
  const form = document.getElementById('settingsForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('settingsFormSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

    const facebook_url = document.getElementById('setting_facebook_url').value;
    const discord_url = document.getElementById('setting_discord_url').value;
    const truemoney_phone = document.getElementById('setting_truemoney_phone').value;
    
    const walletCheckbox = document.getElementById('setting_topup_wallet_enabled');
    const promptPayCheckbox = document.getElementById('setting_topup_promptpay_enabled');
    const slipCheckbox = document.getElementById('setting_topup_slip_enabled');
    
    const topup_wallet_enabled = walletCheckbox && walletCheckbox.checked ? 'true' : 'false';
    const topup_promptpay_enabled = promptPayCheckbox && promptPayCheckbox.checked ? 'true' : 'false';
    const topup_slip_enabled = slipCheckbox && slipCheckbox.checked ? 'true' : 'false';

    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: {
          facebook_url,
          discord_url,
          truemoney_phone,
          topup_wallet_enabled,
          topup_promptpay_enabled,
          topup_slip_enabled
        }
      });
      showToast('บันทึกการตั้งค่าสำเร็จ', 'success');
    } catch (err) {
      showToast(err.error || 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 บันทึกการตั้งค่า';
    }
  });
}

// --- Power Outage Toggle (Admin - Per Machine) ---
async function toggleMachinePowerOutage(id, action) {
  const actionLabel = action === 'activate' ? 'เปิดโหมดไฟดับ' : 'ยกเลิกโหมดไฟดับ';
  if (!confirm(`ต้องการ "${actionLabel}" สำหรับเครื่องคอมพิวเตอร์เครื่องนี้ใช่หรือไม่?\nการกระทำนี้จะหยุดเวลาระบบชั่วคราวสำหรับเครื่องนี้เท่านั้น`)) return;

  try {
    showToast(`กำลังส่งคำสั่ง ${actionLabel}...`, 'info');
    const response = await apiFetch(`/api/admin/machines/${id}/power-outage`, {
      method: 'POST',
      body: { action }
    });
    showToast(response.message || 'บันทึกสถานะสำเร็จ', 'success');
    await Promise.all([
      loadAdminMachines(),
      loadAdminUsers()
    ]);
  } catch (err) {
    showToast(err.error || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ', 'error');
  }
}

// =============================================
// FINANCE & ELECTRICITY BILL MANAGEMENT
// =============================================
let financeData = { daily: [], weekly: [], monthly: [], yearly: [] };
let currentFinancePeriod = 'daily';

async function loadAdminFinance() {
  const summaryContainer = document.getElementById('financeSummaryContainer');
  const logsContainer = document.getElementById('electricityLogsContainer');

  try {
    const summaryRes = await apiFetch('/api/admin/financial-summary');
    if (summaryRes.success) {
      financeData = {
        daily: summaryRes.daily || [],
        weekly: summaryRes.weekly || [],
        monthly: summaryRes.monthly || [],
        yearly: summaryRes.yearly || []
      };
      renderFinanceSummary();
    }
  } catch (err) {
    console.error('Error loading finance summary:', err);
    if (summaryContainer) {
      summaryContainer.innerHTML = `<div class="text-center py-8 text-red-400">❌ โหลดข้อมูลรายงานการเงินไม่สำเร็จ</div>`;
    }
  }

  try {
    const logsRes = await apiFetch('/api/admin/electricity-costs');
    if (logsRes.success) {
      renderElectricityCosts(logsRes.electricity_costs);
    }
  } catch (err) {
    console.error('Error loading electricity costs:', err);
    if (logsContainer) {
      logsContainer.innerHTML = `<div class="text-center py-8 text-red-400">❌ โหลดประวัติค่าไฟไม่สำเร็จ</div>`;
    }
  }
}

function renderFinanceSummary() {
  const container = document.getElementById('financeSummaryContainer');
  if (!container) return;

  const list = financeData[currentFinancePeriod] || [];
  if (list.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-gray-500">📭 ยังไม่มีข้อมูลสรุปสำหรับช่วงเวลานี้</div>`;
    return;
  }

  container.innerHTML = `
    <table class="cyber-table w-full">
      <thead>
        <tr>
          <th>ช่วงเวลา</th>
          <th>รายได้ค่าเช่า</th>
          <th>ยอดเติมเงิน (อนุมัติ)</th>
          <th>ค่าไฟฟ้าที่หัก</th>
          <th>กำไรสุทธิ</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(item => {
          const isProfit = item.profit >= 0;
          return `
            <tr class="hover:bg-white/5 transition">
              <td class="font-semibold text-white whitespace-nowrap">${item.label || item.period}</td>
              <td class="text-cyan-400 font-bold whitespace-nowrap">฿${formatCurrency(item.revenue)}</td>
              <td class="text-pink-400 whitespace-nowrap">฿${formatCurrency(item.topups)}</td>
              <td class="text-red-400 whitespace-nowrap">฿${formatCurrency(item.electricity)}</td>
              <td class="${isProfit ? 'text-green-400 font-bold' : 'text-red-500 font-bold'} whitespace-nowrap">
                ฿${formatCurrency(item.profit)}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function toggleFinancePeriod(period) {
  currentFinancePeriod = period;
  ['daily', 'weekly', 'monthly', 'yearly'].forEach(p => {
    const btn = document.getElementById(`btn-period-${p}`);
    if (btn) {
      if (p === period) {
        btn.className = "px-4 py-2 text-xs sm:text-sm bg-yellow-400/10 text-yellow-400 rounded-lg border border-yellow-400/20 hover:bg-yellow-400/20 transition font-medium whitespace-nowrap";
      } else {
        btn.className = "px-4 py-2 text-xs sm:text-sm bg-white/5 text-gray-400 rounded-lg border border-white/5 hover:bg-white/10 transition font-medium whitespace-nowrap";
      }
    }
  });
  renderFinanceSummary();
}

function renderElectricityCosts(logs) {
  const container = document.getElementById('electricityLogsContainer');
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-gray-500">📭 ยังไม่มีประวัติการบันทึกค่าไฟฟ้า</div>`;
    return;
  }

  const typeLabels = { day: 'รายวัน', week: 'รายสัปดาห์', month: 'รายเดือน', year: 'รายปี' };

  container.innerHTML = `
    <table class="cyber-table w-full">
      <thead>
        <tr>
          <th>รอบเวลา</th>
          <th>ประเภท</th>
          <th>ค่าไฟฟ้า</th>
          <th>หมายเหตุ</th>
          <th>จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map(log => `
          <tr class="hover:bg-white/5 transition">
            <td class="font-mono text-xs text-white whitespace-nowrap font-bold">${log.period_key}</td>
            <td class="whitespace-nowrap"><span class="px-2 py-0.5 rounded text-xs bg-yellow-400/10 text-yellow-400 border border-yellow-400/25">${typeLabels[log.period_type] || log.period_type}</span></td>
            <td class="text-red-400 font-bold whitespace-nowrap">฿${formatCurrency(log.amount)}</td>
            <td class="text-xs text-gray-400 max-w-[150px] truncate" title="${log.note || ''}">${log.note || '-'}</td>
            <td class="whitespace-nowrap">
              <button onclick="deleteElectricityCostLog(${log.id})" class="px-2.5 py-1 text-xs bg-red-500/10 text-red-400 rounded border border-red-500/20 hover:bg-red-500/20 transition" title="ลบ">🗑️ ลบ</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function onElectricityPeriodTypeChange() {
  const type = document.getElementById('elec_period_type').value;
  const container = document.getElementById('elec_period_key_container');
  if (!container) return;

  const now = new Date();
  const bangkokStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // 'YYYY-MM-DD'
  const currentMonth = bangkokStr.substring(0, 7); // 'YYYY-MM'

  if (type === 'day') {
    container.innerHTML = `
      <label class="block text-xs text-gray-400 mb-1">เลือกวันที่ *</label>
      <input type="date" id="elec_period_key" class="cyber-input text-sm" value="${bangkokStr}" required>
    `;
  } else if (type === 'week') {
    container.innerHTML = `
      <label class="block text-xs text-gray-400 mb-1">เลือกสัปดาห์ *</label>
      <input type="week" id="elec_period_key" class="cyber-input text-sm" required>
    `;
  } else if (type === 'month') {
    container.innerHTML = `
      <label class="block text-xs text-gray-400 mb-1">เลือกเดือน *</label>
      <input type="month" id="elec_period_key" class="cyber-input text-sm" value="${currentMonth}" required>
    `;
  } else if (type === 'year') {
    container.innerHTML = `
      <label class="block text-xs text-gray-400 mb-1">เลือกปี พ.ศ. (ค.ศ.) *</label>
      <select id="elec_period_key" class="cyber-input text-sm" required></select>
    `;
    const yearSelect = document.getElementById('elec_period_key');
    const currentYear = now.getFullYear();
    for (let y = currentYear; y >= currentYear - 5; y--) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = `${y + 543} (${y})`;
      yearSelect.appendChild(opt);
    }
  }
}

function setupElectricityForm() {
  const form = document.getElementById('electricityForm');
  if (!form) return;

  onElectricityPeriodTypeChange();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const origText = btn.textContent;
    btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

    const period_type = document.getElementById('elec_period_type').value;
    const period_key = document.getElementById('elec_period_key').value;
    const amount = parseFloat(document.getElementById('elec_amount').value);
    const note = document.getElementById('elec_note').value;

    try {
      await apiFetch('/api/admin/electricity-costs', {
        method: 'POST',
        body: { period_type, period_key, amount, note }
      });
      showToast('บันทึกค่าไฟฟ้าสำเร็จ', 'success');
      document.getElementById('elec_amount').value = '';
      document.getElementById('elec_note').value = '';
      await loadAdminFinance();
    } catch (err) {
      showToast(err.error || 'เกิดข้อผิดพลาดในการบันทึกค่าไฟฟ้า', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });
}

async function deleteElectricityCostLog(id) {
  if (!confirm('คุณแน่ใจหรือไม่ที่จะลบรายการค่าไฟฟ้านี้?\nการลบจะทำให้การคำนวณกำไรสุทธิกลับไปเป็นปกติ')) return;

  try {
    showToast('กำลังลบข้อมูล...', 'info');
    await apiFetch(`/api/admin/electricity-costs/${id}`, {
      method: 'DELETE'
    });
    showToast('ลบรายการค่าไฟฟ้าสำเร็จ', 'success');
    await loadAdminFinance();
  } catch (err) {
    showToast(err.error || 'เกิดข้อผิดพลาดในการลบรายการ', 'error');
  }
}

// =============================================
// SHOP ACCOUNTS MANAGEMENT (บัญชีรับโอนเงินของร้าน)
// =============================================

async function loadShopAccounts() {
  const container = document.getElementById('shopAccountsList');
  if (!container) return;

  try {
    const data = await apiFetch('/api/admin/shop-accounts');
    const accounts = data.accounts || [];

    if (accounts.length === 0) {
      container.innerHTML = `
        <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
          <p class="text-red-400 text-sm font-semibold">⚠️ ยังไม่ได้ตั้งค่าบัญชีร้าน</p>
          <p class="text-gray-500 text-xs mt-1">ระบบจะยังไม่ตรวจสอบบัญชีปลายทาง — กรุณาเพิ่มบัญชีด้านล่างเพื่อเปิดใช้งานระบบความปลอดภัย</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="space-y-2">
        ${accounts.map((acc, idx) => `
          <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 hover:border-green-500/20 transition">
            <div class="flex items-center gap-3">
              <span class="text-lg">🏦</span>
              <div>
                <p class="text-white text-sm font-semibold">${acc.accountName} <span class="text-yellow-400 font-mono text-xs">(${acc.bank})</span></p>
                ${acc.label ? `<p class="text-gray-500 text-xs">${acc.label}</p>` : ''}
              </div>
            </div>
            <button onclick="deleteShopAccount(${idx}, '${acc.accountName}')" 
                    class="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 rounded border border-red-500/20 hover:bg-red-500/20 transition font-semibold">🗑️ ลบ</button>
          </div>
        `).join('')}
      </div>
      <div class="mt-3 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
        <p class="text-green-400 text-xs">✅ ระบบตรวจสอบบัญชีปลายทาง <strong>เปิดใช้งานแล้ว</strong> — สลิปที่ไม่ได้โอนเข้าบัญชีเหล่านี้จะถูกปฏิเสธ</p>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="text-center py-6 text-red-400 text-sm">❌ โหลดข้อมูลบัญชีร้านไม่สำเร็จ</div>`;
  }
}

function setupShopAccountForm() {
  const form = document.getElementById('addShopAccountForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('addShopAccountBtn');
    btn.disabled = true;
    const origText = btn.textContent;
    btn.innerHTML = '<div class="spinner mx-auto" style="width:18px;height:18px;border-width:2px"></div>';

    const bank = document.getElementById('sa_bank').value.trim();
    const accountName = document.getElementById('sa_account_name').value.trim();
    const label = document.getElementById('sa_label').value.trim();

    try {
      await apiFetch('/api/admin/shop-accounts', {
        method: 'POST',
        body: { bank, accountName, label }
      });
      showToast('เพิ่มบัญชีร้านสำเร็จ', 'success');
      document.getElementById('sa_bank').value = '';
      document.getElementById('sa_account_name').value = '';
      document.getElementById('sa_label').value = '';
      await loadShopAccounts();
    } catch (err) {
      showToast(err.error || 'เกิดข้อผิดพลาดในการเพิ่มบัญชี', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });
}

async function deleteShopAccount(index, name) {
  if (!confirm(`ต้องการลบบัญชีร้าน "${name}" ใช่หรือไม่?`)) return;

  try {
    await apiFetch(`/api/admin/shop-accounts/${index}`, { method: 'DELETE' });
    showToast('ลบบัญชีร้านสำเร็จ', 'success');
    await loadShopAccounts();
  } catch (err) {
    showToast(err.error || 'เกิดข้อผิดพลาดในการลบบัญชี', 'error');
  }
}

// --- Slip Security Settings ---
function setupSlipSettingsForm() {
  const form = document.getElementById('slipSettingsForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('slipSettingsBtn');
    btn.disabled = true;
    const origText = btn.textContent;
    btn.innerHTML = '<div class="spinner mx-auto" style="width:18px;height:18px;border-width:2px"></div>';

    const slip_max_age_minutes = document.getElementById('setting_slip_max_age').value;

    try {
      await apiFetch('/api/admin/slip-settings', {
        method: 'PUT',
        body: { slip_max_age_minutes }
      });
      showToast(`ตั้งค่าอายุสลิปสูงสุดเป็น ${slip_max_age_minutes} นาที สำเร็จ`, 'success');
    } catch (err) {
      showToast(err.error || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });
}
