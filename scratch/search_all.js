const fs = require('fs');
const path = require('path');

function searchFile(filePath, query) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let found = false;
  lines.forEach((line, index) => {
    if (line.toLowerCase().includes(query.toLowerCase())) {
      if (!found) {
        console.log(`\n--- ${filePath} ---`);
        found = true;
      }
      console.log(`${index + 1}: ${line.trim()}`);
    }
  });
}

const query = process.argv[2] || 'hour';
const dirs = ['public/js', 'public'];
dirs.forEach(dir => {
  const fullDir = path.join('c:\\งาน\\Web book computer', dir);
  if (fs.existsSync(fullDir)) {
    const files = fs.readdirSync(fullDir);
    files.forEach(file => {
      const fullPath = path.join(fullDir, file);
      if (fs.statSync(fullPath).isFile() && (file.endsWith('.js') || file.endsWith('.html'))) {
        searchFile(fullPath, query);
      }
    });
  }
});
