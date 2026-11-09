const MAX_EDGE = 1600;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file does not look like an image'));
    img.src = src;
  });
}

/**
 * Images are stored inline (base64) with the document, so large photos are
 * scaled down first to keep the local database small. GIFs keep their animation.
 */
export async function fileToDataUrl(file: File): Promise<string> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('Images over 25 MB are too large to store locally');
  const original = await readAsDataUrl(file);
  if (file.type === 'image/gif') return original;
  const img = await loadImage(original);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && file.size < 600 * 1024) return original;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const out = canvas.toDataURL(type, 0.86);
  return out.length < original.length ? out : original;
}
