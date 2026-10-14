/** Compress a camera image to a JPEG cover-sized blob. */
export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  sizeBytes: number;
}

export async function compressImage(file: File, maxSide = 1280, targetBytes = 300 * 1024): Promise<CompressedImage> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('decode_failed'));
    });
    bitmap = await createImageBitmap(image);
    URL.revokeObjectURL(objectUrl);
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.8;
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('compression_failed');

  while (blob.size > targetBytes && quality > 0.4) {
    quality = Math.max(0.4, quality - 0.08);
    const next = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (next) blob = next;
  }

  if (blob.size > targetBytes && width > 720) {
    const canvas2 = document.createElement('canvas');
    canvas2.width = Math.round(width * 0.75);
    canvas2.height = Math.round(height * 0.75);
    const ctx2 = canvas2.getContext('2d');
    if (ctx2) {
      ctx2.drawImage(canvas, 0, 0, canvas2.width, canvas2.height);
      const next = await new Promise<Blob | null>((resolve) => canvas2.toBlob(resolve, 'image/jpeg', 0.6));
      if (next && next.size < blob.size) blob = next;
    }
  }

  return { blob, width, height, sizeBytes: blob.size };
}
