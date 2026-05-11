import { beforeEach, describe, expect, it } from 'vitest';

import { showMessageOverlay } from '../overlay';

function getOverlayRoot(): ShadowRoot {
  const host = document.getElementById('screen-capture-extension-overlay');
  if (!host?.shadowRoot) throw new Error('Message overlay was not created.');
  return host.shadowRoot;
}

describe('showMessageOverlay', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    document.documentElement.querySelector('#screen-capture-extension-overlay')?.remove();
  });

  it('closes and removes the overlay with the close button', () => {
    showMessageOverlay('캡처 UI를 실행할 수 없습니다.');

    const root = getOverlayRoot();
    expect(root.textContent).toContain('캡처 UI를 실행할 수 없습니다.');

    const button = root.querySelector<HTMLButtonElement>('button.capture-button');
    expect(button?.type).toBe('button');
    expect(button?.textContent).toBe('닫기');

    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();
  });
});
