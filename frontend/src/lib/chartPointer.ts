/** Inverse of an equally spaced SVG plot, in rendered client coordinates. */
export function indexFromClientX(clientX: number, rect: { left: number; width: number }, pointCount: number, chartWidth: number, padX: number): number {
  if (pointCount <= 1 || rect.width <= 0 || chartWidth <= padX * 2) return 0;
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  const relative = (ratio * chartWidth - padX) / (chartWidth - padX * 2);
  return Math.min(Math.max(Math.round(relative * (pointCount - 1)), 0), pointCount - 1);
}
