import { describe, expect, it, vi } from 'vitest';

async function importElementCapture(): Promise<typeof import('../element-capture')> {
  vi.resetModules();
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn()
    }
  });
  return import('../element-capture');
}

function getOverlayRoot(): ShadowRoot {
  const host = document.getElementById('screen-capture-extension-overlay');
  if (!host?.shadowRoot) throw new Error('Overlay was not created.');
  return host.shadowRoot;
}

function getBackdrop(): HTMLElement {
  const backdrop = getOverlayRoot().querySelector<HTMLElement>('.capture-backdrop');
  if (!backdrop) throw new Error('Backdrop was not created.');
  return backdrop;
}

function defineRect(element: Element, rect: DOMRectInit): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => DOMRect.fromRect(rect)
  });
}

function stubElementFromPoint(element: Element | null): void {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => element)
  });
}

describe('startElementCapture', () => {
  it('plans element capture chunks for the selected full element bounds', async () => {
    vi.useFakeTimers();
    const scrollTo = vi.fn((x: number, y: number) => {
      vi.stubGlobal('scrollX', x);
      vi.stubGlobal('scrollY', y);
    });
    vi.stubGlobal('scrollTo', scrollTo);
    const { startElementCapture } = await importElementCapture();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);
    vi.stubGlobal('innerWidth', 100);
    vi.stubGlobal('innerHeight', 80);
    vi.stubGlobal('devicePixelRatio', 2);
    Object.defineProperties(document.documentElement, {
      scrollHeight: { configurable: true, value: 180 },
      offsetHeight: { configurable: true, value: 180 },
      scrollWidth: { configurable: true, value: 100 },
      clientWidth: { configurable: true, value: 100 }
    });
    const animationFrameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    }));

    const target = document.createElement('button');
    document.body.append(target);
    defineRect(target, { x: 10, y: 20, width: 80, height: 120 });
    stubElementFromPoint(target);

    startElementCapture();
    const backdrop = getBackdrop();
    backdrop.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 25, clientY: 30 }));
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 25, clientY: 30 }));
    const host = document.getElementById('screen-capture-extension-overlay');
    expect(host?.style.visibility).not.toBe('hidden');
    expect(getOverlayRoot().textContent).toContain('캡처 처리 중...');
    await Promise.resolve();
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'ELEMENT_CAPTURE_STARTED',
      chunks: [
        { scrollY: 0, y: 0, height: 80 },
        { scrollY: 60, y: 80, height: 60 }
      ],
      documentRect: { x: 10, y: 20, width: 80, height: 120 },
      pageWidth: 100,
      pageHeight: 180,
      devicePixelRatio: 2
    });

    await vi.advanceTimersByTimeAsync(649);
    expect(host?.style.visibility).not.toBe('hidden');
    expect(sendMessage).not.toHaveBeenCalledWith({ type: 'ELEMENT_CAPTURE_SCROLLED', scrollY: 0, viewportHeight: 80 });

    await vi.advanceTimersByTimeAsync(1);
    expect(host?.style.visibility).toBe('hidden');
    expect(sendMessage).not.toHaveBeenCalledWith({ type: 'ELEMENT_CAPTURE_SCROLLED', scrollY: 0, viewportHeight: 80 });

    animationFrameCallbacks[0](0);
    await Promise.resolve();
    await Promise.resolve();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'ELEMENT_CAPTURE_SCROLLED', scrollY: 0, viewportHeight: 80 });
    expect(host?.style.visibility).toBe('visible');

    await vi.advanceTimersByTimeAsync(650);
    expect(host?.style.visibility).toBe('hidden');
    expect(sendMessage).not.toHaveBeenCalledWith({ type: 'ELEMENT_CAPTURE_SCROLLED', scrollY: 60, viewportHeight: 80 });

    animationFrameCallbacks[1](0);
    await Promise.resolve();
    await Promise.resolve();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'ELEMENT_CAPTURE_SCROLLED', scrollY: 60, viewportHeight: 80 });
    expect(host?.style.visibility).toBe('visible');
    await Promise.resolve();
    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();
    target.remove();
    vi.useRealTimers();
  });



  it('sends cancellation and cleans up when Escape is pressed', async () => {
    const { startElementCapture } = await importElementCapture();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);

    startElementCapture();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(sendMessage).toHaveBeenCalledWith({ type: 'CAPTURE_CANCELLED' });
    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();
  });

  it('ignores body and html elements', async () => {
    const { startElementCapture } = await importElementCapture();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);
    vi.stubGlobal('innerWidth', 100);
    vi.stubGlobal('innerHeight', 80);

    defineRect(document.body, { x: 0, y: 0, width: 100, height: 80 });
    defineRect(document.documentElement, { x: 0, y: 0, width: 100, height: 80 });

    stubElementFromPoint(document.body);

    startElementCapture();
    const backdrop = getBackdrop();

    backdrop.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.getElementById('screen-capture-extension-overlay')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

  it('ignores clicks when no selectable element is hovered', async () => {
    const { startElementCapture } = await importElementCapture();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);
    vi.stubGlobal('innerWidth', 100);
    vi.stubGlobal('innerHeight', 80);

    startElementCapture();
    const backdrop = getBackdrop();

    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.getElementById('screen-capture-extension-overlay')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
});
