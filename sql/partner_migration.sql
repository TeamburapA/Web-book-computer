-- =============================================
-- Migration Script: เพิ่มระบบยศพาร์ทเนอร์ (Partner System)
-- ใช้รันใน Supabase SQL Editor
-- =============================================

-- 1. อัปเดตตาราง users
-- เพิ่มบทบาท 'partner' ใน CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'partner'));

-- เพิ่มคอลัมน์ partner_credit สำหรับเก็บกระเป๋าเงินรายได้พาร์ทเนอร์
ALTER TABLE users ADD COLUMN IF NOT EXISTS partner_credit NUMERIC(10,2) DEFAULT 0 CHECK (partner_credit >= 0);

-- 2. อัปเดตตาราง machines
-- เพิ่มคอลัมน์ owner_type และ owner_id เพื่อระบุความเป็นเจ้าของเครื่อง
ALTER TABLE machines ADD COLUMN IF NOT EXISTS owner_type TEXT DEFAULT 'admin' CHECK (owner_type IN ('admin', 'partner'));
ALTER TABLE machines ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_machines_owner ON machines(owner_type, owner_id);

-- 3. อัปเดตตาราง rentals
-- เพิ่มคอลัมน์ payment_method สำหรับระบุประเภทกระเป๋าเงินที่ใช้ชำระค่าเช่า (credit หรือ partner_credit)
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'credit' CHECK (payment_method IN ('credit', 'partner_credit'));

-- 4. สร้างตาราง partner_withdrawals (ประวัติคำขอถอนเงินพาร์ทเนอร์)
CREATE TABLE IF NOT EXISTS partner_withdrawals (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  fee NUMERIC(10,2) NOT NULL CHECK (fee >= 0),
  net_amount NUMERIC(10,2) NOT NULL CHECK (net_amount > 0),
  bank_name TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  account_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_user ON partner_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_status ON partner_withdrawals(status);

-- เปิดใช้งาน RLS สำหรับตาราง partner_withdrawals
ALTER TABLE partner_withdrawals ENABLE ROW LEVEL SECURITY;
