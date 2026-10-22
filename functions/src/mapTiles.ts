import sharp from "sharp";

type SaveTile = (path: string, buffer: Buffer) => Promise<unknown>;

/** Decode each level once. Re-decoding a compressed map for every tile is costly. */
export async function prepareMapTiles(
  bytes: Buffer,
  nativeZoom: number,
  save: SaveTile,
) {
  const scale = 2 ** (nativeZoom - 3);
  const source = await sharp(bytes, { limitInputPixels: 64000000 })
    .rotate()
    .resize(2400 * scale, 1800 * scale, {
      fit: "contain",
      background: "#a8c0bc",
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let z = 0; z <= nativeZoom; z++) {
    const levelScale = 2 ** (z - 3);
    const w = Math.round(2400 * levelScale),
      h = Math.round(1800 * levelScale);
    const base =
      z === nativeZoom
        ? source
        : await sharp(source.data, { raw: source.info })
            .resize(w, h)
            .raw()
            .toBuffer({ resolveWithObject: true });
    const columns = Math.ceil(w / 256),
      rows = Math.ceil(h / 256);
    // Bound buffers and outstanding Storage writes, while overlapping network latency.
    for (let start = 0; start < columns * rows; start += 8) {
      const results = await Promise.allSettled(
        Array.from(
          { length: Math.min(8, columns * rows - start) },
          async (_, offset) => {
            const index = start + offset,
              x = Math.floor(index / rows),
              y = index % rows;
            const tw = Math.min(256, w - x * 256),
              th = Math.min(256, h - y * 256);
            const buffer = await sharp(base.data, { raw: base.info })
              .extract({ left: x * 256, top: y * 256, width: tw, height: th })
              .extend({
                right: 256 - tw,
                bottom: 256 - th,
                background: "#a8c0bc",
              })
              .webp({ quality: 88 })
              .toBuffer();
            await save(`tiles/${z}/${x}/${y}.webp`, buffer);
          },
        ),
      );
      const failure = results.find((r) => r.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    }
  }
  await save(
    "overview.webp",
    await sharp(source.data, { raw: source.info })
      .resize(720)
      .webp({ quality: 85 })
      .toBuffer(),
  );
}
