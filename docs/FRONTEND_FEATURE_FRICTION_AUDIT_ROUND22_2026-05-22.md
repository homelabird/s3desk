# Frontend Feature Friction Audit Round 22 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 흐름과 toolbar/menu 코드로 직접 확인했다. 이번 라운드는 모바일 상단 overflow 버튼의 accessible label이 `Object tools`로 남아 있지만, 실제 메뉴는 object 선택 전에도 page/location/create action을 담는 일반 overflow라는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Apple Human Interface Guidelines - Menus and actions](https://developer.apple.com/design/human-interface-guidelines/menus-and-actions): menu/button label은 사용자가 실행 가능한 action의 성격을 예측할 수 있게 해야 한다는 기준을 적용했다.
- [Material AppBar API](https://api.flutter.dev/flutter/material/AppBar-class.html): app bar는 흔한 action을 icon button으로 노출하고 덜 흔한 작업은 overflow menu에 둔다는 기준을 적용했다.
- [Microsoft CommandBar](https://learn.microsoft.com/en-us/uwp/api/windows.ui.xaml.controls.commandbar): secondary commands는 overflow에 위치하며 사용자는 More button을 통해 추가 action을 찾는다는 기준을 적용했다.
- [SAP Fiori Android Top App Bar](https://www.sap.com/design-system/fiori-design-android/v25-8/components/m3-standard-components/top-app-bar/usage): 모바일 top app bar에서 overflow menu를 통해 보조 action을 제공하는 기준을 적용했다.

## Cycle 1 - Current Frontend Scan

### Finding

- Objects 모바일 첫 화면의 ellipsis button은 accessible name이 `Object tools`였다.
- 최근 라운드 이후 이 menu에는 `Folders`, `Go to path…`, `Copy location`, `Bookmark this location`, `New folder…`, workspace mode 같은 page/location/create action이 들어 있다.
- object가 선택되지 않은 초기 상태에서도 `Object tools`라는 이름은 사용자가 object row action 또는 selected-object tool로 오해할 수 있다.

### Action

- 기존 Playwright 모바일 흐름과 `ObjectsToolbar`/`useObjectsTopMenus` 코드를 함께 확인했다.
- 이번 변경은 top toolbar overflow button label과 관련 테스트로 제한했다.

## Cycle 2 - Compare Against Design Practices

### Finding

공식 디자인 사례에서 overflow button은 현재 screen의 추가 action을 여는 일반 진입점으로 쓰인다. 메뉴가 object-specific action만 담지 않는다면 `Object tools`보다 `More actions`가 사용자의 mental model과 더 잘 맞는다.

### Action

- 모바일에서는 overflow button의 accessible label을 `More actions`로 바꾸기로 결정했다.
- 데스크톱에서는 기존 `Object tools` label을 유지했다. 데스크톱 toolbar는 넓은 화면에서 object workspace tool 성격이 더 강하고 기존 테스트/사용 흐름과도 맞기 때문이다.

## Cycle 3 - Rename Mobile Overflow Button

### Finding

`ObjectsToolbar`는 desktop/mobile 상태를 이미 알고 있어 label만 분기하면 된다. 이 변경은 menu item 자체나 action 실행 경로를 바꾸지 않는다.

### Action

- `ObjectsToolbar`에서 mobile overflow button의 `aria-label`을 `More actions`로 변경했다.
- mobile label이 표시되는 경우 `Actions` 대신 `More`를 사용하도록 정리했다.
- desktop에서는 `aria-label="Object tools"`와 visible `Tools` label을 유지했다.

## Cycle 4 - Update Mobile Interaction Tests

### Finding

테스트 helper와 smoke test가 이전 label인 `Object tools`를 사용자-facing 이름으로 찾고 있었다. 실제 사용자 경로를 반영하려면 테스트도 새 label을 사용해야 한다.

### Action

- `objects-mobile-responsive.spec.ts` helper를 `openFoldersFromMoreActions`로 갱신했다.
- mobile smoke의 새 폴더 flow도 `More actions > New folder…` 경로로 갱신했다.
- generic desktop/object smoke fallback은 `More actions`도 허용하도록 업데이트했다.

## Cycle 5 - Regression, Accessibility, And Visual Stability

### Finding

Accessible label 변경은 screen reader 경로와 role query 기반 Playwright tests에 직접 영향을 준다.

### Action

- Playwright focused artifact를 `/tmp/s3desk-round22-objects-after`에 기록했다.
- Objects 모바일 전체 suite, mobile smoke, accessibility overlay scan, mobile visual regression을 실행했다.
- 최종 typecheck, lint, build를 실행했다.

## Resulting UX Changes

- 모바일 상단 ellipsis button은 이제 `More actions`로 인식된다.
- 메뉴 내용이 object-specific 도구가 아니라 추가 page actions임을 더 정확히 전달한다.
- 데스크톱의 `Object tools` naming은 유지된다.
- `Folders`, `Go to path…`, `Copy location`, `Bookmark this location`, `New folder…` 기능은 그대로 유지된다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsToolbar.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "exposes primary toolbar actions"`
- `npm --prefix frontend run test:e2e -- tests/mobile-smoke.spec.ts --project=mobile-pixel-7 --grep "narrow mobile dialogs"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects page|mobile Objects"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- `More actions` menu item order는 아직 location/navigation/create/mode action을 한 menu에 담는다. 다음 라운드에서는 순서와 grouping이 실제 작업 흐름에 맞는지 더 좁게 볼 수 있다.
- Desktop의 `Object tools` label은 유지했지만, desktop에서도 menu 내용이 page action 중심으로 더 바뀐다면 같은 naming 정리를 적용할 수 있다.
