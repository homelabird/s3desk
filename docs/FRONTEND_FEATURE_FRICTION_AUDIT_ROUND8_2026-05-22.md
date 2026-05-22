# Frontend Feature Friction Audit Round 8 - 2026-05-22

## Scope

프론트엔드에서 여전히 사용자가 구현 세부사항이나 전문가용 기능처럼 해석해야 하는 문구가 남아 있는지 Playwright로 확인하고, 모범 디자인 사례와 대조해 5개 반복 사이클로 개선했다. 이번 라운드는 오브젝트 화면의 모드 전환, 전체 버킷 검색, 검색 색인 준비 흐름을 중심으로 다뤘다.

## Reference Practices

- [Microsoft progressive disclosure controls](https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls): 기본 화면은 핵심 작업에 집중하고, 추가 정보나 명령은 필요할 때 드러내야 한다는 기준을 적용했다.
- [Microsoft app settings guidance](https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings): 일반 워크플로우 명령과 드문 설정/정보를 분리하고, 설정 수와 라벨을 단순하게 유지하는 기준을 적용했다.
- [GOV.UK Design Principles](https://www.gov.uk/guidance/government-design-principles): 복잡한 내부 구조를 사용자에게 그대로 떠넘기지 않고, 실제 사용 맥락에 맞춰 단순하게 만드는 원칙을 적용했다.
- [UK Parliament form guidance](https://designsystem.parliament.uk/how-tos/designing-forms/): 추가 필드는 관련될 때만 드러내고, 질문과 라벨은 논리적 순서와 낮은 인지 비용을 가져야 한다는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- `test:e2e:smoke`와 오브젝트 오버레이 접근성 테스트는 통과했지만, 사용자 화면에는 `Switch to advanced mode`, `Indexed Search`, `Search query (substring)`, `Index management`, `Full reindex`처럼 구현자 중심 문구가 남아 있었다.
- 이 문구들은 기능 자체가 불필요한 것은 아니지만, 사용자가 “전문가 모드”나 “색인 내부 동작”을 이해해야 할 것처럼 느끼게 만드는 마찰이었다.

### Action

- 기능을 제거하지 않고, 사용자가 하려는 작업 기준으로 이름을 바꾸는 방향으로 개선 범위를 정했다.

## Cycle 2 - Workspace Mode Toggle

### Finding

`Switch to advanced mode`는 실제로 오브젝트 작업 도구를 더 보여주는 기능인데, “advanced”라는 단어 때문에 일반 사용자가 눌러도 되는지 판단하기 어렵다.

### Action

- 전환 라벨을 `Show workspace tools` / `Hide workspace tools`로 변경했다.
- smoke test도 “advanced mode”가 아니라 focused mode와 workspace tools 전환을 검증하도록 업데이트했다.

## Cycle 3 - Bucket Search Entry Point

### Finding

`Indexed Search`는 내부 구현인 색인 방식을 전면에 드러낸다. 사용자가 필요한 것은 색인 자체가 아니라 현재 폴더 밖까지 포함해 버킷을 찾는 것이다.

### Action

- 오브젝트 전역 검색 진입점과 다이얼로그 제목을 `Search bucket`으로 변경했다.
- 처음에는 `Search all folders`를 검토했지만, Playwright layout test에서 데스크톱 툴바 밀도에 영향을 줄 수 있음을 확인해 더 짧은 최종 라벨로 조정했다.
- 현재 폴더 검색이 제한될 때의 안내도 `Search bucket`으로 연결되도록 정리했다.

## Cycle 4 - Search Drawer Form Copy

### Finding

검색 입력과 필터의 `Search query (substring)`, `Prefix filter`, `Ext`는 개발자에게는 정확하지만, 사용자가 무엇을 입력해야 하는지 곧바로 이해하기 어렵다.

### Action

- 검색 입력을 `Search files or folders`로 바꿨다.
- prefix 필터를 `Folder path filter` / `Folder path (optional)`로 바꿨다.
- 확장자 placeholder를 `File type (e.g. log)`로 바꿨다.
- 검색 다이얼로그 설명을 “색인 검색”보다 “현재 폴더 밖의 객체 찾기” 중심으로 바꿨다.

## Cycle 5 - Index Setup And Responsive Verification

### Finding

`Index management`, `Index prefix`, `Full reindex`, `Create index job`는 필요한 기능이지만 사용자가 실행 결과를 예측하기 어렵다. 또한 새 검색 라벨이 기존 e2e에서 compact/desktop 레이아웃 차이를 드러냈다.

### Action

- 색인 섹션을 `Search index setup`으로 바꿨다.
- `Index prefix`는 `Index folder path`, `Full reindex`는 `Rebuild from scratch`, `Create index job`는 `Build search index`로 바꿨다.
- `objects-global-search` e2e가 inline 컨트롤과 compact `View options` 양쪽에서 `Favorites only`를 다룰 수 있도록 보강했다.
- visual snapshots를 최종 `Search bucket` 화면으로 갱신했다.

## Resulting UX Changes

- 일반 사용자가 “고급 모드”라는 말 없이 추가 오브젝트 작업 도구를 열고 닫을 수 있다.
- 전체 버킷 검색은 색인 구현명이 아니라 `Search bucket`이라는 작업명으로 보인다.
- 검색 폼은 substring/prefix/ext 같은 기술 축약어보다 파일/폴더/경로/파일 형식 중심으로 읽힌다.
- 색인 준비는 여전히 필요할 때만 보이지만, 버튼과 체크박스가 실행 결과를 더 명확히 말한다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/objectsActionCatalog.test.tsx src/pages/objects/__tests__/ObjectsGlobalSearchDrawer.test.tsx src/pages/objects/__tests__/ObjectsListControls.test.tsx src/lib/__tests__/jobTypes.test.ts`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:e2e:smoke`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Objects global search drawer|Objects filters drawer"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "global search|core overlay"`
- `npm --prefix frontend run test:e2e -- tests/objects-layout-density.spec.ts --project=chromium --grep "compact list controls|capped local search|global search results"`
- `npm --prefix frontend run test:e2e -- tests/objects-global-search.spec.ts --project=chromium`
- `npm --prefix frontend run test:e2e -- tests/storage-migration.spec.ts tests/dark-theme-accessibility.spec.ts --project=chromium --grep "migrates legacy raw-token Objects|Objects chrome and global search drawer"`
- `npm --prefix frontend run test:e2e:visual -- --project=chromium --update-snapshots`
- `npm --prefix frontend run test:e2e:visual -- --project=chromium`

## Remaining Watch Items

- `Search bucket`는 짧고 레이아웃에 안정적이지만, 사용자가 “현재 버킷 전체”라는 범위를 충분히 이해하는지는 실제 사용 데이터로 검증할 가치가 있다.
- 내부 코드와 storage key에는 `advanced` / `indexedSearch` 같은 구현 명칭이 남아 있다. 이번 라운드에서는 사용자 노출 문구만 정리했고, 내부 rename은 동작 리스크 대비 효익이 낮아 남겼다.
