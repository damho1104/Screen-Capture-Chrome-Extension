import type { BackgroundToContentMessage } from '../shared/messages';
import { startDragCapture } from './drag-capture';
import { startElementCapture } from './element-capture';
import { startFullPageCapture } from './full-page';
import { createOverlayHost, installBaseStyles, showMessageOverlay } from './overlay';
import { showPreview } from './preview';

let cleanupCurrentFlow: (() => void) | null = null;

function cleanup(): void {
  cleanupCurrentFlow?.();
  cleanupCurrentFlow = null;
}

function showPlaceholder(label: string): void {
  cleanup();
  const overlay = createOverlayHost();
  installBaseStyles(overlay.root);

  const backdrop = document.createElement('div');
  backdrop.className = 'capture-backdrop';

  const toolbar = document.createElement('div');
  toolbar.className = 'capture-toolbar';
  toolbar.textContent = `${label} 준비됨. ESC로 취소`;

  overlay.root.append(backdrop, toolbar);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') cleanup();
  };

  document.addEventListener('keydown', onKeyDown, true);
  cleanupCurrentFlow = () => {
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
  };
}

chrome.runtime.onMessage.addListener((message: BackgroundToContentMessage, _sender, sendResponse?: (response?: unknown) => void) => {
  const respond = (): void => {
    sendResponse?.({ ok: true });
  };

  if (message.type === 'BEGIN_DRAG_CAPTURE') {
    cleanup();
    cleanupCurrentFlow = startDragCapture();
    respond();
    return false;
  }
  if (message.type === 'BEGIN_ELEMENT_CAPTURE') {
    cleanup();
    cleanupCurrentFlow = startElementCapture();
    respond();
    return false;
  }
  if (message.type === 'BEGIN_FULL_PAGE_CAPTURE') {
    cleanup();
    cleanupCurrentFlow = startFullPageCapture();
    respond();
    return false;
  }
  if (message.type === 'SHOW_PREVIEW') {
    cleanup();
    cleanupCurrentFlow = showPreview(message.result, message.result.mode);
    respond();
    return false;
  }
  if (message.type === 'SHOW_ERROR') {
    cleanup();
    cleanupCurrentFlow = showMessageOverlay(message.message);
    respond();
    return false;
  }

  return false;
});
