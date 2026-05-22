# Frontend Feature Friction Audit Round 14 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 흐름, 접근성 스캔, visual regression으로 직접 확인했다. 이번 라운드는 Objects 모바일 첫 화면에서 객체 선택 전 `Details` 버튼이 노출되어 빈 details drawer를 여는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [VA.gov Design System - Button](https://dev-design.va.gov/5896/components/button/): 버튼 텍스트는 무엇이 일어날지 명확히 알려야 하며, 완료 조건 안내용 disabled button은 anti-pattern이라는 기준을 적용했다.
- [Scottish Government Design System - Button](https://designsystem.gov.scot/components/button): disabled button은 사용자를 혼란스럽게 할 수 있고, 실제 도움이 확인된 경우에만 포함해야 한다는 기준을 적용했다.
- [Microsoft Progressive Disclosure Controls](https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls): contextual command는 선택한 객체나 mode와 관련될 때 자동으로 드러내는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- `objects-mobile-responsive` 기준 흐름은 통과했다.
- Playwright 캡처에서 지난 라운드 이후 Back/Forward/Up은 사라졌지만, 선택 전 `Details` 버튼은 여전히 첫 toolbar 행에 남아 있었다.
- 코드 분석상 `Details` drawer는 `selectedCount === 0`일 때 실제 상세 정보를 보여주지 않고 “객체를 선택하라”는 빈 상태만 표시한다.

### Action

- 개선 범위를 Objects 모바일 toolbar와 관련 unit/e2e 테스트로 제한했다.
- 객체 row menu의 `Details` 접근은 유지하고, toolbar의 `Details`는 선택 컨텍스트가 있을 때만 보이도록 결정했다.

## Cycle 2 - Hide Contextless Details

### Finding

모바일 첫 화면의 `Details`는 사용자에게 즉시 실행 가능한 정보 탐색 경로처럼 보이지만, 선택 전에는 비어 있는 drawer를 열 뿐이다. 이는 사용자가 “왜 아무 상세가 없지?”라고 다시 해석해야 하는 불필요한 표면이다.

### Action

- 모바일 toolbar에서 `Details` 버튼은 `selectedCount > 0`일 때만 렌더링하도록 바꿨다.
- 선택 전에는 Upload, New folder, Folders, Object tools 중심으로 toolbar를 단순화했다.
- desktop docked details 패턴과 row action menu는 유지했다.

## Cycle 3 - Preserve Details When Useful

### Finding

Details 기능 자체는 중요하다. 특히 객체를 선택한 뒤에는 toolbar Details가 자연스러운 contextual action이다.

### Action

- 객체 선택 후 toolbar `Details`가 나타나고 44px 이상 touch target을 유지하는지 Playwright 테스트를 추가했다.
- 선택을 clear하면 `Details`가 다시 사라지는지 확인했다.
- ObjectsToolbar unit test에 선택 전 숨김, 선택 후 표시 조건을 추가했다.

## Cycle 4 - Regression And Accessibility

### Finding

Toolbar 버튼 수가 줄면 모바일 레이아웃, row menu details flow, selection bar, overlay 접근성에 영향을 줄 수 있다.

### Action

- Objects 모바일 전체 28개 Playwright 테스트를 iPhone 13, Pixel 7 프로젝트에서 실행했다.
- Objects page 및 mobile Objects overlays axe 스캔을 실행했다.
- `mobile object grid density` visual regression으로 리스트/그리드 안정성을 확인했다.

## Cycle 5 - Build And Documentation

### Finding

이번 변경은 기능 삭제가 아니라 contextual disclosure이다. 같은 Details 기능은 row menu와 선택 후 toolbar에 남아 있으므로, 회귀 기준을 명확히 문서화해야 한다.

### Action

- 이번 리포트에 직접 확인한 문제, 참고 디자인 기준, 개선 결과, 검증 명령을 기록했다.
- typecheck, lint, build를 통과시켜 타입과 production bundle 관점에서 문제 없음을 확인했다.

## Resulting UX Changes

- Objects 모바일 첫 화면에서 선택 전 `Details` 버튼이 사라졌다.
- toolbar는 초기 상태에서 실행 가능한 작업 중심으로 더 간결해졌다.
- 객체를 선택하면 `Details` 버튼이 나타나 선택 컨텍스트에 맞는 동작으로 읽힌다.
- row action menu의 `Details` 접근은 유지되어 특정 객체 상세 진입 경로가 사라지지 않았다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsToolbar.test.tsx src/pages/objects/__tests__/useObjectsToolbarProps.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "primary toolbar actions|shows selection actions"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects page|mobile Objects"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- Objects 모바일 toolbar에는 여전히 `Folders`와 `Object tools`가 모두 남아 있다. 실제 사용 데이터에서 폴더 drawer 사용 빈도가 낮으면 Folders도 Object tools 안으로 낮출 수 있다.
- 선택 후 `Details`는 단일/다중 선택 모두에서 나타난다. 다중 선택에서 details drawer는 bulk action 안내를 보여주므로, 실제 혼란이 관찰되면 단일 선택일 때만 표시하도록 더 좁힐 수 있다.
