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
      loadAdminUsers()
    ]);

    setupMachineForm();
    setupUserCreditForm();
  } catch (err) {
    document.getElementById('accessDenied').classList.remove('hidden');
    document.getElementById('adminContent').classList.add('hidden');
  }
}

// --- Tab Switching ---
function switchAdminTab(tab) {
  ['machines', 'rentals', 'topups', 'users'].forEach(t => {
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
            <th>ประเภท</th>
            <th>สเปก</th>
            <th>ราคา</th>
            <th>สถานะ</th>
            <th>RDP IP</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${data.machines.map(m => `
            <tr>
              <td class="text-gray-500 font-mono text-xs">#${m.id}</td>
              <td class="font-semibold text-white whitespace-nowrap">${m.name}</td>
              <td>${m.category === 'gaming' ? '<span class="text-pink-400">🎮 Gaming</span>' : '<span class="text-yellow-400">🤖 Bot</span>'}</td>
              <td class="text-xs text-gray-400">
                <span class="block">${m.cpu || '-'}</span>
                <span class="block">${m.ram || '-'} / ${m.gpu || '-'}</span>
              </td>
              <td class="whitespace-nowrap">
                <span class="text-yellow-400 font-bold">฿${formatCurrency(m.price_per_hour)}</span><span class="text-gray-500 text-xs">/ชม.</span>
              </td>
              <td>${statusBadge(m.status)}</td>
              <td class="text-xs font-mono text-gray-500">${m.rdp_ip || '-'}</td>
              <td class="whitespace-nowrap">
                <div class="flex gap-1">
                  <button onclick="editMachine(${m.id})" class="px-2 py-1 text-xs bg-blue-500/10 text-blue-400 rounded border border-blue-500/20 hover:bg-blue-500/20 transition" title="แก้ไข">✏️</button>
                  ${m.status === 'available' ? `
                    <button onclick="changeMachineStatus(${m.id}, 'maintenance')" class="px-2 py-1 text-xs bg-orange-500/10 text-orange-400 rounded border border-orange-500/20 hover:bg-orange-500/20 transition" title="ปิดซ่อม">🔧</button>
                  ` : m.status === 'maintenance' ? `
                    <button onclick="changeMachineStatus(${m.id}, 'available')" class="px-2 py-1 text-xs bg-green-500/10 text-green-400 rounded border border-green-500/20 hover:bg-green-500/20 transition" title="เปิดใช้งาน">✅</button>
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
  document.getElementById('mf_rdp_ip').value = m.rdp_ip || '';
  document.getElementById('mf_rdp_user').value = m.rdp_username || '';
  document.getElementById('mf_rdp_pass').value = m.rdp_password || '';
  document.getElementById('mf_image').value = m.image_url || '';
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
      rdp_ip: document.getElementById('mf_rdp_ip').value,
      rdp_username: document.getElementById('mf_rdp_user').value,
      rdp_password: document.getElementById('mf_rdp_pass').value,
      image_url: document.getElementById('mf_image').value
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
              <td>${r.duration_hours >= 24 ? Math.floor(r.duration_hours / 24) + ' วัน' : r.duration_hours + ' ชม.'}</td>
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
async function loadAdminUsers() {
  const container = document.getElementById('adminUserList');
  try {
    const data = await apiFetch('/api/admin/users');
    if (!data.users || data.users.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-gray-500">📭 ยังไม่มีผู้ใช้ในระบบ</div>`;
      return;
    }

    container.innerHTML = `
      <table class="cyber-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>ชื่อผู้ใช้</th>
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
                <button onclick="openUserCreditModal('${u.id}', '${u.username}', ${u.credit})" 
                        class="px-3 py-1 text-xs bg-yellow-500/10 text-yellow-400 rounded border border-yellow-500/20 hover:bg-yellow-500/20 transition flex items-center gap-1 font-semibold">
                  💰 จัดการเงิน
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
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
