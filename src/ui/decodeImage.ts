import { decodePng, isPng, type RgbaImage } from "../core/png";

export interface DecodedImage extends RgbaImage {
  /** True when pixels came from our exact PNG decoder. False = browser decoder (colours may be approximate). */
  exact: boolean;
}

/**
 * Decodes an image file to RGBA. PNGs go through the exact decoder so pixels
 * are bit-for-bit what the file holds. Other formats (and interlaced PNGs)
 * fall back to the browser with colour conversion and premultiplication off.
 */
export async function decodeImage(bytes: Uint8Array): Promise<DecodedImage> {
  if (isPng(bytes)) {
    try {
      return { ...decodePng(bytes), exact: true };
    } catch {
      /* e.g. interlaced: fall through to the browser decoder */
    }
  }
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return { width: data.width, height: data.height, pixels: data.data, exact: false };
}
