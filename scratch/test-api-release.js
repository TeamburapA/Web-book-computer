require('dotenv').config();
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = '6b4d937d-9de5-4294-9b8f-b5218ad1a654'; // the renter
const JWT_SECRET = process.env.JWT_SECRET;

const token = jwt.sign(
  { id: USER_ID, username: 'testuser', role: 'user' },
  JWT_SECRET,
  { expiresIn: '24h' }
);

async function run() {
  try {
    // 1. Force set machine 1 to in_use by USER_ID in DB
    console.log('Force setting machine 1 to in_use...');
    await supabase
      .from('machines')
      .update({ status: 'in_use', current_user_id: USER_ID, session_end_time: new Date(Date.now() + 3600000).toISOString() })
      .eq('id', 1);

    // 2. Call local API release/1
    console.log('Calling API release/1...');
    const res = await fetch('http://localhost:3000/api/release/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json();
    console.log('API Response status:', res.status);
    console.log('API Response data:', data);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

run();
