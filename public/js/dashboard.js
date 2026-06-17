// =============================================
// Dashboard — แดชบอร์ดผู้ใช้
// =============================================

let dashCountdownIntervals = {};

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
                <p class="text-xs text-gray-500">${m.category === 'gaming' ? '🎮 สายเกมมิ่ง' : '🤖 สายเปิดบอท'}</p>
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

            <!-- RDP Info -->
            <div class="space-y-1.5 text-xs">
              <div class="flex justify-between p-2 bg-black/30 rounded">
                <span class="text-gray-500">IP:</span>
                <span class="text-white font-mono">${m.rdp_ip || '-'}</span>
              </div>
              <div class="flex justify-between p-2 bg-black/30 rounded">
                <span class="text-gray-500">User:</span>
                <span class="text-white font-mono">${m.rdp_username || '-'}</span>
              </div>
              <div class="flex justify-between items-center p-2 bg-black/30 rounded">
                <span class="text-gray-500">Pass:</span>
                <div class="flex items-center gap-2">
                  <span class="text-white font-mono" id="dash-rdp-pass-${m.id}">••••••••</span>
                  <button onclick="toggleDashRdpPass(${m.id}, '${m.rdp_password || ''}')" class="text-yellow-400 hover:text-yellow-300">👁</button>
                </div>
              </div>
            </div>

            <button onclick="dashReleaseMachine(${m.id})" class="mt-3 w-full btn-outline text-xs !py-2 border-red-500/30 text-red-400 hover:!border-red-500">🔓 คืนเครื่อง</button>
          </div>
        `).join('')}
      </div>
    `;

    // Start countdowns
    machines.forEach(m => {
      if (m.session_end_time) {
        startDashCountdown(m.id, m.session_end_time);
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

function toggleDashRdpPass(machineId, realPass) {
  const el = document.getElementById(`dash-rdp-pass-${machineId}`);
  el.textContent = el.textContent === '••••••••' ? realPass : '••••••••';
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
              <td>${r.duration_hours >= 24 ? Math.floor(r.duration_hours/24) + ' วัน' : r.duration_hours + ' ชม.'}</td>
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
