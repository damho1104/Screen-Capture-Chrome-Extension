import './styles.css';
import type { PopupToBackgroundMessage } from '../shared/messages';
import type { CaptureMode } from '../shared/types';

const MODES: Array<{ mode: CaptureMode; label: string; description: string }> = [
  { mode: 'drag', label: '드래그 캡처', description: '원하는 사각형 영역을 직접 선택합니다.' },
  { mode: 'element', label: '영역 선택 캡처', description: '마우스로 가리킨 페이지 요소를 선택합니다.' },
  { mode: 'fullPage', label: '전체 페이지 캡처', description: '긴 페이지를 스크롤하며 하나의 이미지로 만듭니다.' }
];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Popup root element was not found.');

function setStatus(message: string, kind: 'idle' | 'error' | 'success' = 'idle'): void {
  const status = document.querySelector<HTMLParagraphElement>('[data-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

async function startCapture(mode: CaptureMode): Promise<void> {
  setStatus('캡처를 준비하는 중입니다.');
  const message: PopupToBackgroundMessage = { type: 'START_CAPTURE', mode };

  try {
    const response = await chrome.runtime.sendMessage(message);

    if (response?.ok) {
      setStatus('현재 탭에서 캡처를 시작했습니다.', 'success');
      window.close();
      return;
    }

    setStatus(response?.message ?? '캡처를 시작할 수 없습니다.', 'error');
  } catch {
    setStatus('캡처를 시작할 수 없습니다.', 'error');
  }
}

app.innerHTML = `
  <section class="popup">
    <h1>화면 캡처</h1>
    <div class="mode-list">
      ${MODES.map(
        (item) => `
          <button class="mode-button" type="button" data-mode="${item.mode}">
            <strong>${item.label}</strong>
            <span>${item.description}</span>
          </button>
        `
      ).join('')}
    </div>
    <p class="status" data-status data-kind="idle">캡처 방식을 선택하세요.</p>
  </section>
`;

for (const button of app.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
  button.addEventListener('click', () => {
    void startCapture(button.dataset.mode as CaptureMode);
  });
}
