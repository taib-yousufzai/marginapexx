const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/admin-layout.css');

const settingsCSS = `
/* ===== SETTINGS PAGE RESPONSIVE LAYOUT ===== */
.adm-settings-layout {
  display: flex;
  height: calc(100vh - 60px);
}

.adm-settings-sidebar {
  width: 240px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  padding: 20px 0;
  flex-shrink: 0;
}

.adm-settings-title {
  margin: 0 0 20px 20px;
  color: #f8fafc;
  font-size: 1.1rem;
  font-weight: 700;
}

.adm-settings-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 12px;
}

.adm-settings-btn {
  padding: 10px 16px;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #94a3b8;
  font-weight: 500;
  cursor: pointer;
  font-size: 0.88rem;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.adm-settings-btn:hover {
  background: rgba(255, 255, 255, 0.03);
  color: #f8fafc;
}

.adm-settings-btn.active {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  font-weight: 600;
}

.adm-settings-main {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
  background-color: transparent;
}

/* Mobile Settings Responsive */
@media (max-width: 768px) {
  .adm-settings-layout {
    flex-direction: column;
    height: auto;
  }
  
  .adm-settings-sidebar {
    width: 100%;
    border-right: none;
    padding: 12px 0 0 0;
  }
  
  .adm-settings-title {
    margin: 0 0 10px 16px;
  }
  
  .adm-settings-nav {
    flex-direction: row;
    overflow-x: auto;
    padding: 0 16px 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    -webkit-overflow-scrolling: touch;
  }
  
  .adm-settings-nav::-webkit-scrollbar {
    height: 0;
    display: none;
  }
  
  .adm-settings-btn {
    text-align: center;
    padding: 8px 16px;
  }
  
  .adm-settings-main {
    padding: 16px 12px;
    height: auto;
    overflow-y: visible;
  }
}
`;

fs.appendFileSync(filePath, settingsCSS, 'utf8');
console.log('Settings mobile CSS appended!');
