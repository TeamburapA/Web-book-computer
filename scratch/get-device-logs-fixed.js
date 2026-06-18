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

function generateSignature(clientId, secret, t, method, path, queryParams = {}, body = '', accessToken = '') {
  const contentHash = crypto.createHash('sha256').update(body).digest('hex');
  
  // Sort query parameters alphabetically
  const sortedKeys = Object.keys(queryParams).sort();
  const sortedQueryArr = sortedKeys.map(key => `${key}=${queryParams[key]}`);
  const sortedQueryStr = sortedQueryArr.join('&');
  
  const fullPathWithQuery = sortedQueryStr ? `${path}?${sortedQueryStr}` : path;
  
  const stringToSign = [method, contentHash, '', fullPathWithQuery].join('\n');
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

async function queryEndpoint(accessToken, path, queryParams = {}) {
  const t = Date.now().toString();
  const sign = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, t, 'GET', path, queryParams, '', accessToken);

  // Construct request URL
  const sortedKeys = Object.keys(queryParams).sort();
  const sortedQueryArr = sortedKeys.map(key => `${key}=${queryParams[key]}`);
  const sortedQueryStr = sortedQueryArr.join('&');
  const requestUrl = sortedQueryStr ? `${TUYA_HOST}${path}?${sortedQueryStr}` : `${TUYA_HOST}${path}`;

  const res = await fetch(requestUrl, {
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

    // Logs for the last 24 hours
    const endTime = Date.now();
    const startTime = endTime - 24 * 3600000;

    for (const dev of devices) {
      console.log(`\n=================== Device logs: ${dev.name} (${dev.id}) ===================`);
      const path = `/v1.0/devices/${dev.id}/logs`;
      const queryParams = {
        start_time: startTime.toString(),
        end_time: endTime.toString(),
        size: '50'
      };
      const logsResult = await queryEndpoint(token, path, queryParams);
      console.log(JSON.stringify(logsResult, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
