# Frontend Feature Friction Audit Round 13 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 흐름, 접근성 스캔, visual regression으로 직접 확인했다. 이번 라운드는 Objects 모바일 첫 화면에서 `Go back`, `Go forward`, `Go up`이 모두 비활성 상태로 상단 주요 도구줄에 노출되는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [VA.gov Design System - Button](https://design.va.gov/components/button/): 단계 완료를 안내하기 위해 버튼을 비활성화하는 패턴은 사용자가 무엇이 잘못됐는지 알기 어렵게 만드는 anti-pattern이라는 기준을 적용했다.
- [Scottish Government Design System - Button](https://designsystem.gov.scot/components/button): disabled button은 사용자를 혼란스럽게 할 수 있고, 실제 도움이 확인된 경우에만 포함해야 한다는 기준을 적용했다.
- [Microsoft Progressive Disclosure Controls](https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls): 보조 명령은 필요할 때 드러내고, 기본 화면은 핵심 작업에 집중한다는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- `objects-mobile-responsive` 기준 흐름은 통과했다.
- Playwright 아티팩트로 640px Objects 모바일 화면을 확인했을 때, 첫 진입 상태에서 `Go back`, `Go forward`, `Go up` 세 버튼이 모두 비활성으로 보였다.
- 이 버튼들은 사용자가 아직 폴더 이동을 하지 않았을 때 실행할 수 없고, Upload, New folder, Folders, Details보다 앞에 놓여 핵심 행동의 스캔을 방해했다.

### Action

- 개선 범위를 모바일 Objects toolbar와 관련 unit/e2e 테스트로 좁혔다.
- 데스크톱 toolbar의 브라우저형 내비게이션 관례는 유지하고, 모바일에서만 비활성 history controls를 숨기는 방식으로 결정했다.

## Cycle 2 - Hide Unavailable Mobile History Controls

### Finding

모바일 첫 화면에서 비활성 history controls는 사용자가 해결할 수 있는 문제를 알려주지 않는다. 화면 폭은 좁고, 비활성 버튼 3개가 첫 번째 toolbar 행의 대부분을 차지한다.

### Action

- 모바일에서는 `canGoBack`, `canGoForward`, `canGoUp`이 true일 때만 각각의 버튼을 렌더링하도록 바꿨다.
- profile 없음, offline, history 없음 상태에서는 해당 내비게이션 버튼이 표시되지 않도록 했다.
- Upload, New folder, Folders, Details, Object tools는 기존대로 유지했다.

## Cycle 3 - Preserve Navigation When It Becomes Useful

### Finding

버튼을 완전히 제거하면 폴더 이동 후 history navigation을 찾기 어려울 수 있다. 따라서 “항상 숨김”이 아니라 “사용 가능할 때 표시”가 필요하다.

### Action

- 폴더 drawer에서 `reports/`로 이동한 뒤 `Go back`과 `Go up`이 활성 버튼으로 표시되는지 Playwright 테스트를 추가했다.
- `Go back` 실행 후 root로 돌아오면 `Go forward`가 활성 버튼으로 표시되는지 확인했다.
- ObjectsToolbar unit test에서도 모바일 history actions가 사용 가능할 때만 나타나는지 검증했다.

## Cycle 4 - Visual And Accessibility Regression

### Finding

Toolbar 버튼 수가 줄면 모바일 상단 밀도와 touch target 배치가 바뀐다. 접근성 이름과 drawer 흐름도 유지되어야 한다.

### Action

- Objects 모바일 전체 28개 Playwright 테스트를 iPhone 13, Pixel 7 프로젝트에서 실행했다.
- Objects page 및 mobile Objects overlays axe 스캔을 실행했다.
- `mobile object grid density` visual regression으로 변경이 객체 그리드 화면 안정성을 깨지 않는지 확인했다.

## Cycle 5 - Report And Build Verification

### Finding

이번 변경은 작지만 첫 화면의 지각 부담을 낮추는 변경이다. 실제 기능 제거가 아니라 사용 시점에 맞춘 progressive disclosure이므로, 회귀 기준을 문서에 남겨야 한다.

### Action

- 이번 리포트에 전/후 판단 근거와 참고 디자인 기준을 기록했다.
- typecheck, lint, build를 통과시켜 타입, 정적 분석, production bundle 관점에서 문제 없음을 확인했다.

## Resulting UX Changes

- Objects 모바일 첫 화면에서 비활성 `Go back`, `Go forward`, `Go up` 버튼이 사라졌다.
- 사용자는 첫 toolbar 행에서 실행 가능한 작업만 먼저 본다.
- 폴더 이동 후에는 `Go back`과 `Go up`이 나타나고, back 후에는 `Go forward`가 나타나므로 history navigation 기능은 유지된다.
- 데스크톱 toolbar는 기존 내비게이션 버튼 표시 방식을 유지한다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsToolbar.test.tsx src/pages/objects/__tests__/useObjectsToolbarProps.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "primary toolbar actions|folders drawer opens"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects page|mobile Objects"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- Objects 모바일 toolbar에는 여전히 Upload, New folder, Folders, Details, Object tools가 한 줄에 노출된다. 실제 사용 데이터에서 Details 사용 빈도가 낮으면 Details도 Object tools 안으로 낮추는 후속 단순화가 가능하다.
- 데스크톱에서는 비활성 Back/Forward/Up을 유지했다. 데스크톱에서도 혼란이 관찰되면 동일한 조건부 렌더링을 확장할 수 있다.
