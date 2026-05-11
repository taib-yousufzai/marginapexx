const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/admin-layout.css');
let css = fs.readFileSync(filePath, 'utf8');

// Global Color Replacements (GitHub Dark -> Premium Dark)
css = css.replace(/#0d1117/g, '#030712'); // Main background
css = css.replace(/#161b22/g, 'rgba(255, 255, 255, 0.03)'); // Card/Drawer background
css = css.replace(/#21262d/g, 'rgba(255, 255, 255, 0.08)'); // Borders
css = css.replace(/#30363d/g, 'rgba(255, 255, 255, 0.12)'); // Hover borders
css = css.replace(/#1c2128/g, 'rgba(255, 255, 255, 0.06)'); // Nav item hover
css = css.replace(/#e6edf3/g, '#f8fafc'); // Primary text
css = css.replace(/#8b949e/g, '#94a3b8'); // Secondary text
css = css.replace(/#1f6feb/g, '#3b82f6'); // Primary Blue
css = css.replace(/#388bfd/g, '#60a5fa'); // Hover Blue
css = css.replace(/#1158c7/g, '#2563eb'); // Active Blue

// Inject Glassmorphism and premium effects
css = css.replace(
  /\.adm-card\s*\{([^}]*)\}/,
  `.adm-card {
  $1
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 24px -4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}`
);

css = css.replace(
  /\.adm-card:hover\s*\{([^}]*)\}/g,
  ''
);

css = css.replace(
  /\.adm-card\s*\{([^}]*)\}/,
  `.adm-card {$1}
.adm-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.15);
}`
);

css = css.replace(
  /\.adm-drawer\s*\{([^}]*)\}/,
  `.adm-drawer {
  $1
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  background: rgba(3, 7, 18, 0.85) !important;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.4);
}`
);

css = css.replace(
  /\.adm-user-panel\s*\{([^}]*)\}/,
  `.adm-user-panel {
  $1
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  background: rgba(3, 7, 18, 0.9) !important;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
}`
);

css = css.replace(
  /\.adm-topbar\s*\{([^}]*)\}/,
  `.adm-topbar {
  $1
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(3, 7, 18, 0.6) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: sticky;
  top: 0;
  z-index: 10;
}`
);

css = css.replace(
  /\.adm-bottom-sheet\s*\{([^}]*)\}/,
  `.adm-bottom-sheet {
  $1
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  background: rgba(15, 23, 42, 0.9) !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.5);
}`
);

css = css.replace(
  /\.adm-btn-primary\s*\{([^}]*)\}/,
  `.adm-btn-primary {
  $1
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}`
);

css = css.replace(
  /\.adm-btn-primary:hover\s*\{([^}]*)\}/,
  `.adm-btn-primary:hover {
  $1
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);
  transform: translateY(-1px);
}`
);

css = css.replace(
  /\.adm-input\s*\{([^}]*)\}/,
  `.adm-input {
  $1
  background: rgba(0, 0, 0, 0.2) !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}`
);

css = css.replace(
  /\.adm-input:focus\s*\{([^}]*)\}/,
  `.adm-input:focus {
  $1
  border-color: #3b82f6;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1), 0 0 0 2px rgba(59, 130, 246, 0.2);
  background: rgba(0, 0, 0, 0.3) !important;
}`
);

fs.writeFileSync(filePath, css, 'utf8');
console.log('UI Updated successfully!');
