export const ASSET_BUCKET = "mergingsunapp-2.firebasestorage.app";
let imageBucket = ASSET_BUCKET;
let imageEndpoint = "https://firebasestorage.googleapis.com";
export function configureAssetEndpoint(bucket: string, endpoint: string) {
  imageBucket = bucket;
  imageEndpoint = endpoint;
}
export function assetUrl(path: string) {
  return `${imageEndpoint}/v0/b/${imageBucket}/o/${encodeURIComponent(path)}?alt=media`;
}
export const emblemUrl = (id: string) =>
  assetUrl(`public/emblems/${id}/image.webp`);
export const mapTileUrl = (id: string) =>
  assetUrl(`public/maps/${id}/tiles/{z}/{x}/{y}.webp`)
    .replace(/%7B/g, "{")
    .replace(/%7D/g, "}");
export const mapPreviewUrl = (id: string) =>
  assetUrl(`public/maps/${id}/overview.webp`);
