/* ==========================================================================
   Cyberpunk Live Chat Widget Client Script (With Admin Overlay & Sound Alerts)
   ========================================================================== */

(function () {
  // Config & State
  let config = null;
  let supabaseClient = null;
  let roomId = null;
  let isChatOpen = false;
  let unreadCount = 0;
  let chatChannel = null;

  // Admin Overlay State
  let activeAdminRoomId = null;
  let adminGlobalChannel = null;
  let unreadRooms = {}; // maps roomId -> unread messages count

  // Helper to check authentication token
  function getAuthToken() {
    return localStorage.getItem('cyber_token');
  }

  // Parse token payload to see if user is an admin
  function isAdminToken() {
    const token = getAuthToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role === 'admin';
    } catch (e) {
      return false;
    }
  }

  // Synthesize futuristic Cyberpunk beep notification sound using Web Audio API
  function playNotificationSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const context = new AudioCtx();
      const osc = context.createOscillator();
      const gain = context.createGain();
      
      osc.type = 'sine';
      // Dual tone beep (frequency jump from 880Hz to 1760Hz)
      osc.frequency.setValueAtTime(880, context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, context.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + 0.15);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Load configuration and initialize Supabase
  async function initChat() {
    try {
      // 1. Fetch Supabase API config from server
      const configRes = await fetch('/api/chat/config');
      if (!configRes.ok) throw new Error('Cannot load chat configuration');
      config = await configRes.json();

      // 2. Load Supabase library dynamically if not loaded
      if (typeof supabase === 'undefined') {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      }

      // 3. Initialize Supabase client
      supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

      // 4. Inject HTML structures into DOM
      injectHTML();

      // 5. Bind DOM events
      bindEvents();

      // 6. Check user state and sync
      await checkUserStateAndSync();

      // 7. If admin, connect the global incoming message listener immediately
      if (isAdminToken()) {
        connectAdminGlobalRealtime();
      }

      console.log('🎮 Cyber Live Chat Initialized.');
    } catch (err) {
      console.error('❌ Cyber Chat Initialization Error:', err);
    }
  }

  // Helper to load external scripts dynamically
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Inject HTML Elements for Widget
  function injectHTML() {
    if (document.getElementById('cyber-chat-widget-root')) return;

    const root = document.createElement('div');
    root.id = 'cyber-chat-widget-root';
    root.innerHTML = `
      <!-- FAB -->
      <div id="cyber-chat-fab" class="cyber-chat-fab" title="คุยกับแอดมิน">
        <i class="fas fa-comments"></i>
        <div id="cyber-chat-badge" class="cyber-chat-badge" style="display: none;">0</div>
      </div>

      <!-- Chat Box -->
      <div id="cyber-chat-box" class="cyber-chat-box">
        <div class="cyber-chat-header">
          <div class="cyber-chat-title" style="display: flex; align-items: center;">
            <button id="cyber-chat-back-btn" class="cyber-chat-back-btn" title="ย้อนกลับ" style="display: none;">
              <i class="fas fa-arrow-left"></i>
            </button>
            <span class="cyber-chat-status-dot"></span>
            <span>Support Chat</span>
          </div>
          <button id="cyber-chat-close" class="cyber-chat-close" title="ปิด">&times;</button>
        </div>
        
        <div id="cyber-chat-messages" class="cyber-chat-messages">
          <!-- Messages will load here -->
        </div>

        <form id="cyber-chat-input-form" class="cyber-chat-input-form" style="display: none;">
          <input type="file" id="cyber-chat-file-input" accept="image/*" style="display: none;">
          
          <button type="button" id="cyber-chat-attach-btn" class="cyber-chat-attach-btn" title="แนบรูปภาพ">
            <i class="fas fa-image"></i>
          </button>
          
          <input type="text" id="cyber-chat-input" class="cyber-chat-input" placeholder="พิมพ์ข้อความ..." autocomplete="off" required>
          
          <button type="submit" class="cyber-chat-send-btn">
            <i class="fas fa-paper-plane"></i>
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(root);

    if (!document.querySelector('link[href*="font-awesome"]') && !document.querySelector('link[href*="all.min.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
      document.head.appendChild(link);
    }
  }

  // Check login state and sync rooms / show restriction block
  async function checkUserStateAndSync() {
    const token = getAuthToken();
    const messageContainer = document.getElementById('cyber-chat-messages');
    const inputForm = document.getElementById('cyber-chat-input-form');
    const backBtn = document.getElementById('cyber-chat-back-btn');
    const titleText = document.querySelector('.cyber-chat-title span:last-child');
    
    if (!token) {
      roomId = null;
      activeAdminRoomId = null;
      backBtn.style.display = 'none';
      if (chatChannel) {
        chatChannel.unsubscribe();
        chatChannel = null;
      }
      if (adminGlobalChannel) {
        adminGlobalChannel.unsubscribe();
        adminGlobalChannel = null;
      }
      
      messageContainer.innerHTML = `
        <div style="text-align: center; color: #bbbbdd; font-size: 13px; margin-top: 60px; padding: 20px;" class="cyber-login-prompt">
          <div style="font-size: 40px; margin-bottom: 15px;">🔒</div>
          <p style="font-weight: bold; text-transform: uppercase; color: var(--cyber-pink); text-shadow: 0 0 5px var(--cyber-pink); margin-bottom: 10px;">ACCESS RESTRICTED</p>
          <p style="font-size: 11px; color: #8888aa; margin-bottom: 20px;">กรุณาเข้าสู่ระบบบัญชีสมาชิกก่อนเริ่มคุยแชทสดกับแอดมิน</p>
          <button id="cyber-chat-login-btn" type="button" class="btn-neon" style="font-size: 11px; padding: 8px 16px; border-radius: 4px; cursor: pointer; border: none;">
            ⚡ เข้าสู่ระบบ / สมัครสมาชิก
          </button>
        </div>
      `;
      inputForm.style.display = 'none';

      const loginBtn = document.getElementById('cyber-chat-login-btn');
      if (loginBtn) {
        loginBtn.addEventListener('click', () => {
          if (typeof showModal === 'function') {
            showModal('authModal');
          } else {
            alert('กรุณาคลิกปุ่มเข้าสู่ระบบที่เมนูด้านบนของหน้าเว็บครับ');
          }
        });
      }
      return;
    }

    // User is logged in
    if (isAdminToken()) {
      // ADMIN MODE
      connectAdminGlobalRealtime();
      if (activeAdminRoomId) {
        // Continue active room session
        inputForm.style.display = 'flex';
        backBtn.style.display = 'flex';
      } else {
        // Display active customer rooms
        inputForm.style.display = 'none';
        backBtn.style.display = 'none';
        await renderAdminRoomsList();
      }
    } else {
      // CUSTOMER MODE
      inputForm.style.display = 'flex';
      backBtn.style.display = 'none';
      titleText.textContent = 'Support Chat';
      
      if (!roomId) {
        try {
          messageContainer.innerHTML = '<div class="text-center p-8 text-gray-500 text-sm">กำลังโหลดข้อมูลแชท...</div>';
          await syncChatRoom();
          await loadHistory();
          connectRealtime();
        } catch (err) {
          console.error('Error syncing room on user check:', err);
          messageContainer.innerHTML = '<div class="text-center p-8 text-red-500 text-sm">เกิดข้อผิดพลาดในการโหลดห้องแชท</div>';
        }
      }
    }
  }

  // Render list of active client rooms (Admin Mode only)
  async function renderAdminRoomsList() {
    const messageContainer = document.getElementById('cyber-chat-messages');
    const inputForm = document.getElementById('cyber-chat-input-form');
    const backBtn = document.getElementById('cyber-chat-back-btn');
    const titleText = document.querySelector('.cyber-chat-title span:last-child');

    activeAdminRoomId = null;
    inputForm.style.display = 'none';
    backBtn.style.display = 'none';
    titleText.textContent = 'Admin Console';

    if (chatChannel) {
      chatChannel.unsubscribe();
      chatChannel = null;
    }

    messageContainer.innerHTML = '<div class="text-center p-8 text-gray-500 text-sm">กำลังโหลดรายชื่อลูกค้า...</div>';

    try {
      const token = getAuthToken();
      const res = await fetch('/api/admin/chat/rooms', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Cannot load admin rooms');
      const data = await res.json();
      const rooms = data.rooms || [];

      if (rooms.length === 0) {
        messageContainer.innerHTML = `
          <div style="text-align: center; color: #555577; font-size: 12px; padding: 40px 10px;">
            <i class="fas fa-inbox" style="font-size: 24px; margin-bottom: 10px; display: block; color: var(--cyber-pink);"></i>
            ยังไม่มีข้อความติดต่อจากลูกค้า
          </div>
        `;
        return;
      }

      messageContainer.innerHTML = '';
      rooms.forEach(room => {
        const div = document.createElement('div');
        const isUnread = unreadRooms[room.id] > 0;
        div.className = `cyber-chat-room-item ${isUnread ? 'unread' : ''}`;

        const time = new Date(room.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        let lastMsgPreview = room.last_message;
        if (lastMsgPreview.length > 25) {
          lastMsgPreview = lastMsgPreview.substring(0, 22) + '...';
        }

        const badgeHtml = isUnread
          ? `<div class="cyber-chat-badge" style="position: static; margin-left: 10px; display: flex; width: 18px; height: 18px; font-size: 9px;">${unreadRooms[room.id]}</div>`
          : '';

        div.innerHTML = `
          <div class="cyber-chat-room-info">
            <div class="cyber-chat-room-user">${escapeHTML(room.username)}</div>
            <div class="cyber-chat-room-msg" style="${isUnread ? 'color: #fff; font-weight: bold;' : ''}">${escapeHTML(lastMsgPreview)}</div>
          </div>
          <div style="display: flex; align-items: center;">
            <span class="cyber-chat-room-time">${time}</span>
            ${badgeHtml}
          </div>
        `;

        div.addEventListener('click', () => {
          // Reset unread count for this room
          if (unreadRooms[room.id]) {
            unreadCount = Math.max(0, unreadCount - unreadRooms[room.id]);
            unreadRooms[room.id] = 0;
            updateBadge();
          }
          openAdminRoomChat(room.id, room.username);
        });

        messageContainer.appendChild(div);
      });
    } catch (err) {
      console.error('Render admin rooms error:', err);
      messageContainer.innerHTML = '<div class="text-center p-8 text-red-500 text-sm">เกิดข้อผิดพลาดในการโหลดรายการ</div>';
    }
  }

  // Open specific chat room as Admin
  async function openAdminRoomChat(roomIdToOpen, username) {
    activeAdminRoomId = roomIdToOpen;

    const messageContainer = document.getElementById('cyber-chat-messages');
    const inputForm = document.getElementById('cyber-chat-input-form');
    const backBtn = document.getElementById('cyber-chat-back-btn');
    const titleText = document.querySelector('.cyber-chat-title span:last-child');

    backBtn.style.display = 'flex';
    inputForm.style.display = 'flex';
    titleText.textContent = username;

    messageContainer.innerHTML = '<div class="text-center p-8 text-gray-500 text-sm">กำลังโหลดประวัติแชท...</div>';

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/chat/history?room_id=${roomIdToOpen}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Cannot load history');
      const data = await res.json();

      messageContainer.innerHTML = '';
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach(msg => {
          appendMessage(msg, false);
        });
        scrollToBottom();
      } else {
        messageContainer.innerHTML = '<div class="text-center p-8 text-gray-500 text-sm">ไม่มีประวัติข้อความ</div>';
      }

      connectRealtime();
    } catch (err) {
      console.error('Open admin room chat error:', err);
      messageContainer.innerHTML = '<div class="text-center p-8 text-red-500 text-sm">เกิดข้อผิดพลาดในการโหลดข้อความ</div>';
    }
  }

  // Connect global listener to catch incoming customer messages from ANY room (Admin only)
  function connectAdminGlobalRealtime() {
    if (adminGlobalChannel) return;

    adminGlobalChannel = supabaseClient
      .channel('admin-global-chat-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages'
        },
        async (payload) => {
          const msg = payload.new;

          // If the message is sent by a customer
          if (msg.sender_role === 'customer') {
            // Play alert sound
            playNotificationSound();

            if (activeAdminRoomId !== msg.room_id) {
              unreadRooms[msg.room_id] = (unreadRooms[msg.room_id] || 0) + 1;
              unreadCount++;
              updateBadge();
            }

            // Reactively update rooms list if chat window is open on index list
            const chatBox = document.getElementById('cyber-chat-box');
            if (chatBox && chatBox.classList.contains('open')) {
              if (activeAdminRoomId === null) {
                await renderAdminRoomsList();
              }
            }
          }
        }
      )
      .subscribe();
  }

  // Get or Create Room ID from server API (Customer Mode only)
  async function syncChatRoom() {
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/chat/room', {
      method: 'POST',
      headers: headers
    });

    if (!res.ok) throw new Error('Failed to synchronize chat room');
    const data = await res.json();
    roomId = data.room_id;
  }

  // Fetch Message History (Customer Mode only)
  async function loadHistory() {
    const token = getAuthToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/chat/history?room_id=${roomId}`, {
      headers: headers
    });

    if (!res.ok) throw new Error('Failed to load chat history');
    const data = await res.json();
    
    const messageContainer = document.getElementById('cyber-chat-messages');
    messageContainer.innerHTML = ''; 

    if (data.messages && data.messages.length > 0) {
      data.messages.forEach(msg => {
        appendMessage(msg, false);
      });
      scrollToBottom();
    } else {
      messageContainer.innerHTML = `
        <div style="text-align: center; color: #555577; font-size: 11px; margin-top: 20px;">
          <p>🤖 ระบบแชทสด Cyber Support</p>
          <p>พิมพ์ข้อความหรือส่งรูปภาพเพื่อติดต่อแอดมินได้เลยครับ</p>
        </div>
      `;
    }
  }

  // Listen to Supabase Realtime changes for CURRENT room (Admin and Customer modes)
  function connectRealtime() {
    if (chatChannel) {
      chatChannel.unsubscribe();
    }

    const currentActiveRoomId = isAdminToken() ? activeAdminRoomId : roomId;
    if (!currentActiveRoomId) return;

    chatChannel = supabaseClient
      .channel(`public:chat_messages:room:${currentActiveRoomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${currentActiveRoomId}`
        },
        (payload) => {
          const msg = payload.new;
          appendMessage(msg, true);
        }
      )
      .subscribe();
  }

  // Append a message block in UI
  function appendMessage(msg, animate = true) {
    const messageContainer = document.getElementById('cyber-chat-messages');
    
    if (document.getElementById(`msg-${msg.id}`)) return;

    const div = document.createElement('div');
    div.id = `msg-${msg.id}`;

    // Swap roles alignment visually if viewing as Admin
    let displayRole = msg.sender_role;
    if (isAdminToken()) {
      displayRole = (msg.sender_role === 'admin') ? 'customer' : 'admin';
    }
    div.className = `cyber-message-bubble ${displayRole}`;
    
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let messageBody = '';
    if (msg.image_url) {
      messageBody = `
        <div class="cyber-message-img-wrapper" style="position: relative;">
          <img src="${msg.image_url}" alt="Attachment" class="cyber-chat-img" style="max-width: 100%; max-height: 180px; border-radius: 6px; cursor: pointer; transition: opacity 0.2s;" onclick="window.open('${msg.image_url}', '_blank')">
        </div>
      `;
      if (msg.message) {
        messageBody += `<div style="margin-top: 6px;">${escapeHTML(msg.message)}</div>`;
      }
    } else {
      messageBody = escapeHTML(msg.message);
    }

    div.innerHTML = `
      <div class="cyber-message-info">
        <span class="cyber-message-sender">${msg.sender_name}</span>
        <span class="cyber-message-time">${time}</span>
      </div>
      <div class="cyber-message-content">${messageBody}</div>
    `;

    if (messageContainer.querySelector('div[style*="text-align: center"]') || messageContainer.querySelector('.cyber-login-prompt')) {
      messageContainer.innerHTML = '';
    }

    messageContainer.appendChild(div);

    if (animate) {
      scrollToBottom();
      
      // Notify customer of new admin replies when chat window is closed
      if (!isAdminToken() && !isChatOpen && msg.sender_role === 'admin') {
        unreadCount++;
        updateBadge();
      }
    }
  }

  // Client-side Canvas Image Compression
  function compressImage(file, maxWidth = 1000, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Canvas compression failed'));
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  }

  // Send message using API (handles both admin and customer destinations)
  async function sendMessage(text, imageUrl = null) {
    if ((!text || text.trim() === '') && !imageUrl) return;

    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const currentActiveRoomId = isAdminToken() ? activeAdminRoomId : roomId;

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          room_id: currentActiveRoomId,
          message: text ? text.trim() : null,
          image_url: imageUrl
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to send message');
      }

      document.getElementById('cyber-chat-input').value = '';
    } catch (err) {
      console.error('Send chat message failed:', err);
      alert('ไม่สามารถส่งข้อความได้: ' + err.message);
    }
  }

  // Handle File upload
  async function handleImageUpload(file) {
    const token = getAuthToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const input = document.getElementById('cyber-chat-input');
    const origPlaceholder = input.placeholder;
    
    input.disabled = true;
    input.placeholder = '📤 กำลังบีบอัดและส่งรูปภาพ...';

    try {
      const compressedBlob = await compressImage(file, 1000, 0.7);

      const formData = new FormData();
      formData.append('image', compressedBlob, 'image.jpg');

      const uploadRes = await fetch('/api/chat/upload', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json();
        throw new Error(errData.error || 'Failed to upload image');
      }

      const data = await uploadRes.json();
      await sendMessage(null, data.imageUrl);
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('อัปโหลดรูปภาพล้มเหลว: ' + err.message);
    } finally {
      input.disabled = false;
      input.placeholder = origPlaceholder;
      input.focus();
    }
  }

  // Events Binding
  function bindEvents() {
    const fab = document.getElementById('cyber-chat-fab');
    const closeBtn = document.getElementById('cyber-chat-close');
    const chatBox = document.getElementById('cyber-chat-box');
    const form = document.getElementById('cyber-chat-input-form');
    const input = document.getElementById('cyber-chat-input');
    const backBtn = document.getElementById('cyber-chat-back-btn');
    
    const fileInput = document.getElementById('cyber-chat-file-input');
    const attachBtn = document.getElementById('cyber-chat-attach-btn');

    // Open/Close toggle
    fab.addEventListener('click', async () => {
      isChatOpen = !isChatOpen;
      if (isChatOpen) {
        chatBox.classList.add('open');
        fab.classList.add('active');
        unreadCount = 0;
        updateBadge();
        
        await checkUserStateAndSync();
        scrollToBottom();
        if (input.offsetParent !== null && !input.disabled) {
          setTimeout(() => input.focus(), 150);
        }
      } else {
        chatBox.classList.remove('open');
        fab.classList.remove('active');
      }
    });

    closeBtn.addEventListener('click', () => {
      isChatOpen = false;
      chatBox.classList.remove('open');
      fab.classList.remove('active');
    });

    // Form Submit
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value;
      sendMessage(text);
    });

    // Back Button (Admin Mode navigation)
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        await renderAdminRoomsList();
      });
    }

    // Attach Image button click
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => {
        if (input.disabled) return;
        fileInput.click();
      });

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          alert('รองรับเฉพาะไฟล์รูปภาพเท่านั้น');
          fileInput.value = '';
          return;
        }
        await handleImageUpload(file);
        fileInput.value = '';
      });
    }
  }

  // Badge controller
  function updateBadge() {
    const badge = document.getElementById('cyber-chat-badge');
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // UI Helpers
  function scrollToBottom() {
    const messageContainer = document.getElementById('cyber-chat-messages');
    messageContainer.scrollTop = messageContainer.scrollHeight;
  }

  // Escape HTML string
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Bootstrap when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
  } else {
    initChat();
  }
})();
