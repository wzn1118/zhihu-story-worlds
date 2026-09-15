/** Minimize transfer size subject to the pixels needed by CSS object-fit and DPR. */
export function selectArtVariant(variants, { width = 0, height = 0, dpr = 1, fit = 'cover' } = {}) {
  if (!variants?.length) return null;
  const largest = variants.reduce((a, b) => a.width >= b.width ? a : b);
  if (!(width > 0) || !(height > 0)) return largest;
  const ratio = largest.width / largest.height;
  const cssWidth = fit === 'contain' ? Math.min(width, height * ratio) : Math.max(width, height * ratio);
  const required = Math.min(largest.width, Math.ceil(cssWidth * Math.max(1, Number(dpr) || 1)));
  return variants.filter(item => item.width >= required).reduce((best, item) =>
    item.bytes < best.bytes || (item.bytes === best.bytes && item.width < best.width) ? item : best, largest);
}
