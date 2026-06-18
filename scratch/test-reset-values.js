require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

const TUYA_HOST = 'https://openapi-sg.iotbing.com'; // Singapore
const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const deviceId = 'a3b9bca14ab5321353fi1k'; // DDC-2

function generateSignature(clientId, secret, t, method, path, body = '', accessToken = '') {
  const contentHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = [method, contentHash, '', path].join('\n');
  const str = clientId + accessToken + t + stringToSign;
  return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
}

async function getAccessToken() {
  const t = Date.now().toString();
  const path = '/v1.0/token?grant_type=1';
  const sign = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, t, 'GET', path);

  const res = await fetch(`${TUYA_HOST}${path}`, {
    headers: {
      'client_id': TUYA_CLIENT_ID,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256'
    }
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.msg || 'Token fetch failed');
  }
  return data.result.access_token;
}

async function sendTuyaCommand(accessToken, code, value) {
  const t = Date.now().toString();
  const path = `/v1.0/devices/${deviceId}/commands`;
  const body = JSON.stringify({ commands: [{ code, value }] });
  const contentHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = ['POST', contentHash, '', path].join('\n');
  const str = TUYA_CLIENT_ID + accessToken + t + stringToSign;
  const sign = crypto.createHmac('sha256', TUYA_CLIENT_SECRET).update(str).digest('hex').toUpperCase();

  try {
    const res = await fetch(`${TUYA_HOST}${path}`, {
      method: 'POST',
      headers: {
        'client_id': TUYA_CLIENT_ID,
        'access_token': accessToken,
        't': t,
        'sign': sign,
        'sign_method': 'HMAC-SHA256',
        'Content-Type': 'application/json'
      },
      body
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function run() {
  try {
    const token = await getAccessToken();
    console.log('Got Access Token:', token);

    const testCases = [
      { code: 'reset', value: 'reboot' },
      { code: 'reset', value: 'force_reboot' },
      { code: 'reset', value: 'none' },
      { code: 'reset', value: '-' },
      { code: 'reset', value: '0' },
      { code: 'reset', value: '1' },
      { code: 'reset', value: '2' },
      { code: 'reset', value: 0 },
      { code: 'reset', value: 1 },
      { code: 'reset', value: 2 },
      { code: 'RESET', value: 'RESET' },
      { code: 'RESET', value: 'reboot' }
    ];

    for (const tc of testCases) {
      console.log(`Testing code="${tc.code}", value=${JSON.stringify(tc.value)}...`);
      const res = await sendTuyaCommand(token, tc.code, tc.value);
      if (res.code !== 2008) {
        console.log(`-> SUCCESS/DIFFERENT ERROR for ${tc.code}=${tc.value}:`, JSON.stringify(res));
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
