-- =============================================
-- เพิ่มตาราง Settings สำหรับจัดการลิ้งก์ติดต่อหลังบ้าน
-- ใช้รันใน Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- เพิ่มค่าเริ่มต้น (Default Values) ของ Facebook และ Discord
INSERT INTO settings (key, value) VALUES
('facebook_url', 'https://facebook.com'),
('discord_url', 'https://discord.com')
ON CONFLICT (key) DO NOTHING;
