const fs = require('fs');
const content = fs.readFileSync('src/lib/groups.js', 'utf-8');
console.log(content.includes('syncAll'));
