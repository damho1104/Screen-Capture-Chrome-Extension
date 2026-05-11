import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');

function readPngSize(path: string): { width: number; height: number } {
  const data = readFileSync(path);
  expect(data.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

describe('store assets', () => {
  it('provides Chrome Web Store screenshots and promo tiles at required sizes', () => {
    const expected = new Map([
      ['store-assets/screenshots/drag-capture-1280x800.png', { width: 1280, height: 800 }],
      ['store-assets/screenshots/element-capture-1280x800.png', { width: 1280, height: 800 }],
      ['store-assets/screenshots/preview-1280x800.png', { width: 1280, height: 800 }],
      ['store-assets/promo-small-440x280.png', { width: 440, height: 280 }],
      ['store-assets/promo-marquee-1400x560.png', { width: 1400, height: 560 }]
    ]);

    for (const [relativePath, size] of expected) {
      const assetPath = resolve(root, relativePath);
      expect(existsSync(assetPath), relativePath).toBe(true);
      expect(readPngSize(assetPath)).toEqual(size);
    }
  });
});
