# Frontend Feature Friction Audit Round 16 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Objects 모바일 흐름으로 직접 확인했다. 이번 라운드는 Objects 모바일 toolbar에서 `Folders`가 1차 버튼과 `Object tools` 메뉴에 동시에 노출되어 첫 화면의 작업 밀도를 높이는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Apple Human Interface Guidelines - Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars): toolbar는 현재 view에서 자주 쓰는 핵심 명령을 빠르게 제공해야 한다는 기준을 적용했다.
- [Microsoft Command Bar](https://learn.microsoft.com/fi-fi/windows/apps/develop/ui/controls/command-bar): 중요한 명령을 우선 배치하고, 작은 화면에서는 overflow menu로 이동할 수 있다는 기준을 적용했다.
- [Android Developers - Add and handle actions](https://developer.android.com/develop/ui/views/components/appbar/actions): 현재 context에서 가장 중요한 action만 app bar에 두고, 공간이 부족하거나 덜 중요한 action은 overflow에 둔다는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- Playwright 모바일 캡처에서 Objects 첫 화면 toolbar에 Upload, New folder, Folders, Object tools가 함께 보였다.
- `Folders`는 이미 `Object tools` overflow menu에도 있어 동일 기능이 두 표면에 중복 노출됐다.
- 390px 모바일에서는 아이콘만 보이므로 folder 아이콘과 new folder 아이콘의 의미가 가까워 보이고, 사용자는 둘을 다시 해석해야 했다.

### Action

- 개선 범위를 Objects 모바일 toolbar와 관련 unit/e2e 테스트로 제한했다.
- `Folders` 기능 자체는 유지하고, 중복된 1차 toolbar 버튼만 제거하기로 결정했다.

## Cycle 2 - Compare Against Design Practices

### Finding

모바일 toolbar는 제한된 공간에서 사용자가 가장 자주 시작하는 명령을 우선 보여줘야 한다. `Folders`는 탐색 보조 panel이며, 이미 overflow에 같은 진입점이 있으므로 Upload/New folder와 같은 1차 생성 동작과 같은 무게로 둘 필요가 약했다.

### Action

- 모바일 1차 toolbar는 Upload, New folder, Object tools 중심으로 단순화했다.
- desktop 구조와 Object tools menu의 `Folders` 항목은 그대로 유지했다.

## Cycle 3 - Remove Duplicate Primary Folders Button

### Finding

기존 모바일 `Folders` 버튼은 `aria-haspopup="dialog"`와 drawer state를 직접 들고 있었지만, 동일한 drawer는 Object tools menu action으로도 열린다. 두 경로가 있으면 테스트와 사용자 mental model 모두에서 “어디가 공식 진입점인가”가 흐려진다.

### Action

- `ObjectsToolbar` 모바일 top row에서 `Folders` primary button을 제거했다.
- 사용하지 않는 `FolderOutlined` 및 `OBJECTS_TREE_DRAWER_ID` import를 제거했다.
- `Details`처럼 선택 context가 있을 때만 필요한 action은 기존 조건을 유지했다.

## Cycle 4 - Preserve Folder Flow Through Object Tools

### Finding

기능을 낮춰도 folder tree drawer, favorites, prefix navigation, history navigation은 그대로 작동해야 한다.

### Action

- Playwright helper `openFoldersFromObjectTools`를 추가해 Object tools menu에서 `Folders`를 열도록 테스트 경로를 갱신했다.
- 메뉴의 `aria-expanded` 상태와 `Folders` menu item 존재를 확인한 뒤 drawer를 여는 흐름을 검증했다.
- iPhone 13, Pixel 7에서 Objects 모바일 전체 28개 테스트를 실행했다.

## Cycle 5 - Accessibility, Visual Regression, And Documentation

### Finding

Toolbar action 수를 줄이면 모바일 첫 화면은 단순해지지만, overflow menu 접근성과 기존 overlay 품질을 함께 확인해야 한다.

### Action

- Objects page 및 mobile Objects overlay axe 스캔을 실행했다.
- `mobile object grid density` visual regression을 실행했다.
- 이번 리포트에 직접 확인한 문제, 참고 디자인 기준, 개선 결과, 검증 명령을 기록했다.

## Resulting UX Changes

- Objects 모바일 첫 화면의 1차 toolbar에서 중복 `Folders` 버튼이 사라졌다.
- 상단 toolbar는 Upload, New folder, Object tools 중심으로 더 짧고 명확해졌다.
- `Folders` drawer는 Object tools menu에서 계속 열 수 있다.
- 폴더 drawer를 통한 prefix 이동 뒤 Back/Up/Forward navigation은 그대로 유지된다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsToolbar.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "exposes primary toolbar actions|folders drawer opens|core overlay drawers|task flows"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects page|mobile Objects"`
- `npm --prefix frontend run test:e2e -- tests/objects-visual-regression.spec.ts --project=chromium --grep "mobile object grid density"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- Object tools menu에는 여전히 history, folders, details, refresh, path, mode 같은 여러 advanced action이 모인다. 실제 사용자가 메뉴를 자주 열고 길이를 부담스러워한다면 menu grouping 또는 command palette 중심 정리가 필요하다.
- 모바일 location/search 영역에는 bucket picker, path chip, favorites, global search, local search가 가까이 배치되어 있다. 다음 라운드에서는 검색 진입점 중복과 정보 밀도를 별도로 볼 수 있다.
