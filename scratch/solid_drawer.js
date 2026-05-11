const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/admin-layout.css');

const solidDrawerCSS = `
/* ===== DRAWER SOLID BACKGROUND OVERRIDE ===== */
.adm-drawer {
  background: #0d1117 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.6) !important;
}
`;

fs.appendFileSync(filePath, solidDrawerCSS, 'utf8');
console.log('Drawer solid background applied!');
