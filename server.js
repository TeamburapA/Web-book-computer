// =============================================
// ระบบเช่าคอมพิวเตอร์ออนไลน์ — Express Backend
// =============================================
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Supabase Client (Service Role — bypasses RLS) ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
    process.env.JWT_SECRET,
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

    const { data, error } = await query;
    if (error) throw error;

    // ซ่อน RDP info จาก response สาธารณะ — จะส่งแยกเฉพาะผู้เช่า
    const sanitized = data.map(m => {
      const machine = { ...m };
      delete machine.rdp_ip;
      delete machine.rdp_username;
      delete machine.rdp_password;
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

// POST /api/rent — เช่าเครื่อง (Atomic Transaction)
app.post('/api/rent', authMiddleware, async (req, res) => {
  try {
    const { machine_id, duration_hours } = req.body;

    if (!machine_id || !duration_hours) {
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

    // คำนวณราคา
    let total_price;
    if (duration_hours >= 24) {
      const days = Math.floor(duration_hours / 24);
      const remainingHours = duration_hours % 24;
      total_price = (days * parseFloat(machine.price_per_day)) + (remainingHours * parseFloat(machine.price_per_hour));
    } else {
      total_price = duration_hours * parseFloat(machine.price_per_hour);
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
    const sessionEnd = new Date(Date.now() + duration_hours * 60 * 60 * 1000);
    const { error: machUpdate } = await supabase
      .from('machines')
      .update({
        status: 'in_use',
        current_user_id: req.user.id,
        session_end_time: sessionEnd.toISOString()
      })
      .eq('id', machine_id);

    if (machUpdate) throw machUpdate;

    // บันทึกประวัติการเช่า
    const { error: rentalErr } = await supabase
      .from('rentals')
      .insert({
        user_id: req.user.id,
        machine_id: machine_id,
        machine_name: machine.name,
        duration_hours: duration_hours,
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
        duration_hours,
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

    // คืนเครื่อง
    await supabase
      .from('machines')
      .update({ status: 'available', current_user_id: null, session_end_time: null })
      .eq('id', machineId);

    // อัปเดตสถานะ rental
    await supabase
      .from('rentals')
      .update({ status: 'completed' })
      .eq('machine_id', machineId)
      .eq('status', 'active');

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
    const { data, error } = await supabase
      .from('machines')
      .select('*')
      .eq('current_user_id', req.user.id)
      .eq('status', 'in_use');

    if (error) throw error;
    res.json({ machines: data });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
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
    const { data, error } = await supabase
      .from('machines')
      .select('*')
      .order('id');
    if (error) throw error;
    res.json({ machines: data });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// POST /api/admin/machines — เพิ่มเครื่องใหม่
app.post('/api/admin/machines', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, category, cpu, ram, ssd, gpu, os, price_per_hour, price_per_day, rdp_ip, rdp_username, rdp_password, image_url } = req.body;

    if (!name || !category || !price_per_hour || !price_per_day) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็น' });
    }

    const { data, error } = await supabase
      .from('machines')
      .insert({
        name, category, cpu, ram, ssd, gpu, os,
        price_per_hour: parseFloat(price_per_hour),
        price_per_day: parseFloat(price_per_day),
        status: 'available',
        rdp_ip, rdp_username, rdp_password, image_url
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
    const { name, category, cpu, ram, ssd, gpu, os, price_per_hour, price_per_day, rdp_ip, rdp_username, rdp_password, image_url } = req.body;

    const { data, error } = await supabase
      .from('machines')
      .update({
        name, category, cpu, ram, ssd, gpu, os,
        price_per_hour: parseFloat(price_per_hour),
        price_per_day: parseFloat(price_per_day),
        rdp_ip, rdp_username, rdp_password, image_url
      })
      .eq('id', parseInt(req.params.id))
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, machine: data });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถแก้ไขเครื่องได้' });
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
    const { data, error } = await supabase
      .from('users')
      .select('id, username, credit, role, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ users: data });
  } catch (err) {
    console.error('Get admin users error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้' });
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


// =============================================
// AUTO-RELEASE: ตรวจสอบเครื่องหมดเวลาอัตโนมัติ
// =============================================
async function autoReleaseExpiredMachines() {
  try {
    const now = new Date().toISOString();
    const { data: expired } = await supabase
      .from('machines')
      .select('id, name')
      .eq('status', 'in_use')
      .lt('session_end_time', now);

    if (expired && expired.length > 0) {
      for (const machine of expired) {
        await supabase
          .from('machines')
          .update({ status: 'available', current_user_id: null, session_end_time: null })
          .eq('id', machine.id);

        await supabase
          .from('rentals')
          .update({ status: 'completed' })
          .eq('machine_id', machine.id)
          .eq('status', 'active');

        console.log(`🔄 Auto-released: ${machine.name} (ID: ${machine.id})`);
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
