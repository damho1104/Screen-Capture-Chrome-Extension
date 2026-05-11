# 화면 캡처 Chrome 확장 프로그램

[English README](README.en.md)

NAVER Whale 브라우저의 기본 화면 캡처 기능을 참고해 만든 Manifest V3 기반 Chrome 확장 프로그램입니다. 현재 탭에서 드래그 영역, HTML 요소, 전체 페이지를 캡처하고, 결과를 현재 탭 위 미리보기 화면에서 확인한 뒤 복사하거나 저장할 수 있습니다.

## 주요 기능

- **드래그 영역 캡처**: 현재 보이는 화면에서 드래그한 영역을 캡처합니다.
- **HTML 요소 캡처**: 선택한 요소의 전체 영역을 캡처합니다. 화면 밖으로 이어지는 요소 영역도 포함합니다.
- **전체 페이지 캡처**: 페이지를 스크롤하며 여러 화면을 이어 붙여 하나의 이미지로 만듭니다.
- **현재 탭 미리보기**: 캡처 결과를 새 탭이 아니라 현재 탭 위 overlay로 보여줍니다.
- **클립보드 복사**: 미리보기에서 PNG 이미지를 클립보드에 복사합니다.
- **PNG 저장**: 캡처 결과를 파일로 다운로드합니다.
- **다시 캡처**: 미리보기에서 이전 캡처 모드로 바로 재시도합니다.
- **제한 페이지 안내**: Chrome 정책상 주입/캡처가 제한되는 페이지에서는 안내 메시지를 표시합니다.

## 기술 스택

- Vite
- TypeScript
- Chrome Extension Manifest V3
- Offscreen document + `OffscreenCanvas`
- Vitest + jsdom

## 시작하기

의존성을 설치합니다.

```bash
npm install
```

확장 프로그램을 빌드합니다.

```bash
npm run build
```

Chrome에서 확장 프로그램을 로드합니다.

1. `chrome://extensions`를 엽니다.
2. **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 누릅니다.
4. 생성된 `dist/` 디렉터리를 선택합니다.

코드를 다시 빌드한 뒤에는 `chrome://extensions`에서 확장 프로그램을 reload하고, 테스트할 대상 탭도 새로고침해야 최신 코드가 반영됩니다.

## 개발 명령어

프로덕션 빌드:

```bash
npm run build
```

watch 빌드:

```bash
npm run dev
```

테스트 실행:

```bash
npm test
```

TypeScript 타입 검사:

```bash
npm run typecheck
```

## 프로젝트 구조

```text
src/background/    서비스 워커, Chrome API 호출, 캡처 오케스트레이션
src/content/       페이지 overlay, 선택 UX, 미리보기 UI, 스크롤 제어
src/offscreen/     이미지 crop/merge 처리를 위한 offscreen document
src/popup/         확장 프로그램 popup UI
src/shared/        공용 타입, 메시지, 좌표 계산, 파일명, 세션 유틸
manual-test-pages/ 수동 테스트용 로컬 HTML 페이지
```

## 캡처 흐름

1. popup에서 background service worker에 캡처 모드 시작을 요청합니다.
2. background는 필요할 때 현재 탭에 content script를 programmatic injection으로 주입합니다.
3. content script는 선택 overlay, 진행 상태, 스크롤, 미리보기 UI를 담당합니다.
4. background는 `chrome.tabs.captureVisibleTab`으로 현재 탭 이미지를 캡처합니다.
5. offscreen document는 `OffscreenCanvas`로 crop 또는 stitch 작업을 수행합니다.
6. content preview overlay에서 복사, 저장, 다시 캡처, 닫기 동작을 제공합니다.

## 수동 테스트 참고사항

- 변경 후에는 항상 `npm run build`를 실행합니다.
- Chrome 확장 프로그램 관리 화면에서 unpacked extension을 reload합니다.
- 테스트 대상 웹 페이지도 새로고침합니다.
- 일반 페이지, 긴 페이지, sticky/fixed 요소가 있는 페이지를 함께 확인합니다.
- Chrome 내부 페이지나 일부 제한 URL은 content script 주입이 막힐 수 있습니다.
- service worker, offscreen document, content page의 콘솔은 서로 다른 DevTools 컨텍스트에서 확인해야 합니다.

## 권한 정책

정적 host permission과 정적 content script는 사용하지 않습니다. 현재 탭에 대한 사용자 제스처 기반 권한인 `activeTab`과 programmatic injection을 사용합니다.

```json
["activeTab", "scripting", "downloads", "offscreen", "clipboardWrite"]
```
