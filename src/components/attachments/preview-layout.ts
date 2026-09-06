export const MAX_CANVAS_PIXELS = 4_000_000;
export function canvasLayout(
  width: number,
  height: number,
  availableWidth: number,
  zoom: number,
  deviceRatio: number,
) {
  if (![width, height, availableWidth, zoom, deviceRatio].every((n) => Number.isFinite(n) && n > 0))
    throw new Error("文档页面尺寸无效");
  const scale = Math.min(1, Math.max(1, availableWidth - 32) / width) * zoom;
  const cssWidth = width * scale,
    cssHeight = height * scale;
  const ratio = Math.min(
    deviceRatio,
    2,
    Math.sqrt(MAX_CANVAS_PIXELS / (cssWidth * cssHeight)),
    8192 / cssWidth,
    8192 / cssHeight,
  );
  return {
    scale,
    cssWidth,
    cssHeight,
    ratio,
    width: Math.max(1, Math.floor(cssWidth * ratio)),
    height: Math.max(1, Math.floor(cssHeight * ratio)),
  };
}
