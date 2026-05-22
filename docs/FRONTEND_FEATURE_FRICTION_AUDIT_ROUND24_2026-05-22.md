# Frontend Feature Friction Audit Round 24 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 화면과 `ObjectsBucketPicker` 코드로 직접 확인했다. 이번 라운드는 선택된 bucket trigger가 bucket 이름과 chevron을 이미 보여주면서도 `Tap to switch bucket`이라는 조작 설명을 계속 노출하는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Apple Human Interface Guidelines - Writing](https://developer.apple.com/design/human-interface-guidelines/writing): interface text는 필요한 정보를 직접 전달하고 action-oriented label을 사용해야 한다는 기준을 적용했다.
- [Apple Human Interface Guidelines - Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons): button은 label, icon, placement로 목적이 드러나야 하며 불필요한 설명을 상시 노출하지 않는 기준을 적용했다.
- [Microsoft Fluent 2 - Content design](https://fluent2.microsoft.design/content-design): 사용자의 목표 달성에 필요한 말만 남기고 excess word를 줄이는 기준을 적용했다.
- [Material Design - Writing](https://m1.material.io/style/writing.html): UI text는 clear, accurate, concise해야 하며 세부 설명은 필요할 때 드러내는 기준을 적용했다.

## Cycle 1 - Current Frontend Scan

### Finding

- Playwright mobile Pixel 7 기준 화면에서 bucket trigger가 `objects-mobile-bucket` 아래에 `Tap to switch bucket`을 항상 표시했다.
- 해당 trigger는 이미 button이며 오른쪽 chevron을 포함한다. 사용자는 bucket 이름과 chevron만으로 선택/전환 affordance를 파악할 수 있다.
- 이 안내문은 첫 화면의 vertical space를 차지해 object list 시작 위치를 아래로 밀었다.

### Action

- 기준 artifact를 `/tmp/s3desk-round24-bucket-before`에 기록했다.
- `ObjectsBucketPicker`의 selected, unselected, empty 상태 copy를 코드와 테스트로 확인했다.

## Cycle 2 - Compare Against Design Practices

### Finding

공식 디자인 사례들은 button 자체가 목적을 드러내는 경우 반복 설명문을 줄이라고 권장한다. 선택된 bucket 상태에서는 bucket 이름이 현재 상태이고 chevron이 전환 가능성을 표시하므로, `Tap to switch bucket`은 기능을 설명하는 상시 문구에 가깝다.

### Action

- 선택된 bucket 상태의 instructional hint만 제거하기로 결정했다.
- bucket 미선택 상태의 `Tap to choose a bucket`과 bucket 없음 상태의 `No buckets available`은 empty/prerequisite guidance라 유지했다.

## Cycle 3 - Compact Selected Bucket Trigger

### Finding

`ObjectsBucketPicker`는 mobile trigger hint를 `value ? tapToSwitchBucketHint() : ...` 조건으로 항상 렌더링했다. `tapToSwitchBucketHint`는 이 selected-state 문구 외에는 사용되지 않았다.

### Action

- selected bucket state에서는 hint span을 렌더링하지 않도록 변경했다.
- unused `tapToSwitchBucketHint` helper와 해당 helper test를 제거했다.
- bucket drawer, search, empty-state copy, trigger `aria-label`, chevron icon은 유지했다.

## Cycle 4 - Update Tests And Re-capture UI

### Finding

기존 단위 테스트는 selected state에서 `Tap to switch bucket`이 보이는 것을 기대했다. 새 UX에서는 해당 문구가 없는 상태가 회귀 방지 기준이다.

### Action

- `ObjectsBucketPicker.test.tsx`에서 selected trigger가 compact하게 렌더링되고 `Tap to switch bucket`이 없는지 확인하도록 갱신했다.
- `actionHints.test.ts`에서 제거된 helper 기대값을 삭제했다.
- 수정 후 artifact를 `/tmp/s3desk-round24-bucket-after`에 기록했다.

## Cycle 5 - Regression, Accessibility, And Visual Stability

### Finding

이번 변경은 selected bucket trigger의 visible text surface를 줄이는 변경이다. bucket drawer open, object workflows, screen reader name, visual density에 영향을 줄 수 있으므로 모바일 전체 회귀 검증이 필요했다.

### Action

- Objects 모바일 전체 suite, accessibility overlay scan, mobile visual regression을 실행했다.
- 최종 typecheck, lint, build를 실행했다.

## Resulting UX Changes

- 선택된 bucket trigger가 한 줄로 정리된다.
- 첫 화면에서 object list가 더 빨리 시작된다.
- bucket 전환 기능은 button, chevron, drawer 동작으로 유지된다.
- bucket 미선택/없음 상태의 안내는 계속 제공된다.

## Verification

- `PLAYWRIGHT_RECORD_ARTIFACTS=1 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-round24-bucket-before npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "renders the mobile header"`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsBucketPicker.test.tsx src/lib/__tests__/actionHints.test.ts`
- `PLAYWRIGHT_RECORD_ARTIFACTS=1 PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-round24-bucket-after npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "renders the mobile header"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects page|mobile Objects"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- `Tap to choose a bucket`는 아직 bucket 미선택 상태에 남아 있다. 실제 first-run 사용자에게 충분히 명확한지 확인한 뒤, placeholder와 empty drawer만으로 대체 가능한지 다음 라운드에서 볼 수 있다.
- 현재 bucket trigger는 chevron만 사용한다. 사용성 테스트에서 bucket 전환 가능성을 놓치는 사용자가 있으면 상시 문구 대신 tooltip이나 drawer title 같은 필요 시점 안내로 보강하는 편이 낫다.
