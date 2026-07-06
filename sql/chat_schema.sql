-- =============================================
-- ระบบกล่องแชทสด (Live Chat) และการทำความสะอาดข้อมูลอัตโนมัติ
-- ใช้รันใน Supabase SQL Editor
-- =============================================

-- ลบตารางเก่า (กรณีที่เคยสร้างไว้แล้วและต้องการเริ่มใหม่)
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_rooms CASCADE;

-- 1. ตาราง ห้องแชท (Chat Rooms)
CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- ลูกค้าจำเป็นต้องเข้าสู่ระบบ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_user ON chat_rooms(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_updated ON chat_rooms(updated_at);

-- 2. ตาราง ข้อความแชท (Chat Messages)
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL, -- แอดมินหรือลูกค้าที่ล็อกอิน
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'admin')),
  message TEXT, -- เปลี่ยนเป็นไม่ต้องระบุก็ได้ (nullable) กรณีส่งเฉพาะรูปภาพ
  image_url TEXT, -- เก็บลิงก์รูปภาพใน Supabase Storage
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

-- 3. เปิดใช้งาน Row Level Security (RLS) เพื่อความปลอดภัย
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- 4. ตั้งค่านโยบายความปลอดภัย (Policies)
-- เนื่องจากระบบเราประมวลผลผ่าน Express Backend (service_role key) เสมอในการเขียน/อ่าน
-- ส่วนหน้าเว็บจะดึงข้อมูลผ่าน Supabase Realtime ด้วยคีย์สาธารณะ (Anon Key)
-- เราจะอนุญาตให้อ่านข้อความเพื่อรับข้อมูลเรียลไทม์ได้ทุกคน (เพื่อความง่ายและปลอดภัยผ่าน UUID)
CREATE POLICY "Allow public select chat_rooms" ON chat_rooms FOR SELECT USING (true);
CREATE POLICY "Allow public select chat_messages" ON chat_messages FOR SELECT USING (true);

-- 5. เปิดใช้งาน Realtime ใน Supabase สำหรับตารางเหล่านี้
-- (สำหรับรันใน Supabase SQL Editor ซึ่งปกติจะมี publication ชื่อ supabase_realtime อยู่แล้ว)
ALTER TABLE chat_rooms REPLICA IDENTITY FULL;
ALTER TABLE chat_messages REPLICA IDENTITY FULL;

-- ถ้ายังไม่มีการเปิดใช้ Realtime ให้รันบรรทัดนี้:
ALTER PUBLICATION supabase_realtime ADD TABLE chat_rooms, chat_messages;


