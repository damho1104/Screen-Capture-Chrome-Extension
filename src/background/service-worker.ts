import { createCaptureFilename } from '../shared/filename';
import { scaleRect } from '../shared/geometry';
import { getRestrictedUrlReason } from '../shared/restricted-url';
import type {
  BackgroundToContentMessage,
  BackgroundToOffscreenMessage,
  ContentToBackgroundMessage,
  OffscreenToBackgroundMessage,
  PopupToBackgroundMessage
} from '../shared/messages';
import type { CaptureResult, Rect, Size } from '../shared/types';

const CAPTURE_UI_UNAVAILABLE_MESSAGE = '이 페이지에서는 캡처 UI를 실행할 수 없습니다.';
const RESTRICTED_CAPTURE_MESSAGE = 'Chrome 보안 정책으로 인해 이 페이지는 캡처할 수 없습니다.';
const CAPTURE_START_UNAVAILABLE_MESSAGE = '캡처를 시작할 수 없습니다.';
const FULL_PAGE_TIMEOUT_MS = 30000;

type CaptureStartResponse = { ok: true } | { ok: false; message: string };
type CaptureMode = PopupToBackgroundMessage['mode'];
type FullPageImage = { dataUrl: string; y: number; height: number };
type FullPageSession = { pageWidth: number; pageHeight: number; sourceWidth: number; images: FullPageImage[]; startedAt: number };
type ElementSession = { documentRect: Rect; pageWidth: number; pageHeight: number; sourceWidth: number; images: FullPageImage[] };

type CaptureStartMessageType = Extract<BackgroundToContentMessage['type'], 'BEGIN_DRAG_CAPTURE' | 'BEGIN_ELEMENT_CAPTURE' | 'BEGIN_FULL_PAGE_CAPTURE'>;

const typeByMode: Record<CaptureMode, CaptureStartMessageType> = {
  drag: 'BEGIN_DRAG_CAPTURE',
  element: 'BEGIN_ELEMENT_CAPTURE',
  fullPage: 'BEGIN_FULL_PAGE_CAPTURE'
};

function isCaptureMode(mode: unknown): mode is CaptureMode {
  return mode === 'drag' || mode === 'element' || mode === 'fullPage';
}

function isPopupToBackgroundMessage(message: unknown): message is PopupToBackgroundMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'START_CAPTURE' &&
    'mode' in message &&
    isCaptureMode(message.mode)
  );
}

function isRect(value: unknown): value is Rect {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    'width' in value &&
    'height' in value &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  );
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isSize(value: unknown): value is Size {
  return (
    typeof value === 'object' &&
    value !== null &&
    'width' in value &&
    'height' in value &&
    isPositiveFiniteNumber(value.width) &&
    isPositiveFiniteNumber(value.height)
  );
}

function isContentToBackgroundMessage(message: unknown): message is ContentToBackgroundMessage {
  if (typeof message !== 'object' || message === null || !('type' in message)) return false;
  if (message.type === 'CAPTURE_CANCELLED') return true;
  if (message.type === 'DRAG_AREA_SELECTED') {
    return 'rect' in message && isRect(message.rect) && 'viewport' in message && isSize(message.viewport);
  }
  if (message.type === 'ELEMENT_CAPTURE_STARTED') {
    return (
      'chunks' in message &&
      Array.isArray(message.chunks) &&
      'documentRect' in message &&
      isRect(message.documentRect) &&
      'pageWidth' in message &&
      isPositiveFiniteNumber(message.pageWidth) &&
      'pageHeight' in message &&
      isPositiveFiniteNumber(message.pageHeight) &&
      'devicePixelRatio' in message &&
      isPositiveFiniteNumber(message.devicePixelRatio)
    );
  }
  if (message.type === 'ELEMENT_CAPTURE_SCROLLED') {
    return (
      'scrollY' in message &&
      typeof message.scrollY === 'number' &&
      Number.isFinite(message.scrollY) &&
      'viewportHeight' in message &&
      isPositiveFiniteNumber(message.viewportHeight)
    );
  }
  if (message.type === 'FULL_PAGE_PLAN_READY') {
    return (
      'chunks' in message &&
      Array.isArray(message.chunks) &&
      'pageWidth' in message &&
      isPositiveFiniteNumber(message.pageWidth) &&
      'pageHeight' in message &&
      isPositiveFiniteNumber(message.pageHeight) &&
      'devicePixelRatio' in message &&
      isPositiveFiniteNumber(message.devicePixelRatio)
    );
  }
  if (message.type === 'FULL_PAGE_SCROLLED') {
    return (
      'scrollY' in message &&
      typeof message.scrollY === 'number' &&
      Number.isFinite(message.scrollY) &&
      'viewportHeight' in message &&
      isPositiveFiniteNumber(message.viewportHeight)
    );
  }
  if (message.type === 'PREVIEW_SAVE_REQUESTED') {
    return 'dataUrl' in message && typeof message.dataUrl === 'string';
  }
  if (message.type === 'PREVIEW_RETRY_REQUESTED') {
    return 'mode' in message && isCaptureMode(message.mode);
  }
  return false;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function sendCaptureStart(mode: CaptureMode): Promise<CaptureStartResponse> {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, message: '활성 탭을 찾을 수 없습니다.' };

  const restrictedReason = getRestrictedUrlReason(tab.url);
  if (restrictedReason) return { ok: false, message: RESTRICTED_CAPTURE_MESSAGE };

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['assets/content.js']
    });
    await chrome.tabs.sendMessage(tab.id, { type: typeByMode[mode] });
    return { ok: true };
  } catch {
    return { ok: false, message: CAPTURE_UI_UNAVAILABLE_MESSAGE };
  }
}

let creatingOffscreenDocument: Promise<void> | undefined;
const fullPageSessions = new Map<number, FullPageSession>();
const elementSessions = new Map<number, ElementSession>();

export async function ensureOffscreenDocument(): Promise<void> {
  const offscreenPath = 'src/offscreen/index.html';
  const offscreenUrl = chrome.runtime.getURL(offscreenPath);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) return;

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: offscreenPath,
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: 'Process captured tab images for crop and full-page merge.'
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = undefined;
  }
}

function isOffscreenResponse(response: unknown): response is OffscreenToBackgroundMessage {
  return (
    typeof response === 'object' &&
    response !== null &&
    'type' in response &&
    (response.type === 'IMAGE_PROCESSED' || response.type === 'IMAGE_PROCESSING_FAILED')
  );
}

export async function processCrop(
  dataUrl: string,
  rect: Rect,
  mode: Extract<CaptureMode, 'drag' | 'element'> = 'drag',
  viewport?: Size
): Promise<CaptureResult> {
  await ensureOffscreenDocument();

  const message: BackgroundToOffscreenMessage = { type: 'CROP_IMAGE', dataUrl, rect, viewport };
  const response: unknown = await chrome.runtime.sendMessage(message);

  if (!isOffscreenResponse(response)) {
    throw new Error('Image crop failed.');
  }

  if (response.type === 'IMAGE_PROCESSING_FAILED') {
    throw new Error(response.message);
  }

  return { ...response.result, mode };
}

async function captureVisibleTab(windowId: number): Promise<string> {
  return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}

async function saveDataUrl(dataUrl: string): Promise<void> {
  await chrome.downloads.download({
    url: dataUrl,
    filename: createCaptureFilename(),
    saveAs: true
  });
}

async function showPreview(tabId: number, result: CaptureResult): Promise<void> {
  await chrome.tabs.sendMessage(tabId, { type: 'SHOW_PREVIEW', result } satisfies BackgroundToContentMessage);
}

async function showCaptureError(tabId: number, message: string, retryMode: CaptureMode): Promise<void> {
  await chrome.tabs.sendMessage(tabId, { type: 'SHOW_ERROR', message, retryMode } satisfies BackgroundToContentMessage);
}

async function mergeFullPage(tabId: number, partial = false, session = fullPageSessions.get(tabId)): Promise<void> {
  if (!session) throw new Error('Full-page capture session was not found.');

  try {
    await ensureOffscreenDocument();
    const message: BackgroundToOffscreenMessage = {
      type: 'MERGE_VERTICAL_IMAGES',
      images: session.images,
      width: session.pageWidth,
      height: session.pageHeight,
      sourceWidth: session.sourceWidth
    };
    const response: unknown = await chrome.runtime.sendMessage(message);

    if (!isOffscreenResponse(response)) {
      throw new Error('Full-page image merge failed.');
    }

    if (response.type === 'IMAGE_PROCESSING_FAILED') {
      throw new Error(response.message);
    }

    if (fullPageSessions.get(tabId) === session) {
      await showPreview(tabId, { ...response.result, mode: 'fullPage', partial });
    }
  } finally {
    if (fullPageSessions.get(tabId) === session) {
      fullPageSessions.delete(tabId);
    }
  }
}

async function mergeElementSession(tabId: number, session: ElementSession): Promise<void> {
  await ensureOffscreenDocument();
  const mergeMessage: BackgroundToOffscreenMessage = {
    type: 'MERGE_VERTICAL_IMAGES',
    images: session.images,
    width: session.pageWidth,
    height: session.pageHeight,
    sourceWidth: session.sourceWidth,
    outputScale: session.sourceWidth / session.pageWidth
  };
  const mergeResponse: unknown = await chrome.runtime.sendMessage(mergeMessage);

  if (!isOffscreenResponse(mergeResponse)) throw new Error('Element image merge failed.');
  if (mergeResponse.type === 'IMAGE_PROCESSING_FAILED') throw new Error(mergeResponse.message);

  const scale = session.sourceWidth / session.pageWidth;
  const result = await processCrop(mergeResponse.result.dataUrl, scaleRect(session.documentRect, scale), 'element');
  if (elementSessions.get(tabId) === session) {
    await showPreview(tabId, result);
  }
}

async function handleElementScrolled(tab: chrome.tabs.Tab, scrollY: number, viewportHeight: number): Promise<ElementSession | null> {
  if (!tab.id || typeof tab.windowId !== 'number' || tab.active !== true) {
    throw new Error(CAPTURE_START_UNAVAILABLE_MESSAGE);
  }

  const session = elementSessions.get(tab.id);
  if (!session) throw new Error(CAPTURE_START_UNAVAILABLE_MESSAGE);

  const dataUrl = await captureVisibleTab(tab.windowId);
  session.images.push({ dataUrl, y: scrollY, height: viewportHeight });
  const elementBottom = session.documentRect.y + session.documentRect.height;
  const capturedBottom = Math.max(...session.images.map((image) => image.y + image.height));
  return capturedBottom >= elementBottom ? session : null;
}

async function handleVisibleAreaSelected(
  tab: chrome.tabs.Tab,
  rect: Rect,
  viewport: Size,
  mode: Extract<CaptureMode, 'drag' | 'element'>
): Promise<void> {
  if (!tab.id || typeof tab.windowId !== 'number' || tab.active !== true) {
    throw new Error(CAPTURE_START_UNAVAILABLE_MESSAGE);
  }

  const dataUrl = await captureVisibleTab(tab.windowId);
  const result = await processCrop(dataUrl, rect, mode, viewport);
  await showPreview(tab.id, result);
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (typeof message !== 'object' || message === null || !('type' in message)) return false;

  if (message.type === 'START_CAPTURE') {
    if (!isPopupToBackgroundMessage(message)) {
      sendResponse({ ok: false, message: CAPTURE_START_UNAVAILABLE_MESSAGE });
      return false;
    }

    void sendCaptureStart(message.mode).then(sendResponse);
    return true;
  }

  if (!isContentToBackgroundMessage(message)) return false;

  if (message.type === 'CAPTURE_CANCELLED') {
    const tabId = sender.tab?.id;
    if (tabId) fullPageSessions.delete(tabId);
    return false;
  }

  if (message.type === 'DRAG_AREA_SELECTED') {
    const tab = sender.tab;
    if (!tab?.id) return false;

    const tabId = tab.id;
    void handleVisibleAreaSelected(tab, message.rect, message.viewport, 'drag')
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Capture failed.';
        void showCaptureError(tabId, errorMessage, 'drag');
        sendResponse({ ok: false, message: errorMessage });
      });
    return true;
  }

  if (message.type === 'ELEMENT_CAPTURE_STARTED') {
    const tabId = sender.tab?.id;
    if (!tabId) return false;

    elementSessions.set(tabId, {
      documentRect: message.documentRect,
      pageWidth: message.pageWidth,
      pageHeight: message.pageHeight,
      sourceWidth: Math.round(message.pageWidth * message.devicePixelRatio),
      images: []
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'ELEMENT_CAPTURE_SCROLLED') {
    const tab = sender.tab;
    if (!tab?.id || typeof tab.windowId !== 'number') return false;

    const tabId = tab.id;
    void handleElementScrolled(tab, message.scrollY, message.viewportHeight)
      .then((session) => {
        sendResponse({ ok: true });
        if (!session) return;

        void (async () => {
          try {
            await mergeElementSession(tabId, session);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Element capture failed.';
            void showCaptureError(tabId, errorMessage, 'element');
          } finally {
            if (elementSessions.get(tabId) === session) {
              elementSessions.delete(tabId);
            }
          }
        })();
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Element capture failed.';
        elementSessions.delete(tabId);
        void showCaptureError(tabId, errorMessage, 'element');
        sendResponse({ ok: false, message: errorMessage });
      });
    return true;
  }

  if (message.type === 'FULL_PAGE_PLAN_READY') {
    const tabId = sender.tab?.id;
    if (!tabId) return false;

    fullPageSessions.set(tabId, {
      pageWidth: message.pageWidth,
      pageHeight: message.pageHeight,
      sourceWidth: Math.round(message.pageWidth * message.devicePixelRatio),
      images: [],
      startedAt: Date.now()
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'FULL_PAGE_SCROLLED') {
    const tab = sender.tab;
    if (!tab?.id || typeof tab.windowId !== 'number') return false;

    const tabId = tab.id;
    const session = fullPageSessions.get(tabId);
    if (!session) return false;

    void (async () => {
      if (Date.now() - session.startedAt > FULL_PAGE_TIMEOUT_MS) {
        if (session.images.length > 0) {
          await mergeFullPage(tabId, true, session);
          sendResponse({ ok: true });
          return;
        }

        throw new Error('Full page capture timed out before any image was captured.');
      }

      const dataUrl = await captureVisibleTab(tab.windowId);
      session.images.push({
        dataUrl,
        y: message.scrollY,
        height: Math.max(0, Math.min(message.viewportHeight, session.pageHeight - message.scrollY))
      });

      if (message.scrollY + message.viewportHeight >= session.pageHeight) {
        await mergeFullPage(tabId, false, session);
      }

      sendResponse({ ok: true });
    })()
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Full-page capture failed.';
        if (fullPageSessions.get(tabId) === session) {
          fullPageSessions.delete(tabId);
          void showCaptureError(tabId, errorMessage, 'fullPage');
        }
        sendResponse({ ok: false, message: errorMessage });
      });
    return true;
  }

  if (message.type === 'PREVIEW_SAVE_REQUESTED') {
    void saveDataUrl(message.dataUrl)
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, message: error instanceof Error ? error.message : 'Save failed.' });
      });
    return true;
  }

  if (message.type === 'PREVIEW_RETRY_REQUESTED') {
    const tabId = sender.tab?.id;
    if (!tabId) return false;

    void chrome.tabs.sendMessage(tabId, { type: typeByMode[message.mode] } satisfies BackgroundToContentMessage)
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, message: error instanceof Error ? error.message : 'Retry failed.' });
      });
    return true;
  }

  return false;
});
