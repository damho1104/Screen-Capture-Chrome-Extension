import { describe, expect, it } from 'vitest';
import { createCaptureFilename } from '../filename';

describe('createCaptureFilename', () => {
  it('formats a timestamped PNG filename', () => {
    const date = new Date('2026-05-09T10:11:12');
    expect(createCaptureFilename(date)).toBe('capture-20260509-101112.png');
  });
});
