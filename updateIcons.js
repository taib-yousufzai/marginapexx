const fs = require('fs');

const cssOverride = `

/* ----- CONSISTENT DARK GREEN NAVIGATION ICONS ----- */
.footer-tab .footer-icon, 
.footer-tab .footer-label {
  color: rgba(20, 83, 45, 0.5) !important;
  background: none !important;
  -webkit-background-clip: initial !important;
}
.footer-tab.active .footer-icon, 
.footer-tab.active .footer-label {
  background: linear-gradient(135deg, #14532D, #064E3B) !important;
  -webkit-background-clip: text !important;
  color: transparent !important;
}
`;

['./app/globals.css', './app/page.css', './app/order/page.css'].forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (!content.includes('CONSISTENT DARK GREEN NAVIGATION ICONS')) {
      fs.appendFileSync(file, cssOverride);
      console.log('Appended to: ' + file);
    } else {
        console.log('Already exists in: ' + file);
    }
  }
});
