import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentToBackgroundMessage } from '../../shared/messages';

let runtimeListener: ((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => boolean | undefined) | null = null;

function installChromeStub(): {
  captureVisibleTab: ReturnType<typeof vi.fn>;
  sendTabMessage: ReturnType<typeof vi.fn>;
  sendRuntimeMessage: ReturnType<typeof vi.fn>;
  downloadsDownload: ReturnType<typeof vi.fn>;
} {
  runtimeListener = null;
  const captureVisibleTab = vi.fn().mockResolvedValue('data:image/png;base64,visible');
  const sendTabMessage = vi.fn().mockResolvedValue(undefined);
  const sendRuntimeMessage = vi.fn().mockResolvedValue({
    type: 'IMAGE_PROCESSED',
    result: { dataUrl: 'data:image/png;base64,cropped', width: 20, height: 30, mode: 'drag' }
  });
  const downloadsDownload = vi.fn().mockResolvedValue(1);

  vi.stubGlobal('chrome', {
    runtime: {
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      getURL: (path: string) => `chrome-extension://id/${path}`,
      getContexts: vi.fn().mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }]),
      sendMessage: sendRuntimeMessage,
      onMessage: {
        addListener: vi.fn((listener) => {
          runtimeListener = listener;
        })
      }
    },
    downloads: {
      download: downloadsDownload
    },
    offscreen: {
      Reason: { BLOBS: 'BLOBS' },
      createDocument: vi.fn().mockResolvedValue(undefined)
    },
    tabs: {
      query: vi.fn(),
      captureVisibleTab,
      sendMessage: sendTabMessage
    },
    windows: {
      WINDOW_ID_CURRENT: -2
    },
    scripting: {
      executeScript: vi.fn()
    }
  });

  return { captureVisibleTab, sendTabMessage, sendRuntimeMessage, downloadsDownload };
}

describe('service worker drag selection handling', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('uses the sender tab window for capture', async () => {
    const chromeStub = installChromeStub();
    vi.stubGlobal('devicePixelRatio', 2);
    await import('../service-worker');

    const message: ContentToBackgroundMessage = {
      type: 'DRAG_AREA_SELECTED',
      rect: { x: 5, y: 6, width: 10, height: 15 },
      viewport: { width: 100, height: 80 }
    };
    const handled = runtimeListener?.(message, { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab }, vi.fn());
    await vi.waitFor(() => expect(chromeStub.sendTabMessage).toHaveBeenCalledWith(123, {
      type: 'SHOW_PREVIEW',
      result: { dataUrl: 'data:image/png;base64,cropped', width: 20, height: 30, mode: 'drag' }
    }));

    expect(handled).toBe(true);
    expect(chromeStub.captureVisibleTab).toHaveBeenCalledWith(456, { format: 'png' });
    expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'CROP_IMAGE',
      dataUrl: 'data:image/png;base64,visible',
      rect: { x: 5, y: 6, width: 10, height: 15 },
      viewport: { width: 100, height: 80 }
    });
  });

  it('sends drag retry error when crop fails', async () => {
    const chromeStub = installChromeStub();
    chromeStub.sendRuntimeMessage.mockResolvedValue({ type: 'IMAGE_PROCESSING_FAILED', message: 'crop failed' });
    await import('../service-worker');

    const message: ContentToBackgroundMessage = {
      type: 'DRAG_AREA_SELECTED',
      rect: { x: 5, y: 6, width: 10, height: 15 },
      viewport: { width: 100, height: 80 }
    };
    runtimeListener?.(message, { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab }, vi.fn());
    await vi.waitFor(() => expect(chromeStub.sendTabMessage).toHaveBeenCalledWith(123, {
      type: 'SHOW_ERROR',
      message: 'crop failed',
      retryMode: 'drag'
    }));
  });

  it('forwards the CSS rect and viewport instead of service worker DPR scaling', async () => {
    const chromeStub = installChromeStub();
    vi.stubGlobal('devicePixelRatio', 3);
    await import('../service-worker');

    const message: ContentToBackgroundMessage = {
      type: 'DRAG_AREA_SELECTED',
      rect: { x: 5, y: 6, width: 10, height: 15 },
      viewport: { width: 100, height: 80 }
    };
    runtimeListener?.(message, { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab }, vi.fn());
    await vi.waitFor(() => expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'CROP_IMAGE',
      dataUrl: 'data:image/png;base64,visible',
      rect: { x: 5, y: 6, width: 10, height: 15 },
      viewport: { width: 100, height: 80 }
    }));
  });

  it('rejects drag messages without a valid viewport', async () => {
    const chromeStub = installChromeStub();
    await import('../service-worker');

    const message = { type: 'DRAG_AREA_SELECTED', rect: { x: 5, y: 6, width: 10, height: 15 } };
    const handled = runtimeListener?.(message, { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab }, vi.fn());

    expect(handled).toBe(false);
    expect(chromeStub.captureVisibleTab).not.toHaveBeenCalled();
    expect(chromeStub.sendRuntimeMessage).not.toHaveBeenCalled();
  });

  it('rejects drag capture from an inactive sender tab', async () => {
    const chromeStub = installChromeStub();
    await import('../service-worker');

    const message: ContentToBackgroundMessage = {
      type: 'DRAG_AREA_SELECTED',
      rect: { x: 5, y: 6, width: 10, height: 15 },
      viewport: { width: 100, height: 80 }
    };
    runtimeListener?.(message, { tab: { id: 123, windowId: 456, active: false } as chrome.tabs.Tab }, vi.fn());

    await vi.waitFor(() => expect(chromeStub.sendTabMessage).toHaveBeenCalledWith(123, {
      type: 'SHOW_ERROR',
      message: '캡처를 시작할 수 없습니다.',
      retryMode: 'drag'
    }));
    expect(chromeStub.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('captures the selected element after all element chunks are scrolled', async () => {
    const chromeStub = installChromeStub();
    chromeStub.captureVisibleTab.mockResolvedValueOnce('data:image/png;base64,top').mockResolvedValueOnce('data:image/png;base64,bottom');
    chromeStub.sendRuntimeMessage
      .mockResolvedValueOnce({
        type: 'IMAGE_PROCESSED',
        result: { dataUrl: 'data:image/png;base64,merged', width: 100, height: 130, mode: 'fullPage' }
      })
      .mockResolvedValueOnce({
        type: 'IMAGE_PROCESSED',
        result: { dataUrl: 'data:image/png;base64,element', width: 160, height: 180, mode: 'drag' }
      });
    await import('../service-worker');

    const startMessage: ContentToBackgroundMessage = {
      type: 'ELEMENT_CAPTURE_STARTED',
      chunks: [{ scrollY: 40, height: 50 }, { scrollY: 90, height: 40 }],
      documentRect: { x: 10, y: 40, width: 80, height: 90 },
      pageWidth: 100,
      pageHeight: 130,
      devicePixelRatio: 2
    };
    expect(runtimeListener?.(startMessage, { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab }, vi.fn())).toBe(false);

    const firstScroll: ContentToBackgroundMessage = { type: 'ELEMENT_CAPTURE_SCROLLED', scrollY: 40, viewportHeight: 50 };
    const secondScroll: ContentToBackgroundMessage = { type: 'ELEMENT_CAPTURE_SCROLLED', scrollY: 90, viewportHeight: 40 };
    expect(runtimeListener?.(firstScroll, { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab }, vi.fn())).toBe(true);
    const secondResponse = vi.fn();
    expect(runtimeListener?.(secondScroll, { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab }, secondResponse)).toBe(true);
    await vi.waitFor(() => expect(secondResponse).toHaveBeenCalledWith({ ok: true }));

    await vi.waitFor(() => expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'MERGE_VERTICAL_IMAGES',
      images: [
        { dataUrl: 'data:image/png;base64,top', y: 40, height: 50 },
        { dataUrl: 'data:image/png;base64,bottom', y: 90, height: 40 }
      ],
      width: 100,
      height: 130,
      sourceWidth: 200,
      outputScale: 2
    }));
    await vi.waitFor(() => expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'CROP_IMAGE',
      dataUrl: 'data:image/png;base64,merged',
      rect: { x: 20, y: 80, width: 160, height: 180 }
    }));
    await vi.waitFor(() => expect(chromeStub.sendTabMessage).toHaveBeenCalledWith(123, {
      type: 'SHOW_PREVIEW',
      result: { dataUrl: 'data:image/png;base64,element', width: 160, height: 180, mode: 'element' }
    }));
    expect(chromeStub.captureVisibleTab).toHaveBeenNthCalledWith(1, 456, { format: 'png' });
    expect(chromeStub.captureVisibleTab).toHaveBeenNthCalledWith(2, 456, { format: 'png' });
  });
  it('sends element retry error when element merge fails', async () => {
    const chromeStub = installChromeStub();
    chromeStub.sendRuntimeMessage.mockResolvedValue({ type: 'IMAGE_PROCESSING_FAILED', message: 'crop failed' });
    await import('../service-worker');

    const startMessage: ContentToBackgroundMessage = {
      type: 'ELEMENT_CAPTURE_STARTED',
      chunks: [{ scrollY: 0, height: 50 }],
      documentRect: { x: 5, y: 6, width: 10, height: 15 },
      pageWidth: 100,
      pageHeight: 100,
      devicePixelRatio: 1
    };
    runtimeListener?.(startMessage, { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab }, vi.fn());

    const scrollMessage: ContentToBackgroundMessage = { type: 'ELEMENT_CAPTURE_SCROLLED', scrollY: 0, viewportHeight: 50 };
    runtimeListener?.(scrollMessage, { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab }, vi.fn());

    await vi.waitFor(() => expect(chromeStub.sendTabMessage).toHaveBeenCalledWith(123, {
      type: 'SHOW_ERROR',
      message: 'crop failed',
      retryMode: 'element'
    }));
  });

  it('rejects element messages without a valid content-side device pixel ratio', async () => {
    const chromeStub = installChromeStub();
    await import('../service-worker');

    const message = { type: 'ELEMENT_CAPTURE_STARTED', chunks: [], documentRect: { x: 5, y: 6, width: 10, height: 15 }, pageWidth: 100, pageHeight: 100, devicePixelRatio: 0 };
    const handled = runtimeListener?.(message, { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab }, vi.fn());

    expect(handled).toBe(false);
    expect(chromeStub.captureVisibleTab).not.toHaveBeenCalled();
    expect(chromeStub.sendRuntimeMessage).not.toHaveBeenCalled();
  });

  it('downloads preview data URLs with a capture filename', async () => {
    const chromeStub = installChromeStub();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T12:34:56'));
    await import('../service-worker');

    const sendResponse = vi.fn();
    const handled = runtimeListener?.({ type: 'PREVIEW_SAVE_REQUESTED', dataUrl: 'data:image/png;base64,preview' }, {}, sendResponse);

    expect(handled).toBe(true);
    await vi.waitFor(() => expect(chromeStub.downloadsDownload).toHaveBeenCalledWith({
      url: 'data:image/png;base64,preview',
      filename: 'capture-20260510-123456.png',
      saveAs: true
    }));
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
    vi.useRealTimers();
  });

  it('captures full-page chunks from the sender window, merges images, and shows a full-page preview', async () => {
    const chromeStub = installChromeStub();
    chromeStub.captureVisibleTab.mockResolvedValueOnce('data:image/png;base64,top').mockResolvedValueOnce('data:image/png;base64,bottom');
    chromeStub.sendRuntimeMessage.mockResolvedValue({
      type: 'IMAGE_PROCESSED',
      result: { dataUrl: 'data:image/png;base64,merged', width: 1000, height: 750, mode: 'drag' }
    });
    await import('../service-worker');

    const sender = { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab };
    const planResponse = vi.fn();
    const planHandled = runtimeListener?.({
      type: 'FULL_PAGE_PLAN_READY',
      chunks: [
        { scrollY: 0, height: 500 },
        { scrollY: 500, height: 250 }
      ],
      pageWidth: 1000,
      pageHeight: 750,
      devicePixelRatio: 1
    } satisfies ContentToBackgroundMessage, sender, planResponse);
    const firstResponse = vi.fn();
    const firstHandled = runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 0, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, firstResponse);
    const secondResponse = vi.fn();
    const secondHandled = runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 500, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, secondResponse);

    expect(planHandled).toBe(false);
    expect(planResponse).toHaveBeenCalledWith({ ok: true });
    expect(firstHandled).toBe(true);
    expect(secondHandled).toBe(true);
    await vi.waitFor(() => expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'MERGE_VERTICAL_IMAGES',
      images: [
        { dataUrl: 'data:image/png;base64,top', y: 0, height: 500 },
        { dataUrl: 'data:image/png;base64,bottom', y: 500, height: 250 }
      ],
      width: 1000,
      height: 750,
      sourceWidth: 1000
    }));
    expect(chromeStub.captureVisibleTab).toHaveBeenNthCalledWith(1, 456, { format: 'png' });
    expect(chromeStub.captureVisibleTab).toHaveBeenNthCalledWith(2, 456, { format: 'png' });
    await vi.waitFor(() => expect(chromeStub.sendTabMessage).toHaveBeenCalledWith(123, {
      type: 'SHOW_PREVIEW',
      result: { dataUrl: 'data:image/png;base64,merged', width: 1000, height: 750, mode: 'fullPage', partial: false }
    }));
    await vi.waitFor(() => expect(firstResponse).toHaveBeenCalledWith({ ok: true }));
    await vi.waitFor(() => expect(secondResponse).toHaveBeenCalledWith({ ok: true }));
  });

  it('merges captured full-page images as a partial preview when the session times out', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'));
    const chromeStub = installChromeStub();
    chromeStub.captureVisibleTab.mockResolvedValueOnce('data:image/png;base64,top');
    chromeStub.sendRuntimeMessage.mockResolvedValue({
      type: 'IMAGE_PROCESSED',
      result: { dataUrl: 'data:image/png;base64,partial', width: 1000, height: 1500, mode: 'drag' }
    });
    await import('../service-worker');

    const sender = { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab };
    runtimeListener?.({
      type: 'FULL_PAGE_PLAN_READY',
      chunks: [
        { scrollY: 0, height: 500 },
        { scrollY: 500, height: 500 },
        { scrollY: 1000, height: 500 }
      ],
      pageWidth: 1000,
      pageHeight: 1500,
      devicePixelRatio: 1
    } satisfies ContentToBackgroundMessage, sender, vi.fn());

    const firstResponse = vi.fn();
    runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 0, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, firstResponse);
    await vi.waitFor(() => expect(firstResponse).toHaveBeenCalledWith({ ok: true }));

    vi.setSystemTime(new Date('2026-05-10T00:00:31.000Z'));
    const timeoutResponse = vi.fn();
    const timeoutHandled = runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 500, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, timeoutResponse);

    expect(timeoutHandled).toBe(true);
    await vi.waitFor(() => expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'MERGE_VERTICAL_IMAGES',
      images: [{ dataUrl: 'data:image/png;base64,top', y: 0, height: 500 }],
      width: 1000,
      height: 1500,
      sourceWidth: 1000
    }));
    await vi.waitFor(() => expect(chromeStub.sendTabMessage).toHaveBeenCalledWith(123, {
      type: 'SHOW_PREVIEW',
      result: { dataUrl: 'data:image/png;base64,partial', width: 1000, height: 1500, mode: 'fullPage', partial: true }
    }));
    expect(chromeStub.captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(timeoutResponse).toHaveBeenCalledWith({ ok: true });
    vi.useRealTimers();
  });

  it('sends a full-page retry error when the session times out before any image is captured', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'));
    const chromeStub = installChromeStub();
    await import('../service-worker');

    const sender = { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab };
    runtimeListener?.({
      type: 'FULL_PAGE_PLAN_READY',
      chunks: [{ scrollY: 0, height: 500 }],
      pageWidth: 1000,
      pageHeight: 500,
      devicePixelRatio: 1
    } satisfies ContentToBackgroundMessage, sender, vi.fn());

    vi.setSystemTime(new Date('2026-05-10T00:00:31.000Z'));
    const timeoutResponse = vi.fn();
    const timeoutHandled = runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 0, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, timeoutResponse);

    expect(timeoutHandled).toBe(true);
    await vi.waitFor(() => expect(chromeStub.sendTabMessage).toHaveBeenCalledWith(123, {
      type: 'SHOW_ERROR',
      message: 'Full page capture timed out before any image was captured.',
      retryMode: 'fullPage'
    }));
    expect(chromeStub.captureVisibleTab).not.toHaveBeenCalled();
    expect(timeoutResponse).toHaveBeenCalledWith({ ok: false, message: 'Full page capture timed out before any image was captured.' });
    vi.useRealTimers();
  });

  it('does not let a stale final merge target a newer full-page session', async () => {
    const chromeStub = installChromeStub();
    let resolveOldCapture: ((value: string) => void) | undefined;
    chromeStub.captureVisibleTab.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOldCapture = resolve;
    }));
    await import('../service-worker');

    const sender = { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab };
    runtimeListener?.({
      type: 'FULL_PAGE_PLAN_READY',
      chunks: [{ scrollY: 0, height: 500 }],
      pageWidth: 1000,
      pageHeight: 500,
      devicePixelRatio: 1
    } satisfies ContentToBackgroundMessage, sender, vi.fn());
    runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 0, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, vi.fn());
    await vi.waitFor(() => expect(chromeStub.captureVisibleTab).toHaveBeenCalledTimes(1));

    runtimeListener?.({
      type: 'FULL_PAGE_PLAN_READY',
      chunks: [{ scrollY: 0, height: 500 }],
      pageWidth: 800,
      pageHeight: 500,
      devicePixelRatio: 1
    } satisfies ContentToBackgroundMessage, sender, vi.fn());

    chromeStub.sendRuntimeMessage.mockResolvedValueOnce({
      type: 'IMAGE_PROCESSED',
      result: { dataUrl: 'data:image/png;base64,old-merged', width: 1000, height: 500, mode: 'drag' }
    });
    resolveOldCapture?.('data:image/png;base64,old');
    await vi.waitFor(() => expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'MERGE_VERTICAL_IMAGES',
      images: [{ dataUrl: 'data:image/png;base64,old', y: 0, height: 500 }],
      width: 1000,
      height: 500,
      sourceWidth: 1000
    }));

    chromeStub.captureVisibleTab.mockResolvedValueOnce('data:image/png;base64,new');
    chromeStub.sendRuntimeMessage.mockResolvedValueOnce({
      type: 'IMAGE_PROCESSED',
      result: { dataUrl: 'data:image/png;base64,new-merged', width: 800, height: 500, mode: 'drag' }
    });
    const newResponse = vi.fn();
    const newHandled = runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 0, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, newResponse);

    expect(newHandled).toBe(true);
    await vi.waitFor(() => expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'MERGE_VERTICAL_IMAGES',
      images: [{ dataUrl: 'data:image/png;base64,new', y: 0, height: 500 }],
      width: 800,
      height: 500,
      sourceWidth: 800
    }));
    await vi.waitFor(() => expect(newResponse).toHaveBeenCalledWith({ ok: true }));
  });

  it('does not let a stale partial merge clear a newer full-page session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'));
    const chromeStub = installChromeStub();
    chromeStub.captureVisibleTab.mockResolvedValueOnce('data:image/png;base64,old');
    let resolveMerge: ((value: unknown) => void) | undefined;
    chromeStub.sendRuntimeMessage.mockImplementation(() => new Promise((resolve) => {
      resolveMerge = resolve;
    }));
    await import('../service-worker');

    const sender = { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab };
    runtimeListener?.({
      type: 'FULL_PAGE_PLAN_READY',
      chunks: [{ scrollY: 0, height: 500 }, { scrollY: 500, height: 500 }],
      pageWidth: 1000,
      pageHeight: 1000,
      devicePixelRatio: 1
    } satisfies ContentToBackgroundMessage, sender, vi.fn());
    const firstResponse = vi.fn();
    runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 0, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, firstResponse);
    await vi.waitFor(() => expect(firstResponse).toHaveBeenCalledWith({ ok: true }));

    vi.setSystemTime(new Date('2026-05-10T00:00:31.000Z'));
    runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 500, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, vi.fn());
    await vi.waitFor(() => expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'MERGE_VERTICAL_IMAGES',
      images: [{ dataUrl: 'data:image/png;base64,old', y: 0, height: 500 }],
      width: 1000,
      height: 1000,
      sourceWidth: 1000
    }));

    vi.setSystemTime(new Date('2026-05-10T00:00:31.100Z'));
    runtimeListener?.({
      type: 'FULL_PAGE_PLAN_READY',
      chunks: [{ scrollY: 0, height: 500 }],
      pageWidth: 800,
      pageHeight: 500,
      devicePixelRatio: 1
    } satisfies ContentToBackgroundMessage, sender, vi.fn());

    resolveMerge?.({ type: 'IMAGE_PROCESSED', result: { dataUrl: 'data:image/png;base64,old-merged', width: 1000, height: 1000, mode: 'drag' } });
    await vi.waitFor(() => expect(chromeStub.sendTabMessage).not.toHaveBeenCalledWith(123, {
      type: 'SHOW_PREVIEW',
      result: { dataUrl: 'data:image/png;base64,old-merged', width: 1000, height: 1000, mode: 'fullPage', partial: true }
    }));

    chromeStub.captureVisibleTab.mockResolvedValueOnce('data:image/png;base64,new');
    chromeStub.sendRuntimeMessage.mockResolvedValueOnce({
      type: 'IMAGE_PROCESSED',
      result: { dataUrl: 'data:image/png;base64,new-merged', width: 800, height: 500, mode: 'drag' }
    });
    const newResponse = vi.fn();
    const newHandled = runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 0, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, newResponse);

    expect(newHandled).toBe(true);
    await vi.waitFor(() => expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'MERGE_VERTICAL_IMAGES',
      images: [{ dataUrl: 'data:image/png;base64,new', y: 0, height: 500 }],
      width: 800,
      height: 500,
      sourceWidth: 800
    }));
    await vi.waitFor(() => expect(newResponse).toHaveBeenCalledWith({ ok: true }));
    vi.useRealTimers();
  });

  it('does not let a stale failed partial merge clear a newer full-page session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'));
    const chromeStub = installChromeStub();
    chromeStub.captureVisibleTab.mockResolvedValueOnce('data:image/png;base64,old');
    let rejectMerge: ((reason: unknown) => void) | undefined;
    chromeStub.sendRuntimeMessage.mockImplementation(() => new Promise((_, reject) => {
      rejectMerge = reject;
    }));
    await import('../service-worker');

    const sender = { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab };
    runtimeListener?.({
      type: 'FULL_PAGE_PLAN_READY',
      chunks: [{ scrollY: 0, height: 500 }, { scrollY: 500, height: 500 }],
      pageWidth: 1000,
      pageHeight: 1000,
      devicePixelRatio: 1
    } satisfies ContentToBackgroundMessage, sender, vi.fn());
    const firstResponse = vi.fn();
    runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 0, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, firstResponse);
    await vi.waitFor(() => expect(firstResponse).toHaveBeenCalledWith({ ok: true }));

    vi.setSystemTime(new Date('2026-05-10T00:00:31.000Z'));
    runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 500, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, vi.fn());
    await vi.waitFor(() => expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'MERGE_VERTICAL_IMAGES',
      images: [{ dataUrl: 'data:image/png;base64,old', y: 0, height: 500 }],
      width: 1000,
      height: 1000,
      sourceWidth: 1000
    }));

    vi.setSystemTime(new Date('2026-05-10T00:00:31.100Z'));
    runtimeListener?.({
      type: 'FULL_PAGE_PLAN_READY',
      chunks: [{ scrollY: 0, height: 500 }],
      pageWidth: 800,
      pageHeight: 500,
      devicePixelRatio: 1
    } satisfies ContentToBackgroundMessage, sender, vi.fn());

    rejectMerge?.(new Error('old merge failed'));
    await vi.waitFor(() => expect(chromeStub.sendTabMessage).not.toHaveBeenCalledWith(123, {
      type: 'SHOW_ERROR',
      message: 'old merge failed',
      retryMode: 'fullPage'
    }));

    chromeStub.captureVisibleTab.mockResolvedValueOnce('data:image/png;base64,new');
    chromeStub.sendRuntimeMessage.mockResolvedValueOnce({
      type: 'IMAGE_PROCESSED',
      result: { dataUrl: 'data:image/png;base64,new-merged', width: 800, height: 500, mode: 'drag' }
    });
    const newResponse = vi.fn();
    const newHandled = runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 0, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, newResponse);

    expect(newHandled).toBe(true);
    await vi.waitFor(() => expect(chromeStub.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'MERGE_VERTICAL_IMAGES',
      images: [{ dataUrl: 'data:image/png;base64,new', y: 0, height: 500 }],
      width: 800,
      height: 500,
      sourceWidth: 800
    }));
    await vi.waitFor(() => expect(newResponse).toHaveBeenCalledWith({ ok: true }));
    vi.useRealTimers();
  });

  it('clears full-page session on capture cancellation', async () => {
    const chromeStub = installChromeStub();
    await import('../service-worker');

    const sender = { tab: { id: 123, windowId: 456, active: true } as chrome.tabs.Tab };
    runtimeListener?.({
      type: 'FULL_PAGE_PLAN_READY',
      chunks: [{ scrollY: 0, height: 500 }],
      pageWidth: 1000,
      pageHeight: 500,
      devicePixelRatio: 1
    } satisfies ContentToBackgroundMessage, sender, vi.fn());
    runtimeListener?.({ type: 'CAPTURE_CANCELLED' } satisfies ContentToBackgroundMessage, sender, vi.fn());

    const handled = runtimeListener?.({ type: 'FULL_PAGE_SCROLLED', scrollY: 0, viewportHeight: 500 } satisfies ContentToBackgroundMessage, sender, vi.fn());

    expect(handled).toBe(false);
    expect(chromeStub.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('returns capture UI unavailable when content script injection fails', async () => {
    const chromeStub = installChromeStub();
    vi.mocked(chrome.scripting.executeScript).mockRejectedValue(new Error('Cannot access page'));
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 123, url: 'https://example.com', active: true } as chrome.tabs.Tab]);
    await import('../service-worker');

    const sendResponse = vi.fn();
    const handled = runtimeListener?.({ type: 'START_CAPTURE', mode: 'drag' }, {}, sendResponse);

    expect(handled).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: false, message: '이 페이지에서는 캡처 UI를 실행할 수 없습니다.' }));
    expect(chromeStub.sendTabMessage).not.toHaveBeenCalled();
  });
});
