// =============================================
// ระบบเช่าคอมพิวเตอร์ออนไลน์ — Express Backend
// =============================================
const path = require('path');
const fs = require('fs');

// --- Crash Logger for Production Debugging ---
process.on('uncaughtException', (err) => {
  try {
    fs.writeFileSync(path.join(__dirname, 'crash.log'), `Uncaught Exception:\n${err.stack || err.message}\n`, 'utf8');
  } catch (e) {}
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  try {
    fs.writeFileSync(path.join(__dirname, 'crash.log'), `Unhandled Rejection:\n${reason && reason.stack || reason}\n`, 'utf8');
  } catch (e) {}
  process.exit(1);
});

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Validate Environment Variables for Production ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(`
  ╔═══════════════════════════════════════════════════════════╗
  ║ ❌ ERROR: MISSING REQUIRED ENVIRONMENT VARIABLES!        ║
  ║                                                           ║
  ║ Please configure the following in your hosting provider: ║
  ║ - SUPABASE_URL                                            ║
  ║ - SUPABASE_SERVICE_ROLE_KEY                               ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
  process.exit(1);
}

const envJwtSecret = process.env.JWT_SECRET;
if (!envJwtSecret) {
  console.warn(`
  ╔═══════════════════════════════════════════════════════════╗
  ║ ⚠️ WARNING: JWT_SECRET IS NOT CONFIGURED!                  ║
  ║                                                           ║
  ║ A default insecure secret is being used. For security,    ║
  ║ please set the JWT_SECRET environment variable in your    ║
  ║ hosting provider dashboard.                               ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
}
const ACTUAL_JWT_SECRET = envJwtSecret || 'cyber-rental-default-fallback-secret-key';

// --- Supabase Client (Service Role — bypasses RLS) ---
global.WebSocket = require('ws');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// สร้าง Bucket 'chat-attachments' อัตโนมัติ (ถ้ายังไม่มี)
(async () => {
  try {
    await supabase.storage.createBucket('chat-attachments', {
      public: true,
      fileSizeLimit: 5242880 // 5MB
    });
    console.log('✅ Supabase Storage bucket "chat-attachments" initialized.');
  } catch (e) {
    // Bucket อาจมีอยู่แล้ว
  }
})();

// --- Tuya Smart API Client ---
// ใช้ HMAC-SHA256 สำหรับ Signature ตามมาตรฐาน Tuya Open API
const crypto = require('crypto');

const TUYA_REGION_HOSTS = {
  us: 'https://openapi.tuyaus.com',
  az: 'https://openapi.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  cn: 'https://openapi.tuyacn.com',
  ay: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
  sg: 'https://openapi-sg.iotbing.com'
};

const region = (process.env.TUYA_REGION || 'us').toLowerCase();
const TUYA_HOST = TUYA_REGION_HOSTS[region] || TUYA_REGION_HOSTS['us'];
const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;

// ดึง Tuya Access Token
async function getTuyaAccessToken() {
  if (!TUYA_CLIENT_ID || !TUYA_CLIENT_SECRET) {
    throw new Error('ระบบไม่ได้ตั้งค่า TUYA_CLIENT_ID หรือ TUYA_CLIENT_SECRET ใน Environment Variables');
  }
  const t = Date.now().toString();
  const method = 'GET';
  const path = '/v1.0/token?grant_type=1';
  const contentHash = crypto.createHash('sha256').update('').digest('hex');
  const stringToSign = [method, contentHash, '', path].join('\n');
  const str = TUYA_CLIENT_ID + t + stringToSign;
  const sign = crypto.createHmac('sha256', TUYA_CLIENT_SECRET)
    .update(str).digest('hex').toUpperCase();

  const res = await fetch(`${TUYA_HOST}${path}`, {
    headers: {
      'client_id': TUYA_CLIENT_ID,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256'
    }
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.msg || 'Tuya token error');
  return data.result.access_token;
}

// ส่งคำสั่ง Tuya (switch_1: true = เปิด, false = ปิด)
async function sendTuyaCommand(deviceId, switchOn) {
  const accessToken = await getTuyaAccessToken();
  const t = Date.now().toString();
  const method = 'POST';
  const path = `/v1.0/devices/${deviceId}/commands`;
  const body = JSON.stringify({ commands: [{ code: 'switch_1', value: switchOn }] });
  const contentHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = [method, contentHash, '', path].join('\n');
  const str = TUYA_CLIENT_ID + accessToken + t + stringToSign;
  const sign = crypto.createHmac('sha256', TUYA_CLIENT_SECRET)
    .update(str).digest('hex').toUpperCase();

  const res = await fetch(`${TUYA_HOST}${path}`, {
    method,
    headers: {
      'client_id': TUYA_CLIENT_ID,
      'access_token': accessToken,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256',
      'Content-Type': 'application/json'
    },
    body
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.msg || 'Tuya command error');
  return data;
}

// --- Middleware ---
// Force HTTPS redirect
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/.well-known', express.static(path.join(__dirname, '.well-known')));

// --- Multer (รับไฟล์สลิปในหน่วยความจำ) ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น'));
  }
});

// =============================================
// Middleware: ตรวจสอบ JWT Token
// =============================================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, ACTUAL_JWT_SECRET);
    req.user = decoded; // { id, username, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้' });
  }
  next();
}

// สร้าง JWT Token
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    ACTUAL_JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// =============================================
// AUTH ROUTES
// =============================================

// POST /api/register — สมัครสมาชิก
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, turnstileToken } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
    }

    // --- Cloudflare Turnstile Verification ---
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!turnstileToken) {
        return res.status(400).json({ error: 'กรุณายืนยันการตรวจสอบสิทธิ์ (Turnstile Token Missing)' });
      }
      try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${encodeURIComponent(turnstileSecret)}&response=${encodeURIComponent(turnstileToken)}&remoteip=${encodeURIComponent(ip)}`
        });
        const turnstileResult = await response.json();
        if (!turnstileResult.success) {
          console.error('Turnstile verification failed:', turnstileResult);
          return res.status(400).json({ error: 'การตรวจสอบความปลอดภัยล้มเหลว กรุณาลองใหม่อีกครั้ง' });
        }
      } catch (verifyErr) {
        console.error('Turnstile connection error:', verifyErr);
        return res.status(500).json({ error: 'ไม่สามารถติดต่อระบบความปลอดภัยของ Cloudflare ได้' });
      }
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username ต้องมีอย่างน้อย 3 ตัวอักษร' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password ต้องมีอย่างน้อย 6 ตัวอักษร' });
    }

    // ตรวจสอบ username ซ้ำ
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Username นี้ถูกใช้งานแล้ว' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // สร้าง user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ username, password_hash, credit: 0, role: 'user' })
      .select('id, username, credit, role, created_at')
      .single();

    if (error) throw error;

    const token = generateToken(newUser);
    res.json({ token, user: newUser });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสมัครสมาชิก' });
  }
});

// GET /api/config — ดึงค่า config สาธารณะ
app.get('/api/config', (req, res) => {
  res.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || ''
  });
});

// POST /api/login — เข้าสู่ระบบ
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, turnstileToken } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
    }

    // ตรวจสอบ Cloudflare Turnstile
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!turnstileToken) {
        return res.status(400).json({ error: 'กรุณายืนยันว่าคุณไม่ใช่บอท' });
      }

      try {
        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `secret=${encodeURIComponent(turnstileSecret)}&response=${encodeURIComponent(turnstileToken)}`
        });

        const verifyData = await verifyRes.json();
        if (!verifyData.success) {
          return res.status(400).json({ error: 'การตรวจสอบบอทล้มเหลว (Turnstile Invalid)' });
        }
      } catch (verifyErr) {
        console.error('Turnstile verification error:', verifyErr);
        return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบบอท' });
      }
    }

    // ค้นหา user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (!user) {
      return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    // ตรวจสอบ password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        credit: user.credit,
        role: user.role,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

// GET /api/me — ข้อมูลผู้ใช้ปัจจุบัน
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, credit, role, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้' });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// =============================================
// MACHINE ROUTES
// =============================================

// GET /api/machines — ดึงรายการเครื่องทั้งหมด
app.get('/api/machines', async (req, res) => {
  try {
    await autoReleaseExpiredMachines();
    const { category } = req.query;
    let query = supabase.from('machines').select('*').order('id');

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const [machinesRes, settings] = await Promise.all([
      query,
      getSettings()
    ]);

    if (machinesRes.error) throw machinesRes.error;

    // ซ่อนข้อมูลส่วนตัวจาก response สาธารณะ — จะส่งแยกเฉพาะผู้เช่า
    const sanitized = machinesRes.data.map(m => {
      const machine = { ...m };
      delete machine.rdp_ip;
      delete machine.rdp_username;
      delete machine.rdp_password;
      delete machine.anydesk_id;
      delete machine.anydesk_password;
      delete machine.tuya_device_id;
      machine.is_power_out = settings[`outage_machine_${m.id}`] === 'true';
      return machine;
    });

    res.json({ machines: sanitized });
  } catch (err) {
    console.error('Machines error:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลเครื่องได้' });
  }
});

// GET /api/machines/:id/rdp — ดึง RDP info (เฉพาะผู้เช่า)
app.get('/api/machines/:id/rdp', authMiddleware, async (req, res) => {
  try {
    const { data: machine, error } = await supabase
      .from('machines')
      .select('current_user_id, rdp_ip, rdp_username, rdp_password')
      .eq('id', req.params.id)
      .single();

    if (error || !machine) {
      return res.status(404).json({ error: 'ไม่พบเครื่อง' });
    }
    if (machine.current_user_id !== req.user.id) {
      return res.status(403).json({ error: 'คุณไม่ได้เช่าเครื่องนี้' });
    }

    res.json({
      rdp_ip: machine.rdp_ip,
      rdp_username: machine.rdp_username,
      rdp_password: machine.rdp_password
    });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/machines/:id/anydesk — ดึงข้อมูล AnyDesk (เฉพาะผู้เช่า)
app.get('/api/machines/:id/anydesk', authMiddleware, async (req, res) => {
  try {
    const { data: machine, error } = await supabase
      .from('machines')
      .select('current_user_id, anydesk_id, anydesk_password')
      .eq('id', req.params.id)
      .single();

    if (error || !machine) {
      return res.status(404).json({ error: 'ไม่พบเครื่อง' });
    }
    if (machine.current_user_id !== req.user.id) {
      return res.status(403).json({ error: 'คุณไม่ได้เช่าเครื่องนี้' });
    }

    res.json({
      anydesk_id: machine.anydesk_id,
      anydesk_password: machine.anydesk_password
    });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// POST /api/machines/:id/power — เปิด/ปิด/รีสตาร์ทเครื่องผ่าน Tuya (Admin only)
app.post('/api/machines/:id/power', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { action } = req.body; // 'on' | 'off' | 'restart'
    if (!['on', 'off', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'action ต้องเป็น on, off หรือ restart เท่านั้น' });
    }

    if (!TUYA_CLIENT_ID || !TUYA_CLIENT_SECRET) {
      return res.status(503).json({ error: 'ระบบ Tuya ยังไม่ได้ตั้งค่า TUYA_CLIENT_ID / TUYA_CLIENT_SECRET' });
    }

    const { data: machine, error } = await supabase
      .from('machines')
      .select('id, name, tuya_device_id')
      .eq('id', parseInt(req.params.id))
      .single();

    if (error || !machine) {
      return res.status(404).json({ error: 'ไม่พบเครื่อง' });
    }
    if (!machine.tuya_device_id) {
      return res.status(400).json({ error: 'เครื่องนี้ยังไม่ได้ตั้งค่า Tuya Device ID' });
    }

    if (action === 'restart') {
      // Force Reset: ส่งคำสั่ง switch_1 เป็น false เพื่อสั่งรีเซ็ตคอมพิวเตอร์ทันที
      await sendTuyaCommand(machine.tuya_device_id, false);
    } else {
      await sendTuyaCommand(machine.tuya_device_id, action === 'on');
    }

    const actionLabel = { on: 'เปิดเครื่อง', off: 'ปิดเครื่อง', restart: 'รีสตาร์ทเครื่อง' }[action];
    console.log(`⚡ Tuya Power [${actionLabel}]: ${machine.name} (${machine.tuya_device_id})`);
    res.json({ success: true, message: `${actionLabel} ${machine.name} สำเร็จ` });
  } catch (err) {
    console.error('Tuya power error:', err);
    res.status(500).json({ error: err.message || 'ไม่สามารถสั่งงาน Tuya ได้' });
  }
});


// POST /api/machines/:id/power-user — เปิด/ปิด/รีสตาร์ทเครื่อง (สำหรับผู้เช่าเครื่องนั้นๆ)
app.post('/api/machines/:id/power-user', authMiddleware, async (req, res) => {
  try {
    const { action } = req.body; // 'on' | 'off' | 'restart'
    if (!['on', 'off', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'action ต้องเป็น on, off หรือ restart เท่านั้น' });
    }

    if (!TUYA_CLIENT_ID || !TUYA_CLIENT_SECRET) {
      return res.status(503).json({ error: 'ระบบ Tuya ยังไม่ได้ตั้งค่า' });
    }

    const { data: machine, error } = await supabase
      .from('machines')
      .select('id, name, tuya_device_id, current_user_id, status')
      .eq('id', parseInt(req.params.id))
      .single();

    if (error || !machine) {
      return res.status(404).json({ error: 'ไม่พบเครื่อง' });
    }

    // ตรวจสอบว่าเป็นผู้เช่าเครื่องนี้อยู่
    if (machine.current_user_id !== req.user.id) {
      return res.status(403).json({ error: 'คุณไม่ได้เช่าเครื่องนี้' });
    }

    if (!machine.tuya_device_id) {
      return res.status(400).json({ error: 'เครื่องนี้ยังไม่ได้ตั้งค่า Tuya Device ID' });
    }

    if (action === 'restart') {
      // Force Reset: ส่งคำสั่ง switch_1 เป็น false เพื่อสั่งรีเซ็ตคอมพิวเตอร์ทันที
      await sendTuyaCommand(machine.tuya_device_id, false);
    } else {
      await sendTuyaCommand(machine.tuya_device_id, action === 'on');
    }

    const actionLabel = { on: 'เปิดเครื่อง', off: 'ปิดเครื่อง', restart: 'รีสตาร์ทเครื่อง' }[action];
    console.log(`⚡ Tuya Power [User] [${actionLabel}]: ${machine.name} (${machine.tuya_device_id})`);
    res.json({ success: true, message: `${actionLabel} ${machine.name} สำเร็จ` });
  } catch (err) {
    console.error('Tuya user power error:', err);
    res.status(500).json({ error: err.message || 'ไม่สามารถสั่งงาน Tuya ได้' });
  }
});
// POST /api/rent — เช่าเครื่อง (Atomic Transaction)
app.post('/api/rent', authMiddleware, async (req, res) => {
  try {
    const { machine_id, duration_hours, rent_unit, rent_quantity } = req.body;
    if (!machine_id) {
      return res.status(400).json({ error: 'กรุณาเลือกเครื่องคอมพิวเตอร์' });
    }

    const settings = await getSettings();
    if (settings[`outage_machine_${machine_id}`] === 'true') {
      return res.status(400).json({ error: 'ไม่สามารถเช่าเครื่องนี้ได้ในขณะนี้ เนื่องจากเครื่องอยู่ในสถานะไฟดับ' });
    }

    if (!machine_id || (!duration_hours && (!rent_unit || !rent_quantity))) {
      return res.status(400).json({ error: 'กรุณาเลือกเครื่องและระยะเวลา' });
    }

    // ดึงข้อมูลเครื่อง
    const { data: machine, error: machErr } = await supabase
      .from('machines')
      .select('*')
      .eq('id', machine_id)
      .single();

    if (!machine) return res.status(404).json({ error: 'ไม่พบเครื่องนี้' });
    if (machine.status !== 'available') {
      return res.status(400).json({ error: 'เครื่องนี้ไม่ว่างในขณะนี้' });
    }

    // ตรวจสอบสิทธิ์การเช่าตามประเภทเวลา (รายวัน, รายสัปดาห์, รายเดือน)
    if (rent_unit === 'day' && machine.allow_daily === false) {
      return res.status(400).json({ error: 'เครื่องนี้ไม่เปิดให้บริการเช่าแบบรายวัน' });
    }
    if (rent_unit === 'week' && machine.allow_weekly === false) {
      return res.status(400).json({ error: 'เครื่องนี้ไม่เปิดให้บริการเช่าแบบรายสัปดาห์' });
    }
    if (rent_unit === 'month' && machine.allow_monthly === false) {
      return res.status(400).json({ error: 'เครื่องนี้ไม่เปิดให้บริการเช่าแบบรายเดือน' });
    }

    // กรณีผ่าน duration_hours โดยตรง (Fallback)
    if (!rent_unit && duration_hours) {
      if (duration_hours >= 720 && machine.allow_monthly === false) {
        return res.status(400).json({ error: 'เครื่องนี้ไม่เปิดให้บริการเช่าแบบรายเดือน' });
      }
      if (duration_hours >= 168 && machine.allow_weekly === false) {
        return res.status(400).json({ error: 'เครื่องนี้ไม่เปิดให้บริการเช่าแบบรายสัปดาห์' });
      }
      if (duration_hours >= 24 && machine.allow_daily === false) {
        return res.status(400).json({ error: 'เครื่องนี้ไม่เปิดให้บริการเช่าแบบรายวัน' });
      }
    }

    // คำนวณราคาและระยะเวลา
    let total_price;
    let computed_duration_hours = duration_hours;

    if (rent_unit && rent_quantity) {
      const qty = parseInt(rent_quantity) || 1;
      if (rent_unit === 'day') {
        computed_duration_hours = qty * 24;
        total_price = qty * parseFloat(machine.price_per_day);
      } else if (rent_unit === 'week') {
        computed_duration_hours = qty * 168;
        const weekPrice = parseFloat(machine.price_per_week);
        total_price = qty * (weekPrice > 0 ? weekPrice : parseFloat(machine.price_per_day) * 7);
      } else if (rent_unit === 'month') {
        computed_duration_hours = qty * 720;
        const monthPrice = parseFloat(machine.price_per_month);
        total_price = qty * (monthPrice > 0 ? monthPrice : parseFloat(machine.price_per_day) * 30);
      } else {
        return res.status(400).json({ error: 'หน่วยเวลาเช่าไม่ถูกต้อง' });
      }
    } else {
      // Fallback
      if (computed_duration_hours >= 24) {
        const days = Math.floor(computed_duration_hours / 24);
        const remainingHours = computed_duration_hours % 24;
        total_price = (days * parseFloat(machine.price_per_day)) + (remainingHours * parseFloat(machine.price_per_hour));
      } else {
        total_price = computed_duration_hours * parseFloat(machine.price_per_hour);
      }
    }

    // ตรวจสอบเครดิต
    const { data: user, error: usrErr } = await supabase
      .from('users')
      .select('credit')
      .eq('id', req.user.id)
      .single();

    if (parseFloat(user.credit) < total_price) {
      return res.status(400).json({
        error: 'เครดิตไม่เพียงพอ',
        required: total_price,
        current: parseFloat(user.credit)
      });
    }

    // หักเครดิต
    const newCredit = parseFloat(user.credit) - total_price;
    const { error: creditErr } = await supabase
      .from('users')
      .update({ credit: newCredit })
      .eq('id', req.user.id);

    if (creditErr) throw creditErr;

    // อัปเดตสถานะเครื่อง
    const sessionEnd = new Date(Date.now() + computed_duration_hours * 60 * 60 * 1000);
    const { error: machUpdate } = await supabase
      .from('machines')
      .update({
        status: 'in_use',
        current_user_id: req.user.id,
        session_end_time: sessionEnd.toISOString()
      })
      .eq('id', machine_id);

    if (machUpdate) throw machUpdate;

    // เปิดเครื่องคอมพิวเตอร์อัตโนมัติ (Tuya Smart Plug/Switch)
    if (machine.tuya_device_id && TUYA_CLIENT_ID && TUYA_CLIENT_SECRET) {
      try {
        await sendTuyaCommand(machine.tuya_device_id, true);
        console.log(`⚡ Auto-start machine: ${machine.name} (${machine.tuya_device_id}) success.`);
      } catch (tuyaErr) {
         console.error(`⚠️ Auto-start machine failed: ${machine.name}:`, tuyaErr);
      }
    }

    // บันทึกประวัติการเช่า
    const { error: rentalErr } = await supabase
      .from('rentals')
      .insert({
        user_id: req.user.id,
        machine_id: machine_id,
        machine_name: machine.name,
        duration_hours: computed_duration_hours,
        total_price: total_price,
        started_at: new Date().toISOString(),
        ended_at: sessionEnd.toISOString(),
        status: 'active'
      });

    if (rentalErr) throw rentalErr;

    res.json({
      success: true,
      message: `เช่าเครื่อง ${machine.name} สำเร็จ!`,
      rental: {
        machine_name: machine.name,
        duration_hours: computed_duration_hours,
        total_price,
        session_end_time: sessionEnd.toISOString(),
        new_credit: newCredit
      }
    });
  } catch (err) {
    console.error('Rent error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเช่าเครื่อง' });
  }
});

// POST /api/rent/extend — ต่อเวลาเช่าเครื่อง
app.post('/api/rent/extend', authMiddleware, async (req, res) => {
  try {
    const { machine_id, rent_unit, rent_quantity } = req.body;
    if (!machine_id) {
      return res.status(400).json({ error: 'ข้อมูลเครื่องคอมพิวเตอร์ไม่ถูกต้อง' });
    }

    const settings = await getSettings();
    if (settings[`outage_machine_${machine_id}`] === 'true') {
      return res.status(400).json({ error: 'ไม่สามารถต่อเวลาได้ในขณะนี้ เนื่องจากเครื่องคอมพิวเตอร์เครื่องนี้อยู่ในสถานะไฟดับ' });
    }

    if (!machine_id || !rent_unit || !rent_quantity) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    const machineId = parseInt(machine_id);
    const qty = parseInt(rent_quantity);

    if (isNaN(machineId) || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    }

    // ดึงข้อมูลเครื่อง
    const { data: machine } = await supabase
      .from('machines')
      .select('*')
      .eq('id', machineId)
      .single();

    if (!machine) return res.status(404).json({ error: 'ไม่พบเครื่องนี้' });
    
    // ตรวจสอบสิทธิ์การต่อเวลาตามประเภทเวลา (รายวัน, รายสัปดาห์, รายเดือน)
    if (rent_unit === 'day' && machine.allow_daily === false) {
      return res.status(400).json({ error: 'เครื่องนี้ไม่เปิดให้ต่อเวลาแบบรายวัน' });
    }
    if (rent_unit === 'week' && machine.allow_weekly === false) {
      return res.status(400).json({ error: 'เครื่องนี้ไม่เปิดให้ต่อเวลาแบบรายสัปดาห์' });
    }
    if (rent_unit === 'month' && machine.allow_monthly === false) {
      return res.status(400).json({ error: 'เครื่องนี้ไม่เปิดให้ต่อเวลาแบบรายเดือน' });
    }

    // ตรวจสอบสิทธิ์: ต้องเป็นผู้เช่าปัจจุบันของเครื่องและเครื่องต้องอยู่ในสถานะ in_use
    if (machine.current_user_id !== req.user.id || machine.status !== 'in_use') {
      return res.status(403).json({ error: 'คุณไม่ได้เช่าเครื่องนี้อยู่ หรือเครื่องหมดเวลาเช่าแล้ว' });
    }

    // คำนวณราคาและระยะเวลา
    let total_price;
    let computed_duration_hours;

    if (rent_unit === 'day') {
      computed_duration_hours = qty * 24;
      total_price = qty * parseFloat(machine.price_per_day);
    } else if (rent_unit === 'week') {
      computed_duration_hours = qty * 168;
      const weekPrice = parseFloat(machine.price_per_week);
      total_price = qty * (weekPrice > 0 ? weekPrice : parseFloat(machine.price_per_day) * 7);
    } else if (rent_unit === 'month') {
      computed_duration_hours = qty * 720;
      const monthPrice = parseFloat(machine.price_per_month);
      total_price = qty * (monthPrice > 0 ? monthPrice : parseFloat(machine.price_per_day) * 30);
    } else {
      return res.status(400).json({ error: 'หน่วยเวลาเช่าไม่ถูกต้อง' });
    }

    // ดึงข้อมูลเครดิตผู้ใช้
    const { data: user } = await supabase
      .from('users')
      .select('credit')
      .eq('id', req.user.id)
      .single();

    if (parseFloat(user.credit) < total_price) {
      return res.status(400).json({
        error: 'เครดิตไม่เพียงพอ',
        required: total_price,
        current: parseFloat(user.credit)
      });
    }

    // หักเครดิต
    const newCredit = parseFloat(user.credit) - total_price;
    const { error: creditErr } = await supabase
      .from('users')
      .update({ credit: newCredit })
      .eq('id', req.user.id);

    if (creditErr) throw creditErr;

    // คำนวณเวลาสิ้นสุดเซสชันใหม่
    const baseTime = machine.session_end_time ? new Date(machine.session_end_time) : new Date();
    const newSessionEnd = new Date(baseTime.getTime() + computed_duration_hours * 60 * 60 * 1000);

    // อัปเดตเครื่อง
    const { error: machUpdate } = await supabase
      .from('machines')
      .update({
        session_end_time: newSessionEnd.toISOString()
      })
      .eq('id', machineId);

    if (machUpdate) throw machUpdate;

    // สั่งเปิดเครื่อง Tuya
    if (machine.tuya_device_id && TUYA_CLIENT_ID && TUYA_CLIENT_SECRET) {
      try {
        await sendTuyaCommand(machine.tuya_device_id, true);
        console.log(`⚡ Auto-start machine (Extend): ${machine.name} (${machine.tuya_device_id}) success.`);
      } catch (tuyaErr) {
         console.error(`⚠️ Auto-start machine failed during extension: ${machine.name}:`, tuyaErr);
      }
    }

    // อัปเดต rentals record
    const { data: activeRental } = await supabase
      .from('rentals')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('machine_id', machineId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (activeRental) {
      const { error: rentalErr } = await supabase
        .from('rentals')
        .update({
          duration_hours: activeRental.duration_hours + computed_duration_hours,
          total_price: parseFloat(activeRental.total_price) + total_price,
          ended_at: newSessionEnd.toISOString()
        })
        .eq('id', activeRental.id);
      if (rentalErr) throw rentalErr;
    } else {
      const { error: rentalErr } = await supabase
        .from('rentals')
        .insert({
          user_id: req.user.id,
          machine_id: machineId,
          machine_name: machine.name,
          duration_hours: computed_duration_hours,
          total_price: total_price,
          started_at: new Date().toISOString(),
          ended_at: newSessionEnd.toISOString(),
          status: 'active'
        });
      if (rentalErr) throw rentalErr;
    }

    res.json({
      success: true,
      message: `ต่อเวลาเช่าเครื่อง ${machine.name} สำเร็จ!`,
      rental: {
        machine_name: machine.name,
        duration_hours: computed_duration_hours,
        total_price,
        session_end_time: newSessionEnd.toISOString(),
        new_credit: newCredit
      }
    });
  } catch (err) {
    console.error('Extend rent error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการต่อเวลาเช่าเครื่อง' });
  }
});


// POST /api/release/:machineId — คืนเครื่อง (หรือหมดเวลาอัตโนมัติ)
app.post('/api/release/:machineId', authMiddleware, async (req, res) => {
  try {
    const machineId = parseInt(req.params.machineId);

    const { data: machine } = await supabase
      .from('machines')
      .select('*')
      .eq('id', machineId)
      .single();

    if (!machine) return res.status(404).json({ error: 'ไม่พบเครื่อง' });

    // ตรวจสอบสิทธิ์: ต้องเป็นผู้เช่าหรือ admin
    if (machine.current_user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์คืนเครื่องนี้' });
    }

    // ปิดเครื่องคอมพิวเตอร์อัตโนมัติ (Tuya Smart Plug/Switch)
    if (machine.tuya_device_id && TUYA_CLIENT_ID && TUYA_CLIENT_SECRET) {
      try {
        await sendTuyaCommand(machine.tuya_device_id, false);
        console.log(`🔌 Auto-shutdown machine: ${machine.name} (${machine.tuya_device_id}) success.`);
      } catch (tuyaErr) {
        console.error(`⚠️ Auto-shutdown machine failed: ${machine.name}:`, tuyaErr);
      }
    }

    // คืนเครื่อง -> ย้ายไปยังสถานะ clearing (กำลังเคลียข้อมูล)
    const { error: machineErr } = await supabase
      .from('machines')
      .update({ status: 'clearing', current_user_id: null, session_end_time: null })
      .eq('id', machineId);
    if (machineErr) throw machineErr;

    // อัปเดตสถานะ rental
    const { error: rentalErr } = await supabase
      .from('rentals')
      .update({ status: 'completed' })
      .eq('machine_id', machineId)
      .eq('status', 'active');
    if (rentalErr) throw rentalErr;

    // ส่งการแจ้งเตือน Discord (รอบที่ 1: คืนเครื่อง)
    sendDiscordExpiryNotification(
      machine,
      '🔌 แจ้งเตือน: คืนเครื่องเช่า',
      'คอมเครื่องนี้ถูกกดคืนเครื่องแล้ว และกำลังเคลียข้อมูล'
    ).catch(err => {
      console.error('Error sending release webhook:', err);
    });

    res.json({ success: true, message: 'คืนเครื่องสำเร็จ' });
  } catch (err) {
    console.error('Release error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการคืนเครื่อง' });
  }
});

// =============================================
// TOPUP ROUTES (ตรวจสลิปอัตโนมัติ)
// =============================================

// --- Rate Limiter สำหรับการส่งสลิป (In-Memory) ---
const slipRateLimitMap = new Map();
const SLIP_RATE_LIMIT = 3;       // จำนวนครั้งสูงสุดต่อ user
const SLIP_RATE_WINDOW = 60000;  // ภายใน 1 นาที (ms)

// POST /api/verify-slip — ตรวจสอบสลิปและเติมเครดิต
app.post('/api/verify-slip', authMiddleware, upload.single('slip'), async (req, res) => {
  try {
    // --- ชั้นที่ 1: Rate Limiting — จำกัด 3 ครั้ง/นาที/user ---
    const rateLimitUserId = req.user.id;
    const rateLimitNow = Date.now();
    const userRateHistory = slipRateLimitMap.get(rateLimitUserId) || [];
    const recentAttempts = userRateHistory.filter(t => rateLimitNow - t < SLIP_RATE_WINDOW);
    if (recentAttempts.length >= SLIP_RATE_LIMIT) {
      return res.status(429).json({ error: 'คุณส่งสลิปถี่เกินไป กรุณารอสักครู่แล้วลองใหม่ (สูงสุด 3 ครั้งต่อนาที)' });
    }
    recentAttempts.push(rateLimitNow);
    slipRateLimitMap.set(rateLimitUserId, recentAttempts);

    const settings = await getSettings();
    if (settings.topup_slip_enabled !== 'true') {
      return res.status(400).json({ error: 'ช่องทางเติมเงินผ่านสลิปธนาคารถูกปิดใช้งานชั่วคราว' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาอัปโหลดรูปสลิปโอนเงิน' });
    }

    // --- ส่งสลิปไปตรวจกับ EasySlip API ---
    const slipApiUrl = process.env.SLIP_API_URL;
    const slipApiKey = process.env.SLIP_API_KEY;

    if (!slipApiUrl || !slipApiKey) {
      // ถ้ายังไม่ได้ตั้งค่า Slip API → บันทึกเป็น pending (fallback)
      console.warn('⚠️ SLIP_API_URL หรือ SLIP_API_KEY ยังไม่ได้ตั้งค่า — บันทึกรอตรวจสอบ');

      const { error } = await supabase.from('topups').insert({
        user_id: req.user.id,
        amount: 0,
        status: 'pending',
        note: 'รอตั้งค่า Slip API'
      });

      return res.json({
        success: false,
        message: 'ระบบตรวจสลิปยังไม่พร้อม กรุณาติดต่อแอดมิน'
      });
    }

    let slipResponse;
    const isV2 = slipApiUrl.includes('/v2');

    if (isV2) {
      // --- EasySlip V2: ส่งไฟล์ผ่าน multipart/form-data ---
      const form = new FormData();
      form.append('image', req.file.buffer, {
        filename: 'slip.jpg', // ใช้ชื่อไฟล์มาตรฐานเพื่อป้องกันปัญหาสระภาษาไทย
        contentType: req.file.mimetype || 'image/jpeg'
      });

      slipResponse = await fetch(slipApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${slipApiKey}`,
          ...form.getHeaders()
        },
        body: form
      });
    } else {
      // --- EasySlip V1 (Legacy): ส่งเป็น JSON Base64 ---
      const base64Image = req.file.buffer.toString('base64');
      slipResponse = await fetch(slipApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${slipApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: base64Image,
          base64: base64Image
        })
      });
    }

    const slipResult = await slipResponse.json();

    // --- ตรวจสอบผลลัพธ์จาก EasySlip API ---
    // EasySlip v2 ใช้ success: true ส่วน EasySlip v1 (legacy) ใช้ status: 200
    const isSuccess = slipResult.success === true || slipResult.status === 200 || slipResult.status === '200';
    if (!isSuccess || !slipResult.data) {
      let errorMsg = (slipResult.error && slipResult.error.message) || slipResult.message || 'สลิปไม่ถูกต้องหรือไม่สามารถอ่าน QR Code ได้';
      if (errorMsg === 'application_expired') {
        errorMsg = 'ระบบตรวจสอบสลิปขัดข้อง (API EasySlip หมดอายุ/ไม่ได้ต่ออายุแพ็กเกจ) กรุณาติดต่อแอดมิน';
      }
      let debugNote = errorMsg;
      if (req.file) {
        debugNote += ` (size: ${req.file.size}B, type: ${req.file.mimetype}, node: ${process.version})`;
      }
      await supabase.from('topups').insert({
        user_id: req.user.id,
        amount: 0,
        status: 'rejected',
        note: debugNote,
        slip_data: slipResult
      });
      return res.status(400).json({ error: errorMsg });
    }

    const transRef = slipResult.data.transRef || (slipResult.data.rawSlip && slipResult.data.rawSlip.transRef);

    if (!transRef) {
      return res.status(400).json({ error: 'ไม่พบเลขอ้างอิงรายการในสลิป' });
    }

    // ดึงยอดเงินทำรายการ (amount) แบบยืดหยุ่นรองรับ v1 และ v2
    let amount = 0;
    if (slipResult.data.amount && typeof slipResult.data.amount === 'object' && slipResult.data.amount.amount !== undefined) {
      amount = slipResult.data.amount.amount;
    } else if (slipResult.data.amountInSlip !== undefined) {
      amount = slipResult.data.amountInSlip;
    } else if (slipResult.data.amount !== undefined) {
      amount = slipResult.data.amount;
    } else if (slipResult.data.rawSlip && slipResult.data.rawSlip.amount && slipResult.data.rawSlip.amount.amount !== undefined) {
      amount = slipResult.data.rawSlip.amount.amount;
    }

    // ตรวจสอบ transRef ซ้ำ
    const { data: existingTopup } = await supabase
      .from('topups')
      .select('id')
      .eq('transaction_ref', transRef)
      .single();

    if (existingTopup) {
      return res.status(400).json({ error: 'สลิปนี้ถูกใช้งานไปแล้ว ไม่สามารถใช้ซ้ำได้' });
    }

    // --- ชั้นที่ 2: ตรวจสอบบัญชีปลายทาง (Receiver Verification) ---
    let shopAccountsRaw = settings.shop_accounts || '[]';
    let shopAccounts = [];
    try {
      shopAccounts = typeof shopAccountsRaw === 'string' ? JSON.parse(shopAccountsRaw) : shopAccountsRaw;
    } catch (e) { shopAccounts = []; }

    if (shopAccounts.length > 0) {
      const receiver = slipResult.data.receiver
        || (slipResult.data.rawSlip && slipResult.data.rawSlip.receiver);

      if (!receiver) {
        await supabase.from('topups').insert({
          user_id: req.user.id, amount: 0, transaction_ref: transRef,
          status: 'rejected', note: 'ไม่พบข้อมูลบัญชีปลายทางในสลิป',
          slip_data: slipResult.data
        });
        return res.status(400).json({ error: 'ไม่สามารถตรวจสอบบัญชีปลายทางในสลิปได้ กรุณาลองใหม่อีกครั้ง' });
      }

      // ดึงข้อมูลผู้รับจาก EasySlip response
      const receiverBankShort = (receiver.bank && (receiver.bank.short || receiver.bank.id)) || '';
      const receiverName = (receiver.account && receiver.account.name
        && (receiver.account.name.th || receiver.account.name.en)) || '';

      // ฟังก์ชันล้างข้อมูลชื่อ: ลบช่องว่าง, จุด, ขีด, และคำนำหน้าชื่อ เพื่อให้เปรียบเทียบกันได้แม้ชื่อถูกบังบางส่วน (Masked)
      const cleanString = (str) => {
        if (!str) return '';
        return str
          .replace(/[\s\.\,\-\_]+/g, '')
          .replace(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง|mr|mrs|miss|ms)\.?/gi, '')
          .toLowerCase();
      };

      // เปรียบเทียบกับบัญชีร้านที่ตั้งค่าไว้
      const isValidReceiver = shopAccounts.some(account => {
        const bankCode = (account.bank || '').toUpperCase();
        const accName = (account.accountName || '');

        // จับคู่รหัสธนาคาร หรือชื่อย่อธนาคาร
        const bankMatch = receiverBankShort.toUpperCase().includes(bankCode)
          || bankCode.includes(receiverBankShort.toUpperCase())
          || (receiver.bank && receiver.bank.id && receiver.bank.id === bankCode)
          || (receiver.bank && receiver.bank.name && receiver.bank.name.toUpperCase().includes(bankCode));

        // ดึงชื่อผู้รับในสลิปทั้งไทยและอังกฤษ
        const cleanAccName = cleanString(accName);
        const receiverNameTh = cleanString(receiver.account && receiver.account.name && receiver.account.name.th);
        const receiverNameEn = cleanString(receiver.account && receiver.account.name && receiver.account.name.en);

        // เช็คว่าชื่อที่ดึงมาบางส่วน ตรงกับชื่อเต็มที่ตั้งค่าไว้หรือไม่
        const nameMatch = (receiverNameTh && (cleanAccName.includes(receiverNameTh) || receiverNameTh.includes(cleanAccName)))
          || (receiverNameEn && (cleanAccName.includes(receiverNameEn) || receiverNameEn.includes(cleanAccName)));

        return bankMatch && nameMatch;
      });

      if (!isValidReceiver) {
        await supabase.from('topups').insert({
          user_id: req.user.id, amount: 0, transaction_ref: transRef,
          status: 'rejected',
          note: `บัญชีปลายทางไม่ตรงกับร้าน: ${receiverName} (${receiverBankShort})`,
          slip_data: slipResult.data
        });
        console.warn(`⚠️ Slip rejected — wrong receiver: user=${req.user.username}, receiver=${receiverName} (${receiverBankShort})`);
        return res.status(400).json({ error: 'สลิปนี้ไม่ได้โอนเข้าบัญชีของร้าน กรุณาโอนเข้าบัญชีที่ระบุไว้ในหน้าเติมเงินเท่านั้น' });
      }
    }

    // --- ชั้นที่ 3: ตรวจสอบอายุสลิป (Slip Age Validation) ---
    const MAX_SLIP_AGE_MINUTES = parseInt(settings.slip_max_age_minutes) || 5;
    const transDate = slipResult.data.transDate || slipResult.data.date
      || (slipResult.data.rawSlip && slipResult.data.rawSlip.transDate);
    const transTimestamp = slipResult.data.transTimestamp
      || (slipResult.data.rawSlip && slipResult.data.rawSlip.transTimestamp);

    let slipTime = null;
    if (transTimestamp) {
      slipTime = new Date(transTimestamp);
    } else if (transDate) {
      slipTime = new Date(transDate);
    }

    if (slipTime && !isNaN(slipTime.getTime())) {
      const slipAgeMinutes = (Date.now() - slipTime.getTime()) / (1000 * 60);
      if (slipAgeMinutes > MAX_SLIP_AGE_MINUTES) {
        await supabase.from('topups').insert({
          user_id: req.user.id, amount: 0, transaction_ref: transRef,
          status: 'rejected',
          note: `สลิปเก่าเกินกำหนด (${Math.round(slipAgeMinutes)} นาที, จำกัด ${MAX_SLIP_AGE_MINUTES} นาที)`,
          slip_data: slipResult.data
        });
        console.warn(`⚠️ Slip rejected — too old: user=${req.user.username}, age=${Math.round(slipAgeMinutes)} min`);
        return res.status(400).json({
          error: `สลิปนี้โอนเงินเมื่อ ${Math.round(slipAgeMinutes)} นาทีที่แล้ว ระบบรับเฉพาะสลิปที่โอนภายใน ${MAX_SLIP_AGE_MINUTES} นาทีเท่านั้น`
        });
      }
    }

    const topupAmount = parseFloat(amount);
    if (isNaN(topupAmount) || topupAmount <= 0) {
      await supabase.from('topups').insert({
        user_id: req.user.id,
        amount: 0,
        transaction_ref: transRef,
        status: 'rejected',
        note: 'จำนวนเงินไม่ถูกต้อง',
        slip_data: slipResult.data
      });
      return res.status(400).json({ error: 'จำนวนเงินในสลิปไม่ถูกต้อง' });
    }

    // --- อนุมัติอัตโนมัติ: เพิ่มเครดิต ---
    // ดึงเครดิตปัจจุบัน
    const { data: user } = await supabase
      .from('users')
      .select('credit')
      .eq('id', req.user.id)
      .single();

    const newCredit = parseFloat(user.credit) + topupAmount;

    // อัปเดตเครดิต
    await supabase
      .from('users')
      .update({ credit: newCredit })
      .eq('id', req.user.id);

    // ดึงรหัสหรือชื่อธนาคารต้นทาง
    let sendingBank = 'N/A';
    if (slipResult.data.sender && slipResult.data.sender.bank) {
      sendingBank = slipResult.data.sender.bank.short || slipResult.data.sender.bank.nameTh || 'N/A';
    } else if (slipResult.data.rawSlip && slipResult.data.rawSlip.sender && slipResult.data.rawSlip.sender.bank) {
      sendingBank = slipResult.data.rawSlip.sender.bank.short || slipResult.data.rawSlip.sender.bank.nameTh || 'N/A';
    }

    // บันทึก topup record
    await supabase.from('topups').insert({
      user_id: req.user.id,
      amount: topupAmount,
      transaction_ref: transRef,
      status: 'approved',
      note: `อนุมัติอัตโนมัติ — ${sendingBank}`,
      slip_data: slipResult.data
    });

    res.json({
      success: true,
      message: `เติมเงินสำเร็จ ${topupAmount.toFixed(2)} บาท`,
      new_credit: newCredit
    });

  } catch (err) {
    console.error('Verify slip error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบสลิป' });
  }
});

// POST /api/verify-angpao — ตรวจสอบและแลกซองของขวัญ TrueMoney
app.post('/api/verify-angpao', authMiddleware, async (req, res) => {
  try {
    const { voucher_url } = req.body;
    if (!voucher_url) {
      return res.status(400).json({ error: 'กรุณากรอกลิงก์ซองของขวัญ TrueMoney' });
    }

    // ดึงรหัสซองของขวัญ (voucher hash)
    let voucherHash = null;
    try {
      const match = voucher_url.match(/v=([a-zA-Z0-9]+)/);
      if (match) {
        voucherHash = match[1];
      } else if (/^[a-zA-Z0-9]+$/.test(voucher_url.trim())) {
        voucherHash = voucher_url.trim();
      }
    } catch (e) {
      // Ignored
    }

    if (!voucherHash) {
      return res.status(400).json({ error: 'ลิงก์ซองของขวัญทรูมันนี่ไม่ถูกต้อง' });
    }

    // ตรวจสอบเบอร์ TrueMoney ของแอดมินจากระบบตั้งค่า
    const settings = await getSettings();
    if (settings.topup_wallet_enabled !== 'true') {
      return res.status(400).json({ error: 'ช่องทางเติมเงินผ่านซองของขวัญ TrueMoney ถูกปิดใช้งานชั่วคราว' });
    }
    const adminPhone = settings.truemoney_phone ? settings.truemoney_phone.trim() : '';
    if (!adminPhone) {
      return res.status(400).json({ error: 'ระบบเติมเงินผ่านซองของขวัญยังไม่เปิดใช้งาน (แอดมินยังไม่ได้ตั้งค่าเบอร์รับเงิน)' });
    }

    // ตรวจสอบว่าเคยใช้ซองนี้หรือยัง (ตรวจ transRef ซ้ำ)
    const { data: existingTopup } = await supabase
      .from('topups')
      .select('id')
      .eq('transaction_ref', voucherHash)
      .single();

    if (existingTopup) {
      return res.status(400).json({ error: 'ซองของขวัญนี้ถูกใช้งานในระบบไปแล้ว ไม่สามารถใช้ซ้ำได้' });
    }

    // เรียก API ภายนอกเพื่อแลกซองของขวัญ
    const response = await fetch(`https://api.xpluem.com/${voucherHash}/${adminPhone}`);
    const result = await response.json();

    // ตรวจสอบผลลัพธ์
    if (!result.success) {
      const errMsg = result.message || 'ลิงก์ซองของขวัญไม่ถูกต้อง หรือถูกใช้งานไปแล้ว';
      return res.status(400).json({ error: errMsg });
    }

    // ดึงจำนวนเงินที่ได้รับจริง
    const amount = parseFloat(result.data ? result.data.amount : 0);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'จำนวนเงินในซองไม่ถูกต้อง หรือซองว่างเปล่า' });
    }

    // เพิ่มเครดิตให้กับสมาชิก
    const { data: user } = await supabase
      .from('users')
      .select('credit')
      .eq('id', req.user.id)
      .single();

    const newCredit = parseFloat(user.credit) + amount;

    await supabase
      .from('users')
      .update({ credit: newCredit })
      .eq('id', req.user.id);

    // ดึงชื่อผู้ส่งซอง (ถ้ามี)
    const senderName = (result.data && result.data.name) || 'N/A';

    // บันทึกในประวัติการเติมเงิน (topup record)
    await supabase.from('topups').insert({
      user_id: req.user.id,
      amount: amount,
      transaction_ref: voucherHash,
      status: 'approved',
      note: `ซองทรูมันนี่ (ผ่าน API xpluem) — จากคุณ ${senderName}`,
      slip_data: result.data
    });

    res.json({
      success: true,
      message: `เติมเงินสำเร็จ ${amount.toFixed(2)} บาท`,
      new_credit: newCredit
    });

  } catch (err) {
    console.error('Verify Angpao error:', err);
    res.status(500).json({ error: `เกิดข้อผิดพลาดในการตรวจสอบซองของขวัญ: ${err.message}` });
  }
});

// =============================================
// PROMPTPAY AUTO TOPUP (inwcloud API)
// =============================================

// ฟังก์ชันสกัดจำนวนเงินจริงที่มีการใส่ทศนิยมสุ่มจากข้อมูล EMVCo Payload
function extractAmountFromEMVCo(payload) {
  if (!payload || typeof payload !== 'string') return null;
  let index = 0;
  while (index < payload.length) {
    if (index + 4 > payload.length) break;
    const tag = payload.substring(index, index + 2);
    const lengthVal = parseInt(payload.substring(index + 2, index + 4), 10);
    if (isNaN(lengthVal)) break;
    
    const value = payload.substring(index + 4, index + 4 + lengthVal);
    if (tag === '54') {
      const parsedAmount = parseFloat(value);
      if (!isNaN(parsedAmount)) {
        return parsedAmount;
      }
    }
    index += 4 + lengthVal;
  }
  return null;
}

// POST /api/topup/promptpay/generate — สร้าง QR Code ชำระเงินผ่าน inwcloud
app.post('/api/topup/promptpay/generate', authMiddleware, async (req, res) => {
  try {
    const settings = await getSettings();
    if (isTopupTimeRestricted(settings)) {
      return res.status(400).json({ error: `ช่องทางเติมเงินผ่าน PromptPay Auto ปิดให้บริการชั่วคราวระหว่างเวลา ${settings.topup_restricted_start} - ${settings.topup_restricted_end} น.` });
    }
    if (settings.topup_promptpay_enabled !== 'true') {
      return res.status(400).json({ error: 'ช่องทางเติมเงินผ่าน PromptPay Auto ปิดใช้งานชั่วคราว' });
    }

    const { amount } = req.body;
    const topupAmount = parseFloat(amount);
    if (isNaN(topupAmount) || topupAmount <= 0) {
      return res.status(400).json({ error: 'กรุณาระบุจำนวนเงินที่ต้องการเติม (ต้องมากกว่า 0 บาท)' });
    }

    const apiKey = process.env.INWCLOUD_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ระบบเติมเงินอัตโนมัติยังไม่พร้อมใช้งาน (ติดต่อแอดมิน)' });
    }

    // สร้างหมายเลขอ้างอิงรายการเติมเงินที่ไม่ซ้ำกัน
    const reference = `PP-${Date.now()}-${req.user.id}`;

    // สร้าง Callback URL อัตโนมัติตามโฮสต์ที่ใช้งานจริง (รองรับทั้ง localhost และโดเมนหลัก)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const callbackUrl = `${protocol}://${req.get('host')}/api/webhook/inwcloud`;

    // ส่งคำขอสร้าง QR code ไปที่ API inwcloud.shop
    const response = await fetch('https://api.inwcloud.shop/v1/promptpay/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: topupAmount,
        reference: reference,
        callback_url: callbackUrl
      })
    });

    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
      const errMsg = result.message || 'ไม่สามารถเจเนอเรต QR Code จาก API ผู้ให้บริการได้';
      return res.status(400).json({ error: errMsg });
    }

    // ตรวจหาจำนวนเงินจริงที่ถูกแปลงทศนิยมสุ่มใน payload ของ QR Code
    let finalAmount = topupAmount;
    if (result.data && result.data.payload) {
      const extracted = extractAmountFromEMVCo(result.data.payload);
      if (extracted !== null) {
        finalAmount = extracted;
        console.log(`Parsed randomized amount from payload: Original=฿${topupAmount}, Actual=฿${finalAmount}`);
      }
    }

    // บันทึกรายการเติมเงินเริ่มต้นเป็น pending ลงในตาราง topups
    await supabase.from('topups').insert({
      user_id: req.user.id,
      amount: finalAmount,
      transaction_ref: reference,
      status: 'pending',
      note: 'รอสแกนชำระเงินผ่าน PromptPay Auto (inwcloud)',
      slip_data: result.data || {}
    });

    res.json({
      success: true,
      qr_url: result.data ? result.data.qr_url : '',
      reference: reference,
      amount: finalAmount
    });

  } catch (err) {
    console.error('Generate PromptPay QR error:', err);
    res.status(500).json({ error: `เกิดข้อผิดพลาดในการสร้าง QR Code: ${err.message}` });
  }
});

// POST /api/webhook/inwcloud — Callback/Webhook แจ้งเงินเข้าจาก inwcloud.shop
app.post('/api/webhook/inwcloud', async (req, res) => {
  try {
    console.log('Received inwcloud webhook payload:', req.body);
    
    // บันทึก Log ลงไฟล์เพื่อตรวจสอบความถูกต้องของข้อมูลจาก API จริง
    try {
      const logPath = path.join(__dirname, 'webhook.log');
      const logMsg = `[${new Date().toISOString()}] BODY: ${JSON.stringify(req.body)} | HEADERS: ${JSON.stringify(req.headers)}\n`;
      fs.appendFileSync(logPath, logMsg, 'utf8');
    } catch (e) {
      console.error('Failed to write webhook.log:', e);
    }
    
    // ดึงค่าอ้างอิงและยอดเงินจาก request body
    const ref = req.body.reference || req.body.ref || req.body.reference_no;
    const amountVal = req.body.amount;
    
    if (!ref) {
      return res.status(400).json({ error: 'Missing reference' });
    }

    // ค้นหารายการเติมเงินที่สถานะเป็น pending
    const { data: topup, error } = await supabase
      .from('topups')
      .select('*')
      .eq('transaction_ref', ref)
      .eq('status', 'pending')
      .single();

    if (error || !topup) {
      console.warn(`Webhook: Transaction reference ${ref} not found or already approved`);
      return res.status(404).json({ error: 'Transaction reference not found or already approved' });
    }

    const topupAmount = parseFloat(amountVal || topup.amount);

    // ดึงเครดิตปัจจุบันของผู้ใช้
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('credit')
      .eq('id', topup.user_id)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // บวกเงินเพิ่มให้ผู้ใช้
    const newCredit = parseFloat(user.credit) + topupAmount;
    await supabase
      .from('users')
      .update({ credit: newCredit })
      .eq('id', topup.user_id);

    // อัปเดตสถานะของตาราง topups เป็น approved
    await supabase
      .from('topups')
      .update({
        status: 'approved',
        note: 'ชำระเงินสำเร็จผ่าน PromptPay Auto (inwcloud)',
        slip_data: req.body
      })
      .eq('id', topup.id);

    console.log(`Successfully credited user ${topup.user_id} with ฿${topupAmount}`);

    res.json({ success: true, message: 'Webhook processed and user credited' });

  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: `Internal server error: ${err.message}` });
  }
});

// GET /api/topup/promptpay/status/:ref — ตรวจสอบสถานะการเติมเงินโดยถาม inwcloud API โดยตรง
app.get('/api/topup/promptpay/status/:ref', authMiddleware, async (req, res) => {
  try {
    const { ref } = req.params;
    const { data: topup, error } = await supabase
      .from('topups')
      .select('*')
      .eq('transaction_ref', ref)
      .eq('user_id', req.user.id)
      .single();

    if (error || !topup) {
      return res.status(404).json({ error: 'ไม่พบรายการอ้างอิงนี้' });
    }

    // ถ้าสถานะเป็น approved อยู่แล้ว ส่งกลับทันที
    if (topup.status === 'approved') {
      return res.json({
        success: true,
        status: 'approved',
        amount: topup.amount
      });
    }

    // ถ้ายังเป็น pending — ถาม inwcloud API โดยตรงว่าเงินเข้าแล้วหรือยัง
    const apiKey = process.env.INWCLOUD_API_KEY;
    const transactionId = topup.slip_data && topup.slip_data.transactionId;

    if (apiKey && transactionId) {
      try {
        const checkRes = await fetch('https://api.inwcloud.shop/v1/promptpay/check', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ transactionId: transactionId })
        });

        const checkData = await checkRes.json();
        console.log(`inwcloud check for ${ref}:`, JSON.stringify(checkData));

        // ถ้า inwcloud ยืนยันว่าชำระสำเร็จ — เครดิตเงินให้ผู้ใช้ทันที
        if (checkData.status === 'success' && checkData.message && checkData.message.includes('สำเร็จ')) {
          // ดึงยอดเงินจาก inwcloud response หรือจากที่บันทึกไว้
          const paidAmount = parseFloat(checkData.amount) || topup.amount;

          // ดึงเครดิตปัจจุบันของผู้ใช้
          const { data: user } = await supabase
            .from('users')
            .select('credit')
            .eq('id', req.user.id)
            .single();

          if (user) {
            const newCredit = parseFloat(user.credit) + paidAmount;
            await supabase
              .from('users')
              .update({ credit: newCredit })
              .eq('id', req.user.id);

            // อัปเดตสถานะเป็น approved
            await supabase
              .from('topups')
              .update({
                status: 'approved',
                note: 'ชำระเงินสำเร็จผ่าน PromptPay Auto (inwcloud)',
                amount: paidAmount
              })
              .eq('id', topup.id);

            console.log(`Active check: credited user ${req.user.id} with ฿${paidAmount}`);

            return res.json({
              success: true,
              status: 'approved',
              amount: paidAmount
            });
          }
        }
      } catch (checkErr) {
        console.error('inwcloud check API error:', checkErr.message);
      }
    }

    // ยังไม่ชำระ — ส่งสถานะ pending กลับไป
    res.json({
      success: true,
      status: topup.status,
      amount: topup.amount
    });

  } catch (err) {
    console.error('Get transaction status error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถานะ' });
  }
});

// GET /api/my-topups — ประวัติเติมเงินของผู้ใช้
app.get('/api/my-topups', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('topups')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ topups: data });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถโหลดประวัติเติมเงินได้' });
  }
});

// =============================================
// RENTAL HISTORY
// =============================================

// GET /api/my-rentals — ประวัติเช่าของผู้ใช้
app.get('/api/my-rentals', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('rentals')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ rentals: data });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถโหลดประวัติการเช่าได้' });
  }
});

// GET /api/my-active-machines — เครื่องที่กำลังเช่าอยู่
app.get('/api/my-active-machines', authMiddleware, async (req, res) => {
  try {
    await autoReleaseExpiredMachines();
    const [machinesRes, settings] = await Promise.all([
      supabase
        .from('machines')
        .select('*')
        .eq('current_user_id', req.user.id)
        .eq('status', 'in_use'),
      getSettings()
    ]);

    if (machinesRes.error) throw machinesRes.error;

    const machines = machinesRes.data.map(m => ({
      ...m,
      is_power_out: settings[`outage_machine_${m.id}`] === 'true'
    }));

    res.json({ machines: machines });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// =============================================
// SETTINGS MANAGEMENT (Facebook & Discord Links & TrueMoney Phone)
// =============================================
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const defaultSettings = {
  facebook_url: 'https://facebook.com',
  discord_url: 'https://discord.com',
  truemoney_phone: '',
  topup_wallet_enabled: 'true',
  topup_promptpay_enabled: 'true',
  topup_slip_enabled: 'true',
  topup_time_restriction_enabled: 'false',
  topup_restricted_start: '01:00',
  topup_restricted_end: '03:00',
  popup_enabled: 'false',
  popup_image_url: '',
  chat_auto_delete_enabled: 'false',
  chat_auto_delete_days: '30'
};

function isTopupTimeRestricted(settings) {
  if (!settings || settings.topup_time_restriction_enabled !== 'true') {
    return false;
  }
  const startTime = settings.topup_restricted_start;
  const endTime = settings.topup_restricted_end;
  if (!startTime || !endTime) return false;

  let now;
  try {
    now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  } catch (e) {
    now = new Date();
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes === endMinutes) return false;

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

async function getSettings() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*');
    if (!error && data && data.length > 0) {
      const settings = {};
      data.forEach(item => {
        settings[item.key] = item.value;
      });
      return { ...defaultSettings, ...settings };
    }
  } catch (err) {
    console.log('Database settings table not ready, using fallback.');
  }

  // Fallback to local settings.json
  try {
    const fs = require('fs');
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return { ...defaultSettings, ...JSON.parse(content) };
    }
  } catch (err) {
    console.error('Error reading settings.json:', err);
  }
  return defaultSettings;
}

async function updateSettings(settings) {
  let dbSuccess = false;
  try {
    const upsertData = Object.entries(settings).map(([key, value]) => ({ key, value }));
    const { error } = await supabase
      .from('settings')
      .upsert(upsertData);
    if (!error) {
      dbSuccess = true;
    }
  } catch (err) {
    console.log('Database settings table not ready, skipping DB update.');
  }

  // Always write to local settings.json as fallback
  try {
    const fs = require('fs');
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing settings.json:', err);
    if (!dbSuccess) throw new Error('ไม่สามารถบันทึกการตั้งค่าได้');
  }
}

// GET /api/settings — ดึงข้อมูลลิ้งก์ติดต่อ (Public)
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลการตั้งค่าได้' });
  }
});

// Ensure public/uploads exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration for popup images
const popupStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `popup-${Date.now()}${ext}`);
  }
});

const uploadPopup = multer({
  storage: popupStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น'));
  }
});

// POST /api/admin/upload-popup — อัปโหลดรูปภาพ Pop-up (Admin only)
app.post('/api/admin/upload-popup', authMiddleware, adminMiddleware, (req, res, next) => {
  uploadPopup.single('popup_image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'ขนาดไฟล์ภาพเกินขีดจำกัด 5MB' });
      }
      return res.status(400).json({ error: `Multer error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์รูปภาพ' });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, imageUrl });
  } catch (err) {
    console.error('Upload popup error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ' });
  }
});

// =============================================
// ADMIN ROUTES
// =============================================

// GET /api/admin/stats — สรุปภาพรวม
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [machines, users, rentals, topups] = await Promise.all([
      supabase.from('machines').select('id, status'),
      supabase.from('users').select('id', { count: 'exact' }),
      supabase.from('rentals').select('id, total_price, status'),
      supabase.from('topups').select('id, amount, status').eq('status', 'approved')
    ]);

    const totalMachines = machines.data?.length || 0;
    const activeMachines = machines.data?.filter(m => m.status === 'in_use').length || 0;
    const totalUsers = users.count || 0;
    const totalRentals = rentals.data?.length || 0;
    const totalRevenue = rentals.data?.reduce((sum, r) => sum + parseFloat(r.total_price || 0), 0) || 0;
    const totalTopups = topups.data?.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) || 0;

    res.json({
      totalMachines, activeMachines, totalUsers,
      totalRentals, totalRevenue, totalTopups
    });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/admin/machines — จัดการเครื่อง (ข้อมูลเต็ม)
app.get('/api/admin/machines', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [machinesRes, settings] = await Promise.all([
      supabase.from('machines').select('*').order('id'),
      getSettings()
    ]);

    if (machinesRes.error) throw machinesRes.error;

    const machines = machinesRes.data.map(m => ({
      ...m,
      is_power_out: settings[`outage_machine_${m.id}`] === 'true'
    }));

    res.json({ machines });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// POST /api/admin/machines — เพิ่มเครื่องใหม่
app.post('/api/admin/machines', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, category, cpu, ram, ssd, gpu, os, price_per_hour, price_per_day, price_per_week, price_per_month,
            rdp_ip, rdp_username, rdp_password,
            anydesk_id, anydesk_password, tuya_device_id,
            image_url,
            allow_daily, allow_weekly, allow_monthly, test_result } = req.body;

    if (!name || !category || !price_per_hour || !price_per_day) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็น' });
    }

    const { data, error } = await supabase
      .from('machines')
      .insert({
        name, category, cpu, ram, ssd, gpu, os,
        price_per_hour: parseFloat(price_per_hour),
        price_per_day: parseFloat(price_per_day),
        price_per_week: parseFloat(price_per_week || 0),
        price_per_month: parseFloat(price_per_month || 0),
        status: 'available',
        rdp_ip: rdp_ip || null,
        rdp_username: rdp_username || null,
        rdp_password: rdp_password || null,
        anydesk_id, anydesk_password, tuya_device_id,
        image_url,
        allow_daily: allow_daily !== undefined ? (allow_daily === true || allow_daily === 'true') : true,
        allow_weekly: allow_weekly !== undefined ? (allow_weekly === true || allow_weekly === 'true') : true,
        allow_monthly: allow_monthly !== undefined ? (allow_monthly === true || allow_monthly === 'true') : true,
        test_result: test_result || null
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, machine: data });
  } catch (err) {
    console.error('Add machine error:', err);
    res.status(500).json({ error: 'ไม่สามารถเพิ่มเครื่องได้' });
  }
});

// PUT /api/admin/machines/:id — แก้ไขเครื่อง
app.put('/api/admin/machines/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, category, cpu, ram, ssd, gpu, os, price_per_hour, price_per_day, price_per_week, price_per_month,
            rdp_ip, rdp_username, rdp_password,
            anydesk_id, anydesk_password, tuya_device_id,
            image_url,
            allow_daily, allow_weekly, allow_monthly, test_result } = req.body;

    const { data, error } = await supabase
      .from('machines')
      .update({
        name, category, cpu, ram, ssd, gpu, os,
        price_per_hour: parseFloat(price_per_hour),
        price_per_day: parseFloat(price_per_day),
        price_per_week: parseFloat(price_per_week || 0),
        price_per_month: parseFloat(price_per_month || 0),
        rdp_ip: rdp_ip || null,
        rdp_username: rdp_username || null,
        rdp_password: rdp_password || null,
        anydesk_id, anydesk_password, tuya_device_id,
        image_url,
        allow_daily: allow_daily !== undefined ? (allow_daily === true || allow_daily === 'true') : true,
        allow_weekly: allow_weekly !== undefined ? (allow_weekly === true || allow_weekly === 'true') : true,
        allow_monthly: allow_monthly !== undefined ? (allow_monthly === true || allow_monthly === 'true') : true,
        test_result: test_result || null
      })
      .eq('id', parseInt(req.params.id))
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, machine: data });
  } catch (err) {
    console.error('Update machine error:', err);
    res.status(500).json({ error: 'ไม่สามารถแก้ไขเครื่องได้', details: err.message || err });
  }
});

// PATCH /api/admin/machines/:id/status — เปลี่ยนสถานะเครื่อง
app.patch('/api/admin/machines/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const updates = { status };

    // ดึงข้อมูลเดิมของเครื่อง
    const { data: machineBefore, error: getErr } = await supabase
      .from('machines')
      .select('*')
      .eq('id', parseInt(req.params.id))
      .single();

    if (getErr || !machineBefore) {
      return res.status(404).json({ error: 'ไม่พบเครื่อง' });
    }

    // ถ้าเปลี่ยนเป็น available หรือ maintenance ให้ลบข้อมูลผู้เช่า
    if (status === 'available' || status === 'maintenance') {
      updates.current_user_id = null;
      updates.session_end_time = null;

      // อัปเดต rental ที่ active ให้เป็น completed
      await supabase
        .from('rentals')
        .update({ status: 'completed' })
        .eq('machine_id', parseInt(req.params.id))
        .eq('status', 'active');
    }

    const { data, error } = await supabase
      .from('machines')
      .update(updates)
      .eq('id', parseInt(req.params.id))
      .select()
      .single();

    if (error) throw error;

    // หากสถานะเดิมคือ 'clearing' และสถานะใหม่ถูกเปลี่ยนเป็น 'available' (เคลียร์เสร็จสิ้น)
    if (machineBefore.status === 'clearing' && status === 'available') {
      sendDiscordAvailableNotification(data).catch(err => {
        console.error('Error sending available webhook:', err);
      });
    }

    res.json({ success: true, machine: data });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถเปลี่ยนสถานะได้' });
  }
});

// DELETE /api/admin/machines/:id — ลบเครื่อง
app.delete('/api/admin/machines/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { error } = await supabase
      .from('machines')
      .delete()
      .eq('id', parseInt(req.params.id));

    if (error) throw error;
    res.json({ success: true, message: 'ลบเครื่องสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถลบเครื่องได้' });
  }
});

// GET /api/admin/rentals — ประวัติเช่าทั้งหมด
app.get('/api/admin/rentals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('rentals')
      .select('*, users!inner(username)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json({ rentals: data });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/admin/topups — ประวัติเติมเงินทั้งหมด
app.get('/api/admin/topups', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('topups')
      .select('*, users!inner(username)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json({ topups: data });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/admin/topups/check-pending — ตรวจสอบและอัปเดตรายการ pending ทั้งหมดกับ inwcloud
app.get('/api/admin/topups/check-pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const apiKey = process.env.INWCLOUD_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'INWCLOUD_API_KEY not configured' });
    }

    const { data: topups, error } = await supabase
      .from('topups')
      .select('*')
      .eq('status', 'pending')
      .like('transaction_ref', 'PP-%');

    if (error) throw error;

    let updatedCount = 0;
    const results = [];

    for (const topup of topups) {
      const transactionId = topup.slip_data?.transactionId;
      if (!transactionId) continue;

      try {
        const checkRes = await fetch('https://api.inwcloud.shop/v1/promptpay/check', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ transactionId })
        });

        const checkData = await checkRes.json();
        if (checkData.status === 'success' && checkData.message?.includes('สำเร็จ')) {
          const paidAmount = parseFloat(checkData.amount) || topup.amount;

          // ดึงเครดิตผู้ใช้
          const { data: user } = await supabase
            .from('users')
            .select('credit')
            .eq('id', topup.user_id)
            .single();

          if (user) {
            const newCredit = parseFloat(user.credit) + paidAmount;
            await supabase.from('users').update({ credit: newCredit }).eq('id', topup.user_id);
            await supabase.from('topups').update({
              status: 'approved',
              note: 'ชำระเงินสำเร็จผ่าน PromptPay Auto (inwcloud - Check Pending Admin)',
              amount: paidAmount
            }).eq('id', topup.id);

            updatedCount++;
            results.push({ ref: topup.transaction_ref, amount: paidAmount, status: 'approved' });
          }
        }
      } catch (err) {
        console.error(`Error checking ${topup.transaction_ref}:`, err.message);
      }
    }

    res.json({ success: true, checked_count: topups.length, updated_count: updatedCount, details: results });
  } catch (err) {
    console.error('Check pending admin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users — ดึงรายชื่อผู้ใช้ทั้งหมด
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await autoReleaseExpiredMachines();
    const [usersRes, machinesRes, settings] = await Promise.all([
      supabase
        .from('users')
        .select('id, username, credit, role, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('machines')
        .select('id, name, current_user_id, session_end_time')
        .eq('status', 'in_use'),
      getSettings()
    ]);

    if (usersRes.error) throw usersRes.error;

    const users = usersRes.data.map(u => {
      const activeMachine = machinesRes.data?.find(m => m.current_user_id === u.id);
      return {
        ...u,
        active_machine: activeMachine ? {
          id: activeMachine.id,
          name: activeMachine.name,
          session_end_time: activeMachine.session_end_time,
          is_power_out: settings[`outage_machine_${activeMachine.id}`] === 'true'
        } : null
      };
    });

    res.json({ users });
  } catch (err) {
    console.error('Get admin users error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้' });
  }
});

// POST /api/admin/users/:id/extend-session — เพิ่มเวลาเช่าเครื่องให้ผู้ใช้งานแบบแมนนวล (ชั่วโมง/นาที)
app.post('/api/admin/users/:id/extend-session', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { duration, unit } = req.body; // duration: number, unit: 'minutes' | 'hours'

    const numericDuration = parseFloat(duration);
    if (isNaN(numericDuration) || numericDuration <= 0) {
      return res.status(400).json({ error: 'จำนวนเวลาต้องเป็นตัวเลขที่มากกว่า 0' });
    }

    if (!['minutes', 'hours'].includes(unit)) {
      return res.status(400).json({ error: 'หน่วยเวลาไม่ถูกต้อง (minutes หรือ hours)' });
    }

    const durationMs = unit === 'hours' 
      ? numericDuration * 60 * 60 * 1000 
      : numericDuration * 60 * 1000;

    const durationHours = unit === 'hours' 
      ? numericDuration 
      : numericDuration / 60;

    // ดึงเครื่องที่ผู้ใช้กำลังใช้งานอยู่
    const { data: machine, error: machErr } = await supabase
      .from('machines')
      .select('*')
      .eq('current_user_id', id)
      .eq('status', 'in_use')
      .single();

    if (machErr || !machine) {
      return res.status(404).json({ error: 'ผู้ใช้งานนี้ไม่มีเซสชันเช่าเครื่องที่กำลังใช้งานอยู่' });
    }

    const baseTime = machine.session_end_time ? new Date(machine.session_end_time) : new Date();
    const newSessionEnd = new Date(baseTime.getTime() + durationMs);

    // อัปเดตเวลาเครื่อง
    const { error: machUpdate } = await supabase
      .from('machines')
      .update({ session_end_time: newSessionEnd.toISOString() })
      .eq('id', machine.id);

    if (machUpdate) throw machUpdate;

    // อัปเดต rentals record
    const { data: activeRental } = await supabase
      .from('rentals')
      .select('*')
      .eq('user_id', id)
      .eq('machine_id', machine.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (activeRental) {
      const { error: rentalErr } = await supabase
        .from('rentals')
        .update({
          duration_hours: Math.round(parseFloat(activeRental.duration_hours) + durationHours),
          ended_at: newSessionEnd.toISOString()
        })
        .eq('id', activeRental.id);
      if (rentalErr) throw rentalErr;
    }

    const unitLabel = unit === 'hours' ? 'ชั่วโมง' : 'นาที';
    res.json({
      success: true,
      message: `เพิ่มเวลาเช่าเครื่อง ${machine.name} ให้ผู้ใช้สำเร็จ ${numericDuration} ${unitLabel}`,
      new_session_end: newSessionEnd.toISOString()
    });
  } catch (err) {
    console.error('Admin extend session error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มเวลาเช่าเครื่อง' });
  }
});

// POST /api/admin/users/:id/reduce-session — ลดเวลาเช่าเครื่องให้ผู้ใช้งานแบบแมนนวล (ชั่วโมง/นาที)
app.post('/api/admin/users/:id/reduce-session', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { duration, unit } = req.body; // duration: number, unit: 'minutes' | 'hours'

    const numericDuration = parseFloat(duration);
    if (isNaN(numericDuration) || numericDuration <= 0) {
      return res.status(400).json({ error: 'จำนวนเวลาต้องเป็นตัวเลขที่มากกว่า 0' });
    }

    if (!['minutes', 'hours'].includes(unit)) {
      return res.status(400).json({ error: 'หน่วยเวลาไม่ถูกต้อง (minutes หรือ hours)' });
    }

    const durationMs = unit === 'hours' 
      ? numericDuration * 60 * 60 * 1000 
      : numericDuration * 60 * 1000;

    const durationHours = unit === 'hours' 
      ? numericDuration 
      : numericDuration / 60;

    // ดึงเครื่องที่ผู้ใช้กำลังใช้งานอยู่
    const { data: machine, error: machErr } = await supabase
      .from('machines')
      .select('*')
      .eq('current_user_id', id)
      .eq('status', 'in_use')
      .single();

    if (machErr || !machine) {
      return res.status(404).json({ error: 'ผู้ใช้งานนี้ไม่มีเซสชันเช่าเครื่องที่กำลังใช้งานอยู่' });
    }

    const baseTime = machine.session_end_time ? new Date(machine.session_end_time) : new Date();
    let newSessionEnd = new Date(baseTime.getTime() - durationMs);
    
    // หากเวลาสิ้นสุดใหม่น้อยกว่าเวลาปัจจุบัน ให้ถือว่าหมดเวลาทันที
    const now = new Date();
    if (newSessionEnd < now) {
      newSessionEnd = new Date(now.getTime() - 1000); // 1 วินาทีย้อนหลังเพื่อให้ cron ตรวจพบว่าหมดเวลาแน่นอน
    }

    // อัปเดตเวลาเครื่อง
    const { error: machUpdate } = await supabase
      .from('machines')
      .update({ session_end_time: newSessionEnd.toISOString() })
      .eq('id', machine.id);

    if (machUpdate) throw machUpdate;

    // อัปเดต rentals record
    const { data: activeRental } = await supabase
      .from('rentals')
      .select('*')
      .eq('user_id', id)
      .eq('machine_id', machine.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (activeRental) {
      const currentDuration = parseFloat(activeRental.duration_hours) || 0;
      const { error: rentalErr } = await supabase
        .from('rentals')
        .update({
          duration_hours: Math.max(0, Math.round(currentDuration - durationHours)),
          ended_at: newSessionEnd.toISOString()
        })
        .eq('id', activeRental.id);
      if (rentalErr) throw rentalErr;
    }

    const unitLabel = unit === 'hours' ? 'ชั่วโมง' : 'นาที';
    res.json({
      success: true,
      message: `ลดเวลาเช่าเครื่อง ${machine.name} ให้ผู้ใช้สำเร็จ ${numericDuration} ${unitLabel}`,
      new_session_end: newSessionEnd.toISOString()
    });
  } catch (err) {
    console.error('Admin reduce session error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลดเวลาเช่าเครื่อง' });
  }
});

// POST /api/admin/machines/:id/power-outage — จัดการสถานะไฟดับของเครื่อง (Activate/Deactivate)
app.post('/api/admin/machines/:id/power-outage', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const machineId = parseInt(req.params.id);
    const { action } = req.body; // 'activate' | 'deactivate'

    if (!['activate', 'deactivate'].includes(action)) {
      return res.status(400).json({ error: 'action ต้องเป็น activate หรือ deactivate' });
    }

    const { data: machine, error: machErr } = await supabase
      .from('machines')
      .select('*')
      .eq('id', machineId)
      .single();

    if (machErr || !machine) {
      return res.status(404).json({ error: 'ไม่พบเครื่องคอมพิวเตอร์นี้ในระบบ' });
    }

    const settings = await getSettings();
    const keyOutage = `outage_machine_${machineId}`;
    const keyStart = `outage_start_machine_${machineId}`;
    const isCurrentlyOut = settings[keyOutage] === 'true';

    if (action === 'activate') {
      if (isCurrentlyOut) {
        return res.status(400).json({ error: 'เครื่องนี้อยู่ในสถานะไฟดับอยู่แล้ว' });
      }

      settings[keyOutage] = 'true';
      settings[keyStart] = new Date().toISOString();
      await updateSettings(settings);

      return res.json({ success: true, message: `เปิดใช้งานสถานะไฟดับสำหรับเครื่อง ${machine.name} สำเร็จ` });
    } else {
      if (!isCurrentlyOut) {
        return res.status(400).json({ error: 'เครื่องนี้ไม่ได้อยู่ในสถานะไฟดับ' });
      }

      const startTimeStr = settings[keyStart];
      const now = new Date();
      const outageDurationMs = startTimeStr ? (now.getTime() - new Date(startTimeStr).getTime()) : 0;

      if (machine.status === 'in_use' && outageDurationMs > 0) {
        const baseTime = machine.session_end_time ? new Date(machine.session_end_time) : new Date();
        const newSessionEnd = new Date(baseTime.getTime() + outageDurationMs);

        // อัปเดตเวลาเครื่อง
        await supabase
          .from('machines')
          .update({ session_end_time: newSessionEnd.toISOString() })
          .eq('id', machineId);

        // อัปเดต rentals record
        const { data: activeRental } = await supabase
          .from('rentals')
          .select('*')
          .eq('machine_id', machineId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (activeRental) {
          await supabase
            .from('rentals')
            .update({ ended_at: newSessionEnd.toISOString() })
            .eq('id', activeRental.id);
        }
      }

      settings[keyOutage] = 'false';
      delete settings[keyStart];
      await updateSettings(settings);

      return res.json({ success: true, message: `ยกเลิกสถานะไฟดับสำหรับเครื่อง ${machine.name} สำเร็จ` });
    }
  } catch (err) {
    console.error('Machine power outage toggle error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการจัดการสถานะไฟดับ' });
  }
});

// PUT /api/admin/users/:id/credit — ปรับปรุงยอดเงินของผู้ใช้
app.put('/api/admin/users/:id/credit', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, action, note } = req.body;

    if (amount === undefined || !action || !note) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน (amount, action, note)' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ error: 'จำนวนเงินต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0' });
    }

    // ดึงข้อมูลผู้ใช้ปัจจุบัน
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('username, credit')
      .eq('id', id)
      .single();

    if (userErr || !user) {
      return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้ในระบบ' });
    }

    const currentCredit = parseFloat(user.credit);
    let newCredit = currentCredit;

    if (action === 'add') {
      newCredit = currentCredit + numericAmount;
    } else if (action === 'deduct') {
      newCredit = currentCredit - numericAmount;
    } else if (action === 'set') {
      newCredit = numericAmount;
    } else {
      return res.status(400).json({ error: 'รูปแบบการปรับปรุงไม่ถูกต้อง (add, deduct, set)' });
    }

    if (newCredit < 0) {
      return res.status(400).json({ error: 'ยอดเงินคงเหลือไม่สามารถต่ำกว่า 0 บาทได้' });
    }

    // อัปเดตยอดเงินใน users
    const { error: updateErr } = await supabase
      .from('users')
      .update({ credit: newCredit })
      .eq('id', id);

    if (updateErr) throw updateErr;

    // คำนวณความต่างเพื่อบันทึกลงในตาราง topups
    const diff = newCredit - currentCredit;
    const actionLabel = action === 'add' ? 'เพิ่มเงิน' : action === 'deduct' ? 'ลดเงิน' : 'ปรับยอดเงิน';
    const finalNote = `[แอดมิน ${actionLabel}] (เก่า: ${currentCredit.toFixed(2)} -> ใหม่: ${newCredit.toFixed(2)}) — เหตุผล: ${note}`;
    const transactionRef = `MANUAL-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // บันทึก transaction log
    const { error: logErr } = await supabase
      .from('topups')
      .insert({
        user_id: id,
        amount: diff,
        transaction_ref: transactionRef,
        status: 'approved',
        note: finalNote
      });

    if (logErr) {
      console.error('Log topup transaction error:', logErr);
    }

    res.json({
      success: true,
      message: `ปรับปรุงเงินผู้ใช้ ${user.username} สำเร็จ`,
      new_credit: newCredit
    });
  } catch (err) {
    console.error('Update credit error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการปรับปรุงยอดเงิน' });
  }
});

// PUT /api/admin/settings — แก้ไขลิ้งก์ติดต่อ (Admin only)
app.put('/api/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { 
      facebook_url, 
      discord_url, 
      truemoney_phone, 
      topup_wallet_enabled, 
      topup_promptpay_enabled, 
      topup_slip_enabled,
      topup_time_restriction_enabled,
      topup_restricted_start,
      topup_restricted_end,
      popup_enabled,
      popup_image_url
    } = req.body;

    if (!facebook_url || !discord_url) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    if (topup_time_restriction_enabled === 'true') {
      const timeRegex = /^\d{2}:\d{2}$/;
      if (!timeRegex.test(topup_restricted_start) || !timeRegex.test(topup_restricted_end)) {
        return res.status(400).json({ error: 'รูปแบบเวลาเริ่มต้นหรือสิ้นสุดไม่ถูกต้อง (ต้องเป็น HH:MM)' });
      }
    }

    // ดึง settings เดิมเพื่อรักษาค่าที่ไม่ได้ส่งมา (เช่น shop_accounts, slip_max_age_minutes)
    const currentSettings = await getSettings();
    await updateSettings({
      ...currentSettings,
      facebook_url,
      discord_url,
      truemoney_phone: truemoney_phone || '',
      topup_wallet_enabled: topup_wallet_enabled || 'true',
      topup_promptpay_enabled: topup_promptpay_enabled || 'true',
      topup_slip_enabled: topup_slip_enabled || 'true',
      topup_time_restriction_enabled: topup_time_restriction_enabled || 'false',
      topup_restricted_start: topup_restricted_start || '01:00',
      topup_restricted_end: topup_restricted_end || '03:00',
      popup_enabled: popup_enabled || 'false',
      popup_image_url: popup_image_url || ''
    });
    res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: err.message || 'ไม่สามารถบันทึกการตั้งค่าได้' });
  }
});

// =============================================
// SHOP ACCOUNTS MANAGEMENT (บัญชีรับโอนเงินของร้าน)
// =============================================

// GET /api/admin/shop-accounts — ดึงรายการบัญชีร้าน
app.get('/api/admin/shop-accounts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await getSettings();
    let accounts = [];
    try {
      const raw = settings.shop_accounts || '[]';
      accounts = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) { accounts = []; }
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลบัญชีร้านได้' });
  }
});

// POST /api/admin/shop-accounts — เพิ่มบัญชีร้านใหม่
app.post('/api/admin/shop-accounts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { bank, accountName, label } = req.body;
    if (!bank || !accountName) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อธนาคาร (รหัสย่อ) และชื่อบัญชี' });
    }

    const settings = await getSettings();
    let accounts = [];
    try {
      const raw = settings.shop_accounts || '[]';
      accounts = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) { accounts = []; }

    accounts.push({ bank: bank.trim(), accountName: accountName.trim(), label: (label || '').trim() });
    settings.shop_accounts = JSON.stringify(accounts);
    await updateSettings(settings);

    console.log(`🏦 Shop account added: ${bank} / ${accountName}`);
    res.json({ success: true, message: 'เพิ่มบัญชีร้านสำเร็จ', accounts });
  } catch (err) {
    console.error('Add shop account error:', err);
    res.status(500).json({ error: 'ไม่สามารถเพิ่มบัญชีร้านได้' });
  }
});

// DELETE /api/admin/shop-accounts/:index — ลบบัญชีร้าน
app.delete('/api/admin/shop-accounts/:index', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const settings = await getSettings();
    let accounts = [];
    try {
      const raw = settings.shop_accounts || '[]';
      accounts = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) { accounts = []; }

    if (index < 0 || index >= accounts.length) {
      return res.status(404).json({ error: 'ไม่พบบัญชีร้านที่ต้องการลบ' });
    }

    const removed = accounts.splice(index, 1);
    settings.shop_accounts = JSON.stringify(accounts);
    await updateSettings(settings);

    console.log(`🏦 Shop account removed: ${JSON.stringify(removed[0])}`);
    res.json({ success: true, message: 'ลบบัญชีร้านสำเร็จ', accounts });
  } catch (err) {
    console.error('Delete shop account error:', err);
    res.status(500).json({ error: 'ไม่สามารถลบบัญชีร้านได้' });
  }
});

// PUT /api/admin/slip-settings — ตั้งค่าอายุสลิปสูงสุด
app.put('/api/admin/slip-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { slip_max_age_minutes } = req.body;
    const maxAge = parseInt(slip_max_age_minutes);
    if (isNaN(maxAge) || maxAge < 1 || maxAge > 60) {
      return res.status(400).json({ error: 'อายุสลิปสูงสุดต้องเป็นตัวเลข 1-60 นาที' });
    }

    const settings = await getSettings();
    settings.slip_max_age_minutes = String(maxAge);
    await updateSettings(settings);

    res.json({ success: true, message: `ตั้งค่าอายุสลิปสูงสุดเป็น ${maxAge} นาที สำเร็จ` });
  } catch (err) {
    console.error('Update slip settings error:', err);
    res.status(500).json({ error: 'ไม่สามารถบันทึกการตั้งค่าได้' });
  }
});

// =============================================
// ELECTRICITY COSTS & FINANCIAL SUMMARY (Admin only)
// =============================================
const ELECTRICITY_COSTS_FILE = path.join(__dirname, 'electricity_costs.json');

async function getElectricityCosts() {
  // 1. ลองดึงจาก Supabase
  try {
    const { data, error } = await supabase
      .from('electricity_costs')
      .select('*')
      .order('period_key', { ascending: false });
    if (!error && data) {
      return data.map(item => ({
        ...item,
        amount: parseFloat(item.amount || 0)
      }));
    }
  } catch (err) {
    console.log('Database electricity_costs table not ready, using fallback.');
  }

  // 2. ดึงจากไฟล์โลคัล
  try {
    if (fs.existsSync(ELECTRICITY_COSTS_FILE)) {
      const content = fs.readFileSync(ELECTRICITY_COSTS_FILE, 'utf8');
      return JSON.parse(content).map(item => ({
        ...item,
        amount: parseFloat(item.amount || 0)
      }));
    }
  } catch (err) {
    console.error('Error reading electricity_costs.json:', err);
  }
  return [];
}

async function saveElectricityCost({ period_type, period_key, amount, note }) {
  const numAmount = parseFloat(amount || 0);

  // 1. ลองบันทึกลง Supabase (Upsert)
  try {
    const { data, error } = await supabase
      .from('electricity_costs')
      .upsert(
        { period_type, period_key, amount: numAmount, note },
        { onConflict: 'period_type,period_key' }
      )
      .select();
    if (!error && data && data.length > 0) {
      return data[0];
    }
  } catch (err) {
    console.log('Database electricity_costs table upsert failed, using local fallback.');
  }

  // 2. บันทึกลงไฟล์โลคัล
  try {
    let list = [];
    if (fs.existsSync(ELECTRICITY_COSTS_FILE)) {
      list = JSON.parse(fs.readFileSync(ELECTRICITY_COSTS_FILE, 'utf8'));
    }
    // ค้นหาว่ามีรายการเก่าของคาบนี้อยู่แล้วหรือไม่
    const existingIndex = list.findIndex(x => x.period_type === period_type && x.period_key === period_key);
    const newRecord = {
      period_type,
      period_key,
      amount: numAmount,
      note,
      created_at: new Date().toISOString()
    };

    if (existingIndex !== -1) {
      // อัปเดตรายการเดิม
      newRecord.id = list[existingIndex].id;
      list[existingIndex] = newRecord;
    } else {
      // สร้างรายการใหม่
      const maxId = list.reduce((max, x) => (x.id > max ? x.id : max), 0);
      newRecord.id = maxId + 1;
      list.push(newRecord);
    }

    fs.writeFileSync(ELECTRICITY_COSTS_FILE, JSON.stringify(list, null, 2), 'utf8');
    return newRecord;
  } catch (err) {
    console.error('Error writing electricity_costs.json:', err);
    throw new Error('ไม่สามารถบันทึกข้อมูลค่าไฟฟ้าได้');
  }
}

async function deleteElectricityCost(id) {
  const numericId = parseInt(id);

  // 1. ลองลบใน Supabase
  try {
    const { error } = await supabase
      .from('electricity_costs')
      .delete()
      .eq('id', id);
    if (!error) return true;
  } catch (err) {
    console.log('Database electricity_costs delete failed, using local fallback.');
  }

  // 2. ลบในไฟล์โลคัล
  try {
    if (fs.existsSync(ELECTRICITY_COSTS_FILE)) {
      let list = JSON.parse(fs.readFileSync(ELECTRICITY_COSTS_FILE, 'utf8'));
      const initialLength = list.length;
      list = list.filter(x => x.id !== numericId);
      if (list.length !== initialLength) {
        fs.writeFileSync(ELECTRICITY_COSTS_FILE, JSON.stringify(list, null, 2), 'utf8');
        return true;
      }
    }
  } catch (err) {
    console.error('Error deleting from electricity_costs.json:', err);
  }
  return false;
}

// แปรงวันในเวลาของประเทศไทย (UTC+7)
function getBangkokDateInfo(dateStrOrObj) {
  const d = new Date(dateStrOrObj);
  const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // 'YYYY-MM-DD'
  const [year, month, day] = dateStr.split('-').map(Number);
  
  const localD = new Date(Date.UTC(year, month - 1, day));
  const dayNum = localD.getUTCDay() || 7;
  localD.setUTCDate(localD.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(localD.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((localD - yearStart) / 86400000) + 1) / 7);
  const weekStr = `${localD.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;

  return {
    day: dateStr,
    week: weekStr,
    month: `${year}-${String(month).padStart(2, '0')}`,
    year: String(year)
  };
}

// ดึงฉลากแสดงผลของสัปดาห์ เช่น "สัปดาห์ที่ 29/06/2026 - 05/07/2026"
function getWeekRangeLabel(weekStr) {
  const parts = weekStr.match(/^(\d{4})-W(\d{2})$/);
  if (!parts) return weekStr;
  const year = parseInt(parts[1]);
  const week = parseInt(parts[2]);
  
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const ISOweekStart = simple;
  if (dow <= 4) {
    ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  } else {
    ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  }
  
  const monday = new Date(ISOweekStart);
  const sunday = new Date(ISOweekStart);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  
  const format = (d) => {
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yy = d.getUTCFullYear();
    return `${dd}/${mm}/${yy}`;
  };
  return `สัปดาห์ที่ ${format(monday)} - ${format(sunday)}`;
}

// แปลงรูปแบบช่วงเวลาเป็นภาษาไทย
function formatPeriodLabel(type, key) {
  if (type === 'day') {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  if (type === 'week') {
    return getWeekRangeLabel(key);
  }
  if (type === 'month') {
    const [y, m] = key.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
  }
  if (type === 'year') {
    return `ปี พ.ศ. ${parseInt(key) + 543}`;
  }
  return key;
}

// GET /api/admin/electricity-costs — ดึงข้อมูลค่าไฟทั้งหมด
app.get('/api/admin/electricity-costs', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const list = await getElectricityCosts();
    res.json({ success: true, electricity_costs: list });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลค่าไฟได้' });
  }
});

// POST /api/admin/electricity-costs — บันทึก/อัปเดตค่าไฟ
app.post('/api/admin/electricity-costs', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { period_type, period_key, amount, note } = req.body;
    if (!period_type || !period_key || amount === undefined) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }
    if (!['day', 'week', 'month', 'year'].includes(period_type)) {
      return res.status(400).json({ error: 'ประเภทช่วงเวลาไม่ถูกต้อง' });
    }
    const record = await saveElectricityCost({ period_type, period_key, amount, note });
    res.json({ success: true, message: 'บันทึกข้อมูลค่าไฟฟ้าสำเร็จ', record });
  } catch (err) {
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในการบันทึกค่าไฟ' });
  }
});

// DELETE /api/admin/electricity-costs/:id — ลบข้อมูลค่าไฟ
app.delete('/api/admin/electricity-costs/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const success = await deleteElectricityCost(req.params.id);
    if (success) {
      res.json({ success: true, message: 'ลบข้อมูลค่าไฟฟ้าสำเร็จ' });
    } else {
      res.status(404).json({ error: 'ไม่พบข้อมูลค่าไฟฟ้าที่ต้องการลบ' });
    }
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบข้อมูลค่าไฟฟ้า' });
  }
});

// GET /api/admin/financial-summary — สรุปรายงานการเงินแยกตามรอบเวลา
app.get('/api/admin/financial-summary', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rentalsRes, topupsRes, electricityCosts] = await Promise.all([
      supabase.from('rentals').select('started_at, total_price, status'),
      supabase.from('topups').select('created_at, amount, status').eq('status', 'approved'),
      getElectricityCosts()
    ]);

    const rentals = rentalsRes.data || [];
    const topups = topupsRes.data || [];

    const dailyMap = {};
    const weeklyMap = {};
    const monthlyMap = {};
    const yearlyMap = {};

    const initPeriod = (map, key) => {
      if (!map[key]) {
        map[key] = { revenue: 0, topups: 0, electricity: 0 };
      }
    };

    // 1. จัดกลุ่มยอดรายได้เช่าคอม
    rentals.forEach(r => {
      if (!r.started_at) return;
      const amt = parseFloat(r.total_price || 0);
      const info = getBangkokDateInfo(r.started_at);

      initPeriod(dailyMap, info.day);
      dailyMap[info.day].revenue += amt;

      initPeriod(weeklyMap, info.week);
      weeklyMap[info.week].revenue += amt;

      initPeriod(monthlyMap, info.month);
      monthlyMap[info.month].revenue += amt;

      initPeriod(yearlyMap, info.year);
      yearlyMap[info.year].revenue += amt;
    });

    // 2. จัดกลุ่มยอดเติมเงินที่อนุมัติ
    topups.forEach(t => {
      if (!t.created_at) return;
      const amt = parseFloat(t.amount || 0);
      const info = getBangkokDateInfo(t.created_at);

      initPeriod(dailyMap, info.day);
      dailyMap[info.day].topups += amt;

      initPeriod(weeklyMap, info.week);
      weeklyMap[info.week].topups += amt;

      initPeriod(monthlyMap, info.month);
      monthlyMap[info.month].topups += amt;

      initPeriod(yearlyMap, info.year);
      yearlyMap[info.year].topups += amt;
    });

    // 3. จัดกลุ่มค่าไฟ
    electricityCosts.forEach(cost => {
      const type = cost.period_type;
      const key = cost.period_key;
      const amt = parseFloat(cost.amount || 0);

      if (type === 'day') {
        initPeriod(dailyMap, key);
        dailyMap[key].electricity += amt;
      } else if (type === 'week') {
        initPeriod(weeklyMap, key);
        weeklyMap[key].electricity += amt;
      } else if (type === 'month') {
        initPeriod(monthlyMap, key);
        monthlyMap[key].electricity += amt;
      } else if (type === 'year') {
        initPeriod(yearlyMap, key);
        yearlyMap[key].electricity += amt;
      }
    });

    // 4. สรุปคำนวณและเรียงลำดับ
    const toSortedArray = (map, type) => {
      return Object.keys(map)
        .map(key => {
          const item = map[key];
          const profit = item.revenue - item.electricity;
          return {
            period: key,
            label: formatPeriodLabel(type, key),
            revenue: item.revenue,
            topups: item.topups,
            electricity: item.electricity,
            profit: profit
          };
        })
        .sort((a, b) => b.period.localeCompare(a.period));
    };

    res.json({
      success: true,
      daily: toSortedArray(dailyMap, 'day'),
      weekly: toSortedArray(weeklyMap, 'week'),
      monthly: toSortedArray(monthlyMap, 'month'),
      yearly: toSortedArray(yearlyMap, 'year')
    });
  } catch (err) {
    console.error('Financial summary error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรายงานสรุปการเงิน' });
  }
});

// =============================================
// DISCORD WEBHOOK NOTIFICATIONS
// =============================================
async function sendDiscordExpiryNotification(machine, customTitle, customDescription) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    let expiryStr = 'N/A';
    if (machine.session_end_time) {
      const date = new Date(machine.session_end_time);
      expiryStr = date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    } else {
      expiryStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    }

    const specs = [];
    if (machine.cpu) specs.push(`• **CPU:** ${machine.cpu}`);
    if (machine.ram) specs.push(`• **RAM:** ${machine.ram}`);
    if (machine.ssd) specs.push(`• **SSD:** ${machine.ssd}`);
    if (machine.gpu) specs.push(`• **GPU:** ${machine.gpu}`);
    if (machine.os) specs.push(`• **OS:** ${machine.os}`);
    const specsText = specs.length > 0 ? specs.join('\n') : 'ไม่ระบุ';

    const prices = [];
    if (machine.price_per_hour !== undefined && machine.price_per_hour !== null && parseFloat(machine.price_per_hour) > 0) {
      prices.push(`• **รายชั่วโมง:** ${parseFloat(machine.price_per_hour).toLocaleString()} บาท`);
    }
    if (machine.allow_daily && machine.price_per_day && parseFloat(machine.price_per_day) > 0) {
      prices.push(`• **รายวัน:** ${parseFloat(machine.price_per_day).toLocaleString()} บาท`);
    }
    if (machine.allow_weekly) {
      const weeklyPrice = parseFloat(machine.price_per_week) > 0 ? parseFloat(machine.price_per_week) : parseFloat(machine.price_per_day || 0) * 7;
      if (weeklyPrice > 0) {
        prices.push(`• **รายสัปดาห์:** ${weeklyPrice.toLocaleString()} บาท`);
      }
    }
    if (machine.allow_monthly) {
      const monthlyPrice = parseFloat(machine.price_per_month) > 0 ? parseFloat(machine.price_per_month) : parseFloat(machine.price_per_day || 0) * 30;
      if (monthlyPrice > 0) {
        prices.push(`• **รายเดือน:** ${monthlyPrice.toLocaleString()} บาท`);
      }
    }
    const priceText = prices.length > 0 ? prices.join('\n') : 'ไม่ระบุ';

    const embed = {
      title: customTitle || '🔌 แจ้งเตือน: เครื่องหมดเวลาเช่า',
      description: customDescription || 'คอมเครื่องนี้หมดเวลาเช่าแล้ว และกำลังเคลียข้อมูล',
      color: 16737894, // Crimson Red / Orange (#FF4757)
      fields: [
        {
          name: '🖥️ ชื่อเครื่อง',
          value: `**${machine.name || 'ไม่ทราบชื่อ'}**`,
          inline: true
        },
        {
          name: '⏰ เวลาที่หมดอายุ',
          value: `\`${expiryStr}\``,
          inline: true
        },
        {
          name: '⚙️ สเปกเครื่อง',
          value: specsText,
          inline: false
        },
        {
          name: '💰 อัตราค่าบริการ',
          value: priceText,
          inline: false
        },
        {
          name: '🔗 เช่าเครื่องต่อได้ที่นี่',
          value: '[คลิกเพื่อเปิดเว็บไซต์ chickDDC.xyz](https://chickDDC.xyz)',
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'ChickDDC System Notification'
      }
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ChickDDC Bot', embeds: [embed] })
    });
  } catch (err) {
    console.error('Error sending Discord expiry notification:', err);
  }
}

async function sendDiscordAvailableNotification(machine) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const specs = [];
    if (machine.cpu) specs.push(`• **CPU:** ${machine.cpu}`);
    if (machine.ram) specs.push(`• **RAM:** ${machine.ram}`);
    if (machine.ssd) specs.push(`• **SSD:** ${machine.ssd}`);
    if (machine.gpu) specs.push(`• **GPU:** ${machine.gpu}`);
    if (machine.os) specs.push(`• **OS:** ${machine.os}`);
    const specsText = specs.length > 0 ? specs.join('\n') : 'ไม่ระบุ';

    const prices = [];
    if (machine.price_per_hour !== undefined && machine.price_per_hour !== null && parseFloat(machine.price_per_hour) > 0) {
      prices.push(`• **รายชั่วโมง:** ${parseFloat(machine.price_per_hour).toLocaleString()} บาท`);
    }
    if (machine.allow_daily && machine.price_per_day && parseFloat(machine.price_per_day) > 0) {
      prices.push(`• **รายวัน:** ${parseFloat(machine.price_per_day).toLocaleString()} บาท`);
    }
    if (machine.allow_weekly) {
      const weeklyPrice = parseFloat(machine.price_per_week) > 0 ? parseFloat(machine.price_per_week) : parseFloat(machine.price_per_day || 0) * 7;
      if (weeklyPrice > 0) {
        prices.push(`• **รายสัปดาห์:** ${weeklyPrice.toLocaleString()} บาท`);
      }
    }
    if (machine.allow_monthly) {
      const monthlyPrice = parseFloat(machine.price_per_month) > 0 ? parseFloat(machine.price_per_month) : parseFloat(machine.price_per_day || 0) * 30;
      if (monthlyPrice > 0) {
        prices.push(`• **รายเดือน:** ${monthlyPrice.toLocaleString()} บาท`);
      }
    }
    const priceText = prices.length > 0 ? prices.join('\n') : 'ไม่ระบุ';

    const embed = {
      title: '✅ แจ้งเตือน: เคลียร์ข้อมูลเสร็จสิ้น',
      description: 'คอมเครื่องนี้แอดมินเคลียข้อมูลเสร็จแล้ว พร้อมให้บริการเช่า',
      color: 3066993, // Green (#2ECC71)
      fields: [
        {
          name: '🖥️ ชื่อเครื่อง',
          value: `**${machine.name || 'ไม่ทราบชื่อ'}**`,
          inline: true
        },
        {
          name: '⚙️ สเปกเครื่อง',
          value: specsText,
          inline: false
        },
        {
          name: '💰 อัตราค่าบริการ',
          value: priceText,
          inline: false
        },
        {
          name: '🔗 เช่าเครื่องต่อได้ที่นี่',
          value: '[คลิกเพื่อเปิดเว็บไซต์ chickDDC.xyz](https://chickDDC.xyz)',
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'ChickDDC System Notification'
      }
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ChickDDC Bot', embeds: [embed] })
    });
  } catch (err) {
    console.error('Error sending Discord available notification:', err);
  }
}

// =============================================
// LIVE CHAT & AUTO-CLEANUP SYSTEM
// =============================================

// ฟังก์ชันลบไฟล์รูปภาพในห้องแชทออกจาก Supabase Storage
async function deleteChatRoomFiles(roomIds) {
  if (!roomIds || roomIds.length === 0) return;
  try {
    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('image_url')
      .in('room_id', roomIds)
      .not('image_url', 'is', null);

    if (error) throw error;
    if (!messages || messages.length === 0) return;

    const filePaths = messages
      .map(msg => {
        const url = msg.image_url;
        const marker = '/storage/v1/object/public/chat-attachments/';
        const index = url.indexOf(marker);
        if (index !== -1) {
          return decodeURIComponent(url.substring(index + marker.length));
        }
        return null;
      })
      .filter(path => path !== null);

    if (filePaths.length > 0) {
      console.log(`🧹 Storage Cleanup: Deleting files:`, filePaths);
      const { error: deleteError } = await supabase.storage
        .from('chat-attachments')
        .remove(filePaths);
      if (deleteError) throw deleteError;
      console.log(`🧹 Storage Cleanup: Deleted ${filePaths.length} files from Supabase Storage.`);
    }
  } catch (err) {
    console.error('❌ Storage Cleanup Error:', err);
  }
}

// ฟังก์ชันล้างห้องแชทเก่าอัตโนมัติ
async function cleanupOldChats(customDays = null) {
  try {
    const settings = await getSettings();
    const isEnabled = settings.chat_auto_delete_enabled === 'true';
    const daysStr = customDays !== null ? String(customDays) : settings.chat_auto_delete_days;
    const days = parseInt(daysStr);

    if ((isEnabled || customDays !== null) && !isNaN(days) && days > 0) {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      console.log(`🧹 Chat Cleanup: Deleting chat rooms with no activity since ${cutoffDate} (${days} days)`);
      
      // ดึงห้องแชทที่จะลบ
      const { data: roomsToDelete, error: fetchErr } = await supabase
        .from('chat_rooms')
        .select('id')
        .lt('updated_at', cutoffDate);

      if (fetchErr) throw fetchErr;
      if (roomsToDelete && roomsToDelete.length > 0) {
        const ids = roomsToDelete.map(r => r.id);
        // ลบรูปภาพออกจาก Storage
        await deleteChatRoomFiles(ids);
        
        // ลบจาก Database
        const { error } = await supabase
          .from('chat_rooms')
          .delete()
          .in('id', ids);

        if (error) throw error;
        console.log(`🧹 Chat Cleanup: Removed ${ids.length} old chat rooms.`);
        return ids.length;
      }
    }
  } catch (err) {
    console.error('❌ Error during chat cleanup:', err);
  }
  return 0;
}

// รันตรวจแชทหมดอายุอัตโนมัติทุกๆ 24 ชั่วโมง
setInterval(() => {
  cleanupOldChats();
}, 24 * 60 * 60 * 1000);

// Middleware: ตรวจสอบ JWT แบบไม่บังคับ (Optional Auth)
function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, ACTUAL_JWT_SECRET);
      req.user = decoded; // { id, username, role }
    } catch (err) {
      // ดำเนินการต่อในฐานะผู้เยี่ยมชม (guest)
    }
  }
  next();
}

// 1. GET /api/chat/config — ดึงการตั้งค่า Supabase
app.get('/api/chat/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

// 2. POST /api/chat/room — สร้าง/ดึงห้องแชทของลูกค้า
app.post('/api/chat/room', authMiddleware, async (req, res) => {
  try {
    let userId = req.user.id;

    const { data: existingRooms, error: findErr } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('user_id', userId);
      
    if (findErr) throw findErr;

    if (existingRooms && existingRooms.length > 0) {
      return res.json({ room_id: existingRooms[0].id });
    }

    // สร้างห้องแชทใหม่
    const { data: newRoom, error: createErr } = await supabase
      .from('chat_rooms')
      .insert({
        user_id: userId
      })
      .select()
      .single();

    if (createErr) throw createErr;
    res.json({ room_id: newRoom.id });
  } catch (err) {
    console.error('Create/get chat room error:', err);
    res.status(500).json({ error: 'ไม่สามารถเปิดห้องแชทได้' });
  }
});

// 3. GET /api/chat/history — ดึงประวัติการแชท
app.get('/api/chat/history', authMiddleware, async (req, res) => {
  try {
    const { room_id } = req.query;
    if (!room_id) {
      return res.status(400).json({ error: 'กรุณาระบุ room_id' });
    }

    const { data: room, error: roomErr } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', room_id)
      .single();

    if (roomErr || !room) {
      return res.status(404).json({ error: 'ไม่พบห้องแชท' });
    }

    // ตรวจสอบสิทธิ์ (แอดมินดูได้หมด, เจ้าของห้องเท่านั้นที่จะดูได้)
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) {
      const isOwnerUser = room.user_id === req.user.id;
      if (!isOwnerUser) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงประวัติการคุยในห้องนี้' });
      }
    }

    const { data: messages, error: msgErr } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', room_id)
      .order('created_at', { ascending: true });

    if (msgErr) throw msgErr;
    res.json({ messages });
  } catch (err) {
    console.error('Get chat history error:', err);
    res.status(500).json({ error: 'ไม่สามารถดึงประวัติข้อความแชทได้' });
  }
});

// ตั้งค่า Multer Memory Storage สำหรับอัปเดตรูปแชท
const multerMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// 4. POST /api/chat/upload — อัปเดตรูปแชทไปที่ Supabase Storage
app.post('/api/chat/upload', authMiddleware, multerMemory.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์ภาพ' });
    }

    const file = req.file;
    const fileExt = path.extname(file.originalname) || '.jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${fileExt}`;
    const filePath = `${req.user.id}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('chat-attachments')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(filePath);

    const imageUrl = publicUrlData.publicUrl;
    res.json({ success: true, imageUrl });
  } catch (err) {
    console.error('Chat image upload error:', err);
    res.status(500).json({ error: 'ไม่สามารถอัปโหลดรูปภาพได้' });
  }
});

// 5. POST /api/chat/send — ส่งข้อความใหม่
app.post('/api/chat/send', authMiddleware, async (req, res) => {
  try {
    const { room_id, message, image_url } = req.body;
    if (!room_id || ((!message || message.trim() === '') && !image_url)) {
      return res.status(400).json({ error: 'กรุณาระบุรหัสห้องแชทและข้อความหรือรูปภาพ' });
    }

    const { data: room, error: roomErr } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', room_id)
      .single();

    if (roomErr || !room) {
      return res.status(404).json({ error: 'ไม่พบห้องแชท' });
    }

    const isAdmin = req.user.role === 'admin';
    let senderName = req.user.username;
    let senderRole = 'customer';
    let senderId = req.user.id;

    if (isAdmin) {
      senderRole = 'admin';
    } else {
      // ตรวจสอบสิทธิ์ส่งข้อความ
      const isOwnerUser = room.user_id === req.user.id;
      if (!isOwnerUser) {
        return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ส่งข้อความในห้องนี้' });
      }
    }

    const { data: msgData, error: sendErr } = await supabase
      .from('chat_messages')
      .insert({
        room_id,
        sender_id: senderId,
        sender_name: senderName,
        sender_role: senderRole,
        message: message ? message.trim() : null,
        image_url: image_url || null
      })
      .select()
      .single();

    if (sendErr) throw sendErr;

    // อัปเดตเวลาเคลื่อนไหวล่าสุดของห้องแชท
    await supabase
      .from('chat_rooms')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', room_id);

    res.json({ success: true, message: msgData });
  } catch (err) {
    console.error('Send chat message error:', err);
    res.status(500).json({ error: 'ไม่สามารถส่งข้อความได้' });
  }
});

// 6. GET /api/admin/chat/rooms — ดึงรายการห้องแชททั้งหมดสำหรับแอดมิน
app.get('/api/admin/chat/rooms', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data: rooms, error: roomErr } = await supabase
      .from('chat_rooms')
      .select(`
        *,
        users ( username )
      `)
      .order('updated_at', { ascending: false });

    if (roomErr) throw roomErr;

    const formattedRooms = await Promise.all(rooms.map(async (room) => {
      const { data: latestMsg } = await supabase
        .from('chat_messages')
        .select('message, image_url, created_at')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let lastMsgText = '(ไม่มีข้อความ)';
      if (latestMsg) {
        if (latestMsg.message) lastMsgText = latestMsg.message;
        else if (latestMsg.image_url) lastMsgText = '[ส่งรูปภาพ]';
      }

      return {
        id: room.id,
        username: room.users ? room.users.username : 'Unknown User',
        created_at: room.created_at,
        updated_at: room.updated_at,
        last_message: lastMsgText,
        last_message_time: latestMsg ? latestMsg.created_at : room.updated_at
      };
    }));

    res.json({ rooms: formattedRooms });
  } catch (err) {
    console.error('Get admin chat rooms error:', err);
    res.status(500).json({ error: 'ไม่สามารถดึงห้องแชทได้' });
  }
});

// 7. DELETE /api/admin/chat/rooms/:id — [แมนนวล] ลบห้องแชท
app.delete('/api/admin/chat/rooms/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // 1. ลบไฟล์รูปภาพออกจาก Storage ก่อน
    await deleteChatRoomFiles([id]);

    // 2. ลบจากฐานข้อมูล
    const { data, error } = await supabase
      .from('chat_rooms')
      .delete()
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'ไม่พบห้องแชทที่ต้องการลบ' });
    }

    res.json({ success: true, message: 'ลบห้องสนทนาเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Delete chat room error:', err);
    res.status(500).json({ error: 'ไม่สามารถลบห้องสนทนาได้' });
  }
});

// 7. POST /api/admin/chat/cleanup-now — [แมนนวล] สั่งล้างแชทเก่าทันที
app.post('/api/admin/chat/cleanup-now', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { days } = req.body;
    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum <= 0) {
      return res.status(400).json({ error: 'กรุณาระบุจำนวนวันให้ถูกต้อง (ต้องมากกว่า 0 วัน)' });
    }

    const removedCount = await cleanupOldChats(daysNum);
    res.json({ success: true, message: `ล้างประวัติแชทเก่าสำเร็จ ลบห้องแชททั้งหมด ${removedCount} ห้อง` });
  } catch (err) {
    console.error('Manual chat cleanup error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการล้างข้อมูลแชท' });
  }
});

// 8. PUT /api/admin/chat/settings — ตั้งค่าการลบแชทอัตโนมัติ
app.put('/api/admin/chat/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { chat_auto_delete_enabled, chat_auto_delete_days } = req.body;
    
    if (chat_auto_delete_days !== undefined) {
      const days = parseInt(chat_auto_delete_days);
      if (isNaN(days) || days <= 0) {
        return res.status(400).json({ error: 'จำนวนวันในการลบต้องเป็นตัวเลขที่มากกว่า 0' });
      }
    }

    const settings = await getSettings();
    if (chat_auto_delete_enabled !== undefined) {
      settings.chat_auto_delete_enabled = String(chat_auto_delete_enabled === true || chat_auto_delete_enabled === 'true');
    }
    if (chat_auto_delete_days !== undefined) {
      settings.chat_auto_delete_days = String(chat_auto_delete_days);
    }

    await updateSettings(settings);
    res.json({ success: true, message: 'บันทึกการตั้งค่าล้างแชทสำเร็จ', settings });
  } catch (err) {
    console.error('Update chat settings error:', err);
    res.status(500).json({ error: 'ไม่สามารถบันทึกการตั้งค่าได้' });
  }
});

// =============================================
// AUTO-RELEASE: ตรวจสอบเครื่องหมดเวลาอัตโนมัติ
// =============================================
async function autoReleaseExpiredMachines() {
  try {
    const now = new Date().toISOString();
    const { data: expired } = await supabase
      .from('machines')
      .select('*')
      .eq('status', 'in_use')
      .lt('session_end_time', now);

    if (expired && expired.length > 0) {
      const settings = await getSettings();
      for (const machine of expired) {
        if (settings[`outage_machine_${machine.id}`] === 'true') {
          // Skip releasing machines in outage mode
          continue;
        }

        // ปิดเครื่องคอมพิวเตอร์อัตโนมัติ (Tuya Smart Plug/Switch)
        if (machine.tuya_device_id && TUYA_CLIENT_ID && TUYA_CLIENT_SECRET) {
          try {
            await sendTuyaCommand(machine.tuya_device_id, false);
            console.log(`🔌 Auto-shutdown machine (Expired): ${machine.name} (${machine.tuya_device_id}) success.`);
          } catch (tuyaErr) {
            console.error(`⚠️ Auto-shutdown machine failed: ${machine.name}:`, tuyaErr);
          }
        }

        await supabase
          .from('machines')
          .update({ status: 'clearing', current_user_id: null, session_end_time: null })
          .eq('id', machine.id);

        await supabase
          .from('rentals')
          .update({ status: 'completed' })
          .eq('machine_id', machine.id)
          .eq('status', 'active');

        console.log(`🔄 Auto-released to clearing: ${machine.name} (ID: ${machine.id})`);
        
        // ส่งการแจ้งเตือน Discord (รอบที่ 1: หมดเวลาเช่า)
        await sendDiscordExpiryNotification(machine);
      }
    }
  } catch (err) {
    console.error('Auto-release error:', err);
  }
}

// รันทุก 30 วินาที
setInterval(autoReleaseExpiredMachines, 30000);

// =============================================
// SPA FALLBACK — ส่ง HTML สำหรับ route ที่ไม่ใช่ API
// =============================================
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// =============================================
// START SERVER
// =============================================
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║  🖥️  ระบบเช่าคอมพิวเตอร์ออนไลน์              ║
  ║  🌐  http://localhost:${PORT}                    ║
  ║  🎮  Cyberpunk Rental System is ONLINE        ║
  ╚═══════════════════════════════════════════════╝
  `);
  // รัน auto-release ครั้งแรกเมื่อ server เริ่ม
  autoReleaseExpiredMachines();
  // รันระบบล้างห้องแชทครั้งแรกเมื่อ server เริ่ม
  cleanupOldChats();
});

