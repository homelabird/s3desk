# Frontend Feature Friction Audit Round 18 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 흐름으로 직접 확인했다. 이번 라운드는 Objects 모바일 위치 영역의 경로 bookmark 별표가 파일 row의 favorite 별표와 같은 의미로 오해될 수 있는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Apple Human Interface Guidelines - Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars): toolbar는 현재 view에서 필요한 명령을 제공하되, 좁은 폭에서는 항목 우선순위를 조절해야 한다는 기준을 적용했다.
- [Microsoft Command Bar](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/command-bar): command bar는 가장 중요한 명령을 primary로 두고, 공간이 제한되면 secondary/overflow command로 이동할 수 있다는 기준을 적용했다.
- [Android Developers - Add and handle actions](https://developer.android.com/develop/ui/views/components/appbar/actions): 현재 context의 핵심 action만 app bar에 두고, 초과하거나 덜 중요한 action은 overflow menu로 보낸다는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- Playwright 모바일 캡처에서 path row에 `Copy location` 버튼과 별표 icon button이 함께 보였다.
- 같은 화면의 object row에도 파일 favorite 별표가 반복되어, 경로 bookmark 별표와 파일 favorite 별표의 대상이 시각적으로 분리되지 않았다.
- 390px 모바일에서는 icon-only control만 보여서 별표가 "현재 위치를 북마크"한다는 맥락을 사용자가 즉시 알기 어렵다.

### Action

- baseline artifact를 `/tmp/s3desk-round18-objects-before`에 기록했다.
- 개선 범위를 Objects location controls, global action catalog, Object tools menu, 관련 unit/e2e 테스트로 제한했다.

## Cycle 2 - Compare Against Design Practices

### Finding

모바일 첫 화면의 primary action 공간은 Upload, New folder, Search current folder, Search bucket처럼 사용자가 자주 시작하는 작업에 우선 배정되어야 한다. 경로 bookmark는 유용하지만 탐색 보조 기능이며, 파일 favorite과 같은 별표를 icon-only로 노출하면 사용자는 "무엇을 즐겨찾기하는가"를 다시 해석해야 한다.

### Action

- 경로 bookmark 기능 자체는 유지했다.
- compact/mobile에서는 icon-only shortcut을 숨기고, `Object tools` menu 안에서 텍스트가 있는 `Bookmark this location` action으로 제공하기로 결정했다.

## Cycle 3 - Move Location Bookmark Out Of Compact Inline Controls

### Finding

Desktop non-compact layout에서는 path row가 넓고 button title/aria label이 보조 설명을 제공하므로 inline bookmark가 보조 도구로 읽힌다. Compact/mobile에서는 같은 아이콘이 object row favorite 별표와 더 가까워 보인다.

### Action

- `ObjectsListControls`에서 location bookmark button을 `!props.isCompact`일 때만 inline 렌더링하도록 바꿨다.
- desktop label을 `Add bookmark`에서 `Bookmark this location`으로 바꿔, 파일 favorite과 의미를 분리했다.
- compact/mobile에서는 해당 button이 DOM에 나오지 않도록 테스트를 추가했다.

## Cycle 4 - Preserve Access Through Object Tools

### Finding

inline shortcut을 제거해도 advanced user가 현재 위치 bookmark를 토글할 경로는 필요하다.

### Action

- objects global action catalog에 `toggle_location_bookmark` action을 추가했다.
- 현재 상태에 따라 `Bookmark this location` / `Remove location bookmark` label과 star icon이 바뀌도록 했다.
- `Object tools` menu에 이 action을 배치해 mobile에서도 레이블이 있는 menu item으로 접근할 수 있게 했다.

## Cycle 5 - Regression, Accessibility, And Visual Stability

### Finding

Objects action catalog에 global action이 추가되면 command palette, top menu, mobile toolbar assertions, visual density가 함께 영향을 받을 수 있다.

### Action

- Objects controls 및 action catalog unit test를 갱신했다.
- Playwright 모바일 캡처를 `/tmp/s3desk-round18-objects-after`에 기록해 path row에서 별표가 사라지고 copy action만 남은 것을 확인했다.
- Objects 모바일, accessibility overlay, visual regression, typecheck, lint, build 검증을 실행했다.

## Resulting UX Changes

- Objects 모바일 path row에서 파일 favorite과 혼동될 수 있던 경로 bookmark 별표가 사라졌다.
- `Object tools` menu 안에 레이블이 있는 `Bookmark this location` action이 추가됐다.
- Desktop non-compact에서는 inline 경로 bookmark shortcut을 유지하되, label을 `Bookmark this location`으로 명확히 바꿨다.
- 경로 copy, object favorite, bucket search, current folder search 흐름은 그대로 유지된다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsListControls.test.tsx src/pages/objects/__tests__/objectsActionCatalog.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "renders the mobile header|exposes primary toolbar actions"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects page|mobile Objects"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- Mobile location row에는 여전히 `Copy location` icon-only button이 남아 있다. 복사 action도 실제 사용 빈도가 낮다면 다음 라운드에서 Object tools로 낮출 수 있다.
- `Object tools` menu가 점점 많은 advanced action을 모으고 있다. 메뉴 길이가 사용성을 해치기 시작하면 grouping 또는 command palette 중심 정리가 필요하다.
