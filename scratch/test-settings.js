require('dotenv').config();
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function test() {
  console.log('--- TESTING SETTINGS API ---');
  
  // 1. GET current settings
  try {
    const res = await fetch(`${BASE_URL}/api/settings`);
    const data = await res.json();
    console.log('Initial GET settings:', data);
  } catch (err) {
    console.error('Error fetching settings:', err.message);
  }

  // 2. Generate Mock Admin Token
  const mockAdminUser = {
    id: '00000000-0000-0000-0000-000000000000',
    username: 'mockadmin',
    role: 'admin'
  };
  const token = jwt.sign(mockAdminUser, JWT_SECRET, { expiresIn: '1h' });
  console.log('Generated Mock Admin Token');

  // 3. PUT new settings
  const newSettings = {
    facebook_url: 'https://facebook.com/ChickDDC.Test',
    discord_url: 'https://discord.gg/chickddc-test'
  };

  try {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newSettings)
    });
    const data = await res.json();
    console.log('PUT admin settings response:', data);
  } catch (err) {
    console.error('Error updating settings:', err.message);
  }

  // 4. GET settings again to verify
  try {
    const res = await fetch(`${BASE_URL}/api/settings`);
    const data = await res.json();
    console.log('Verified GET settings:', data);
  } catch (err) {
    console.error('Error fetching settings again:', err.message);
  }
}

test();
