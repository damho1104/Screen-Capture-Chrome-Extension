import { beforeEach, describe, expect, it, vi } from 'vitest';

let runtimeListener: ((message: unknown) => void) | null = null;

function installChromeStub(): void {
  runtimeListener = null;
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: vi.fn((listener) => {
          runtimeListener = listener;
        })
      }
    }
  });
}

function getOverlayRoot(): ShadowRoot {
  const host = document.getElementById('screen-capture-extension-overlay');
  if (!host?.shadowRoot) throw new Error('Message overlay was not created.');
  return host.shadowRoot;
}

describe('content script error overlay', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    document.documentElement.querySelector('#screen-capture-extension-overlay')?.remove();
    installChromeStub();
  });

  it('shows an error overlay for SHOW_ERROR messages', async () => {
    await import('../content-script');

    runtimeListener?.({ type: 'SHOW_ERROR', message: '이 페이지에서는 캡처 UI를 실행할 수 없습니다.' });

    const root = getOverlayRoot();
    expect(root.textContent).toContain('이 페이지에서는 캡처 UI를 실행할 수 없습니다.');
    expect(root.querySelector('button.capture-button')?.textContent).toBe('닫기');
  });
});
