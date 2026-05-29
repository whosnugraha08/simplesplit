const MAX_SIZE_BYTES = 800 * 1024;

export async function compressImage(file: File, maxBytes = MAX_SIZE_BYTES): Promise<File> {
  if (file.size <= maxBytes) return file;

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  const maxDim = 1600;

  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.85;
  let blob: Blob | null = null;

  while (quality >= 0.4) {
    blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (blob && blob.size <= maxBytes) break;
    quality -= 0.1;
  }

  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}
