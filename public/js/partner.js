// =============================================
// Partner Dashboard JavaScript
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  initPartnerDashboard();
  setupPartnerWithdrawForm();
});

async function initPartnerDashboard() {
  const token = getToken();
  if (!token) {
    showAccessDenied();
    return;
  }
  await loadPartnerDashboardData();
}

function showAccessDenied() {
  document.getElementById('partnerAccessDenied')?.classList.remove('hidden');
  document.getElementById('partnerContent')?.classList.add('hidden');
}

function showPartnerContent() {
  document.getElementById('partnerAccessDenied')?.classList.add('hidden');
  document.getElementById('partnerContent')?.classList.remove('hidden');
}

async function loadPartnerDashboardData() {
  try {
    const data = await apiFetch('/api/partner/dashboard');
    showPartnerContent();

    // Render Stats
    document.getElementById('stat_total_revenue').textContent = `฿ ${formatCurrency(data.stats.total_revenue)}`;
    document.getElementById('stat_today_revenue').textContent = `฿ ${formatCurrency(data.stats.today_revenue)}`;
    document.getElementById('stat_month_revenue').textContent = `เดือนนี้: ฿ ${formatCurrency(data.stats.month_revenue)}`;
    document.getElementById('stat_partner_credit').textContent = `฿ ${formatCurrency(data.stats.partner_credit)}`;
    document.getElementById('stat_total_withdrawn').textContent = `฿ ${formatCurrency(data.stats.total_withdrawn)}`;

    // Render Machines
    renderPartnerMachines(data.machines || []);

    // Render Withdrawals
    renderPartnerWithdrawals(data.withdrawals || []);
  } catch (err) {
    console.error('Partner dashboard error:', err);
    showAccessDenied();
  }
}

function renderPartnerMachines(machines) {
  const container = document.getElementById('partnerMachinesTable');
  if (!container) return;

  if (machines.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-gray-500">📭 คุณยังไม่มีเครื่องคอมพิวเตอร์ที่ผูกไว้ในระบบ</div>`;
    return;
  }

  container.innerHTML = `
    <table class="cyber-table">
      <thead>
        <tr>
          <th>ชื่อเครื่อง</th>
          <th>หมวดหมู่</th>
          <th>ราคา/วัน</th>
          <th>สถานะ</th>
          <th>ผู้เช่าปัจจุบัน</th>
        </tr>
      </thead>
      <tbody>
        ${machines.map(m => `
          <tr>
            <td class="font-bold text-white whitespace-nowrap">${m.name}</td>
            <td>
              <span class="badge ${m.category === 'gaming' ? 'badge-gaming' : 'badge-bot'}">
                ${m.category === 'gaming' ? '🎮 สายเกม' : '🤖 เปิดบอท'}
              </span>
            </td>
            <td class="text-yellow-400 font-mono">฿ ${formatCurrency(m.price_per_day)}</td>
            <td>${statusBadge(m.status)}</td>
            <td class="text-xs text-gray-400">
              ${m.status === 'in_use' ? '<span class="text-green-400 font-semibold">🟢 มีผู้เช่าใช้งาน</span>' : '<span class="text-gray-500">-</span>'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderPartnerWithdrawals(withdrawals) {
  const container = document.getElementById('partnerWithdrawalsTable');
  if (!container) return;

  if (withdrawals.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-gray-500">📭 คุณยังไม่มีประวัติการแจ้งถอนเงิน</div>`;
    return;
  }

  container.innerHTML = `
    <table class="cyber-table">
      <thead>
        <tr>
          <th>วันที่แจ้ง</th>
          <th>ยอดถอน</th>
          <th>ค่าธรรมเนียม (10%)</th>
          <th>ยอดโอนสุทธิ</th>
          <th>บัญชีปลายทาง</th>
          <th>สถานะ</th>
        </tr>
      </thead>
      <tbody>
        ${withdrawals.map(w => `
          <tr>
            <td class="text-xs whitespace-nowrap">${formatDate(w.created_at)}</td>
            <td class="text-yellow-400 font-mono font-bold">฿ ${formatCurrency(w.amount)}</td>
            <td class="text-pink-400 font-mono text-xs">- ฿ ${formatCurrency(w.fee)}</td>
            <td class="text-green-400 font-mono font-bold">฿ ${formatCurrency(w.net_amount)}</td>
            <td class="text-xs text-gray-300">
              <div class="font-semibold text-white">${w.bank_name}</div>
              <div class="font-mono text-cyan-400">${w.bank_account}</div>
              <div class="text-gray-400 text-[11px]">${w.account_name}</div>
            </td>
            <td>${statusBadge(w.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function calculateWithdrawNet() {
  const amountInput = document.getElementById('pw_amount');
  const amount = parseFloat(amountInput?.value || 0);

  const calcAmount = document.getElementById('calc_amount');
  const calcFee = document.getElementById('calc_fee');
  const calcNet = document.getElementById('calc_net');

  if (isNaN(amount) || amount <= 0) {
    if (calcAmount) calcAmount.textContent = '฿ 0.00';
    if (calcFee) calcFee.textContent = '- ฿ 0.00';
    if (calcNet) calcNet.textContent = '฿ 0.00';
    return;
  }

  const fee = Math.round(amount * 0.10 * 100) / 100;
  const net = amount - fee;

  if (calcAmount) calcAmount.textContent = `฿ ${formatCurrency(amount)}`;
  if (calcFee) calcFee.textContent = `- ฿ ${formatCurrency(fee)}`;
  if (calcNet) calcNet.textContent = `฿ ${formatCurrency(net)}`;
}

function setupPartnerWithdrawForm() {
  const form = document.getElementById('partnerWithdrawForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('partnerWithdrawBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

    const amount = document.getElementById('pw_amount').value;
    const bank_name = document.getElementById('pw_bank_name').value;
    const bank_account = document.getElementById('pw_bank_account').value;
    const account_name = document.getElementById('pw_account_name').value;

    try {
      const res = await apiFetch('/api/partner/withdraw', {
        method: 'POST',
        body: { amount, bank_name, bank_account, account_name }
      });

      showToast(res.message || 'ส่งคำขอถอนเงินสำเร็จ', 'success');
      form.reset();
      calculateWithdrawNet();
      await loadPartnerDashboardData();
    } catch (err) {
      showToast(err.error || 'เกิดข้อผิดพลาดในการแจ้งถอนเงิน', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📤 ยืนยันแจ้งถอนเงิน';
    }
  });
}
