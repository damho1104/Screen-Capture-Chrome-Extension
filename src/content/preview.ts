import type { ContentToBackgroundMessage } from '../shared/messages';
import type { CaptureMode, CaptureResult } from '../shared/types';
import { createOverlayHost, installBaseStyles } from './overlay';

export function showPreview(result: CaptureResult, retryMode: CaptureMode): () => void {
  const overlay = createOverlayHost();
  overlay.host.style.background = 'rgba(15, 23, 42, 0.82)';
  overlay.host.style.cursor = 'default';
  installBaseStyles(overlay.root);

  const style = document.createElement('style');
  style.textContent = `
    .preview-backdrop {
      position: fixed;
      inset: 0;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 12px;
      padding: 16px;
      background: rgba(15, 23, 42, 0.82);
      font: 13px system-ui, sans-serif;
      color: #fff;
    }
    .preview-actions {
      display: grid;
      grid-template-columns: repeat(4, 112px);
      justify-content: center;
      gap: 10px;
      padding: 10px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.74);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(14px);
    }
    .preview-button {
      width: 112px;
      height: 40px;
      border: 1px solid transparent;
      border-radius: 12px;
      padding: 0 12px;
      cursor: pointer;
      font: 600 13px system-ui, sans-serif;
      transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease;
    }
    .preview-button:hover {
      transform: translateY(-1px);
    }
    .preview-button:active {
      transform: translateY(0);
    }
    .preview-button:focus-visible {
      outline: 2px solid rgba(226, 232, 240, 0.95);
      outline-offset: 2px;
    }
    .preview-button-primary {
      color: #0f172a;
      background: #f8fafc;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.22);
    }
    .preview-button-primary:hover {
      background: #ffffff;
    }
    .preview-button-secondary {
      color: #e5e7eb;
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.18);
    }
    .preview-button-secondary:hover {
      background: rgba(255, 255, 255, 0.14);
    }
    @media (max-width: 560px) {
      .preview-actions {
        grid-template-columns: repeat(2, 112px);
      }
    }
    .preview-stage {
      min-height: 0;
      display: grid;
      place-items: center;
      overflow: auto;
    }
    .preview-image {
      max-width: 100%;
      height: auto;
      background: #fff;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    }
    .preview-status {
      min-height: 18px;
      text-align: center;
      color: #d1d5db;
    }
  `;

  const backdrop = document.createElement('div');
  backdrop.className = 'preview-backdrop';

  const actions = document.createElement('div');
  actions.className = 'preview-actions';

  const copyButton = createButton('복사', 'primary');
  const saveButton = createButton('저장', 'primary');
  const retryButton = createButton('다시 캡처', 'secondary');
  const closeButton = createButton('닫기', 'secondary');
  actions.append(copyButton, saveButton, retryButton, closeButton);

  const stage = document.createElement('div');
  stage.className = 'preview-stage';

  const image = document.createElement('img');
  image.className = 'preview-image';
  image.src = result.dataUrl;
  image.alt = '캡처 미리보기';
  image.addEventListener('error', () => {
    console.error('[screen-capture] preview:image-error');
    status.textContent = '미리보기 이미지를 표시할 수 없습니다.';
  });
  stage.append(image);

  const status = document.createElement('p');
  status.className = 'preview-status';
  status.textContent = result.partial ? '일부 영역만 캡처되었습니다.' : '';

  backdrop.append(actions, stage, status);
  overlay.root.append(style, backdrop);

  saveButton.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'PREVIEW_SAVE_REQUESTED', dataUrl: result.dataUrl } satisfies ContentToBackgroundMessage);
  });

  copyButton.addEventListener('click', async () => {
    try {
      const blob = await (await fetch(result.dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      cleanup();
    } catch {
      status.textContent = '복사에 실패했습니다. 저장 버튼을 사용하세요.';
    }
  });

  retryButton.addEventListener('click', () => {
    cleanup();
    void chrome.runtime.sendMessage({ type: 'PREVIEW_RETRY_REQUESTED', mode: retryMode } satisfies ContentToBackgroundMessage);
  });

  closeButton.addEventListener('click', () => cleanup());

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') cleanup();
  };

  document.addEventListener('keydown', onKeyDown, true);

  function cleanup(): void {
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
  }

  return cleanup;
}

function createButton(label: string, variant: 'primary' | 'secondary'): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `preview-button preview-button-${variant}`;
  button.type = 'button';
  button.textContent = label;
  return button;
}
