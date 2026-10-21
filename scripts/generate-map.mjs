import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import {
  LAND,
  ISLANDS,
  FORESTS,
  MOUNTAINS,
  RIVER,
  WIDTH,
  HEIGHT,
} from "../shared/geography.ts";
let seed = 74;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const polygon = (p) => p.map((x) => x.join(",")).join(" ");
let art = "";
for (const e of FORESTS) {
  art += `<ellipse cx="${e.x}" cy="${e.y}" rx="${e.rx}" ry="${e.ry}" fill="#869b75" opacity=".25" filter="url(#soft)"/>`;
  for (let i = 0; i < 160; i++) {
    const x = e.x + (rand() * 2 - 1) * e.rx,
      y = e.y + (rand() * 2 - 1) * e.ry;
    if (((x - e.x) / e.rx) ** 2 + ((y - e.y) / e.ry) ** 2 > 1) continue;
    const s = 8 + rand() * 11;
    art += `<g transform="translate(${x} ${y})" opacity="${0.35 + rand() * 0.35}"><path d="M0 ${-s}L${-s * 0.65} ${s * 0.3}H${-s * 0.35}L${-s * 0.85} ${s}H${s * 0.85}L${s * 0.35} ${s * 0.3}H${s * 0.65}Z" fill="#617960" stroke="#526a53" stroke-width=".8"/><path d="M0 ${s * 0.2}v${s}" stroke="#58634b"/></g>`;
  }
}
for (const e of MOUNTAINS) {
  for (let i = 0; i < 44; i++) {
    const x = e.x + (rand() * 2 - 1) * e.rx,
      y = e.y + (rand() * 2 - 1) * e.ry;
    if (((x - e.x) / e.rx) ** 2 + ((y - e.y) / e.ry) ** 2 > 1) continue;
    const s = 24 + rand() * 30;
    art += `<g transform="translate(${x} ${y})"><path d="M${-s} ${s * 0.5}L0 ${-s}L${s} ${s * 0.5}" fill="#b8b6a0" stroke="#888d7d" stroke-width="1.2"/><path d="M0 ${-s}L${s} ${s * 0.5}L${s * 0.1} ${s * 0.2}Z" fill="#949f8e" opacity=".6"/><path d="M${-s * 0.3} ${-s * 0.55}L0 ${-s}L${s * 0.35} ${-s * 0.48}L${s * 0.12} ${-s * 0.55}L0 ${-s * 0.4}L${-s * 0.12} ${-s * 0.6}Z" fill="#eee9d4"/></g>`;
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".12"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter><filter id="soft"><feGaussianBlur stdDeviation="24"/></filter><pattern id="sea" width="85" height="65" patternUnits="userSpaceOnUse"><path d="M10 30q9-5 18 0m22 20q8-4 16 0" stroke="#648d91" stroke-width="1" opacity=".2" fill="none"/></pattern><radialGradient id="land"><stop stop-color="#e0d8b1"/><stop offset="1" stop-color="#c5cba5"/></radialGradient><clipPath id="landclip"><polygon points="${polygon(LAND)}"/></clipPath></defs><rect width="2400" height="1800" fill="#a8c0bc"/><rect width="2400" height="1800" fill="url(#sea)"/><g fill="none" stroke="#cbd6c5" stroke-linejoin="round"><polygon points="${polygon(LAND)}" stroke-width="48" opacity=".3"/><polygon points="${polygon(LAND)}" stroke-width="25" opacity=".5"/></g><g fill="url(#land)" stroke="#78917c" stroke-width="3" stroke-linejoin="round"><polygon points="${polygon(LAND)}"/>${ISLANDS.map((p) => `<polygon points="${polygon(p)}"/>`).join("")}</g><g clip-path="url(#landclip)"><ellipse cx="1400" cy="800" rx="550" ry="300" fill="#e8d5a7" opacity=".7" filter="url(#soft)"/>${art}<polyline points="${polygon(RIVER)}" fill="none" stroke="#829f94" stroke-width="10" stroke-linejoin="round"/><polyline points="${polygon(RIVER)}" fill="none" stroke="#b5d1c4" stroke-width="5" stroke-linejoin="round"/><path d="M735 760Q850 840 1090 945Q1400 780 1750 785M1090 945Q1020 1130 870 1270M1090 945Q1040 600 1110 340" fill="none" stroke="#a18c65" stroke-width="3" stroke-dasharray="5 7" opacity=".55"/></g><g fill="#4e6658" font-family="Georgia,serif" text-anchor="middle"><text x="1340" y="800" font-size="38" letter-spacing="8" opacity=".76">THE SUNWARD REACH</text><text x="710" y="640" font-size="24" letter-spacing="6" transform="rotate(-12 710 640)">ELDERWOOD</text><text x="1190" y="260" font-size="21" letter-spacing="5">THE ASHEN PEAKS</text><text x="1070" y="1370" font-size="23" letter-spacing="5">WHISPERING VALE</text><text x="1780" y="1010" font-size="22" letter-spacing="5" transform="rotate(-74 1780 1010)">THE GOLDEN COAST</text></g><g fill="#557c7e" opacity=".7" font-family="Georgia,serif" font-style="italic" text-anchor="middle"><text x="280" y="820" font-size="29" letter-spacing="5" transform="rotate(-75 280 820)">The Wandering Sea</text><text x="1570" y="1650" font-size="29" letter-spacing="6">Sea of First Light</text></g><g transform="translate(2130 1290)" stroke="#63857f" fill="none" opacity=".65"><circle r="78" stroke-width="1"/><circle r="67" stroke-width=".5"/><path d="M0-105L13-13 105 0 13 13 0 105-13 13-105 0-13-13Z" stroke-width="1.5"/><path d="M0-105V105M-105 0H105M-49-49 49 49M49-49-49 49"/><path d="M0-105L13-13 0 0Z" fill="#63857f"/><text y="-120" fill="#63857f" stroke="none" text-anchor="middle" font-family="Georgia" font-size="23">N</text></g><rect width="2400" height="1800" fill="transparent" filter="url(#paper)" opacity=".4"/></svg>`;
await mkdir("public/map", { recursive: true });
await writeFile("public/map/world.svg", svg);
const input = Buffer.from(svg);
for (let z = 0; z <= 3; z++) {
  const scale = 2 ** (z - 3);
  const width = Math.round(WIDTH * scale),
    height = Math.round(HEIGHT * scale);
  const base = await sharp(input).resize(width, height).png().toBuffer();
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
await sharp(input)
  .resize(720)
  .webp({ quality: 85 })
  .toFile("public/map/overview.webp");
console.log(
  "Generated illustrated placeholder map, overview, and 108 zoom tiles.",
);
