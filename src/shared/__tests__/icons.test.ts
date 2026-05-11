import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const iconSizes = [16, 32, 48, 128] as const;

describe('extension icons', () => {
  it('declares browser action and extension icons in the manifest', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

    expect(manifest.action.default_icon).toEqual({
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png'
    });
    expect(manifest.icons).toEqual(manifest.action.default_icon);
  });

  it('keeps an svg source and required png icon sizes', () => {
    expect(existsSync(resolve(root, 'icons/icon.svg'))).toBe(true);

    for (const size of iconSizes) {
      const iconPath = resolve(root, `icons/icon-${size}.png`);
      expect(existsSync(iconPath)).toBe(true);
    }
  });
});
