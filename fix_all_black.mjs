import fs from 'fs';
import path from 'path';

function walk(dir) {
  let res = [];
  for (let f of fs.readdirSync(dir)) {
    let p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) res.push(...walk(p));
    else if (p.endsWith('.css')) res.push(p);
  }
  return res;
}

// This script finds ALL `.dark .class` rules (without body prefix)
// and creates matching `.black .class` rules with AMOLED black colors.
// It also converts `body.dark` rules that were missed.

const bgColorMap = {
  '#121212': '#000000',
  '#1a1a1a': '#000000',
  '#1e1e1e': '#000000',
  '#252525': '#000000',
  '#2c313f': '#000000',
  '#2d2d2d': '#000000',
  '#2a2a2a': '#000000',
  '#2e2e2e': '#000000',
  '#333333': '#000000',
  '#333': '#000',
  '#3a3a3a': '#0a0a0a',
  '#444444': '#111111',
  '#444': '#111',
  '#111': '#000',
};

const borderColorMap = {
  '#2a2a2a': '#111111',
  '#333': '#111',
  '#333333': '#111111',
  '#3a3a3a': '#111111',
  '#444': '#1a1a1a',
  '#444444': '#1a1a1a',
};

const files = [...walk('./app'), ...walk('./components')];
let totalUpdated = 0;

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  let hasBlackSection = content.includes('body.black') || content.includes('.black .');

  // Find all `.dark .xxx` rules (not prefixed with body)
  // Pattern: standalone .dark selector (not preceded by body)
  const darkRuleRegex = /^(\.dark\s+[^{]+)\{([^}]+)\}/gm;
  let newBlocks = [];

  let match;
  while ((match = darkRuleRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const selector = match[1].trim();
    let body = match[2];

    // Create .black version
    let blackSelector = selector.replace(/\.dark\b/g, '.black');

    // Check if this .black rule already exists
    if (content.includes(blackSelector + ' {') || content.includes(blackSelector + '{')) {
      continue;
    }

    // Replace background colors to pure black
    let blackBody = body;
    let changed = false;

    for (const [old, nw] of Object.entries(bgColorMap)) {
      const regex = new RegExp(old.replace('#', '#'), 'gi');
      if (regex.test(blackBody)) {
        blackBody = blackBody.replace(regex, nw);
        changed = true;
      }
    }

    // For backgrounds, force #000000
    blackBody = blackBody.replace(/background:\s*#[0-9a-fA-F]{3,6}/gi, (m) => {
      const hex = m.match(/#[0-9a-fA-F]{3,6}/)[0].toLowerCase();
      // If it's a dark color (not a bright accent), make it pure black
      const r = parseInt(hex.length === 4 ? hex[1]+hex[1] : hex.slice(1,3), 16);
      const g = parseInt(hex.length === 4 ? hex[2]+hex[2] : hex.slice(3,5), 16);
      const b = parseInt(hex.length === 4 ? hex[3]+hex[3] : hex.slice(5,7), 16);
      if (r < 80 && g < 80 && b < 80) {
        changed = true;
        return 'background: #000000';
      }
      return m;
    });

    // For border-color, make them very subtle
    blackBody = blackBody.replace(/border-color:\s*#[0-9a-fA-F]{3,6}/gi, (m) => {
      const hex = m.match(/#[0-9a-fA-F]{3,6}/)[0].toLowerCase();
      const r = parseInt(hex.length === 4 ? hex[1]+hex[1] : hex.slice(1,3), 16);
      const g = parseInt(hex.length === 4 ? hex[2]+hex[2] : hex.slice(3,5), 16);
      const b = parseInt(hex.length === 4 ? hex[3]+hex[3] : hex.slice(5,7), 16);
      if (r < 80 && g < 80 && b < 80) {
        changed = true;
        return 'border-color: #111111';
      }
      return m;
    });

    blackBody = blackBody.replace(/border-bottom-color:\s*#[0-9a-fA-F]{3,6}/gi, (m) => {
      changed = true;
      return 'border-bottom-color: #111111';
    });

    if (changed || blackBody !== body) {
      newBlocks.push(`${blackSelector} {${blackBody}}`);
    }
  }

  if (newBlocks.length > 0) {
    content += '\n\n/* ── AMOLED BLACK: .dark -> .black overrides ── */\n';
    content += newBlocks.join('\n\n');
    content += '\n';
    fs.writeFileSync(f, content, 'utf8');
    totalUpdated++;
    console.log(`Added ${newBlocks.length} .black rules to ${f}`);
  }
}

console.log(`\nTotal files updated: ${totalUpdated}`);
