interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** object-contain ile gösterilen videoda istemci koordinatını kare (program penceresi) koordinatına çevirir. */
export function toVideoCoords(
  clientX: number,
  clientY: number,
  rect: Box,
  videoWidth: number,
  videoHeight: number,
): { x: number; y: number } | null {
  if (!videoWidth || !videoHeight || !rect.width || !rect.height) return null;
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
  const offsetX = (rect.width - videoWidth * scale) / 2;
  const offsetY = (rect.height - videoHeight * scale) / 2;
  const x = (clientX - rect.left - offsetX) / scale;
  const y = (clientY - rect.top - offsetY) / scale;
  if (x < 0 || y < 0 || x >= videoWidth || y >= videoHeight) return null;
  return { x: Math.round(x), y: Math.round(y) };
}
