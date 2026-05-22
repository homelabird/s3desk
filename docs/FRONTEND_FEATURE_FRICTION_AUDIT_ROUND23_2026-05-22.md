# Frontend Feature Friction Audit Round 23 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 화면과 `ObjectsListControls` 코드로 직접 확인했다. 이번 라운드는 모바일 Objects 목록의 compact search area가 `Search current folder` placeholder와 `Search bucket` button을 이미 제공하면서도 별도 안내문 `Search here, or use Search bucket for the whole bucket.`를 반복 노출하는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Apple Human Interface Guidelines - Writing](https://developer.apple.com/design/human-interface-guidelines/writing): 화면의 목적과 주요 정보를 먼저 배치하고 action-oriented label을 쓰는 기준을 적용했다.
- [Apple Human Interface Guidelines - Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields/): text field의 목적은 placeholder나 label로 전달할 수 있다는 기준을 적용했다.
- [Microsoft Fluent 2 - Content design](https://fluent2.microsoft.design/content-design): 사용자의 목표 달성을 돕도록 필요한 정보만 제공하고, excess word를 줄이는 기준을 적용했다.
- [Material Design - Writing](https://m1.material.io/style/writing.html): UI text는 clear, accurate, concise해야 하며 세부 설명은 필요해질 때 드러내는 기준을 적용했다.

## Cycle 1 - Current Frontend Scan

### Finding

- Playwright mobile Pixel 7 기준 화면에서 `Search current folder...` 입력창, `Search bucket` button, `1 folders, 3 files` summary 아래에 별도 검색 안내문이 추가로 노출됐다.
- 이 문구는 사용자가 실제로 눌러야 하는 control이 아니라, 이미 보이는 control label을 문장으로 다시 설명한다.
- 모바일에서는 해당 한 줄이 object list 시작 위치를 아래로 밀어 첫 화면의 정보 밀도를 낮춘다.

### Action

- 기준 artifact를 `/tmp/s3desk-round23-objects-before`에 기록했다.
- compact footer와 meta 영역의 사용자-facing copy를 코드와 screenshot으로 함께 확인했다.

## Cycle 2 - Compare Against Design Practices

### Finding

공식 디자인 사례들은 control 자체의 label과 placeholder가 충분히 설명한다면 반복 안내문을 줄이고, 사용자가 현재 task에 집중할 수 있게 concise copy를 유지하라고 권장한다. 이번 문구는 검색 범위 차이를 설명하려는 목적은 있지만, 이미 `Search current folder`와 `Search bucket`이라는 두 control label로 같은 차이가 전달된다.

### Action

- 검색 기능 자체나 `Search bucket` CTA는 유지하고, 반복 설명 문구만 제거하기로 결정했다.
- summary count는 사용자가 목록 범위를 파악하는 실제 상태 정보이므로 유지했다.

## Cycle 3 - Remove Redundant Compact Hint

### Finding

`ObjectsListControls`의 compact advanced meta는 count summary와 hint text를 같은 영역에 렌더링하고 있었다. hint 전용 CSS는 이 문구 외에는 사용되지 않았다.

### Action

- `ObjectsListControls`에서 `Search here, or use Search bucket for the whole bucket.` 렌더링을 제거했다.
- unused `.listControlsHintText` CSS를 제거했다.
- `Search current folder` input, `Filters`, `Search bucket`, view toggle, count summary는 유지했다.

## Cycle 4 - Update Tests

### Finding

단위 테스트와 mid-width density Playwright test가 이전 안내문 노출을 기대하고 있었다. 새 UX에서는 해당 문구가 없는 것이 명시적 기대값이어야 한다.

### Action

- `ObjectsListControls.test.tsx`에서 redundant hint가 렌더링되지 않는지 확인하도록 갱신했다.
- `objects-layout-density.spec.ts`에서 같은 문구가 없는 상태를 검증하도록 갱신했다.
- focused unit test와 focused Playwright 재촬영을 실행했다.

## Cycle 5 - Regression, Accessibility, And Visual Stability

### Finding

이번 변경은 모바일 vertical spacing과 screen reader text surface를 줄이는 변경이다. 검색 기능과 menu/drawer interaction에는 영향이 없어야 한다.

### Action

- 수정 후 artifact를 `/tmp/s3desk-round23-objects-after`에 기록했다.
- Objects 모바일 전체 suite, compact density, accessibility overlay scan, mobile visual regression을 실행했다.
- 최종 typecheck, lint, build를 실행했다.

## Resulting UX Changes

- 모바일 Objects 목록에서 중복 검색 안내문이 사라졌다.
- 첫 화면에서 object list가 더 빨리 시작된다.
- 검색 범위는 placeholder `Search current folder...`와 button `Search bucket`으로 계속 구분된다.
- folder/file count summary는 유지되어 현재 목록 상태를 계속 전달한다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsListControls.test.tsx`
- `PLAYWRIGHT_RECORD_ARTIFACTS=1 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-round23-objects-before npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "renders the mobile header"`
- `PLAYWRIGHT_RECORD_ARTIFACTS=1 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-round23-objects-after npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "renders the mobile header"`
- `npm --prefix frontend run test:e2e -- tests/objects-layout-density.spec.ts --project=chromium --grep "uses compact list controls"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects page|mobile Objects"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- `Search current folder...` placeholder와 `Search bucket` button naming은 현재 충분히 명확하지만, 검색 범위 혼동이 사용자 테스트에서 다시 나오면 tooltip이나 help-on-demand 방식으로 보강하는 편이 상시 문구보다 낫다.
- Compact controls 아래의 count summary는 유지했지만, 향후 더 작은 viewport에서 list 시작 위치가 여전히 낮으면 summary 위치를 header row 안으로 옮길 수 있다.
