# 모바일 디자인 점검 — 2026-09-09

## 후속 개선

아래 초기 점검에서 확인한 세 가지 항목을 `4f3e27e` 이후 작업 트리에서 수정했다.

- **그리드 조작:** 메뉴의 절대 배치를 제거해 이미지 위를 덮지 않게 했다. 320/360/390/412px에서 4열과 48×48px 메뉴 버튼을 유지하며 겹침 면적은 모두 0이다. 썸네일 중앙 터치는 파일 선택, 메뉴 터치는 작업 메뉴, 폴더 이미지 터치는 폴더 이동으로 각각 검증했다.
- **파일명:** 카드 글자를 11px에서 13px로 키우고, 단일 선택 시 선택 막대에 16px 파일명을 표시한다. 긴 파일명은 두 줄로 제한하며 기존 Details에서 전체 키를 확인할 수 있다. 선택 해제와 긴 키 상세 열기까지 브라우저에서 검증했다.
- **짧은 화면:** 너비 480px 이하·높이 640px 이하에서는 전역 헤더를 한 줄로 배치한다. 프로필·메뉴·전송 기능을 유지하고 브랜드 링크는 Navigation의 기존 경로로 접근한다. Activity의 중복 연결 상태 배지를 없애고 제목과 Refresh를 함께 배치한다. Uploads의 중복 안내를 줄이되 선택 교체 및 업로드 불가 안내는 유지한다.

320×568에서 프로필 선택기는 y=58→5, Objects 검색 입력은 y=261→208, Activity 검색 입력은 y=334→246으로 이동했다. Uploads의 버킷 입력은 첫 화면 안에 표시된다. 업로드 prefix와 긴 콘텐츠는 스크롤로 접근하는 구조를 유지한다. 모든 값을 최초 렌더의 동일 모의 데이터로 비교했다.

후속 증빙: [그리드](mobile-design-audit-2026-09-09/fixed/objects-grid-320-light.png), [선택한 파일명](mobile-design-audit-2026-09-09/fixed/grid-center-tap-320.png), [Activity](mobile-design-audit-2026-09-09/fixed/jobs-320-light.png), [Uploads](mobile-design-audit-2026-09-09/fixed/uploads-320-light.png), [측정 집계](mobile-design-audit-2026-09-09/fixed/summary.json).

후속 검증은 로컬 production preview·모의 API·Chromium 범위다. 아래 Safari·키보드·실기기·대용량 다운로드 항목은 측정하지 않은 환경 경계이며 이 수정의 통과 결과로 대체하지 않는다.

| 후속 검증 | 결과 |
| --- | --- |
| 변경 소유자 단위 테스트 | 9개 파일, 31개 통과 |
| `npm run lint`, `npm run build`, `npm run check:e2e:geometry`, `git diff --check` | 통과 |
| 전체 `@mobile-responsive`, iPhone 13·Pixel 7 Chromium | 최종 128개 통과, skipped/flaky 0 |
| 전체 `@visual`, Chromium | 34개 통과; Bucket create 1개는 자산 로딩의 `ERR_NETWORK_CHANGED`로 실패 후 단독 재실행 통과 |
| `tests/wcag-reflow.spec.ts` | 320px 및 모의 200% 글자 확대 8개 통과 |
| `@check-smoke` | 로그인·Objects 진입 2개 통과 |
| 후속 화면 관찰 | 8화면 × 4너비 × 2테마 = 64개, 가로 넘침 0 |
| 의도된 기준 이미지 변경 | 그리드 1개, 짧은 Objects 1개, Activity 3개, Uploads 2개. 실제 캡처를 확인한 뒤 총 7개 갱신 |

후속 명령은 `frontend/`에서 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18137` production preview를 대상으로 실행했다.

```bash
rtk proxy npx playwright test --grep @mobile-responsive --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=2
rtk proxy npx playwright test --grep @visual --project=chromium --workers=2
rtk proxy npx playwright test tests/workflows-visual-regression.spec.ts --grep 'mobile Bucket create dialog' --project=chromium --workers=1
rtk proxy npx playwright test tests/wcag-reflow.spec.ts tests/design-audit-visual.spec.ts tests/mobile-current-audit.spec.ts --project=chromium --workers=2
```

단위 검사는 `ObjectsSelectionBar`, `useObjectsObjectGridRenderer`, `JobsToolbar`, `PageHeader`, `FullAppInner.smoke`, `UploadsSelectionSection`, `UploadsPageShell`, `buildUploadsPagePresentationProps`, `ObjectsToolbar`의 기존 스펙을 실행했다. 후속 관찰용 스펙은 `/tmp/s3desk-mobile-fix-20260909/mobile-current-audit.spec.ts`에 보관하고 테스트 디렉터리에서는 제거했다. 전체 로그는 같은 임시 디렉터리에 있으며 최종 집계와 주요 화면은 위 `fixed/` 증빙에 보존했다.

## 초기 점검

현재 코드의 주요 모바일 화면에서 페이지 가로 넘침이나 핵심 메뉴·팝업을 사용할 수 없는 큰 레이아웃 붕괴는 재현되지 않았다. 다만 **파일 그리드의 메뉴 터치 영역이 썸네일 중앙을 덮는 문제**를 재현했다. 작은 글자와 짧은 화면의 정보 밀도도 개선 대상으로 확인했다.

대상은 `96f179c02d00f2bf526138975c5cce2c7870adc5`에 기존 미커밋 서버 경유 다운로드 기본값 변경이 포함된 작업 트리다. 이번 점검에서는 제품 코드를 수정하지 않았다. 결과는 로컬 production preview와 모의 API에 대한 증거이며 운영 서버나 실기기 검증 결과가 아니다.

## 확인된 문제와 개선 우선순위

### 1. 우선 개선: 그리드의 이미지 중앙 터치가 작업 메뉴로 들어감

- 재현: Objects → Grid → `preview.png` 썸네일 중앙을 터치한다.
- 320, 360, 390, 412 CSS px 모두 중앙의 실제 hit target이 `Object actions for preview.png`였다. 실제 터치 후 작업 메뉴가 열리는 것까지 확인했다.
- 원인: 모바일에서 카드 상단 메뉴를 `position: absolute; top: 4px; right: 4px`로 이미지 위에 놓는 동시에 버튼 터치 영역은 48×48px을 유지한다. 작은 4열 카드에서는 눈에 보이는 `…`보다 훨씬 넓은 영역이 이미지를 가린다.
- 일반 카드 본문은 선택 동작을 갖지만 이미지 중앙은 메뉴 버튼이 이벤트를 받는다. 이미지가 모두 직접 미리보기를 열어야 한다는 새 요구를 전제한 판정은 아니다. 작은 아이콘과 실제 동작 영역이 크게 어긋나 있다는 조작 문제다.

| 화면 너비 | 썸네일 프레임 | 메뉴와 겹치는 면적 | 중앙 터치 결과 |
| --- | --- | --- | --- |
| 320px | 52.5×52.5px | 70.2% | 작업 메뉴 열림 |
| 360px | 62.5×62.5px | 49.6% | 작업 메뉴 열림 |
| 390px | 70×70px | 39.5% | 작업 메뉴 열림 |
| 412px | 75.5×75.5px | 34.0% | 작업 메뉴 열림 |

4열 요구와 충분한 터치 크기는 유지하면서 작업 메뉴를 미디어 영역 밖으로 옮기는 것이 적절하다. 기존 선택 도구 메뉴 활용을 먼저 검토한다.

근거: [터치 측정값](mobile-design-audit-2026-09-09/grid-touch-targets.json), [중앙 터치 후 메뉴 화면](mobile-design-audit-2026-09-09/grid-center-tap-320.png).
소유 코드: [카드 모바일 배치](../frontend/src/pages/objects/ObjectsGridCards.module.css), [메뉴 버튼과 카드 선택 처리](../frontend/src/pages/objects/useObjectsObjectGridRenderer.tsx).

현재 [모바일 이미지 미리보기 테스트](../frontend/tests/objects-mobile-responsive.spec.ts)의 `opens image preview directly from a mobile grid card`는 실제로 `…` → `Open large preview` 경로를 사용한다. 썸네일 중앙 터치는 검사하지 않으므로 기존 테스트 통과와 이 문제의 재현이 양립한다. 수정 시 중앙 터치와 메뉴 버튼 터치를 별도로 검증해야 한다.

### 2. 가독성 개선: 4열 파일명의 11px 글자와 두 줄 제한

320px에서 파일명 영역 너비는 60.5px, 글자는 11px이다. `preview.png`도 두 줄로 갈라지고 긴 키는 두 줄 뒤 생략된다. 작은 화면에서 이름이 비슷한 파일을 구분하기 어렵다. 390px에서도 파일명 글자는 11px이다.

이는 의도된 4열 표시의 제약이며 가로 넘침은 아니다. 열 수를 임의로 줄이기보다 선택한 파일명을 더 크게 보여주고 기존 상세 보기로 전체 키를 확인하는 흐름을 개선하는 편이 요구에 맞는다.

근거: [320px 그리드](mobile-design-audit-2026-09-09/objects-grid-320-light.png), [글자·영역 측정](mobile-design-audit-2026-09-09/objects-grid-320-light.json).
소유 코드: [gridCardTitle 및 모바일 규칙](../frontend/src/pages/objects/ObjectsGridCards.module.css), [글꼴 크기 토큰](../frontend/src/index.css).

### 3. 정보 밀도 개선: 320×568에서 실제 내용이 화면 아래쪽에 몰림

- Objects의 파일 영역은 약 y=361px부터 시작한다. 전역 헤더, 프로필 선택, 제목·업로드, 버킷 선택, 검색·보기 도구가 먼저 자리를 차지한다. 목록에서는 첫 파일의 이름과 메타데이터가 화면 하단에 나타난다.
- Activity의 연결 끊김 상태에서는 첫 작업 내용이 약 y=549px에 나타난다. 상태 표시, 경고, 상태별 필터, 검색, History 제목이 쌓인다.
- Uploads에서는 320×568의 첫 화면 아래로 업로드 목적지 입력이 이어진다. 390×844에서는 목적지와 prefix까지 보인다.

스크롤하면 접근할 수 있고 관련 동작 검사도 통과했으므로 기능 상실로 판정하지 않았다. 짧은 화면에서 상단 설명과 중복 상태 표시를 압축할 여지가 있다. Activity의 연결 끊김은 의도된 모의 API 상태이며 실제 서버 장애를 뜻하지 않는다.

근거: [Objects](mobile-design-audit-2026-09-09/objects-320-light.png), [Activity](mobile-design-audit-2026-09-09/jobs-320-light.png).
소유 코드: [전역 모바일 헤더](../frontend/src/FullAppInner.module.css), [Objects 화면](../frontend/src/pages/objects/ObjectsShell.module.css), [Activity 도구 영역](../frontend/src/pages/jobs/JobsToolbar.tsx).

## 미확정 우려와 실기기 검증 범위

| 항목 | 현재 확인한 사실 | 남은 확인 |
| --- | --- | --- |
| Safari·화면 키보드 | iPhone 프로젝트도 Chromium을 사용한다. WebKit 실행은 호스트 라이브러리 부족으로 실패했다. 로그인·검색 등 일부 입력의 실제 글자 크기는 14px이다. | 실제 iPhone Safari에서 입력 포커스, 화면 확대, 키보드가 열린 동안 입력·저장·닫기 버튼 접근을 확인해야 한다. 이번 결과만으로 자동 확대나 키보드 가림 발생을 확정하지 않는다. |
| 주소창·확대·화면 높이 | `dvh`와 safe-area 처리가 있고 회전·안전 영역 모의 검사는 통과했다. | 실제 키보드는 layout viewport를 그대로 두고 visual viewport만 줄일 수 있다. 단순 화면 크기 변경과 같은 검증으로 취급할 수 없다. [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) |
| 폴더 선택·기기 저장 | `deviceFs.ts`가 picker 지원과 secure context를 검사한다. 브라우저 다운로드 및 다중 선택 ZIP 대체 경로가 존재한다. | OS 파일 선택기와 다운로드 보관함으로의 실제 전달은 실기기 확인이 필요하다. `showDirectoryPicker`는 모든 주요 브라우저에서 동일하게 제공되는 API가 아니다. [MDN showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) |
| 큰 파일·백그라운드 | 일반 다운로드는 전체 응답을 Blob으로 받은 뒤 저장하고 재시도 시 진행량을 0으로 초기화한다. 서버 경유 기본값은 저장소 직접 접근 문제를 줄이지만 이 동작은 그대로다. | 대용량에서의 자원 부담, 앱 전환·화면 잠금 이후 유지 여부는 측정하지 않았다. 크기별 실기기 다운로드와 복귀 시나리오가 필요하다. 실제 메모리 사용량이나 실패 크기를 추정치로 단정하지 않는다. |

관련 소유 코드: [기기 파일 API](../frontend/src/lib/deviceFs.ts), [다운로드 저장 방식](../frontend/src/components/transfers/transferDownloadUtils.ts), [재시도](../frontend/src/components/transfers/useTransfersTaskActions.ts), [브라우저 프로젝트 정의](../frontend/playwright.config.ts).

## 검증 범위와 결과

| 검증 | 결과 |
| --- | --- |
| `npm run build` | 성공 |
| 모바일 동작: iPhone 13·Pixel 7 크기의 Chromium | 126개 통과, 건너뜀·실패·flaky 0 |
| 320px reflow, 모의 200% 글자 확대 | 8개 통과 |
| 기존 디자인 스냅샷 비교 | 10개 통과, 기준 이미지 갱신 없음 |
| 별도 화면 관찰 | 로그인, 프로필, 버킷, Objects 목록·그리드, 업로드, Activity, 설정의 8개 관찰 시나리오 완료 |
| 화면 너비·테마 조합 | 320/360/390/412px × light/dark × 8화면 = 64개 캡처·측정, 페이지 가로 넘침 0 |
| 그리드 중앙 터치 재현 | 4개 너비 모두 작업 메뉴가 중앙 터치를 받음. 재현 시나리오 완료는 제품 결함 해소를 뜻하지 않음 |
| 실제 Safari/WebKit | WebKit launch 실패: 호스트 의존성 `libgtk-4-1`, `libicu74` 등 부족. Safari 실기기 미실행 |
| 운영 URL·실기기 | 제공된 접속 주소 없음. 실서비스·실기기 결과로 확장하지 않음 |

모바일 동작 검사는 로그인과 토큰 교체, 프로필 카드·편집·가져오기, 버킷 검색·생성·정책·삭제, 파일 선택·폴더·검색·필터·미리보기·다운로드 링크, 업로드 선택·대기열, 작업 필터·상세·로그, 설정, 회전, reduced-motion, 모의 safe-area를 포함한다. 모든 OS·키보드·보조기술 조합을 검사한 것은 아니다.

측정 도구가 나열한 20px 체크박스 자체나 입력 내부 높이를 곧바로 터치 영역 위반으로 세지 않았다. 외곽 클릭 영역과 가려짐을 따로 보아야 한다. 기존 reflow 대상별 유효 터치 영역 검사는 통과했다.

## 재현과 증빙

`frontend/`에서 production preview를 시작한 뒤 다음 명령을 실행했다. 셸 명령은 저장소의 RTK 규칙을 따른다.

```bash
rtk proxy npm run build
rtk proxy npm run preview -- --host 127.0.0.1 --port 18137 --strictPort
rtk proxy env PLAYWRIGHT_BASE_URL=http://127.0.0.1:18137 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-mobile-audit-20260909/mobile PLAYWRIGHT_SCREENSHOT_MODE=on PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/s3desk-mobile-audit-20260909/mobile-results.json npx playwright test --grep @mobile-responsive --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=2 --reporter=list,json
rtk proxy env PLAYWRIGHT_BASE_URL=http://127.0.0.1:18137 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-mobile-audit-20260909/reflow-visual PLAYWRIGHT_SCREENSHOT_MODE=on PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/s3desk-mobile-audit-20260909/reflow-visual-results.json npx playwright test tests/wcag-reflow.spec.ts tests/design-audit-visual.spec.ts tests/mobile-current-audit.spec.ts --project=chromium --workers=2 --reporter=list,json
rtk proxy env PLAYWRIGHT_BASE_URL=http://127.0.0.1:18137 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-mobile-audit-20260909/grid-touch npx playwright test tests/mobile-current-audit.spec.ts --grep 'grid thumbnail touch' --project=chromium --workers=1
```

`mobile-current-audit.spec.ts`는 일회성 관찰 도구다. 작업 트리에서는 제거하고 `/tmp/s3desk-mobile-audit-20260909/mobile-current-audit.spec.ts`에 보관했다. 관찰을 반복할 때만 `frontend/tests/`로 복사해 사용한다. 제품 회귀 검사는 앞의 기존 스펙들로 별도 실행할 수 있다. `/tmp`의 전체 캡처와 JSON 로그는 임시 자료이며 삭제될 수 있다.

핵심 증빙은 이 보고서와 함께 [증빙 디렉터리](mobile-design-audit-2026-09-09/) 및 [집계 JSON](mobile-design-audit-2026-09-09/summary.json)에 보존했다. 캡처는 모두 테스트 데이터이고 사용자 자격증명이나 실제 서명 URL은 포함하지 않는다.
