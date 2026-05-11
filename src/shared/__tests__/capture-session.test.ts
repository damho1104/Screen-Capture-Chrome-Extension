import { describe, expect, it } from 'vitest';
import { transitionCaptureState } from '../capture-session';

describe('transitionCaptureState', () => {
  it('allows the expected happy path', () => {
    expect(transitionCaptureState('idle', 'select')).toBe('selecting');
    expect(transitionCaptureState('selecting', 'capture')).toBe('capturing');
    expect(transitionCaptureState('capturing', 'preview')).toBe('preview');
    expect(transitionCaptureState('preview', 'reset')).toBe('idle');
  });

  it('enters failed from selecting or capturing', () => {
    expect(transitionCaptureState('selecting', 'fail')).toBe('failed');
    expect(transitionCaptureState('capturing', 'fail')).toBe('failed');
  });

  it('cancels any active state back to idle', () => {
    expect(transitionCaptureState('selecting', 'cancel')).toBe('idle');
    expect(transitionCaptureState('capturing', 'cancel')).toBe('idle');
  });
});
