import sharp from "sharp";
import { mkdir } from "node:fs/promises";
const path = process.argv[2];
if (!path) {
  console.error(
    "Usage: node scripts/tile-map.mjs /absolute/path/to/your-map.png",
  );
  process.exit(1);
}
const meta = await sharp(path).metadata();
if (
  !meta.width ||
  !meta.height ||
  Math.abs(meta.width / meta.height - 4 / 3) > 0.01
) {
  console.error(
    "Use a 4:3 image to preserve the map coordinate system. Pad or crop your artwork before tiling.",
  );
  process.exit(1);
}
// Generate each tile from the normalized image, leaving geometry and world rules untouched.
const source = await sharp(path).resize(2400, 1800).png().toBuffer();
for (let z = 0; z <= 3; z++) {
  const scale = 2 ** (z - 3),
    width = Math.round(2400 * scale),
    height = Math.round(1800 * scale);
  const base = await sharp(source).resize(width, height).png().toBuffer();
  for (let x = 0; x < Math.ceil(width / 256); x++) {
    await mkdir(`public/map/tiles/${z}/${x}`, { recursive: true });
    for (let y = 0; y < Math.ceil(height / 256); y++) {
      const w = Math.min(256, width - x * 256),
        h = Math.min(256, height - y * 256);
      await sharp(base)
        .extract({ left: x * 256, top: y * 256, width: w, height: h })
        .extend({ right: 256 - w, bottom: 256 - h, background: "#a8c0bc" })
        .webp({ quality: 88 })
        .toFile(`public/map/tiles/${z}/${x}/${y}.webp`);
    }
  }
}
await sharp(source)
  .resize(720)
  .webp({ quality: 85 })
  .toFile("public/map/overview.webp");
console.log(
  "Map tiles replaced. Terrain rules and location coordinates are unchanged.",
);
