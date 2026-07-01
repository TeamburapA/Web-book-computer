require('dotenv').config();
const jwt = require('jsonwebtoken');

const envJwtSecret = process.env.JWT_SECRET;
const ACTUAL_JWT_SECRET = envJwtSecret || 'cyber-rental-default-fallback-secret-key';

const user = {
  id: "6b4d937d-9de5-4294-9b8f-b5218ad1a654",
  username: "Team",
  role: "admin"
};

const token = jwt.sign(user, ACTUAL_JWT_SECRET, { expiresIn: '24h' });
console.log('JWT_TOKEN:', token);
