const sharp = require('sharp');

async function fixIcon() {
  const input = 'app/icon.jpeg';
  
  const metadata = await sharp(input).metadata();
  console.log(`Original: ${metadata.width}x${metadata.height}`);

  // Less aggressive trim - threshold 10 instead of 30
  // This keeps the subtle dark green border visible
  const trimmedBuffer = await sharp(input)
    .trim({ threshold: 10 })
    .toBuffer();
  
  const trimmedMeta = await sharp(trimmedBuffer).metadata();
  console.log(`After gentle trim: ${trimmedMeta.width}x${trimmedMeta.height}`);

  // Add a tiny bit of padding (8px each side) so the border isn't cut at edges
  // Use the green color from the logo background
  const r = 48, g = 141, b = 96; // The green from the logo

  await sharp({
    create: {
      width: 528, // 512 + 8+8 padding
      height: 528,
      channels: 4,
      background: { r, g, b, alpha: 1 }
    }
  })
  .composite([{
    input: await sharp(trimmedBuffer).resize(512, 512, { fit: 'contain' }).toBuffer(),
    gravity: 'center'
  }])
  .resize(512, 512)
  .png()
  .toFile('public/icon-512x512.png');

  await sharp({
    create: {
      width: 208,
      height: 208,
      channels: 4,
      background: { r, g, b, alpha: 1 }
    }
  })
  .composite([{
    input: await sharp(trimmedBuffer).resize(192, 192, { fit: 'contain' }).toBuffer(),
    gravity: 'center'
  }])
  .resize(192, 192)
  .png()
  .toFile('public/icon-192x192.png');

  await sharp({
    create: {
      width: 528,
      height: 528,
      channels: 4,
      background: { r, g, b, alpha: 1 }
    }
  })
  .composite([{
    input: await sharp(trimmedBuffer).resize(512, 512, { fit: 'contain' }).toBuffer(),
    gravity: 'center'
  }])
  .resize(512, 512)
  .jpeg({ quality: 95 })
  .toFile('public/splash-icon.jpg');

  console.log('Icons created with subtle border preserved!');
}

fixIcon().catch(console.error);
