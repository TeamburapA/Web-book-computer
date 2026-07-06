const fs = require('fs');
const content = fs.readFileSync('c:\\งาน\\Web book computer\\server.js', 'utf8');
const lines = content.split('\n');

const query = process.argv[2] || 'rent';
console.log(`Searching for "${query}":`);
lines.forEach((line, index) => {
  if (line.toLowerCase().includes(query.toLowerCase())) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
