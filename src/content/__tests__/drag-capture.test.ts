import { describe, expect, it, vi } from 'vitest';

async function importDragCapture(): Promise<typeof import('../drag-capture')> {
  vi.resetModules();
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn()
    }
  });
  return import('../drag-capture');
}

function getBackdrop(): HTMLElement {
  const host = document.getElementById('screen-capture-extension-overlay');
  const backdrop = host?.shadowRoot?.querySelector<HTMLElement>('.capture-backdrop');
  if (!backdrop) throw new Error('Backdrop was not created.');
  return backdrop;
}

function createPointerEvent(type: string, options: MouseEventInit): Event {
  return new MouseEvent(type, options);
}

describe('startDragCapture', () => {
  it('sends a clamped viewport-relative rect after a valid drag and cleans up', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const { startDragCapture } = await importDragCapture();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);
    vi.stubGlobal('innerWidth', 100);
    vi.stubGlobal('innerHeight', 80);
    vi.stubGlobal('devicePixelRatio', 2);

    startDragCapture();
    const backdrop = getBackdrop();

    backdrop.dispatchEvent(createPointerEvent('pointerdown', { clientX: 90, clientY: 70, bubbles: true }));
    backdrop.dispatchEvent(createPointerEvent('pointermove', { clientX: -10, clientY: 20, bubbles: true }));
    backdrop.dispatchEvent(createPointerEvent('pointerup', { clientX: -10, clientY: 20, bubbles: true }));

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60);

    expect(sendMessage).toHaveBeenCalledWith({ type: 'DRAG_AREA_SELECTED', rect: { x: 0, y: 20, width: 90, height: 50 }, viewport: { width: 100, height: 80 } });
    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();
    vi.useRealTimers();
  });

  it('removes the overlay and waits for a paint opportunity before sending capture request', async () => {
    vi.useFakeTimers();
    const animationFrameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    }));
    const { startDragCapture } = await importDragCapture();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);
    vi.stubGlobal('innerWidth', 100);
    vi.stubGlobal('innerHeight', 80);

    startDragCapture();
    const backdrop = getBackdrop();
    const host = document.getElementById('screen-capture-extension-overlay');

    backdrop.dispatchEvent(createPointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    backdrop.dispatchEvent(createPointerEvent('pointerup', { clientX: 60, clientY: 50, bubbles: true }));

    expect(host?.isConnected).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
    animationFrameCallbacks[0](0);
    await Promise.resolve();
    expect(sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60);

    expect(sendMessage).toHaveBeenCalledWith({ type: 'DRAG_AREA_SELECTED', rect: { x: 10, y: 10, width: 50, height: 40 }, viewport: { width: 100, height: 80 } });
    vi.useRealTimers();
  });

  it('ignores selections smaller than eight pixels and cleans up', async () => {
    const { startDragCapture } = await importDragCapture();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);
    vi.stubGlobal('innerWidth', 100);
    vi.stubGlobal('innerHeight', 80);

    startDragCapture();
    const backdrop = getBackdrop();

    backdrop.dispatchEvent(createPointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    backdrop.dispatchEvent(createPointerEvent('pointerup', { clientX: 17, clientY: 40, bubbles: true }));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();
  });

  it('sends cancellation and cleans up when Escape is pressed', async () => {
    const { startDragCapture } = await importDragCapture();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);

    startDragCapture();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(sendMessage).toHaveBeenCalledWith({ type: 'CAPTURE_CANCELLED' });
    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();
  });
});
