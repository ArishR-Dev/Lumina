import sharp from "sharp";
import pngToIco from "png-to-ico";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");
const src = path.join(publicDir, "lumina-logo-source.png");

const BG = { r: 26, g: 16, b: 51, alpha: 1 };

async function resize(size, out) {
  await sharp(src)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, out));
  console.log("wrote", out, `${size}x${size}`);
}

async function maskable(size, out, padRatio = 0.18) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const icon = await sharp(src)
    .resize(inner, inner, { fit: "contain", background: BG })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: icon, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, out));
  console.log("wrote maskable", out, `${size}x${size}`);
}

async function ogImage(out) {
  const icon = await sharp(src).resize(420, 420).png().toBuffer();
  const backdrop = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g" cx="50%" cy="40%" r="70%">
        <stop offset="0%" stop-color="#3d1e4a"/>
        <stop offset="55%" stop-color="#1a1033"/>
        <stop offset="100%" stop-color="#0b0619"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#g)"/>
  </svg>`);
  await sharp(backdrop)
    .composite([{ input: icon, top: 105, left: 390 }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, out));
  console.log("wrote", out, "1200x630");
}

const meta = await sharp(src).metadata();
console.log("source", meta.width, meta.height);

await resize(1024, "lumina-icon-1024.png");
await resize(512, "icon-512.png");
await resize(512, "android-chrome-512x512.png");
await resize(512, "lumina-mark-512.png");
await resize(192, "icon-192.png");
await resize(192, "android-chrome-192x192.png");
await resize(180, "apple-touch-icon.png");
await resize(32, "favicon-32x32.png");
await resize(16, "favicon-16x16.png");
await maskable(512, "icon-maskable-512.png");
await maskable(512, "maskable-512x512.png");
await maskable(192, "icon-maskable-192.png");
await ogImage("og-shivani.jpg");

const icoBuf = await pngToIco([
  path.join(publicDir, "favicon-16x16.png"),
  path.join(publicDir, "favicon-32x32.png"),
]);
fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuf);
console.log("wrote favicon.ico");
