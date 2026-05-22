# Frontend Feature Friction Audit Round 17 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 흐름으로 직접 확인했다. 이번 라운드는 Objects 모바일 위치/검색 영역에서 `Go to path` 원형 검색 아이콘이 `Search current folder` 입력과 `Search bucket` 버튼 옆에 함께 노출되어 검색 진입점처럼 오해될 수 있는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Apple Human Interface Guidelines - Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars): toolbar는 현재 view에서 자주 쓰는 명령을 제공하되, 사용자가 명령의 의미를 빠르게 이해할 수 있어야 한다는 기준을 적용했다.
- [Microsoft Command Bar](https://learn.microsoft.com/fi-fi/windows/apps/develop/ui/controls/command-bar): 작은 화면에서는 중요한 명령만 primary 영역에 남기고 secondary command를 overflow에 둘 수 있다는 기준을 적용했다.
- [Android Developers - Add and handle actions](https://developer.android.com/develop/ui/views/components/appbar/actions): 현재 context에서 가장 중요한 action만 app bar에 두고, 초과하거나 덜 중요한 action은 overflow menu로 보내는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- Playwright 모바일 캡처에서 path row 오른쪽에 별 아이콘과 원형 검색 아이콘이 보였다.
- 원형 검색 아이콘은 실제로 `Search bucket`이 아니라 `Go to path`를 여는 버튼이었다.
- 같은 화면 아래에는 `Search current folder` 입력과 라벨 있는 `Search bucket` 버튼이 있어, 사용자는 검색 아이콘이 어떤 검색을 의미하는지 다시 해석해야 했다.

### Action

- 개선 범위를 `ObjectsListControls`의 compact/mobile location shortcut과 관련 unit/e2e 테스트로 제한했다.
- `Go to path` 기능 자체는 유지하고, compact/mobile에서 unlabeled icon shortcut만 제거하기로 결정했다.

## Cycle 2 - Compare Against Design Practices

### Finding

모바일의 제한된 action 영역에서 search icon은 이미 강한 의미를 가진다. 현재 폴더 검색과 전체 버킷 검색이 명시적으로 제공되는 화면에서 같은 search glyph로 path 이동을 표현하면, 기능은 유용하더라도 기본 화면에서는 오히려 선택 부담을 늘린다.

### Action

- 라벨이 있는 `Search bucket` 버튼을 전체 버킷 검색의 주 진입점으로 유지했다.
- path 직접 이동은 고급/키보드 중심 기능으로 보고 `Object tools > Go to path…`와 `Ctrl+L` 경로에 남겼다.

## Cycle 3 - Hide Inline Path Shortcut On Compact Layouts

### Finding

`Go to path` 바로가기는 desktop 넓은 화면에서는 path row의 보조 도구로 읽히지만, compact/mobile에서는 검색 UI 사이에 끼어 검색 버튼처럼 보인다.

### Action

- `ObjectsListControls`에서 `showInlinePathShortcut = props.isAdvanced && !props.isCompact` 조건을 추가했다.
- compact/mobile에서는 `Go to path` icon button을 렌더링하지 않도록 바꿨다.
- desktop non-compact에서는 기존 `Go to path` 바로가기를 유지했다.

## Cycle 4 - Preserve Advanced Access Through Object Tools

### Finding

바로가기를 숨기더라도 고급 사용자가 path modal에 접근할 수 있어야 한다.

### Action

- Objects 모바일 Playwright 테스트에서 primary 화면에 `Go to path` 버튼이 없는지 확인했다.
- 같은 테스트에서 `Object tools` 메뉴 안의 `Go to path…` 항목이 유지되는지 확인했다.
- `Search bucket` drawer 재열기와 filter 유지 흐름을 함께 검증했다.

## Cycle 5 - Regression, Accessibility, And Visual Stability

### Finding

검색/위치 영역의 action 수를 줄이면 Objects 모바일 레이아웃과 global search drawer 접근 경로가 영향을 받을 수 있다.

### Action

- Objects 모바일 전체 28개 Playwright 테스트를 iPhone 13, Pixel 7 프로젝트에서 실행했다.
- Objects page 및 mobile Objects overlay axe 스캔을 실행했다.
- global search drawer와 mobile object grid visual regression을 실행했다.
- 이번 리포트에 직접 확인한 문제, 참고 디자인 기준, 개선 결과, 검증 명령을 기록했다.

## Resulting UX Changes

- Objects 모바일 path row에서 검색처럼 보이던 `Go to path` 원형 icon shortcut이 사라졌다.
- 모바일 검색 영역은 `Search current folder`와 `Search bucket` 두 경로로 더 명확해졌다.
- `Go to path…`는 `Object tools` menu와 keyboard shortcut 경로로 계속 사용할 수 있다.
- Desktop non-compact의 inline `Go to path` shortcut은 유지된다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsListControls.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "renders the mobile header|exposes primary toolbar actions|global search preserves"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects page|mobile Objects"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density|global search drawer action layout"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- 모바일 location row에는 아직 copy location과 bookmark icon이 남아 있다. 실제 사용자가 bookmark icon을 파일 favorite과 혼동한다면 bookmark도 Object tools 또는 folders drawer 안으로 낮출 수 있다.
- `Search current folder`와 `Search bucket`의 차이는 텍스트로 설명되어 있지만, 첫 방문자가 둘을 바로 구분하는지 사용성 테스트로 확인할 가치가 있다.
