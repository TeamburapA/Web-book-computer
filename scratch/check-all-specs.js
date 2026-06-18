require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

const TUYA_HOST = 'https://openapi-sg.iotbing.com'; // Singapore
const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;

const devices = [
  { name: 'DDC-1', id: 'a3014c53f327dc9a9alfte' },
  { name: 'DDC-2', id: 'a3b9bca14ab5321353fi1k' },
  { name: 'DDC-3', id: 'a3b2ee103983cae9ad9ee0' }
];

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

async function queryEndpoint(accessToken, path) {
  const t = Date.now().toString();
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

    for (const dev of devices) {
      console.log(`\n=================== Device: ${dev.name} (${dev.id}) ===================`);
      const specsResult = await queryEndpoint(token, `/v1.0/devices/${dev.id}/specifications`);
      console.log('Specifications:', JSON.stringify(specsResult, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
