const sharp = require('sharp');
const fs = require('fs');

async function fixIconGreen() {
  const input = 'app/icon.jpeg';
  const { data, info } = await sharp(input)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Get color at left edge (x=10, y=height/2)
  const pixelIndex = (Math.floor(info.height / 2) * info.width + 10) * info.channels;
  const r = data[pixelIndex];
  const g = data[pixelIndex + 1];
  const b = data[pixelIndex + 2];
  
  console.log(`Extracted background color: rgb(${r}, ${g}, ${b})`);

  // We'll resize the square logo slightly so the elephant and text are well within the "safe zone",
  // and we'll fill the rest of the 512x512 canvas with this exact green color.
  
  const resizedLogo = await sharp(input)
    .resize(400, 400, { fit: 'contain' }) // Larger than before, but safe.
    .toBuffer();

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
      input: await sharp(input).resize(150, 150, { fit: 'contain' }).toBuffer(),
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

  console.log("Green-padded icons created.");
}

fixIconGreen().catch(console.error);
