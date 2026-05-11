import { describe, expect, it, vi } from 'vitest';
import type { BackgroundToOffscreenMessage } from '../../shared/messages';

async function importOffscreen(): Promise<typeof import('../main')> {
  vi.resetModules();
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: vi.fn()
      }
    }
  });
  return import('../main');
}

function bitmap(width: number, height: number): ImageBitmap {
  return { width, height } as ImageBitmap;
}

describe('resolveSourceRect', () => {
  it('scales CSS viewport rects to source bitmap pixels', async () => {
    const { resolveSourceRect } = await importOffscreen();

    expect(resolveSourceRect({
      type: 'CROP_IMAGE',
      dataUrl: 'data:image/png;base64,test',
      rect: { x: 10, y: 20, width: 30, height: 40 },
      viewport: { width: 100, height: 100 }
    }, bitmap(200, 300))).toEqual({ x: 20, y: 60, width: 60, height: 120 });
  });

  it('rounds outward for fractional scaling', async () => {
    const { resolveSourceRect } = await importOffscreen();

    expect(resolveSourceRect({
      type: 'CROP_IMAGE',
      dataUrl: 'data:image/png;base64,test',
      rect: { x: 1, y: 1, width: 2, height: 2 },
      viewport: { width: 10, height: 10 }
    }, bitmap(15, 15))).toEqual({ x: 1, y: 1, width: 4, height: 4 });
  });

  it('clamps scaled rects to bitmap bounds', async () => {
    const { resolveSourceRect } = await importOffscreen();

    expect(resolveSourceRect({
      type: 'CROP_IMAGE',
      dataUrl: 'data:image/png;base64,test',
      rect: { x: 80, y: 70, width: 50, height: 50 },
      viewport: { width: 100, height: 100 }
    }, bitmap(200, 150))).toEqual({ x: 160, y: 105, width: 40, height: 45 });
  });

  it('clamps fully out-of-bounds starts to bitmap bounds', async () => {
    const { resolveSourceRect } = await importOffscreen();

    expect(resolveSourceRect({
      type: 'CROP_IMAGE',
      dataUrl: 'data:image/png;base64,test',
      rect: { x: 150, y: 110, width: 10, height: 10 },
      viewport: { width: 100, height: 100 }
    }, bitmap(200, 150))).toEqual({ x: 200, y: 150, width: 1, height: 1 });
  });

  it('preserves source-pixel rects when viewport metadata is absent', async () => {
    const { resolveSourceRect } = await importOffscreen();

    expect(resolveSourceRect({
      type: 'CROP_IMAGE',
      dataUrl: 'data:image/png;base64,test',
      rect: { x: 5, y: 6, width: 10, height: 15 }
    }, bitmap(200, 150))).toEqual({ x: 5, y: 6, width: 10, height: 15 });
  });
});

describe('resolveMergeCanvasSize', () => {
  it('uses outputScale to preserve high-DPR element capture resolution', async () => {
    const { resolveMergeCanvasSize } = await importOffscreen();
    const message: BackgroundToOffscreenMessage = {
      type: 'MERGE_VERTICAL_IMAGES',
      images: [],
      width: 100,
      height: 130,
      sourceWidth: 200,
      outputScale: 2
    };

    expect(resolveMergeCanvasSize(message)).toEqual({ width: 200, height: 260, outputScale: 2 });
  });
});
