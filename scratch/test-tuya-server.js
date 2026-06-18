require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

const TUYA_REGION_HOSTS = {
  us: 'https://openapi.tuyaus.com',
  az: 'https://openapi.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  cn: 'https://openapi.tuyacn.com',
  ay: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
  sg: 'https://openapi-sg.iotbing.com'
};

const region = (process.env.TUYA_REGION || 'us').toLowerCase();
const TUYA_HOST = TUYA_REGION_HOSTS[region] || TUYA_REGION_HOSTS['us'];
const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;

async function getTuyaAccessToken() {
  const t = Date.now().toString();
  const method = 'GET';
  const path = '/v1.0/token?grant_type=1';
  const contentHash = crypto.createHash('sha256').update('').digest('hex');
  const stringToSign = [method, contentHash, '', path].join('\n');
  const str = TUYA_CLIENT_ID + t + stringToSign;
  const sign = crypto.createHmac('sha256', TUYA_CLIENT_SECRET)
    .update(str).digest('hex').toUpperCase();

  const res = await fetch(`${TUYA_HOST}${path}`, {
    headers: {
      'client_id': TUYA_CLIENT_ID,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256'
    }
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.msg || 'Tuya token error');
  return data.result.access_token;
}

getTuyaAccessToken()
  .then(token => console.log('Successfully retrieved token using server.js logic:', token))
  .catch(err => console.error('Error with server.js logic:', err));
