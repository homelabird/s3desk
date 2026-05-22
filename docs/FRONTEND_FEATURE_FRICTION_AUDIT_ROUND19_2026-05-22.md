# Frontend Feature Friction Audit Round 19 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 흐름으로 직접 확인했다. 이번 라운드는 Objects 모바일 위치 영역에 남아 있던 `Copy location` icon-only button이 첫 화면의 작업 밀도를 높이는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Apple Human Interface Guidelines - Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars): toolbar는 현재 view의 작업을 돕되, 좁은 폭에서는 항목을 overflow로 옮겨 안정적인 접근을 유지해야 한다는 기준을 적용했다.
- [Microsoft Command Bar](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/command-bar): 가장 중요한 명령을 primary command로 배치하고, 좁은 화면에서는 secondary/overflow command로 이동할 수 있다는 기준을 적용했다.
- [Android Developers - Add and handle actions](https://developer.android.com/develop/ui/views/components/appbar/actions): 현재 context의 핵심 action만 app bar에 두고 공간이 부족한 action은 overflow menu로 보내는 기준을 적용했다.
- [SAP Fiori Android Top App Bar](https://www.sap.com/design-system/fiori-design-android/v25-8/components/m3-standard-components/top-app-bar/usage): 모바일에서는 trailing icon 수를 제한하고, 덜 중요한 secondary action을 overflow에 둔다는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- Playwright 모바일 캡처에서 Round 18 이후 경로 bookmark 별표는 사라졌지만 `Copy location` 원형 icon button은 여전히 path row 중앙에 크게 남아 있었다.
- 같은 첫 화면에는 Upload, New folder, Object tools, bucket picker, local search, global search, filters, view mode가 이미 노출되어 있다.
- `Copy location`은 고급 보조 작업에 가깝고, 첫 방문 사용자가 파일 탐색을 시작하는 데 필요한 primary action은 아니었다.

### Action

- baseline artifact를 `/tmp/s3desk-round19-objects-before`에 기록했다.
- 개선 범위를 Objects location controls, global action catalog, Object tools menu, mobile responsive/clipboard 관련 테스트로 제한했다.

## Cycle 2 - Compare Against Design Practices

### Finding

모바일 첫 화면의 action budget은 작다. 공식 가이드들은 공통적으로 중요한 현재 작업을 우선 노출하고, 덜 중요한 보조 명령은 overflow/menu에서 레이블과 함께 제공하는 패턴을 권장한다. `Copy location`은 자주 쓰는 사용자가 있더라도 탐색의 시작점은 아니므로 icon-only primary 위치보다 menu item이 더 적합하다.

### Action

- `Copy location` 기능 자체는 유지했다.
- compact/mobile에서는 inline button을 숨기고, `Object tools` menu에 텍스트가 있는 `Copy location` action을 추가하기로 결정했다.

## Cycle 3 - Hide Inline Copy Button On Compact Layouts

### Finding

Desktop non-compact layout에서는 path row가 넓고 copy icon이 URI 옆 보조 도구로 읽힌다. Compact/mobile에서는 동일 button이 독립적인 큰 원형 action처럼 보여 기본 작업 우선순위를 흐린다.

### Action

- `ObjectsListControls`에서 `Copy location` button을 `!props.isCompact`일 때만 inline 렌더링하도록 변경했다.
- `buildS3Location`을 `objectsLocationUtils.ts`로 분리해 inline control과 menu action이 같은 URI 생성 로직을 사용하게 했다.
- compact/mobile unit test에 `Copy location` button이 렌더링되지 않는 assertion을 추가했다.

## Cycle 4 - Preserve Copy Access Through Object Tools

### Finding

복사 기능은 일부 고급 사용자가 필요로 하므로 제거가 아니라 접근 위치 조정이 적절하다.

### Action

- global action catalog에 `copy_location` action을 추가했다.
- `Object tools` menu에 `Copy location` menu item을 배치했다.
- action catalog unit test에서 `s3://bucket-1/reports/2026/` URI가 복사 callback으로 전달되는지 검증했다.

## Cycle 5 - Regression, Accessibility, And Visual Stability

### Finding

location row 높이가 바뀌면 mobile grid visual baseline과 webview clipboard copy-location 테스트가 영향을 받을 수 있다.

### Action

- Playwright after artifact를 `/tmp/s3desk-round19-objects-after`에 기록해 mobile path row에서 copy icon이 제거된 것을 확인했다.
- Objects 모바일 전체 suite, webview copy-location secure/insecure 흐름, accessibility overlay scan을 실행했다.
- mobile object grid visual snapshot은 의도한 layout 변화로 1px 높이가 바뀌어 snapshot을 갱신하고 재실행했다.
- 이번 리포트에 직접 확인한 문제, 참고 디자인 기준, 개선 결과, 검증 명령을 기록했다.

## Resulting UX Changes

- Objects 모바일 path row에서 `Copy location` 원형 icon-only button이 사라졌다.
- `Object tools` menu 안에 레이블이 있는 `Copy location` action이 추가됐다.
- Desktop non-compact의 inline `Copy location` button과 기존 webview clipboard feedback 흐름은 유지된다.
- 모바일 첫 화면은 위치 텍스트, 검색, 필터, view mode, object list에 더 집중된다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsListControls.test.tsx src/pages/objects/__tests__/objectsActionCatalog.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "renders the mobile header|exposes primary toolbar actions"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/webview-clipboard.spec.ts tests/webview-environment-posture.spec.ts --project=chromium --grep "copy-location"`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects page|mobile Objects"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density" --update-snapshots`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- `Object tools` menu가 location, folders, refresh, path, mode 등 advanced action을 계속 흡수하고 있다. 다음 라운드에서는 menu grouping 또는 더 명확한 label ordering이 필요한지 확인할 수 있다.
- 모바일 상단에는 아직 Upload/New folder/Object tools가 모두 1차 action으로 남아 있다. 실제 사용 빈도 관점에서 New folder가 모바일 primary action이어야 하는지 추가 검토할 가치가 있다.
