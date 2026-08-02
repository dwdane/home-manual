// photos.js
/**
 * Photo intake. Camera and gallery files are downscaled and re-encoded as
 * JPEG on capture so a big library costs megabytes rather than gigabytes,
 * and a 320px thumbnail is stored alongside for fast grids.
 *
 * A photo record:
 *   { id, subjectId, roomId, assetId, taskId, docType, caption,
 *     taken (ISO date), added (ISO datetime), blob, thumb }
 */

const FULL_MAX = 1600;
const THUMB_MAX = 320;
const QUALITY = 0.82;

/**
 * Decode an image file respecting EXIF orientation.
 * @param {File|Blob} file
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall through to the <img> path */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image.')); };
    img.src = url;
  });
}

/**
 * Draw a source scaled to fit within `max` and return a JPEG blob.
 * @param {ImageBitmap|HTMLImageElement} src
 * @param {number} max
 */
function toJpeg(src, max) {
  const w = src.width;
  const h = src.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo.'))),
      'image/jpeg',
      QUALITY,
    );
  });
}

/**
 * Process one incoming file.
 * @param {File} file
 * @returns {Promise<{blob: Blob, thumb: Blob}>}
 */
export async function processImage(file) {
  const src = await decode(file);
  const blob = await toJpeg(src, FULL_MAX);
  const thumb = await toJpeg(src, THUMB_MAX);
  if (src.close) src.close();
  return { blob, thumb };
}

/** Object URL for a stored blob. Caller revokes when done, or leaks a little. */
export function urlFor(blob) {
  return URL.createObjectURL(blob);
}
