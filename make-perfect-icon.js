const sharp = require('sharp');
const fs = require('fs');

async function createPerfectIcon() {
  const input = 'app/icon.jpeg';
  
  // 1. Trim the white space from the original icon to get just the green square
  const trimmedBuffer = await sharp(input)
    .trim({ threshold: 50 }) // Remove the white border automatically
    .toBuffer();

  // 2. Get the exact green color from the top-left pixel of the trimmed green square
  const { data, info } = await sharp(trimmedBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const r = data[0];
  const g = data[1];
  const b = data[2];
  console.log(`Trimmed logo exact background color: rgb(${r}, ${g}, ${b})`);

  // 3. Resize the trimmed green square so it's a safe size for the maskable icon
  const resizedLogo = await sharp(trimmedBuffer)
    .resize(360, 360, { fit: 'contain' })
    .toBuffer();

  // 4. Create the final 512x512 icon with the EXACT green background color,
  // so the padding seamlessly blends with the logo!
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
      input: resizedLogo,
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
      input: await sharp(trimmedBuffer).resize(140, 140, { fit: 'contain' }).toBuffer(),
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
      input: resizedLogo,
      gravity: 'center'
    }
  ])
  .jpeg()
  .toFile('public/splash-icon.jpg');

  console.log("Perfect seamless green icons created.");
}

createPerfectIcon().catch(console.error);
