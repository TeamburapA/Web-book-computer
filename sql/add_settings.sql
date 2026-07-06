-- =============================================
-- เพิ่มตาราง Settings สำหรับจัดการลิ้งก์ติดต่อหลังบ้าน
-- ใช้รันใน Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
('facebook_url', 'https://facebook.com'),
('discord_url', 'https://discord.com'),
('truemoney_phone', ''),
('topup_wallet_enabled', 'true'),
('topup_promptpay_enabled', 'true'),
('topup_slip_enabled', 'true'),
('topup_time_restriction_enabled', 'false'),
('topup_restricted_start', '01:00'),
('topup_restricted_end', '03:00'),
('popup_enabled', 'false'),
('popup_image_url', '')
ON CONFLICT (key) DO NOTHING;
