import { describe, expect, it } from 'vitest';
import { clampRectToViewport, createRectFromPoints, createVerticalChunks, scaleRect } from '../geometry';

describe('geometry helpers', () => {
  it('creates normalized rects from drag points', () => {
    expect(createRectFromPoints({ x: 90, y: 80 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 80, height: 60 });
  });

  it('clamps a rect to the viewport', () => {
    expect(clampRectToViewport({ x: -10, y: 20, width: 120, height: 100 }, { width: 100, height: 80 })).toEqual({
      x: 0,
      y: 20,
      width: 100,
      height: 60
    });
  });

  it('scales a rect by device pixel ratio', () => {
    expect(scaleRect({ x: 10, y: 20, width: 30, height: 40 }, 2)).toEqual({ x: 20, y: 40, width: 60, height: 80 });
  });

  it('creates vertical chunks using reachable scroll positions and source offsets', () => {
    expect(createVerticalChunks({ pageHeight: 1250, viewportHeight: 500 })).toEqual([
      { scrollY: 0, y: 0, height: 500 },
      { scrollY: 500, y: 500, height: 500 },
      { scrollY: 750, y: 1000, height: 250 }
    ]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('returns no chunks for invalid page height %s', (pageHeight) => {
    expect(createVerticalChunks({ pageHeight, viewportHeight: 500 })).toEqual([]);
  });

  it('throws for zero viewport height when page height is positive', () => {
    expect(() => createVerticalChunks({ pageHeight: 1000, viewportHeight: 0 })).toThrow('viewportHeight must be a positive finite number');
  });

  it('throws for negative viewport height when page height is positive', () => {
    expect(() => createVerticalChunks({ pageHeight: 1000, viewportHeight: -1 })).toThrow('viewportHeight must be a positive finite number');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('throws for non-finite viewport height %s when page height is positive', (viewportHeight) => {
    expect(() => createVerticalChunks({ pageHeight: 1000, viewportHeight })).toThrow('viewportHeight must be a positive finite number');
  });
});
