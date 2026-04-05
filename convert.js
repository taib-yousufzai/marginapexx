const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const sourceDir = path.join(__dirname, '..');
const destDir = path.join(__dirname, 'app');

const filesToConvert = [
  { name: 'homePage (1).html', route: '' },
  { name: 'WATCHLIST.html', route: 'watchlist' },
  { name: 'basket.html', route: 'basket' },
  { name: 'buysegment.html', route: 'buysegment' },
  { name: 'history.html', route: 'history' },
  { name: 'order.html', route: 'order' },
  { name: 'position.html', route: 'position' }
];

for (const file of filesToConvert) {
  const sourcePath = path.join(sourceDir, file.name);
  if (!fs.existsSync(sourcePath)) {
    console.error('Not found:', sourcePath);
    continue;
  }
  
  const htmlContent = fs.readFileSync(sourcePath, 'utf8');
  const $ = cheerio.load(htmlContent);
  
  const style = $('style').html() || '';
  const bodyContent = $('body').html() || '';
  let scripts = $('script').map((i, el) => $(el).html()).get().join('\n');
  
  // Replace let and const with var to avoid re-declaration errors
  scripts = scripts.replace(/\bconst \b/g, 'var ').replace(/\blet \b/g, 'var ');
  
  const routeDir = path.join(destDir, file.route);
  if (!fs.existsSync(routeDir)) {
    fs.mkdirSync(routeDir, { recursive: true });
  }
  
  const cssPath = path.join(routeDir, 'page.css');
  fs.writeFileSync(cssPath, style);
  
  const tsxContent = `
'use client';
import { useEffect, useRef } from 'react';
import './page.css';

export default function Page() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Inject scripts
    const script = document.createElement('script');
    script.innerHTML = \`${scripts.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/<\/script>/g, '<\\/script>')}\`;
    document.body.appendChild(script);
    
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: \`${bodyContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` }} 
    />
  );
}
`;
  
  fs.writeFileSync(path.join(routeDir, 'page.tsx'), tsxContent);
  console.log('Converted:', file.name, 'to', path.join(routeDir, 'page.tsx'));
}
