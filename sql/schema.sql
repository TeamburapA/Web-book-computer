-- =============================================
-- ระบบเช่าคอมพิวเตอร์ออนไลน์ — Database Schema
-- ใช้รันใน Supabase SQL Editor
-- =============================================

-- 1. ตาราง Users (Custom Auth — ไม่ใช้ Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  credit NUMERIC(10,2) DEFAULT 0 CHECK (credit >= 0),
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);

-- 2. ตาราง Machines (เครื่องคอมพิวเตอร์)
CREATE TABLE IF NOT EXISTS machines (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('gaming', 'bot')),
  cpu TEXT,
  ram TEXT,
  ssd TEXT,
  gpu TEXT,
  os TEXT,
  price_per_hour NUMERIC(10,2) NOT NULL,
  price_per_day NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance')),
  current_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_end_time TIMESTAMPTZ,
  rdp_ip TEXT,
  rdp_username TEXT,
  rdp_password TEXT,
  anydesk_id TEXT,         -- หมายเลข AnyDesk ของเครื่อง
  anydesk_password TEXT,   -- รหัสผ่าน AnyDesk ของเครื่อง
  tuya_device_id TEXT,     -- Device ID จาก Tuya Smart สำหรับเปิด/ปิดเครื่อง
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_machines_status ON machines(status);
CREATE INDEX idx_machines_category ON machines(category);
CREATE INDEX idx_machines_current_user ON machines(current_user_id);

-- สำหรับตารางที่มีอยู่แล้ว ให้รันคำสั่งนี้เพิ่มเติม (ถ้าตารางถูกสร้างไว้ก่อนหน้า)
-- ALTER TABLE machines ADD COLUMN IF NOT EXISTS anydesk_id TEXT;
-- ALTER TABLE machines ADD COLUMN IF NOT EXISTS anydesk_password TEXT;
-- ALTER TABLE machines ADD COLUMN IF NOT EXISTS tuya_device_id TEXT;

-- 3. ตาราง Rentals (ประวัติการเช่า)
CREATE TABLE IF NOT EXISTS rentals (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  machine_id INT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  machine_name TEXT,
  duration_hours INT NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rentals_user ON rentals(user_id);
CREATE INDEX idx_rentals_status ON rentals(status);

-- 4. ตาราง Topups (ประวัติเติมเงิน)
CREATE TABLE IF NOT EXISTS topups (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  transaction_ref TEXT UNIQUE,
  slip_data JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_topups_user ON topups(user_id);
CREATE INDEX idx_topups_ref ON topups(transaction_ref);
CREATE INDEX idx_topups_status ON topups(status);

-- =============================================
-- Row Level Security (RLS)
-- Backend ใช้ service_role key จึง bypass RLS
-- แต่เปิด RLS ไว้เพื่อความปลอดภัยกรณีมีการเข้าถึงจาก client โดยตรง
-- =============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE topups ENABLE ROW LEVEL SECURITY;

-- อนุญาตให้อ่านรายการเครื่องได้ทุกคน (public)
CREATE POLICY "Public read machines" ON machines FOR SELECT USING (true);

-- =============================================
-- ข้อมูลตัวอย่าง (Sample Data)
-- =============================================

-- สร้าง Admin account (password: admin123 — เปลี่ยนหลังจากตั้งค่า)
-- หมายเหตุ: password_hash จะถูกสร้างผ่าน bcrypt ใน server.js
-- ตัวอย่างนี้ต้องเพิ่มผ่าน API /api/register แล้วเปลี่ยน role ใน Supabase Dashboard

-- เครื่องตัวอย่าง สายเกมมิ่ง
INSERT INTO machines (name, category, cpu, ram, ssd, gpu, os, price_per_hour, price_per_day, status, rdp_ip, rdp_username, rdp_password, image_url) VALUES
('CYBER-GAME-01', 'gaming', 'Intel Core i9-14900K', '64GB DDR5', '2TB NVMe Gen4', 'NVIDIA RTX 4090 24GB', 'Windows 11 Pro', 25, 400, 'available', '103.xx.xx.1', 'gamer01', 'G@m3r!2024', NULL),
('CYBER-GAME-02', 'gaming', 'AMD Ryzen 9 7950X', '32GB DDR5', '1TB NVMe Gen4', 'NVIDIA RTX 4080 16GB', 'Windows 11 Pro', 20, 320, 'available', '103.xx.xx.2', 'gamer02', 'G@m3r!2024', NULL),
('CYBER-GAME-03', 'gaming', 'Intel Core i7-14700K', '32GB DDR5', '1TB NVMe Gen4', 'NVIDIA RTX 4070 Ti 12GB', 'Windows 11 Pro', 15, 250, 'available', '103.xx.xx.3', 'gamer03', 'G@m3r!2024', NULL),
('CYBER-GAME-04', 'gaming', 'AMD Ryzen 7 7800X3D', '32GB DDR5', '512GB NVMe', 'NVIDIA RTX 4060 Ti 8GB', 'Windows 11 Pro', 12, 200, 'available', '103.xx.xx.4', 'gamer04', 'G@m3r!2024', NULL);

-- เครื่องตัวอย่าง สายเปิดบอท
INSERT INTO machines (name, category, cpu, ram, ssd, gpu, os, price_per_hour, price_per_day, status, rdp_ip, rdp_username, rdp_password, image_url) VALUES
('CYBER-BOT-01', 'bot', 'Intel Xeon E-2388G', '128GB ECC', '2TB NVMe', 'Integrated', 'Windows Server 2022', 18, 300, 'available', '103.xx.xx.10', 'bot01', 'B0t!Secure', NULL),
('CYBER-BOT-02', 'bot', 'AMD EPYC 7443P', '64GB ECC', '1TB NVMe', 'Integrated', 'Windows Server 2022', 15, 250, 'available', '103.xx.xx.11', 'bot02', 'B0t!Secure', NULL),
('CYBER-BOT-03', 'bot', 'Intel Xeon E-2336', '32GB ECC', '512GB NVMe', 'Integrated', 'Windows Server 2019', 10, 180, 'available', '103.xx.xx.12', 'bot03', 'B0t!Secure', NULL),
('CYBER-BOT-04', 'bot', 'AMD Ryzen 5 5600G', '16GB DDR4', '256GB NVMe', 'Integrated', 'Ubuntu 22.04 LTS', 8, 140, 'maintenance', '103.xx.xx.13', 'bot04', 'B0t!Secure', NULL);
