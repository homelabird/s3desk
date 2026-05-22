# Frontend Feature Friction Audit Round 20 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 흐름으로 직접 확인했다. 이번 라운드는 Objects 모바일 첫 화면 toolbar의 `New folder` icon-only primary button이 기본 탐색 작업보다 앞에 노출되어 작업 밀도를 높이는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Apple Human Interface Guidelines - Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars): 모바일에서는 가장 중요한 toolbar 항목만 우선 노출하고, 덜 중요한 action은 More menu로 보내는 기준을 적용했다.
- [Android Developers - Add and handle actions](https://developer.android.com/develop/ui/views/components/appbar/actions): 현재 context에서 가장 중요한 action만 app bar에 두고, 초과 action은 overflow menu로 보내는 기준을 적용했다.
- [Microsoft Command Bar](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/command-bar): command bar의 primary command는 핵심 명령에 집중하고 secondary command는 overflow에서 label과 함께 제공하는 기준을 적용했다.
- [SAP Fiori Android Top App Bar](https://www.sap.com/design-system/fiori-design-android/v25-8/components/m3-standard-components/top-app-bar/usage): mobile top app bar에서 icon button 수를 제한하고 secondary action을 overflow에 배치하는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- Playwright 모바일 캡처에서 Round 19 이후 toolbar에는 `Upload`, `New folder`, `Object tools`가 남아 있었다.
- `New folder`는 파일 관리 기능이지만 모바일 첫 진입 사용자가 가장 먼저 수행하는 핵심 작업은 보통 upload, search, object navigation이다.
- icon-only folder-plus button은 bucket/folder 탐색 계열과 의미가 가까워 보이고, 이미 `Object tools`가 존재하는 상황에서는 첫 화면의 선택지를 불필요하게 늘렸다.

### Action

- baseline artifact를 `/tmp/s3desk-round20-objects-before`에 기록했다.
- 개선 범위를 Objects mobile toolbar, Object tools menu, 관련 unit/e2e 테스트로 제한했다.

## Cycle 2 - Compare Against Design Practices

### Finding

모바일 toolbar의 primary 영역은 제한적이다. 공식 가이드들은 공통적으로 가장 중요한 action만 즉시 노출하고 보조 action은 overflow/menu로 이동시키라고 권장한다. 새 폴더 생성은 기능 자체는 필요하지만 매번 첫 화면에 icon-only primary action으로 둘 만큼 보편적인 시작 작업은 아니라고 판단했다.

### Action

- `New folder` 기능 자체는 유지했다.
- 모바일 primary toolbar에서는 제거하고, `Object tools` menu에 `New folder…` action으로 접근하도록 유지하기로 결정했다.
- 데스크톱 toolbar의 `New folder` button은 기존대로 유지했다.

## Cycle 3 - Remove Mobile Primary New Folder Button

### Finding

`ObjectsToolbar`는 desktop과 mobile render path를 분리하고 있었으므로 mobile render path에서만 `newFolderButton`을 제거할 수 있었다. 이 방식은 desktop layout, compact desktop test, keyboard shortcut behavior를 건드리지 않는다.

### Action

- `ObjectsToolbar` mobile top row에서 `newFolderButton` 렌더링을 제거했다.
- `ObjectsToolbar` unit test에 mobile에서 `New folder` primary button이 렌더링되지 않는 assertion을 추가했다.

## Cycle 4 - Preserve New Folder Access Through Object Tools

### Finding

모바일에서 primary button을 제거하더라도 simple/advanced mode 모두에서 새 폴더 생성 경로는 남아 있어야 한다.

### Action

- `useObjectsTopMenus`에서 `new_folder` action을 advanced-only group 밖으로 이동했다.
- 모바일 responsive Playwright test에서 primary toolbar에는 `New folder` button이 없고, `Object tools` menu에는 `New folder…` item이 있는지 검증했다.
- mobile smoke test의 narrow dialog flow가 `Object tools > New folder…`로 새 폴더 dialog를 여는 경로를 사용하도록 갱신했다.

## Cycle 5 - Regression, Accessibility, And Visual Stability

### Finding

Toolbar action 수를 줄이면 모바일 첫 화면, simple mode smoke flow, visual density, accessibility overlays가 영향을 받을 수 있다.

### Action

- Playwright after artifact를 `/tmp/s3desk-round20-objects-after`에 기록해 mobile toolbar가 `Upload`와 `Object tools` 중심으로 단순해진 것을 확인했다.
- Objects 모바일 전체 suite, mobile smoke narrow dialog flow, accessibility overlay scan, mobile visual regression을 실행했다.
- 최종 typecheck, lint, build를 실행해 정적 품질과 production build를 확인했다.

## Resulting UX Changes

- Objects 모바일 첫 화면 toolbar에서 `New folder` icon-only primary button이 사라졌다.
- `New folder…`는 `Object tools` menu에서 계속 사용할 수 있다.
- Desktop non-compact 및 compact desktop의 `New folder` primary button은 유지된다.
- 모바일 첫 화면의 생성 action은 upload 중심으로 단순해졌고, 덜 자주 쓰는 생성 기능은 레이블 있는 menu item으로 이동했다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsToolbar.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "renders the mobile header|exposes primary toolbar actions"`
- `npm --prefix frontend run test:e2e -- tests/mobile-smoke.spec.ts --project=mobile-pixel-7 --grep "narrow mobile dialogs"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects page|mobile Objects"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- `Object tools` menu는 이제 folders, path, copy, bookmark, new folder, mode 등 여러 action을 담는다. 다음 라운드에서는 menu grouping, ordering, label density가 사용성을 해치지 않는지 직접 확인할 필요가 있다.
- 모바일 first screen에는 `Upload` primary action이 남아 있다. Upload는 핵심 작업이지만, 실제 사용자가 다운로드/탐색 위주라면 upload도 context에 따라 더 낮출지 검토할 수 있다.
