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

const files = [...walk('./app'), ...walk('./components')];
let cnt = 0;

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  let newContent = content.replace(/body\.black[^{]*\{[^}]*\}/g, (match) => {
    return match
      .replaceAll('#0A0A0A', '#000000')
      .replaceAll('#050505', '#000000')
      .replaceAll('#111111', '#050505') // Make borders even darker!
      .replaceAll('#0a0a0a', '#000000')
      .replaceAll('#050505', '#000000');
  });
  
  if (content !== newContent) {
    fs.writeFileSync(f, newContent, 'utf8');
    console.log(`Deepened AMOLED in ${f}`);
    cnt++;
  }
}
console.log(`Total files deepened: ${cnt}`);
