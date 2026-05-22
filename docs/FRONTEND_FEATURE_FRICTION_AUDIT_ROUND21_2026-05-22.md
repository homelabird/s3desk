# Frontend Feature Friction Audit Round 21 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 흐름으로 직접 확인했다. 이번 라운드는 최근 라운드에서 보조 기능을 `Object tools`로 옮긴 뒤, 메뉴 안에 비활성 history 명령과 선택 전 `Show details` 같은 즉시 실행할 수 없는 항목이 남아 사용자를 방해할 수 있는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Apple Human Interface Guidelines - Menus](https://developer.apple.com/design/human-interface-guidelines/menus): 메뉴는 공간 효율적으로 명령을 제공하되, 현재 view/task와 관련 있는 소수의 자주 쓰는 action을 명확하게 조직해야 한다는 기준을 적용했다.
- [Android Developers - Add and handle actions](https://developer.android.com/develop/ui/views/components/appbar/actions): app bar에는 현재 context의 가장 중요한 action을 두고, overflow에는 실제 선택 가능한 추가 action을 두는 기준을 적용했다.
- [Microsoft Command Bar](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/command-bar): primary command와 secondary command를 중요도 기준으로 나누고, overflow에는 label이 있는 보조 명령을 둔다는 기준을 적용했다.
- [SAP Fiori Android Top App Bar](https://www.sap.com/design-system/fiori-design-android/v25-8/components/m3-standard-components/top-app-bar/usage): 모바일 top app bar와 overflow에서 icon/action 수를 제한하고 관련 action 중심으로 유지하는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- Playwright 모바일 흐름에서 `Object tools`는 이제 `Folders`, `Go to path`, `Copy location`, `Bookmark this location`, `New folder…` 등 여러 보조 action을 담고 있다.
- 코드 분석상 `Object tools` menu는 비활성 `Back`, `Forward`, `Go up` action을 앞쪽에 포함할 수 있었다.
- 선택된 object가 없는 초기 상태에서도 `Show details` action이 menu에 들어갈 수 있어, 사용자는 열어도 의미 있는 detail content가 없는 action을 보게 된다.

### Action

- baseline artifact를 `/tmp/s3desk-round21-objects-before`에 기록했다.
- 개선 범위를 Objects top menu 구성, global action enabled 조건, 관련 unit/e2e 테스트로 제한했다.

## Cycle 2 - Compare Against Design Practices

### Finding

모바일 overflow menu는 보조 기능을 숨겨두는 곳이지만, 비활성 또는 현재 context와 맞지 않는 항목까지 많이 넣으면 사용자는 "무엇을 할 수 있는지"보다 "왜 안 되는지"를 먼저 해석해야 한다. history navigation은 이미 사용 가능할 때 toolbar button으로 나타나며, 선택 전 details는 실제 정보 대상을 갖지 않는다.

### Action

- `Object tools`에서 history navigation 항목을 제거하기로 결정했다.
- `Show details`는 선택된 object가 있거나 details panel이 이미 열린 경우에만 action으로 유지하기로 했다.

## Cycle 3 - Remove Redundant History Commands From Object Tools

### Finding

`Back`, `Forward`, `Go up`은 mobile toolbar에서 사용 가능한 경우 직접 노출된다. `Object tools`에 다시 넣으면 초기 상태에서는 disabled clutter가 되고, 사용 가능한 상태에서는 toolbar와 중복된다.

### Action

- `useObjectsTopMenus`에서 `nav_back`, `nav_forward`, `nav_up` menu items를 제거했다.
- action catalog 자체의 navigation actions는 command/keyboard flow를 위해 유지했다.

## Cycle 4 - Contextualize Details Action

### Finding

Details panel은 object context가 있어야 의미가 있다. 선택이 없는 상태에서 `Show details`를 menu item으로 보여주면 action의 결과를 예측하기 어렵다.

### Action

- `toggle_details` action은 `selectedCount > 0`이거나 `detailsVisible`일 때만 enabled 되도록 바꿨다.
- `useObjectsTopMenus`에서는 enabled 된 `toggle_details`만 menu item으로 렌더링하도록 했다.
- unit test로 idle/selected/open-panel 상태별 enabled 조건을 검증했다.

## Cycle 5 - Regression, Accessibility, And Visual Stability

### Finding

Menu composition은 overlay behavior와 mobile toolbar test에 직접 영향을 준다.

### Action

- Playwright after artifact를 `/tmp/s3desk-round21-objects-after`에 기록했다.
- focused mobile test에서 초기 `Object tools` menu에 `Back`, `Forward`, `Go up`, `Show details`가 없고 핵심 보조 action은 유지되는지 검증했다.
- Objects 모바일 전체 suite, accessibility overlay scan, mobile visual regression, typecheck, lint, build를 실행했다.

## Resulting UX Changes

- 초기 모바일 `Object tools` menu에서 비활성 history 항목이 사라졌다.
- object 선택 전에는 `Show details`가 `Object tools`에 나타나지 않는다.
- object selection/detail context가 있을 때 details action은 계속 사용할 수 있다.
- `Folders`, `Go to path…`, `Copy location`, `Bookmark this location`, `New folder…`는 menu에서 계속 접근 가능하다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/objectsActionCatalog.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "exposes primary toolbar actions"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects page|mobile Objects"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- `Object tools` menu는 한층 짧아졌지만 location, folder, creation, mode action이 한 메뉴에 함께 있다. 실제 사용자가 메뉴 항목 순서를 헷갈린다면 다음 라운드에서는 grouping/order를 더 강하게 조정할 수 있다.
- Command palette에는 disabled action이 discoverability 목적으로 남을 수 있다. 실제 사용자가 disabled command를 불편하게 느끼는지 별도 검토가 필요하다.
