const sharp = require('sharp');
const fs = require('fs');

async function fixIconFinal() {
  const input = 'app/icon.jpeg';
  
  // 1. Get image info to find the center
  const { data, info } = await sharp(input)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cx = Math.floor(info.width / 2);
  const cy = Math.floor(info.height / 2);
  
  // 2. Pick a pixel safely inside the green area (above the elephant)
  // Let's use 20% from the top, center X.
  const y = Math.floor(info.height * 0.20);
  const x = cx;
  
  const pixelIndex = (y * info.width + x) * info.channels;
  const r = data[pixelIndex];
  const g = data[pixelIndex + 1];
  const b = data[pixelIndex + 2];
  
  console.log(`Sampled Green Color at (${x}, ${y}): rgb(${r}, ${g}, ${b})`);

  // 3. We will assume the central 60% of the image is safely just the green square + elephant
  // and contains no white border.
  const extractSize = Math.floor(info.width * 0.60);
  const extractX = Math.floor((info.width - extractSize) / 2);
  const extractY = Math.floor((info.height - extractSize) / 2);

  const croppedGreenSquare = await sharp(input)
    .extract({ left: extractX, top: extractY, width: extractSize, height: extractSize })
    .resize(320, 320, { fit: 'contain' })
    .toBuffer();

  // 4. Create the final 512x512 icon with the EXACT green background color
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r, g, b, alpha: 1 }
    }
  })
  .composite([
    {
      input: croppedGreenSquare,
      gravity: 'center'
    }
  ])
  .png()
  .toFile('public/icon-512x512.png');
  
  await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: { r, g, b, alpha: 1 }
    }
  })
  .composite([
    {
      input: await sharp(input).extract({ left: extractX, top: extractY, width: extractSize, height: extractSize }).resize(120, 120, { fit: 'contain' }).toBuffer(),
      gravity: 'center'
    }
  ])
  .png()
  .toFile('public/icon-192x192.png');

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r, g, b, alpha: 1 }
    }
  })
  .composite([
    {
      input: croppedGreenSquare,
      gravity: 'center'
    }
  ])
  .jpeg()
  .toFile('public/splash-icon.jpg');

  console.log("Perfect seamless green icons created.");
}

fixIconFinal().catch(console.error);
