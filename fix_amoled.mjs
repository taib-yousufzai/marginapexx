import fs from 'fs';
import path from 'path';

function walk(dir) {
  let res = [];
  for (let f of fs.readdirSync(dir)) {
    let p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      res.push(...walk(p));
    } else if (p.endsWith('.css')) {
      res.push(p);
    }
  }
  return res;
}

const colorMap = {
  '#121212': '#000000',
  '#1A1E2B': '#050505',
  '#1a1e2b': '#050505',
  '#1A1A1A': '#000000',
  '#1a1a1a': '#000000',
  '#1E1E1E': '#0A0A0A',
  '#1e1e1e': '#0A0A0A',
  '#252525': '#0A0A0A',
  '#2C313F': '#111111',
  '#2c313f': '#111111',
  '#2D2D2D': '#111111',
  '#2d2d2d': '#111111',
  '#2A2A2A': '#111111',
  '#2a2a2a': '#111111',
  '#333333': '#1A1A1A',
  '#333': '#111',
  '#444444': '#222222',
  '#444': '#222'
};

const files = walk('./app');
let cnt = 0;

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  
  // Find all CSS rules for `:is(body.dark, body.black)`
  // We'll use a simple parser to find the opening `{` and its matching closing `}`
  let index = 0;
  let newBlocks = [];
  let modifiedContent = content;
  
  while (true) {
    let searchStr = ':is(body.dark, body.black)';
    let matchIdx = modifiedContent.indexOf(searchStr, index);
    if (matchIdx === -1) break;
    
    let openBraceIdx = modifiedContent.indexOf('{', matchIdx);
    if (openBraceIdx === -1) break;
    
    let closeBraceIdx = -1;
    let braceCount = 0;
    
    for (let i = openBraceIdx; i < modifiedContent.length; i++) {
      if (modifiedContent[i] === '{') braceCount++;
      else if (modifiedContent[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          closeBraceIdx = i;
          break;
        }
      }
    }
    
    if (closeBraceIdx !== -1) {
      // We found the full block
      let block = modifiedContent.substring(matchIdx, closeBraceIdx + 1);
      
      // Make a copy for body.black
      let blackBlock = block.replace(/:is\(body\.dark,\s*body\.black\)/g, 'body.black');
      
      let colorReplaced = false;
      // Replace colors in the black block
      for (const [oldC, newC] of Object.entries(colorMap)) {
        if (blackBlock.includes(oldC)) {
          blackBlock = blackBlock.replaceAll(oldC, newC);
          colorReplaced = true;
        }
      }
      
      if (colorReplaced) {
        newBlocks.push(blackBlock);
      }
      
      index = closeBraceIdx + 1;
    } else {
      break; // Malformed CSS
    }
  }
  
  if (newBlocks.length > 0) {
    // Revert the original file's `:is(body.dark, body.black)` to `body.dark`
    content = content.replaceAll(':is(body.dark, body.black)', 'body.dark');
    
    // Append the AMOLED black blocks at the end
    content += '\n\n/* ========================================= */\n';
    content += '/* AMOLED SUPER BLACK OVERRIDES */\n';
    content += '/* ========================================= */\n\n';
    content += newBlocks.join('\n\n');
    
    fs.writeFileSync(f, content, 'utf8');
    cnt++;
    console.log(`Updated ${f} with AMOLED overrides.`);
  }
}

console.log(`Total files updated: ${cnt}`);
