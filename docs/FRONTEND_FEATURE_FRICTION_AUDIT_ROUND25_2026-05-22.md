# Frontend Feature Friction Audit Round 25 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 화면과 `ObjectsGlobalSearchDrawer` 코드로 직접 확인했다. 이번 라운드는 `Search bucket` drawer가 매번 긴 informational Alert를 먼저 보여 주어 실제 검색/필터 컨트롤을 아래로 밀어내는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Apple Human Interface Guidelines - Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts): alerts는 중요한 정보에만 sparingly 사용하고, 단순 정보 제공용 alert는 피하는 기준을 적용했다.
- [Microsoft Fluent 2 - Content design](https://fluent2.microsoft.design/content-design): 사용자가 빠르게 scan할 수 있도록 필요한 copy만 남기는 기준을 적용했다.
- [Microsoft Fluent 2 - Accessibility](https://fluent2.microsoft.design/accessibility): UI text는 concise, consistent, descriptive해야 하며 text zoom/contrast를 고려해야 한다는 기준을 적용했다.
- [Material Design - Writing](https://m1.material.io/style/writing.html): clear, accurate, concise text와 progressive disclosure 기준을 적용했다.

## Cycle 1 - Current Frontend Scan

### Finding

- Playwright mobile Pixel 7 기준 `Search bucket` drawer에서 상단 Alert가 `Search across this bucket`과 긴 설명문을 표시했다.
- 동일 화면에 이미 drawer title, `Search files or folders`, folder path filter, file type/size/date filters, `Search index setup` section이 있어 기능 구조가 드러난다.
- 상단 Alert가 모바일 첫 화면의 큰 영역을 차지해 실제 검색 입력과 필터 영역의 가시성을 낮췄다.

### Action

- 기준 artifact를 `/tmp/s3desk-round25-search-drawer-before`에 기록했다.
- `ObjectsGlobalSearchDrawer`, `ObjectsGlobalSearchControls`, `ObjectsGlobalSearchIndexPanel`의 역할을 나누어 확인했다.

## Cycle 2 - Compare Against Design Practices

### Finding

공식 디자인 사례들은 informational alert와 장문 intro copy를 상시 노출하지 말고, 사용자가 작업하는 시점에 필요한 control과 state를 우선 노출하라고 권장한다. 이번 intro Alert는 오류, 경고, prerequisite도 아니고 drawer를 열 때마다 반복되는 기능 설명이었다.

### Action

- `Search bucket` drawer의 상단 intro Alert를 제거하기로 결정했다.
- 검색/필터 controls, index setup disclosure, index-missing error Alert는 실제 작업과 상태에 연결되어 있으므로 유지했다.

## Cycle 3 - Remove Redundant Intro Alert

### Finding

`ObjectsGlobalSearchDrawer`의 intro Alert는 `InfoCircleOutlined` icon과 `.globalSearchIntro` CSS를 단독으로 사용하고 있었다.

### Action

- `Search across this bucket` intro Alert를 제거했다.
- unused `InfoCircleOutlined` import와 `.globalSearchIntro` CSS를 제거했다.
- `ObjectsGlobalSearchDrawer.test.tsx`에 intro copy가 렌더링되지 않는 회귀 방지 기대값을 추가했다.

## Cycle 4 - Accessibility Follow-up

### Finding

Intro Alert 제거 후 mobile accessibility scan에서 `Reset` secondary button의 focused text color가 AntD 기본 primary color로 바뀌며 contrast 3.82로 감지됐다. 이전에는 상단 Alert가 focus/scan surface를 가려 이 문제가 드러나지 않았다.

### Action

- `globalSearchCompactButton` default button의 hover/focus/active text color를 app text color로 유지했다.
- focus border는 유지해 keyboard focus affordance를 보존했다.
- global search drawer accessibility scan을 다시 실행해 통과시켰다.

## Cycle 5 - Regression And Visual Stability

### Finding

상단 Alert 제거는 desktop/dark drawer snapshot에도 의도된 시각 변화를 만든다.

### Action

- 수정 후 artifact를 `/tmp/s3desk-round25-search-drawer-after`에 기록했다.
- Objects 모바일 전체 suite, desktop/tablet global search flow, accessibility overlay scan을 실행했다.
- desktop global search drawer와 dark global search drawer visual snapshot을 actual 확인 후 갱신하고 재실행했다.
- 최종 typecheck, lint, build를 실행했다.

## Resulting UX Changes

- `Search bucket` drawer가 설명 Alert 없이 바로 `Search` controls로 시작한다.
- 모바일에서 더 많은 filter와 index setup control이 첫 화면에 들어온다.
- index가 없거나 search error가 발생하는 실제 상태 Alert는 유지된다.
- focused secondary button contrast가 개선됐다.

## Verification

- `PLAYWRIGHT_RECORD_ARTIFACTS=1 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-round25-search-drawer-before npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "global search preserves query filters"`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsGlobalSearchDrawer.test.tsx`
- `PLAYWRIGHT_RECORD_ARTIFACTS=1 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-round25-search-drawer-after npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "global search preserves query filters"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "global search"`
- `npm --prefix frontend run test:e2e -- tests/objects-layout-density.spec.ts --project=chromium --grep "global search"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "global search drawer action layout" --update-snapshots`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "global search drawer action layout"`
- `npm --prefix frontend run test:e2e -- tests/dark-theme-visual-regression.spec.ts --project=chromium --grep "global search drawer" --update-snapshots`
- `npm --prefix frontend run test:e2e -- tests/dark-theme-visual-regression.spec.ts --project=chromium --grep "global search drawer"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- `Search index setup` is still visible as a collapsed disclosure on every drawer open. It is less intrusive than the removed Alert, but a future round can check whether it should appear only when the index is missing or when the user asks for indexing controls.
- The desktop global search table still has a long-key overlap in the visual snapshot. It was pre-existing and outside this round's feature-friction target, but it is a good candidate for a later table-layout pass.
