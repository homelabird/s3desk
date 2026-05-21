# 프론트엔드 기능 마찰 감사 리포트 - 2026-05-22

대상: 현재 S3Desk 프론트엔드 `main` 브랜치. 분석 시작 기준은 `3bcff15`이며, 이 리포트에는 이후 5회 개선 사이클에서 적용한 변경까지 포함한다.

목적: 현재 웹앱에 기능은 존재하지만 사용자의 기본 작업을 방해하거나, 너무 이른 단계에 노출되어 인지 부담과 실수 가능성을 높이는 요소가 있는지 프론트엔드 전문가 관점에서 점검한다.

## 결론 요약

현재 프론트엔드는 이전보다 훨씬 정돈되어 있지만, 아직 몇몇 고급 기능이 기본 사용자 여정에 너무 가까이 노출되어 있다. 문제의 핵심은 기능 자체가 불필요하다는 것이 아니라, 노출 위치와 우선순위가 사용자 의도보다 구현/운영 기능 중심으로 배치된 부분이다.

가장 우선적으로 개선할 부분은 다음이다.

1. `Objects` 화면의 `More` 메뉴를 줄이고 `View`, `Tools`, 컨텍스트 액션으로 분리한다.
2. 전송 설정의 raw concurrency, chunk, throughput 조절값은 전문가 설정으로 숨긴다.
3. 백업/복원 드로어는 한 화면에 모든 작업을 보여주지 말고 task-first flow로 바꾼다.
4. Buckets/Profile 행 메뉴에서 정책, 삭제, benchmark, YAML 같은 고급/위험 기능을 낮은 우선순위로 내린다.
5. 첫 설정 완료 후에는 `Objects` 진입을 가장 강하게 유도하고 Uploads/Activity 링크는 앱 내부 shell로 이동한다.

## 분석 방법

이번 분석은 정적 코드 검토, 기존 UX 문서 검토, Playwright visual regression 직접 실행, Playwright visual snapshot 확인을 함께 사용했다. 실제 사용자 테스트나 production telemetry 분석은 포함하지 않았다.

검토 기준은 다음 질문을 중심으로 잡았다.

- 이 컨트롤이 자주 수행하는 사용자 작업을 직접 돕는가?
- 위험하거나 낮은 빈도의 기능이 기본 화면에 너무 크게 노출되어 있지는 않은가?
- 같은 목적을 수행하는 경로가 중복되어 사용자가 선택 부담을 느끼지는 않는가?
- 버튼/메뉴 라벨만 보고 결과를 예측할 수 있는가?
- Ant Design 기반 앱의 시각적 우선순위 모델과 맞는가?
- 모바일 화면에서도 사용자가 주된 작업을 빠르게 판단할 수 있는가?

## Playwright 직접 검증 결과

다음 명령으로 현재 프론트엔드의 visual regression suite를 직접 실행했다.

```bash
npm --prefix frontend run test:e2e:visual -- --project=chromium
```

초기 기준선 결과:

- 18개 Playwright visual 시나리오 통과
- 실행 시간: 약 35.1초
- Vite dev server가 테스트 중 자동 구동되어 현재 React UI를 실제 브라우저에서 렌더링했다.

검증된 주요 화면:

- Objects global search drawer
- Objects mobile grid density
- Profiles edit dialog
- Profiles YAML import dialog
- Bucket create dialog
- Bucket policy sheet
- Bucket delete confirmation and not-empty warning flow
- GCS/Azure/OCI bucket governance sheets
- Jobs mobile filters sheet
- Transfers mobile drawer states
- Upload source selection dialog
- Settings mobile drawer
- Dark theme Objects global search drawer
- Image preview mobile panning stage

Playwright 결과는 layout regression이 없음을 보여준다. 다만 이 리포트의 목적은 visual stability 통과 여부가 아니라, 현재 안정적으로 렌더링되는 화면 안에서 어떤 기능 노출이 사용자 인지 부담을 만드는지 판단하는 것이다.

## 5회 반복 개선 사이클 실행 로그

### Cycle 1. 기준선 분석

- Playwright visual suite를 직접 실행해 현재 UI 렌더링 기준선을 확인했다.
- 결과: 18개 visual 시나리오 통과.
- 리포트에 현재 프론트엔드 근거 맵과 모범 사례 비교 기준을 정리했다.

### Cycle 2. Objects / Favorites 기본 화면 단순화

- Objects 상단 `More` 메뉴에서 command palette, workspace tab, indexed search, folder job submenu처럼 expert 성격이 강한 항목을 내렸다.
- Indexed Search는 검색 영역의 명시적 CTA로 유지하고, 포괄적인 overflow menu에서는 제거했다.
- Favorites pane에서 `Open details on click` 설정을 제거했다.
- Favorites pane의 `Favorites only` control은 기본 노출하지 않고, active 상태에서 해제할 수 있는 보조 control로 제한했다.

### Cycle 3. Transfers / Light setup 기본 경로 정리

- Transfer concurrency, chunk, batch, throughput 조절값을 `Expert transfer tuning` disclosure 안으로 이동했다.
- `Max Throughput` primary preset을 제거하고 `High throughput` secondary preset으로 낮췄다.
- Light setup의 profile 선택 후 목적지를 `Open Objects` primary와 `Manage Buckets` secondary로 줄였다.
- `/uploads`, `/jobs` 직접 링크는 setup 화면에서 제거하고 authenticated shell 내부 흐름으로 남겼다.
- `Advanced` 링크는 `Advanced profile setup`으로 구체화했다.

### Cycle 4. Profiles 행 메뉴 demotion

- Buckets row action은 `Open` primary + `Manage` menu 구조로 변경했다.
- `Controls`, `Advanced policy`, `Delete bucket`은 bucket별 반복 노출에서 내려 `Manage` 메뉴 안으로 이동했다.
- Profiles row menu에서 routine action인 `Edit`, `Test`는 첫 레벨에 유지했다.
- `Benchmark`, `YAML`은 `Advanced` 하위로 이동했다.
- `YAML` 라벨은 `Export/Edit YAML`로 바꿔 사용자가 동작을 예측하기 쉽게 했다.

### Cycle 5. Activity / Backup 고위험 흐름 정리

- Activity의 queue health 카드를 클릭 가능한 status filter action으로 바꿨다.
- 사용자는 별도 filter form을 열기 전에 `Failed`, `Running`, `Queued` 같은 상태 카드를 눌러 바로 좁힐 수 있다.
- Backup/Restore drawer는 export, restore, portable import, cleanup을 동시에 보여주지 않도록 task selector 기반으로 변경했다.
- 기본 task는 가장 안전한 `Export backup`이며, restore/import/cleanup은 사용자가 명시적으로 선택한 뒤 form이 나타난다.

## 최종 검증 결과

개선 반영 후 다음 검증을 통과했다.

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsFavoritesPane.test.tsx src/pages/objects/__tests__/ObjectsTreePanel.test.tsx src/pages/objects/__tests__/ObjectsPagePanes.test.tsx src/pages/__tests__/SettingsPage.test.tsx src/__tests__/LightApp.auth.test.tsx src/pages/profiles/__tests__/ProfilesTable.test.tsx src/pages/jobs/__tests__/JobsToolbar.test.tsx src/components/__tests__/SidebarBackupAction.test.tsx
npm --prefix frontend run test:unit -- src/pages/buckets/__tests__/BucketActions.test.tsx src/pages/__tests__/BucketsPage.smoke.test.tsx
npm --prefix frontend run test:e2e:visual -- --project=chromium
npm --prefix frontend run test:e2e:smoke
npm --prefix frontend run test:e2e -- tests/buckets-mobile-responsive.spec.ts --project=mobile-pixel-7
npm --prefix frontend run test:e2e -- tests/buckets-mobile-responsive.spec.ts tests/dark-theme-accessibility.spec.ts tests/bucket-governance.spec.ts --project=chromium
```

검증 결과:

- TypeScript typecheck 통과
- ESLint, CSS token check, import cycle check 통과
- 변경 영역 unit/smoke 79개 테스트 통과
- Playwright visual regression 18개 시나리오 통과
- Playwright smoke 2개 시나리오 통과
- Bucket 모바일, dark accessibility, bucket governance 관련 추가 Playwright 10개 시나리오 통과

## 참고한 디자인 모범 사례

- GOV.UK Design Principles: 사용자 니즈에서 시작하고, 서비스를 단순하게 만들기 위해 내부 복잡도를 제품이 흡수해야 한다. <https://www.gov.uk/guidance/government-design-principles>
- Nielsen Norman Group 휴리스틱: 드물게 필요한 정보가 자주 필요한 정보와 경쟁하면 사용성이 떨어진다. <https://media.nngroup.com/media/articles/attachments/Heuristic_Evaluation_Workbook_-_Nielsen_Norman_Group.pdf>
- Ant Design Button: primary button은 구역의 주 행동에만 사용해야 하며, 한 구역에 여러 primary가 있으면 의사결정이 흐려진다. <https://ant.design/components/button/>
- Material Design Menus: 메뉴는 임시 선택지 제공용이며, 주요 탐색 구조나 복잡한 기능 설명을 대신해서는 안 된다. <https://m1.material.io/components/menus.html>
- WCAG 2.2 / WAI-ARIA APG: custom menu, combobox, dialog는 name, role, value, focus 이동, Escape 동작이 예측 가능해야 한다. <https://w3c.github.io/wcag/guidelines/22/> / <https://www.w3.org/TR/2019/WD-wai-aria-practices-1.2-20191218/>

## 현재 프론트엔드 근거 맵

| 영역 | 확인한 파일/스냅샷 | 관찰된 마찰 패턴 |
| --- | --- | --- |
| Objects workspace | `useObjectsTopMenus.tsx`, `ObjectsToolbar.tsx`, `ObjectsFiltersDrawer.tsx`, `ObjectsFavoritesPane.tsx`, `objects-mobile-grid-density` snapshot | 탐색, 검색, 탭, 명령 팔레트, 폴더 작업, 전송 접근이 한 흐름에서 경쟁한다. |
| Indexed Search | `objects-global-search-drawer-actions` snapshot | 기능은 유용하지만 검색, 필터, index management, row actions가 한 drawer에 밀집해 있다. |
| Buckets | `BucketActions.tsx`, bucket policy/delete snapshots | 일반 탐색 화면에서 governance, policy, delete 같은 고위험 기능이 반복 노출된다. |
| Profiles | `ProfilesTable.tsx`, profile YAML import snapshot | 기본 profile 사용과 diagnostic/export/destructive action이 같은 메뉴 레벨에 있다. |
| Activity / Jobs | `JobsToolbar.tsx`, jobs filter sheet snapshot | 운영 상태 확인보다 필터/레이아웃 조정 UI가 크게 보일 수 있다. |
| Settings / Transfers | `TransfersSettingsSection.tsx`, settings mobile snapshot, transfers mobile snapshot | transfer tuning과 내부 실행값이 일반 설정처럼 보인다. |
| Backup / Restore | `SidebarBackupDrawer.tsx` | export, restore, portable import, cleanup이 하나의 drawer에 함께 노출된다. |
| First-run setup | `LightApp.tsx` | profile 선택 이후 `/objects`, `/buckets`, `/uploads`, `/jobs`가 함께 제시되어 setup이 launcher처럼 보인다. |
| Shared UI primitives | `MenuPopover.tsx`, `ObjectsCommandPaletteModal.tsx` | custom menu/combobox는 기능 가치 대비 접근성 유지 비용이 크다. |

## 디자인 원칙을 S3Desk에 적용한 해석

S3Desk는 S3 호환 스토리지를 다루는 도구이기 때문에 전문 기능을 완전히 제거하면 안 된다. 하지만 기본 화면은 다음 작업을 가장 쉽게 만들어야 한다.

- profile 연결
- bucket/object 탐색
- 검색
- 업로드/다운로드
- 실패한 작업 확인
- 필요한 경우에만 고급 운영 기능 접근

따라서 UI 우선순위는 기능 수가 아니라 빈도와 위험도에 맞춰야 한다.

- 자주 쓰고 안전한 기능: 기본 화면에 노출한다.
- 자주 쓰지만 조건이 있는 기능: 관련 맥락 안에서 노출한다.
- 드물고 위험한 기능: 명확한 task 선택 후 노출한다.
- 구현 세부값 조절: expert disclosure 뒤로 숨긴다.
- 파워유저 기능: keyboard shortcut이나 advanced menu로 유지하되 기본 탐색을 방해하지 않는다.

## 상세 발견 사항

### P1. Objects `More` 메뉴가 너무 많은 mental model을 담고 있다

근거:

- `frontend/src/pages/objects/useObjectsTopMenus.tsx`는 history navigation, details/folders, refresh, go-to-path, upload variants, commands, transfers, tabs, indexed search, folder actions, UI mode switch를 하나의 `More` 메뉴에 넣는다.
- `frontend/src/pages/objects/ObjectsToolbar.tsx`의 모바일 고급 toolbar도 history, upload, folder, details, more action을 함께 노출한다.

사용자 불편:

- `More actions`라는 라벨만으로 사용자는 그 안에 탐색, 검색, 전송, 탭, 명령 팔레트, 폴더 작업이 섞여 있음을 예측하기 어렵다.
- 같은 목표를 위한 경로가 많다. 예를 들어 위치 이동, 검색, indexed search, command palette, folder pane, go to path가 모두 탐색/찾기 의도를 부분적으로 겹친다.
- folder job action은 유용하지만 기본 discovery 경로에 있으면 초보 사용자가 업무 구조를 이해하기 어렵다.

개선안:

- `More`를 하나의 큰 메뉴로 유지하지 말고 다음처럼 intent별로 나눈다.
- `View`: Details, Folders, Simple/Advanced mode, list/grid 관련 액션
- `Tools`: Indexed Search, Go to path, Commands
- Context menu only: folder download/copy/move/delete 같은 대상 기반 작업
- `Commands`는 visible menu에서 제거하고 `Ctrl+K`나 keyboard help에서만 안내한다.
- `New tab` / `Close tab`은 tab UI가 실제로 보이는 상태 또는 advanced workspace mode에서만 노출한다.

우선순위: P1

### P1. 전송 설정이 구현 세부값을 너무 빨리 보여준다

근거:

- `TransfersSettingsSection.tsx`는 download/upload task concurrency를 advanced collapse 이전에 노출한다.
- advanced collapse label이 batch/chunk 값을 직접 보여준다.
- `Max Throughput` preset이 primary button처럼 보여 가장 권장되는 선택처럼 보인다.
- batch size, chunk size, chunk concurrency, file concurrency, threshold, resume conversion이 일반 설정처럼 이어진다.

사용자 불편:

- 대부분의 사용자는 concurrency, chunk size, browser memory pressure를 직접 조절할 필요가 없다.
- `Max Throughput`은 성능을 높일 수 있지만 provider throttling, browser memory, request cost 측면에서 가장 위험한 선택일 수 있다.
- 설정 화면이 제품 설정이 아니라 업로드 런타임 내부값 조정 화면처럼 보인다.

개선안:

- 기본값은 `Auto` 또는 `Balanced` 하나로 둔다.
- preset은 `Stable`, `Balanced`, `Fast` 정도로 축약한다.
- raw numeric tuning은 `Expert tuning` disclosure 안으로 이동한다.
- `Max Throughput`은 primary가 아니라 secondary/warning 성격으로 낮춘다.
- raw value summary는 collapsed label에서 빼고, 사용자가 expert mode를 열었을 때만 보여준다.

우선순위: P1

### P1. Backup / Restore 드로어가 고위험 작업을 한 화면에 모아 둔다

근거:

- `SidebarBackupDrawer.tsx`는 backup export, restore staging, portable migration, staged restore cleanup을 하나의 drawer에 렌더링한다.

사용자 불편:

- export, restore, import, cleanup은 목적과 위험도가 다르다.
- 고위험 작업을 한 화면에서 스크롤로 나열하면 사용자가 중요한 설명을 지나칠 가능성이 커진다.
- restore/import는 드물지만 영향이 큰 작업이므로 사용자가 먼저 의도를 선택해야 한다.

개선안:

- drawer 첫 화면을 task selector로 바꾼다.
- `Export backup`, `Stage restore`, `Import portable bundle`, `Clean staged restores` 중 하나를 선택한 후 해당 form만 보여준다.
- stale restore 상태는 compact banner로 유지하되 cleanup action은 별도 task로 분리한다.
- 가장 안전하고 빈도가 높은 `Export backup`을 default task로 둔다.

우선순위: P1

### P2. Buckets 행 메뉴에 governance/delete 기능이 반복 노출된다

근거:

- `BucketActions.tsx`는 각 bucket row에 `Open`, `Controls`, `Policy`, `Delete`를 제공한다.
- visual snapshot상 policy sheet와 delete confirmation은 잘 설계되어 있지만, 진입점이 row마다 반복된다.

사용자 불편:

- bucket list는 먼저 object workspace로 가는 inventory/navigation 화면이어야 한다.
- `Policy`와 `Delete`는 고급/위험 기능인데 row마다 보이면 사용자는 매 행에서 관리 기능을 처리해야 할 것처럼 느낄 수 있다.
- 삭제는 confirmation이 있어도 반복 row action에 있으면 attention cost가 높다.

개선안:

- row 기본 action은 `Open` 중심으로 둔다.
- `Controls`, `Policy`, `Delete`는 `Manage` 또는 `More` 안으로 이동한다.
- 가능하면 `Controls`를 안전한 structured path로 유지하고 raw policy/delete는 더 아래 단계로 내린다.
- bucket 상태는 action 버튼보다 badge/status summary로 먼저 보여준다.

우선순위: P2

### P2. Profiles 행 메뉴가 routine, diagnostic, export, destructive action을 섞는다

근거:

- `ProfilesTable.tsx`는 `Edit`, `Test`, `Benchmark`, `YAML`, `Delete`를 같은 row menu에 둔다.
- YAML import snapshot은 credential warning이 잘 되어 있지만, YAML 기능 자체는 초보 사용자에게 고급 기능이다.

사용자 불편:

- 새 사용자는 profile을 선택하고 test하는 것이 주 목적이다.
- `Benchmark`와 `YAML`은 진단/이전/고급 작업이다.
- `Delete`가 같은 레벨에 있으면 menu scanning 중 위험 기능까지 계속 읽어야 한다.

개선안:

- 기본 row action은 `Use`, `Edit`, `Test` 정도로 제한한다.
- `Benchmark`와 `YAML`은 `Advanced`, `Diagnostics`, `Import/Export` 그룹으로 이동한다.
- `YAML` 라벨은 `Export/Edit YAML` 또는 `Import/Export YAML`처럼 행동을 설명하는 이름으로 바꾼다.
- `Delete`는 분리하고 destructive confirmation의 시각적 hierarchy를 더 강하게 유지한다.

우선순위: P2

### P2. Activity / Jobs에서 필터와 레이아웃 조정이 과하게 보일 수 있다

근거:

- `JobsToolbar.tsx`는 realtime status, refresh, more, needs attention, queue health, filters & layout을 함께 다룬다.
- mobile filter sheet snapshot은 단순하지만, page-level에서는 filter/layout이 여전히 운영 상태 확인과 경쟁할 수 있다.

사용자 불편:

- job page의 핵심은 실패/진행/대기 작업을 빠르게 파악하고 복구하는 것이다.
- column customization은 table personalization이지 기본 recovery task가 아니다.
- 필터 설명 문구가 길면 실패 원인 확인보다 UI 조작을 먼저 읽게 된다.

개선안:

- 검색은 유지한다.
- status chips를 클릭하면 바로 filter가 적용되도록 한다.
- type/error filter와 column toggle은 `View` 또는 `Filters` 버튼 뒤로 이동한다. 단, filter가 active일 때는 chip으로 노출한다.
- copy/move/indexing 관련 안내는 Objects context나 empty state로 옮긴다.

우선순위: P2

### P2. Favorites pane에 설정 성격의 control이 섞여 있다

근거:

- `ObjectsFavoritesPane.tsx`는 `Favorites only`, `Open details on click`을 제공한다.
- `ObjectsFiltersDrawer.tsx`도 `Favorites only`, `Favorites first`를 제공한다.

사용자 불편:

- `Favorites only`는 filter 기능인데 tree pane과 filter drawer에 중복된다.
- `Open details on click`은 browsing pane 안의 동작 preference라서 사용자가 결과를 예측하기 어렵다.

개선안:

- `Favorites only`는 filter/view drawer에 한 곳만 둔다.
- active 상태는 chip으로 표시한다.
- `Open details on click`은 제거하거나 Settings > Objects > Advanced로 이동한다.

우선순위: P2

### P2. Light setup이 첫 진입 이후 너무 많은 목적지를 보여준다

근거:

- `LightApp.tsx`는 profile 선택 후 `/buckets`, `/objects`, `/uploads`, `/jobs`를 함께 제시한다.
- header에도 `Create profile`, `Advanced`, `Settings`가 함께 있다.

사용자 불편:

- setup의 목적은 사용자를 앱으로 진입시키는 것이다.
- Uploads/Activity는 profile 연결 직후의 주 목적지가 아니라 shell 내부에서 접근해도 충분하다.
- `Advanced`는 사용자가 어떤 문제가 생겼을 때 필요한 기능이지 첫 번째 의사결정으로 보일 필요는 낮다.

개선안:

- profile 선택 후 primary action은 `Open Objects` 하나로 둔다.
- `Buckets`는 first-time bucket creation을 위한 secondary action으로 유지한다.
- `Uploads`, `Activity`는 setup 화면에서 제거하고 authenticated shell 내부 navigation으로만 유지한다.
- `Advanced`는 `Advanced profile setup`처럼 구체적으로 바꾸거나 profile 생성 실패/특수 provider 설정 상황에서만 노출한다.

우선순위: P2

### P3. Custom menu / command palette는 유지 비용 대비 가치 검증이 필요하다

근거:

- `MenuPopover.tsx`는 custom menu/submenu behavior를 직접 구현한다.
- `ObjectsCommandPaletteModal.tsx`는 combobox/listbox semantics를 직접 구현한다.

사용자 불편:

- 현재 구조가 즉시 문제라는 뜻은 아니다.
- 다만 nested menu, focus return, Escape, disabled state, active descendant는 장기적으로 regression이 생기기 쉬운 영역이다.
- command palette가 visible menu에도 노출되면 일반 사용자에게 또 하나의 탐색 모델을 추가한다.

개선안:

- Ant Design primitive로 대체 가능한 곳은 대체한다.
- custom widget은 명확한 제품 가치가 있는 곳에만 유지한다.
- focus return, Escape, submenu keyboard, disabled item announcement, combobox active descendant 테스트를 계속 유지한다.

우선순위: P3

## 제거가 아니라 demote해야 할 기능

다음 기능들은 불필요해서 삭제할 대상이 아니라, 기본 화면에서 물러나야 할 기능이다.

- Indexed Search: 큰 bucket에서 유용하므로 search context 안에서 유지한다.
- Backup / restore / portable import: 운영상 필요하지만 task-first flow로 바꾼다.
- Benchmark: 진단에 유용하지만 기본 profile menu의 1차 항목일 필요는 낮다.
- YAML import/export: 이전과 백업에 유용하지만 label과 위치를 고급 기능으로 정리한다.
- Command palette: keyboard-heavy 사용자에게 유용하지만 기본 overflow menu에는 필요하지 않다.
- Transfer raw tuning: 통제된 환경에서는 필요하지만 expert disclosure 뒤에 둔다.

## 우선 적용할 개선 목록

1. Objects `More` 메뉴에서 `Commands`, tab 관련 액션, folder job action을 기본 노출에서 내린다.
2. Favorites pane에서 `Open details on click`을 제거하거나 advanced settings로 옮긴다.
3. Transfers 설정에서 `Max Throughput` primary styling을 제거하고 raw tuning을 expert 영역으로 이동한다.
4. Light setup에서 Uploads/Activity 직접 링크를 제거하고 `Open Objects`를 primary CTA로 둔다.
5. Bucket row action은 `Open` + `Manage` 구조로 바꾸고 `Delete`는 row 반복 노출에서 내린다.
6. Profile row menu에서 `Benchmark`, `YAML`을 `Advanced` 또는 `Diagnostics & export`로 이동한다.
7. Activity page에서 filters/columns는 active 상태가 아닐 때 compact button 뒤로 숨긴다.
8. Backup drawer를 task selector 기반 flow로 재구성한다.

## 권장 실행 계획

### Phase 1. 저위험 demotion

범위:

- Objects `More` menu
- Profiles row menu
- Light setup destinations
- Transfer preset priority
- Favorites pane behavior control

검증:

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- Objects toolbar/menu, Profiles table, LightApp, Settings transfers, Favorites pane unit test
- Objects/Login mobile responsive smoke 확인

### Phase 2. 고위험 workflow 재구성

범위:

- Backup / restore drawer
- Buckets row governance controls
- Activity filters/layout

검증:

- backup, bucket governance, jobs toolbar/table 관련 unit/e2e
- mobile visual regression snapshot 갱신
- accessibility overlay 테스트 유지

### Phase 3. telemetry 또는 사용 로그 기반 정리

관찰할 이벤트:

- command palette open/completed command
- indexed search open source
- transfer expert tuning 변경
- backup task 시작/중단
- bucket policy vs controls 진입
- profile benchmark/YAML 진입
- advanced mode toggle

판단 기준:

- 사용 빈도는 낮고 위험/유지 비용이 높은 기능은 더 깊게 숨기거나 제거한다.
- 사용 빈도가 높은데 찾기 어려운 기능은 해당 task context 안으로 승격한다.

## 최종 판단

현재 S3Desk 프론트엔드의 가장 큰 문제는 기능 부족이 아니라, 고급 기능이 기본 여정에 남아 있어 사용자가 “무엇을 먼저 해야 하는지” 판단하는 시간이 늘어나는 점이다.

즉시 삭제해야 할 기능은 많지 않다. 대신 사용자 의도, 빈도, 위험도에 따라 다음처럼 재배치하는 것이 가장 효과적이다.

- 기본 화면: 탐색, 검색, 업로드/다운로드, 실패 확인
- 관련 맥락: indexed search, view mode, filters
- advanced 영역: command palette, tabs, YAML, benchmark, raw transfer tuning
- task-first flow: backup, restore, import, cleanup
- destructive path: delete, policy deletion, cleanup

이 방향으로 정리하면 power-user 기능은 유지하면서도 일반 사용자의 인지 부담과 실수 가능성을 줄일 수 있다.
