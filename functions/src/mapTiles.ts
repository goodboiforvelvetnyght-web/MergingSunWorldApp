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

/** Natural maps use a 2048-unit longest side, independent of original pixel density. */
export async function prepareNaturalMapTiles(
  bytes: Buffer,
  dimensions: { mapWidth: number; mapHeight: number; nativeZoom: number },
  save: SaveTile,
  progress: (percent: number) => Promise<void> = async () => {},
) {
  const { mapWidth, mapHeight, nativeZoom } = dimensions;
  const scale = 2 ** (nativeZoom - 3);
  const source = await sharp(bytes, { limitInputPixels: 64000000 })
    .rotate()
    .resize(Math.round(mapWidth * scale), Math.round(mapHeight * scale), {
      fit: "fill",
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const levels = Array.from({ length: nativeZoom + 1 }, (_, z) => {
    const factor = 2 ** (z - 3);
    const width = Math.max(1, Math.round(mapWidth * factor)),
      height = Math.max(1, Math.round(mapHeight * factor));
    return {
      z,
      width,
      height,
      columns: Math.ceil(width / 256),
      rows: Math.ceil(height / 256),
    };
  });
  const total =
    levels.reduce((n, level) => n + level.columns * level.rows, 0) + 1;
  let done = 0;
  for (const { z, width, height, columns, rows } of levels) {
    const base =
      z === nativeZoom
        ? source
        : await sharp(source.data, { raw: source.info })
            .resize(width, height)
            .raw()
            .toBuffer({ resolveWithObject: true });
    for (let start = 0; start < columns * rows; start += 8) {
      const results = await Promise.allSettled(
        Array.from(
          { length: Math.min(8, columns * rows - start) },
          async (_, offset) => {
            const index = start + offset,
              x = Math.floor(index / rows),
              y = index % rows;
            const tw = Math.min(256, width - x * 256),
              th = Math.min(256, height - y * 256);
            const buffer = await sharp(base.data, { raw: base.info })
              .extract({ left: x * 256, top: y * 256, width: tw, height: th })
              .ensureAlpha()
              .extend({
                right: 256 - tw,
                bottom: 256 - th,
                background: { r: 168, g: 192, b: 188, alpha: 0 },
              })
              .webp({ quality: 88 })
              .toBuffer();
            await save(`tiles/${z}/${x}/${y}.webp`, buffer);
          },
        ),
      );
      const failure = results.find((r) => r.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      done += results.length;
      await progress((done / total) * 100);
    }
  }
  await save(
    "overview.webp",
    await sharp(source.data, { raw: source.info })
      .resize({
        width: 720,
        height: 720,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer(),
  );
  await progress(100);
}
