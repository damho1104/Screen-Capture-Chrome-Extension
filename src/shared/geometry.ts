import type { Point, Rect, Size, VerticalChunk } from './types';

export function createRectFromPoints(start: Point, end: Point): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

export function clampRectToViewport(rect: Rect, viewport: Size): Rect {
  const x = Math.max(0, Math.min(rect.x, viewport.width));
  const y = Math.max(0, Math.min(rect.y, viewport.height));
  const right = Math.max(x, Math.min(rect.x + rect.width, viewport.width));
  const bottom = Math.max(y, Math.min(rect.y + rect.height, viewport.height));
  return {
    x,
    y,
    width: right - x,
    height: bottom - y
  };
}

export function scaleRect(rect: Rect, scale: number): Rect {
  return {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale)
  };
}

export type ScrollChunk = VerticalChunk;

export function createVerticalChunks(input: { pageHeight: number; viewportHeight: number }): VerticalChunk[] {
  if (!Number.isFinite(input.pageHeight) || input.pageHeight <= 0) return [];
  if (!Number.isFinite(input.viewportHeight) || input.viewportHeight <= 0) {
    throw new Error('viewportHeight must be a positive finite number');
  }

  const chunks: VerticalChunk[] = [];
  let y = 0;

  while (y < input.pageHeight) {
    const remainingHeight = input.pageHeight - y;
    const height = Math.min(input.viewportHeight, remainingHeight);
    const scrollY = remainingHeight <= input.viewportHeight ? input.pageHeight - input.viewportHeight : y;

    chunks.push({
      scrollY: Math.max(0, scrollY),
      y,
      height
    });
    y += input.viewportHeight;
  }

  return chunks;
}

export const createScrollChunks = createVerticalChunks;
