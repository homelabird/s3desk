# Frontend Feature Friction Audit Round 12 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Uploads 모바일 흐름, 접근성 스캔, visual regression으로 직접 확인했다. 이번 라운드는 Uploads 첫 화면에서 선택 전 `Queue upload`가 비활성 주요 CTA처럼 노출되는 문제와, Upload source dialog의 보조 버튼 색 대비 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Scottish Government Design System - Button](https://designsystem.gov.scot/components/button): 페이지 또는 섹션의 primary button은 하나로 제한하고, disabled button은 혼란을 줄 수 있으므로 실제로 도움이 확인된 경우에만 포함한다는 기준을 적용했다.
- [VA.gov Design System - Button](https://dev-design.va.gov/5896/components/button/): 단계 완료를 안내하기 위해 버튼을 비활성화하는 패턴은 사용자가 무엇이 잘못됐는지 알기 어렵게 만드는 anti-pattern이라는 기준을 적용했다.
- [W3C WCAG 2.2 Understanding SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum): 일반 텍스트의 4.5:1 대비 기준과, 실제 CSS foreground/background 값을 기준으로 평가해야 한다는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- `uploads-mobile-responsive` 모바일 흐름은 통과했다.
- Playwright 아티팩트로 초기 Uploads 화면을 확인했을 때, 사용자가 아직 파일을 선택하지 않았는데도 헤더에 비활성 `Queue upload`가 주요 CTA처럼 보였다.
- 실제 다음 행동은 `Add from device…`이지만 첫 화면 위쪽에서는 비활성 버튼이 더 먼저 시선을 끌어, 사용자가 왜 업로드를 시작할 수 없는지 추론해야 했다.

### Action

- 개선 범위를 Uploads shell, selection section, upload source dialog, 관련 unit/e2e 테스트로 제한했다.
- 업로드 기능 자체는 유지하고, 선택 전/후에 보이는 CTA 우선순위만 조정하기로 했다.

## Cycle 2 - Remove Premature Queue CTA

### Finding

선택 전 `Queue upload`는 사용자가 지금 실행할 수 없는 명령이다. 헤더의 primary 위치에 비활성 버튼이 있으면 목적지가 잘못됐는지, 파일 선택이 누락됐는지, 권한이 없는지 즉시 알기 어렵다.

### Action

- 파일 또는 폴더 선택 전에는 헤더의 `Queue upload`, `Open Transfers`, `Clear selection`을 숨겼다.
- 선택이 생긴 뒤에만 `Queue upload (n)`, `Open Transfers`, `Clear selection`이 헤더에 나타나도록 했다.
- 테스트 전제도 “선택 없음이면 disabled queue가 있다”에서 “선택 없음이면 queue action이 없다”로 바꿨다.

## Cycle 3 - Promote The Real First Action

### Finding

선택 전 사용자의 실제 첫 행동은 파일 또는 폴더를 추가하는 것이다. 이 버튼이 secondary처럼 보이면 사용자는 헤더의 비활성 버튼과 아래쪽 실제 버튼 사이에서 우선순위를 다시 해석해야 한다.

### Action

- 선택이 없을 때 `Add from device…`를 primary button으로 표시했다.
- 선택이 생기면 `Add from device…`는 추가 소스 선택용 secondary action으로 낮추고, `Queue upload (n)`을 primary action으로 유지했다.
- 헤더 문구에서 `stage files` 같은 내부 구현 중심 표현을 제거하고, `Choose a bucket and add files or a folder from this device.`처럼 실제 작업 순서 중심으로 정리했다.

## Cycle 4 - Source Dialog Contrast Repair

### Finding

접근성 Playwright/axe 스캔에서 Upload source dialog의 `Choose folder` 버튼 텍스트 대비가 3.82:1로 보고됐다. 버튼은 활성 상태였으므로 WCAG 2.2 일반 텍스트 4.5:1 기준을 만족해야 한다.

### Action

- `Choose folder` 보조 버튼에 앱 primary 토큰을 명시적으로 적용했다.
- 버튼 텍스트와 아이콘이 같은 색을 상속하도록 맞춰, 버튼 아이콘과 라벨이 같은 action으로 읽히게 했다.
- 접근성 스캔을 재실행해 Uploads page와 mobile Uploads source dialog가 모두 axe violation 없이 통과하는지 확인했다.

## Cycle 5 - Regression And Flow Alignment

### Finding

CTA 노출 조건이 바뀌면 선택 초기화, provider capability gating, mobile upload 흐름 테스트가 모두 새 UX 전제를 따라야 한다.

### Action

- Uploads unit tests, mobile responsive tests, header action e2e, capability gating e2e를 갱신했다.
- visual regression으로 Upload source selection dialog가 안정적인지 확인했다.
- typecheck, lint, import-cycle, CSS token 검사를 통과시켜 변경이 구조적 부작용을 만들지 않는지 확인했다.

## Resulting UX Changes

- Uploads 첫 화면에서 비활성 `Queue upload`가 사라져 사용자가 막힌 주요 CTA를 먼저 해석하지 않아도 된다.
- 선택 전에는 `Add from device…`가 명확한 primary action이다.
- 선택 후에는 `Queue upload (n)`이 primary action으로 나타나 작업 단계가 자연스럽게 전환된다.
- `Clear selection` 후에도 비활성 queue button으로 돌아가지 않고, 다시 파일 추가 상태로 복귀한다.
- Upload source dialog의 `Choose folder` 버튼 대비가 접근성 기준을 만족한다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/uploads/__tests__/UploadsPageShell.test.tsx src/pages/uploads/__tests__/UploadsSelectionSection.test.tsx src/pages/uploads/__tests__/buildUploadsPagePresentationProps.test.ts src/pages/__tests__/UploadsPage.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/uploads-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/uploads-more-menu.spec.ts tests/capabilities-ui-gating.spec.ts --project=chromium --grep "Uploads|uploads page"`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Uploads page|mobile Uploads"`
- `npm --prefix frontend run test:e2e -- tests/workflows-visual-regression.spec.ts --project=chromium --grep "mobile Uploads source selection dialog"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- Uploads 상단 앱 chrome에는 여전히 전역 Transfers 진입 버튼이 있다. 사용자가 Uploads page의 local action과 global transfer action을 혼동한다면, 아이콘 tooltip/label을 더 직접적으로 개선할 수 있다.
- 선택 후 `Open Transfers`가 header action으로 나타나는 것은 현재 유용하지만, 업로드 큐잉 전에는 노출 우선순위를 더 낮춰도 되는지 실제 사용 빈도를 보고 판단할 수 있다.
