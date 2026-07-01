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
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
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

// POST /api/login — เข้าสู่ระบบ
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
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

    res.json({ success: true, message: 'คืนเครื่องสำเร็จ' });
  } catch (err) {
    console.error('Release error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการคืนเครื่อง' });
  }
});

// =============================================
// TOPUP ROUTES (ตรวจสลิปอัตโนมัติ)
// =============================================

// POST /api/verify-slip — ตรวจสอบสลิปและเติมเครดิต
app.post('/api/verify-slip', authMiddleware, upload.single('slip'), async (req, res) => {
  try {
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

    // แปลงรูปภาพใน Buffer เป็น Base64 String สำหรับ EasySlip
    const base64Image = req.file.buffer.toString('base64');

    const slipResponse = await fetch(slipApiUrl, {
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

    const slipResult = await slipResponse.json();

    // --- ตรวจสอบผลลัพธ์จาก EasySlip API ---
    // EasySlip v2 ใช้ success: true ส่วน EasySlip v1 (legacy) ใช้ status: 200
    const isSuccess = slipResult.success === true || slipResult.status === 200 || slipResult.status === '200';
    if (!isSuccess || !slipResult.data) {
      const errorMsg = (slipResult.error && slipResult.error.message) || slipResult.message || 'สลิปไม่ถูกต้องหรือไม่สามารถอ่าน QR Code ได้';
      await supabase.from('topups').insert({
        user_id: req.user.id,
        amount: 0,
        status: 'rejected',
        note: errorMsg,
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

    // เรียก API ทรูมันนี่ เพื่อแลกซองของขวัญ ผ่าน curl เพื่อเลี่ยงการตรวจจับ TLS Fingerprint ของ Cloudflare
    const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const { execFile } = require('child_process');
    
    const redeemUrl = `https://gift.truemoney.com/campaign/vouchers/${voucherHash}/redeem`;
    const requestBody = JSON.stringify({
      mobile: adminPhone,
      voucher_hash: voucherHash
    });
    
    const curlArgs = [
      '-s',
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-d', requestBody,
      redeemUrl
    ];

    const result = await new Promise((resolve, reject) => {
      execFile(curlCmd, curlArgs, (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(`Failed to execute curl: ${error.message}`));
        }
        try {
          const json = JSON.parse(stdout);
          resolve(json);
        } catch (parseError) {
          reject(new Error(`Failed to parse TrueMoney response: ${stdout || stderr}`));
        }
      });
    });

    // ตรวจสอบผลลัพธ์
    const isSuccess = result.status && (result.status.code === 'SUCCESS' || result.status.message === 'success');
    if (!isSuccess) {
      let errMsg = 'ลิงก์ซองของขวัญไม่ถูกต้อง หรือถูกใช้งานไปแล้ว';
      if (result.status && result.status.code) {
        if (result.status.code === 'VOUCHER_OUT_OF_STOCK') {
          errMsg = 'ซองของขวัญนี้ถูกรับไปหมดแล้ว';
        } else if (result.status.code === 'VOUCHER_NOT_FOUND') {
          errMsg = 'ไม่พบซองของขวัญนี้ในระบบ TrueMoney';
        } else if (result.status.code === 'VOUCHER_EXPIRED') {
          errMsg = 'ซองของขวัญนี้หมดอายุแล้ว';
        } else if (result.status.code === 'TARGET_USER_REDEEMED') {
          errMsg = 'เบอร์โทรศัพท์นี้ได้ทำการรับซองของขวัญนี้ไปแล้ว';
        } else {
          errMsg = `TrueMoney Error: ${result.status.code} - ${result.status.message || ''}`;
        }
      }
      return res.status(400).json({ error: errMsg });
    }

    // ดึงจำนวนเงินที่ได้รับจริง
    let amount = 0;
    if (result.data && result.data.my_ticket && result.data.my_ticket.amount_baht) {
      amount = parseFloat(result.data.my_ticket.amount_baht);
    } else if (result.data && result.data.voucher && result.data.voucher.amount_baht) {
      amount = parseFloat(result.data.voucher.amount_baht);
    }

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
    const senderName = (result.data && result.data.owner_profile && result.data.owner_profile.full_name) || 'N/A';

    // บันทึกในประวัติการเติมเงิน (topup record)
    await supabase.from('topups').insert({
      user_id: req.user.id,
      amount: amount,
      transaction_ref: voucherHash,
      status: 'approved',
      note: `ซองทรูมันนี่ — จากคุณ ${senderName}`,
      slip_data: result.data
    });

    res.json({
      success: true,
      message: `เติมเงินสำเร็จ ${amount.toFixed(2)} บาท`,
      new_credit: newCredit
    });

  } catch (err) {
    console.error('Verify Angpao error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบซองของขวัญ' });
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
  truemoney_phone: ''
};

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

// GET /api/admin/users — ดึงรายชื่อผู้ใช้ทั้งหมด
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
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
    const { facebook_url, discord_url, truemoney_phone } = req.body;
    if (!facebook_url || !discord_url) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }
    await updateSettings({ facebook_url, discord_url, truemoney_phone: truemoney_phone || '' });
    res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: err.message || 'ไม่สามารถบันทึกการตั้งค่าได้' });
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
// AUTO-RELEASE: ตรวจสอบเครื่องหมดเวลาอัตโนมัติ
// =============================================
async function autoReleaseExpiredMachines() {
  try {
    const now = new Date().toISOString();
    const { data: expired } = await supabase
      .from('machines')
      .select('id, name, tuya_device_id')
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
});

