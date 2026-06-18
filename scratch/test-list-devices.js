require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

const TUYA_HOST = 'https://openapi-sg.iotbing.com'; // Singapore
const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;

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

async function listDevices(accessToken) {
  const t = Date.now().toString();
  // Using the devices endpoint. Sometimes it requires a page size / page index or user ID. Let's try querying it directly.
  const path = '/v1.0/devices?page_no=1&page_size=20';
  const sign = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, t, 'GET', path, '', accessToken);

  const res = await fetch(`${TUYA_HOST}${path}`, {
    headers: {
      'client_id': TUYA_CLIENT_ID,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256',
      'access_token': accessToken
    }
  });
  return await res.json();
}

async function run() {
  try {
    const token = await getAccessToken();
    console.log('Got Access Token:', token);
    const devicesResult = await listDevices(token);
    console.log('Devices Result:', JSON.stringify(devicesResult, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
