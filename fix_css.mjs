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

const files = walk('./app');
let cnt = 0;
for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('body.dark') && !content.includes('body.black')) {
    // Replace body.dark with :is(body.dark, body.black)
    let newContent = content.replaceAll('body.dark', ':is(body.dark, body.black)');
    fs.writeFileSync(f, newContent, 'utf8');
    console.log(`Updated ${f}`);
    cnt++;
  }
}
console.log(`Total files updated: ${cnt}`);
