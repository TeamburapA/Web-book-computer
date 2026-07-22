const fetch = require('node-fetch');

async function testAntiBot() {
  console.log('Testing Honeypot trap rejection...');
  try {
    const res = await fetch('http://localhost:3000/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({
        username: 'testbot123',
        password: 'password123',
        website_hp: 'http://botspam.com'
      })
    });
    const data = await res.json();
    console.log('Honeypot Response Status:', res.status, data);
  } catch (e) {
    console.log('Server not running locally or error:', e.message);
  }

  console.log('Testing Emoji Username rejection...');
  try {
    const res = await fetch('http://localhost:3000/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({
        username: 'test🚀💀😀',
        password: 'password123'
      })
    });
    const data = await res.json();
    console.log('Emoji Username Response Status:', res.status, data);
  } catch (e) {
    console.log('Server not running locally or error:', e.message);
  }
}

testAntiBot();
