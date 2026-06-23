const sharp = require('sharp');

async function fixIcon() {
  const input = 'app/icon.jpeg';
  
  console.log('Reading and trimming image...');
  // Trim the white background aggressively to get just the green square
  const trimmedBuffer = await sharp(input)
    .trim({ threshold: 40 })
    .toBuffer();
  
  console.log('Generating 512x512 icon...');
  // Resize to exactly 512x512, covering the whole area. NO PADDING.
  // fit: 'fill' ensures it stretches exactly to the borders.
  await sharp(trimmedBuffer)
    .resize(512, 512, { fit: 'fill' })
    .png()
    .toFile('public/icon-512x512.png');

  console.log('Generating 192x192 icon...');
  await sharp(trimmedBuffer)
    .resize(192, 192, { fit: 'fill' })
    .png()
    .toFile('public/icon-192x192.png');

  console.log('Generating splash icon...');
  await sharp(trimmedBuffer)
    .resize(512, 512, { fit: 'fill' })
    .jpeg({ quality: 100 })
    .toFile('public/splash-icon.jpg');

  console.log('Generating favicon...');
  await sharp(trimmedBuffer)
    .resize(32, 32, { fit: 'fill' })
    .png()
    .toFile('public/favicon-32.png');

  console.log('All icons generated! Perfect fit up to the borders, no padding added.');
}

fixIcon().catch(console.error);
