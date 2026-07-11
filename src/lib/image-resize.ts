// Client-side downscale so a 12MB phone photo never has to travel over the
// wire or blow the perf budget on the page that eventually renders it.
// Falls back to the original file untouched on any failure — resizing must
// never be the reason an upload breaks.
const MAX_DIMENSION = 2000;
const QUALITY = 0.85;

export async function downscaleImage(file: File, maxDimension = MAX_DIMENSION, quality = QUALITY): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (width <= maxDimension && height <= maxDimension) return file;

    const scale = maxDimension / Math.max(width, height);
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, file.type, quality));
    if (!blob) return file;
    return new File([blob], file.name, { type: file.type });
  } catch {
    return file;
  }
}
