-- =============================================
-- เพิ่มตาราง Electricity Costs สำหรับจัดการค่าไฟฟ้าแยกตามรอบเวลา
-- ใช้รันใน Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS electricity_costs (
  id SERIAL PRIMARY KEY,
  period_type TEXT NOT NULL CHECK (period_type IN ('day', 'week', 'month', 'year')),
  period_key TEXT NOT NULL, -- 'YYYY-MM-DD' for day, 'YYYY-Wxx' for week, 'YYYY-MM' for month, 'YYYY' for year
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_period_cost UNIQUE (period_type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_electricity_costs_period ON electricity_costs(period_type, period_key);
