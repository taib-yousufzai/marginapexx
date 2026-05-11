const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/admin-layout.css');

const responsiveCSS = `
/* ===== GLOBAL MOBILE RESPONSIVENESS (ADDED) ===== */
@media (max-width: 768px) {
  /* Fix tables overflowing */
  .adm-table-wrap, .table-container, .table-responsive {
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch;
    width: 100%;
    display: block;
  }
  
  table, .adm-table {
    width: 100%;
    min-width: 600px; /* Forces scroll instead of squishing */
  }

  /* Make grids 1 column */
  .adm-db-grid, .adm-ord-stats, .adm-grid, .adm-script-list {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }

  /* Adjust main padding */
  .adm-content {
    padding: 16px 12px 30px !important;
  }

  /* Adjust cards */
  .adm-card {
    padding: 14px !important;
  }

  /* User Panel full width on mobile */
  .adm-user-panel {
    width: 100% !important;
    max-width: 100% !important;
  }

  /* Make popups/sheets full width */
  .adm-bottom-sheet {
    max-width: 100% !important;
    border-radius: 16px 16px 0 0 !important;
    padding: 20px 16px 24px !important;
  }
  
  /* Form actions stack vertically or full width buttons */
  .adm-form-actions, .adm-sheet-actions {
    flex-direction: column;
    width: 100%;
  }
  
  .adm-form-actions button, .adm-sheet-actions button, .adm-btn-primary, .adm-btn-ghost {
    width: 100%;
    justify-content: center;
  }
  
  .adm-btn-primary, .adm-btn-ghost, .adm-sheet-cancel {
     margin-bottom: 8px;
  }

  /* Make the topbar better */
  .adm-topbar {
    padding: 12px 14px !important;
  }
}
`;

fs.appendFileSync(filePath, responsiveCSS, 'utf8');
console.log('Mobile responsiveness added!');
