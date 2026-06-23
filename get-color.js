const sharp = require('sharp');

async function getColor() {
  const { data, info } = await sharp('app/icon.jpeg')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelIndex = (50 * info.width + 256) * info.channels;
  const r = data[pixelIndex];
  const g = data[pixelIndex + 1];
  const b = data[pixelIndex + 2];
  
  console.log(`RGB: ${r}, ${g}, ${b}`);
  console.log(`Hex: #${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
}

getColor().catch(console.error);
