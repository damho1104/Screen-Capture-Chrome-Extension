import type { CaptureSessionState } from './types';

export type CaptureSessionEvent = 'select' | 'capture' | 'preview' | 'fail' | 'cancel' | 'reset';

export function transitionCaptureState(state: CaptureSessionState, event: CaptureSessionEvent): CaptureSessionState {
  if (event === 'cancel' || event === 'reset') return 'idle';
  if (event === 'fail') return 'failed';
  if (state === 'idle' && event === 'select') return 'selecting';
  if (state === 'selecting' && event === 'capture') return 'capturing';
  if (state === 'capturing' && event === 'preview') return 'preview';
  return state;
}
