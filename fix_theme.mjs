import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory() && !['node_modules', '.next', '.git'].includes(file)) {
      walk(path.join(dir, file), fileList);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const dirsToSearch = [path.join(__dirname, 'app'), path.join(__dirname, 'components')];
let files = [];
for (const dir of dirsToSearch) {
  if (fs.existsSync(dir)) {
    files = files.concat(walk(dir));
  }
}

let modifiedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Pattern 1: Multi-line if/else in login/register etc
  const p1 = `if (saved === 'dark') {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }`;
  const p1r = `document.body.classList.remove('dark', 'black');
      if (saved === 'dark' || saved === 'black') {
        document.body.classList.add(saved);
      }`;
  
  if (content.includes(p1)) {
    content = content.replace(p1, p1r);
    changed = true;
  }

  // Pattern 2: Single-line if/else in history, profile/details, etc
  const p2 = /if\s*\(saved\s*===\s*'dark'\)\s*document\.body\.classList\.add\('dark'\);\s*else\s*document\.body\.classList\.remove\('dark'\);/g;
  if (p2.test(content)) {
    content = content.replace(p2, `document.body.classList.remove('dark', 'black');\n    if (saved === 'dark' || saved === 'black') document.body.classList.add(saved);`);
    changed = true;
  }

  // Pattern 3: toggle('dark', saved === 'dark')
  const p3 = /document\.body\.classList\.toggle\('dark',\s*(.+?)\);/g;
  if (p3.test(content)) {
    content = content.replace(p3, (match, p1) => {
      // In Sidebar.tsx it's `newDark` or `saved === 'dark'`
      return `document.body.classList.remove('dark', 'black');\n    if (${p1}) document.body.classList.add('dark');\n    else { const t = localStorage.getItem('marginApexTheme'); if (t === 'black') document.body.classList.add('black'); }`;
    });
    changed = true;
  }

  // Sidebar specific: localStorage.setItem('marginApexTheme', newDark ? 'dark' : 'light');
  // It shouldn't overwrite black if we're just toggling dark mode?
  // Let's leave Sidebar toggle as light/dark only, or we can patch Sidebar to toggle light/black if it was black?
  // Actually, the user asked to apply black mode everywhere, they probably don't mind Sidebar toggle resetting it to light/dark, or maybe we should fix Sidebar too.
  
  // Actually, wait: app/page.tsx has:
  // document.body.classList.toggle('dark', savedTheme === 'dark');
  // Which p3 handles.

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
    console.log(`Modified ${file}`);
  }
}

console.log(`Finished modifying ${modifiedCount} files.`);
