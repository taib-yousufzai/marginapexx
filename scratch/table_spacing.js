const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/admin-layout.css');

const tableSpacingCSS = `
/* ===== MARKETWATCH TABLE SPACING FIX ===== */
.adm-mw-table {
  border-collapse: collapse;
  min-width: 850px !important; /* Extra width so columns don't squish */
}

.adm-mw-table th, 
.adm-mw-table td {
  padding: 14px 16px !important;
  white-space: nowrap !important; /* Prevents text from breaking into multiple lines */
}

.adm-mw-table th {
  color: #94a3b8;
  font-size: 0.75rem;
  letter-spacing: 0.5px;
}

.adm-mw-table td {
  font-size: 0.85rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.adm-mw-sym-cell {
  padding-left: 20px !important;
}
`;

fs.appendFileSync(filePath, tableSpacingCSS, 'utf8');
console.log('Table spacing fixes added!');
