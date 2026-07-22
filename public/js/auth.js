// =============================================
// Auth — ระบบสมัคร / เข้าสู่ระบบ / ออกจากระบบ
// =============================================

// ตรวจสอบ session เมื่อโหลดหน้า
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  setupAuthForms();
});

async function checkSession() {
  const token = getToken();
  if (!token) {
    updateNavbar(null);
    return;
  }

  try {
    const data = await apiFetch('/api/me');
    setCachedUser(data.user);
    updateNavbar(data.user);
  } catch (err) {
    // Token หมดอายุ
    removeToken();
    updateNavbar(null);
  }
}

function updateNavbar(user) {
  const authButtons = document.getElementById('authButtons');
  const userInfo = document.getElementById('userInfo');
  const mobileAuthButtons = document.getElementById('mobileAuthButtons');
  const mobileUserInfo = document.getElementById('mobileUserInfo');

  if (user) {
    // Desktop
    if (authButtons) authButtons.classList.add('hidden');
    if (userInfo) {
      userInfo.classList.remove('hidden');
      userInfo.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="text-right hidden sm:block">
            <p class="text-sm font-semibold text-white">${user.username}</p>
            <div class="flex items-center gap-1.5 justify-end text-xs mt-0.5">
              <span class="text-yellow-400 font-semibold" title="เครดิตเติมเงินทั่วไป">฿ ${formatCurrency(user.credit)}</span>
              ${user.role === 'partner' ? `<span class="text-purple-300 font-semibold bg-purple-500/15 px-2 py-0.5 rounded border border-purple-500/30" title="เครดิตถอนได้พาร์ทเนอร์">🤝 ฿ ${formatCurrency(user.partner_credit || 0)}</span>` : ''}
            </div>
          </div>
          <div class="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-400 to-pink-500 flex items-center justify-center text-black font-bold text-sm">
            ${user.username.charAt(0).toUpperCase()}
          </div>
          ${user.role === 'admin' ? '<a href="/admin.html" class="text-xs bg-pink-500/20 text-pink-400 px-2.5 py-1 rounded-full border border-pink-500/30 hover:bg-pink-500/30 transition font-semibold">แอดมิน</a>' : ''}
          ${user.role === 'partner' ? '<a href="/partner.html" class="text-xs bg-purple-500/20 text-purple-300 px-2.5 py-1 rounded-full border border-purple-500/30 hover:bg-purple-500/30 transition flex items-center gap-1 font-semibold">🤝 พาร์ทเนอร์</a>' : ''}
          ${user.role === 'user' ? '<button onclick="showPartnerModal()" class="text-xs bg-purple-500/10 text-purple-300 px-2 py-1 rounded-full border border-purple-500/20 hover:bg-purple-500/20 transition">🤝 สมัครพาร์ทเนอร์</button>' : ''}
          <button onclick="logout()" class="text-gray-400 hover:text-red-400 transition text-sm ml-1" title="ออกจากระบบ">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          </button>
        </div>
      `;
    }
    // Mobile
    if (mobileAuthButtons) mobileAuthButtons.classList.add('hidden');
    if (mobileUserInfo) {
      mobileUserInfo.classList.remove('hidden');
      mobileUserInfo.innerHTML = `
        <div class="flex items-center justify-between p-3 rounded-lg bg-white/5 mb-2">
          <div>
            <p class="font-semibold text-white">${user.username}</p>
            <div class="flex items-center gap-2 text-sm mt-0.5">
              <span class="neon-text-yellow">฿ ${formatCurrency(user.credit)}</span>
              ${user.role === 'partner' ? `<span class="text-purple-300 text-xs font-semibold bg-purple-500/15 px-2 py-0.5 rounded border border-purple-500/30">🤝 ฿ ${formatCurrency(user.partner_credit || 0)}</span>` : ''}
            </div>
          </div>
          <button onclick="logout()" class="text-red-400 text-sm hover:underline">ออกจากระบบ</button>
        </div>
        ${user.role === 'admin' ? '<a href="/admin.html" class="block text-center text-sm bg-pink-500/20 text-pink-400 px-3 py-2 rounded-lg border border-pink-500/30 mb-2">⚡ แอดมินแพนเนล</a>' : ''}
        ${user.role === 'partner' ? '<a href="/partner.html" class="block text-center text-sm bg-purple-500/20 text-purple-300 px-3 py-2 rounded-lg border border-purple-500/30 mb-2 font-semibold">🤝 แดชบอร์ดพาร์ทเนอร์</a>' : ''}
        ${user.role === 'user' ? '<button onclick="showPartnerModal()" class="w-full text-center text-sm bg-purple-500/10 text-purple-300 px-3 py-2 rounded-lg border border-purple-500/20 mb-2">🤝 สมัครเป็นพาร์ทเนอร์</button>' : ''}
      `;
    }
  } else {
    // Not logged in
    if (authButtons) authButtons.classList.remove('hidden');
    if (userInfo) { userInfo.classList.add('hidden'); userInfo.innerHTML = ''; }
    if (mobileAuthButtons) mobileAuthButtons.classList.remove('hidden');
    if (mobileUserInfo) { mobileUserInfo.classList.add('hidden'); mobileUserInfo.innerHTML = ''; }
  }
}

let turnstileLoginWidgetId = null;
let turnstileRegisterWidgetId = null;

// Callback สำหรับโหลด Cloudflare Turnstile
window.onloadTurnstileCallback = async function () {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    const siteKey = config.turnstileSiteKey;

    if (siteKey && window.turnstile) {
      const loginContainer = document.getElementById('cf-turnstile-login');
      if (loginContainer && !loginContainer.innerHTML) {
        turnstileLoginWidgetId = window.turnstile.render('#cf-turnstile-login', {
          sitekey: siteKey,
          theme: 'dark'
        });
      }

      const regContainer = document.getElementById('cf-turnstile-register');
      if (regContainer && !regContainer.innerHTML) {
        turnstileRegisterWidgetId = window.turnstile.render('#cf-turnstile-register', {
          sitekey: siteKey,
          theme: 'dark'
        });
      }
    }
  } catch (err) {
    console.error('Error initializing Turnstile:', err);
  }
};

function setupAuthForms() {
  // Login form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('button[type="submit"]');
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (!username || !password) {
        showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
        return;
      }

      // ดึง Turnstile Token
      const turnstileInput = loginForm.querySelector('[name="cf-turnstile-response"]');
      const turnstileToken = turnstileInput ? turnstileInput.value : '';

      // ตรวจสอบเบื้องต้น
      const container = document.getElementById('cf-turnstile-login');
      if (container && !turnstileToken) {
        showToast('กรุณายืนยันว่าคุณไม่ใช่บอท (Turnstile)', 'error');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

      try {
        const data = await apiFetch('/api/login', {
          method: 'POST',
          body: { username, password, turnstileToken }
        });
        setToken(data.token);
        setCachedUser(data.user);
        updateNavbar(data.user);
        await checkSession();
        hideModal('authModal');
        showToast(`ยินดีต้อนรับ, ${data.user.username}! 🎮`, 'success');
        loginForm.reset();

        // Reload machines if on index page
        if (typeof loadMachines === 'function') loadMachines();
      } catch (err) {
        showToast(err.error || 'เข้าสู่ระบบล้มเหลว', 'error');
        // รีเซ็ต Turnstile ให้กดใหม่เมื่อล็อกอินล้มเหลว
        if (window.turnstile && turnstileLoginWidgetId !== null) {
          window.turnstile.reset(turnstileLoginWidgetId);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'เข้าสู่ระบบ';
      }
    });
  }

  // Register form
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = registerForm.querySelector('button[type="submit"]');
      const username = document.getElementById('regUsername').value.trim();
      const password = document.getElementById('regPassword').value;
      const confirmPassword = document.getElementById('regConfirmPassword').value;

      if (!username || !password) {
        showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
        return;
      }
      if (password !== confirmPassword) {
        showToast('รหัสผ่านไม่ตรงกัน', 'error');
        return;
      }

      const usernameRegex = /^[a-zA-Z0-9_\u0E00-\u0E7F]{3,20}$/;
      if (!usernameRegex.test(username)) {
        showToast('Username ต้องเป็นตัวอักษรภาษาอังกฤษ ภาษาไทย ตัวเลข หรือ _ ความยาว 3-20 ตัวอักษรเท่านั้น (ห้ามใส่อีโมจิ)', 'error');
        return;
      }

      // Honeypot Field
      const website_hp = registerForm.querySelector('[name="website_hp"]')?.value || '';

      // Retrieve Cloudflare Turnstile token if present
      const turnstileTokenEl = registerForm.querySelector('[name="cf-turnstile-response"]');
      const turnstileToken = turnstileTokenEl ? turnstileTokenEl.value : '';
      const turnstileContainer = document.getElementById('cf-turnstile-register');

      if (turnstileContainer && turnstileContainer.children.length > 0 && !turnstileToken) {
        showToast('กรุณายืนยันตัวตนว่าคุณไม่ใช่บอท (Turnstile)', 'error');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<div class="spinner mx-auto" style="width:20px;height:20px;border-width:2px"></div>';

      try {
        const data = await apiFetch('/api/register', {
          method: 'POST',
          body: { username, password, turnstileToken, website_hp }
        });
        setToken(data.token);
        setCachedUser(data.user);
        updateNavbar(data.user);
        await checkSession();
        hideModal('authModal');
        showToast(`สมัครสมาชิกสำเร็จ! ยินดีต้อนรับ ${data.user.username} 🎉`, 'success');
        registerForm.reset();
        if (window.turnstile && turnstileRegisterWidgetId !== null) {
          window.turnstile.reset(turnstileRegisterWidgetId);
        }
      } catch (err) {
        showToast(err.error || 'สมัครสมาชิกล้มเหลว', 'error');
        if (window.turnstile && turnstileRegisterWidgetId !== null) {
          window.turnstile.reset(turnstileRegisterWidgetId);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'สมัครสมาชิก';
      }
    });
  }
}

function logout() {
  removeToken();
  updateNavbar(null);
  showToast('ออกจากระบบสำเร็จ', 'info');

  const path = window.location.pathname.toLowerCase();
  if (path !== '/' && path !== '/index.html' && path !== '') {
    window.location.href = '/';
  } else {
    if (typeof loadMachines === 'function') loadMachines();
  }
}

// สลับแท็บ Login / Register
function switchAuthTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginPane = document.getElementById('loginPane');
  const registerPane = document.getElementById('registerPane');

  if (tab === 'login') {
    loginTab.classList.add('text-yellow-400', 'border-yellow-400');
    loginTab.classList.remove('text-gray-500', 'border-transparent');
    registerTab.classList.remove('text-yellow-400', 'border-yellow-400');
    registerTab.classList.add('text-gray-500', 'border-transparent');
    loginPane.classList.remove('hidden');
    registerPane.classList.add('hidden');
  } else {
    registerTab.classList.add('text-yellow-400', 'border-yellow-400');
    registerTab.classList.remove('text-gray-500', 'border-transparent');
    loginTab.classList.remove('text-yellow-400', 'border-yellow-400');
    loginTab.classList.add('text-gray-500', 'border-transparent');
    registerPane.classList.remove('hidden');
    loginPane.classList.add('hidden');
  }
}

function showPartnerModal() {
  if (typeof showModal === 'function') {
    showModal('partnerModal');
  } else {
    alert('กรุณาติดต่อแอดมินเพื่อสมัครใช้งานยศพาร์ทเนอร์');
  }
}
