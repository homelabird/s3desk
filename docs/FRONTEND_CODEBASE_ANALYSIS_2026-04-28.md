# Frontend Codebase Analysis Report - 2026-04-28

## Scope

- 분석 기준: 현재 워크트리의 `frontend/src`, `frontend/tests`, `frontend/docs`, 프론트엔드에 직접 영향을 주는 API/빌드/품질 게이트.
- 관점: 프론트엔드 아키텍처, UX 품질, 상태 관리, 접근성, 성능, 테스트 유지보수성.
- 주의: 현재 저장소에는 이미 많은 수정/신규 파일이 존재한다. 이 문서는 릴리스 diff 평가가 아니라 현재 로컬 코드베이스 스냅샷 평가다.

## Verification

다음 명령은 모두 통과했다.

- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run check:e2e:geometry`
- `cd frontend && npm run test:unit`
  - `236` test files passed
  - `872` tests passed

## Follow-up Implementation Status

이 보고서를 기준으로 2026-04-28에 순차 개선을 진행했다. 아래 항목은 현재 워크트리 기준으로 개선 완료 또는 품질 게이트에 편입된 상태다.

- CSS design token alias를 추가하고 `frontend/scripts/check-css-tokens.mjs`를 lint gate에 연결했다.
- production query key 배열을 `frontend/src/api/queryKeys.ts` 중심으로 정리했다.
- reset 가능한 UI storage key/prefix를 registry로 모아 `SettingsPage` drift 위험을 줄였다.
- `Objects` 화면의 view-model surface를 location/list/selection/operation/pane 성격의 slice로 축소했다.
- `ObjectsPageScreen`, `useObjectsScreenComposition`, `useObjectsScreenList`의 production path를 전체 `data` bag 전달 대신 slice VM 인자로 전환했다.
- `buildObjectsPageDataState`의 legacy flat spread를 제거하고 slice VM만 반환하도록 좁혔다.
- production query key 배열뿐 아니라 feature test의 invalidation/query expectation도 `queryKeys.*` helper 기준으로 정리했다.
- `useObjectsPageData`에서 core route/location/view/query orchestration, location sync, selection controls, tree navigation, zip/indexing jobs, prefetch controls, search state 조립을 helper hook으로 분리했다.
- `useObjectsPageCoreState` 내부의 tree/view/query hook argument wiring을 `useObjectsPageTreeState`, `useObjectsPageViewControls`, `useObjectsPageQueryState`로 분리했다.
- `useObjectsLocationState`의 path modal/bookmark 계산과 `useObjectsPageViewState`의 scoped drawer/auto-scan/layout width 상태를 helper hook으로 분리했다.
- `useObjectsLocationState`의 tab/history navigation과 `useObjectsPageViewState`의 search/filter/mode-derived 상태 조립을 helper hook으로 분리했다.
- `useObjectsLocationState`의 invalid-bucket cleanup과 `useObjectsPageViewState`의 layout composition/keyboard shortcut wiring을 helper hook으로 분리했다.
- transfer upload runtime을 task runner와 planning/attempt/resume/session/retry/preview/fallback/commit helper로 분리했다.
- bucket governance mutation/shell 공통 흐름을 분리해 stale mutation guard와 feedback/invalidation 반복을 줄였다.
- bucket governance provider controls에서 반복되던 `mutationScope + refreshState` 생성과 mutation wiring을 공통 runner hook으로 모았다.
- bucket governance provider controls 4종을 `GovernanceControlSections` 선언형 섹션 모델로 전환해 save/loading/actions shell 반복을 공통 renderer에 모았다.
- bucket governance의 GCS/Azure/OCI field-array editor shell을 `GovernanceEditorCard`, `GovernanceEditorList`, `GovernanceNestedSectionCard` helper로 좁혔다.
- GCS IAM binding, Azure stored access policy, Azure protection, OCI retention/PAR, OCI sharing success feedback을 subcomponent/presenter로 분리했다.
- bucket governance provider controls의 API request assembly와 summary tag 계산을 `requestBuilders.ts`, `summaryTags.ts` helper로 분리했다.
- AWS/GCS/Azure/OCI provider controls의 inline form body를 `*ControlBodies.tsx` presenter로 분리해 provider controls 파일을 state/mutation/section 선언 중심으로 좁혔다.
- `uploadRuntimeTask` 단위 테스트에 resumable chunk reuse, resumable chunk validation failure, provider unsupported fallback state, session maxBytes cleanup branch를 추가했다.
- `message.*` 직접 호출을 `appFeedback` 및 feature feedback adapter로 모았다.
- `objects-mobile-responsive.spec.ts`를 숫자 기반 layout probe 대신 모바일 작업 완료 흐름 중심으로 재작성했다.
- `objects-layout-density.spec.ts`의 folders prerequisite/empty/error 상태 검증을 픽셀 측정 대신 상태 종류, 안내 문구, 오류 `alert` 역할 중심으로 전환했다.
- `objects-layout-density.spec.ts`의 global search table/favorites drawer 검증을 픽셀 밀도 대신 결과 action 노출, prefix 이동, favorites 필터/토글, favorite 선택 흐름 중심으로 전환했다.
- `objects-layout-density.spec.ts`의 capped local search status 검증을 픽셀 높이/overflow 대신 상태 문구와 Indexed Search drawer 진입 흐름 중심으로 전환했다.
- `objects-layout-density.spec.ts`의 folder tree row/header action 검증을 행 높이/indent 측정 대신 새 폴더 다이얼로그 진입과 `reports/` prefix 이동 흐름 중심으로 전환했다.
- `objects-layout-density.spec.ts`의 tab overflow 상태 검증에서 직접 `page.evaluate`를 제거하고 locator 기반 attribute assertion으로 전환했다.
- `objects-layout-density.spec.ts`의 desktop action group/compact list controls 검증을 버튼 accessibility, 새 폴더 다이얼로그, overflow menu, view mode toggle 흐름 중심으로 전환했다.
- `objects-layout-density.spec.ts`의 남은 toolbar/bucket density 측정을 탭 navigation, history button, long-bucket picker 선택 흐름으로 전환했다.
- 사용하지 않게 된 `frontend/tests/support/densityMetrics.ts` helper를 제거해 Playwright spec의 active DOM geometry probe를 없앴다.
- `MenuPopover` keyboard contract에 Arrow/Home/End에 더해 typeahead focus 이동을 추가했다.
- Objects route bundle에서 thumbnail/preview/new-folder/job feedback loader를 lazy split하고 bundle budget report를 release gate로 유지했다.
- `buildObjectsPageDataState`의 중복 flat-state 재매핑과 legacy flat spread를 제거해 slice VM만 반환하게 했다.
- Uploads route를 profile/setup gate와 authenticated workspace로 나눠 `UploadsPage` entry와 `UploadsPageExperience` payload를 별도 budget으로 감시하게 했다.
- Transfers route bundle에서 presigned upload implementation을 lazy split해 기본 Transfers chunk를 줄였다.
- bundle report에 `ObjectsPage`, `UploadsPage`, `UploadsPageExperience`, `Transfers` 상위 모듈 breakdown을 추가해 tight headroom review가 실제 원인 모듈까지 이어지도록 했다.
- Objects drag-and-drop drop execution과 clipboard paste parsing/request assembly를 action-time runtime chunk로 분리해 `ObjectsPage` gzip review 후보를 해소했다.
- Objects new-folder submit path의 folder plan/marker creation/visibility outcome 계산을 `objectsNewFolderRuntime` action-time chunk로 분리해 `ObjectsPage` gzip headroom을 추가 확보했다.
- Objects preview load path의 fetch/thumbnail cache/error formatting/runtime 계산을 `objectPreviewRuntime` action-time chunk로 분리하고 preview size limit 상수를 `objectPreviewLimits`로 분리해 first-render hook payload를 줄였다.
- Preview action은 lazy runtime cold import 중에도 즉시 `loading`/cancel 상태를 노출하고, cancel 이후 늦게 도착한 응답이 ready 상태로 되돌리지 않도록 request guard를 보강했다.
- `objectsActionCatalog.tsx`의 object/prefix/selection/global action builder를 domain별 파일로 분리해 기존 `516` line action catalog 핫스팟을 `16` line facade로 줄였다.
- `useObjectsScreenListInteractions.tsx`의 다운로드/clipboard/DnD/presign runtime 조립과 list rendering 조립을 `useObjectsScreenListActionRuntime`, `useObjectsScreenListRendering`으로 분리해 route-level facade를 `62` lines로 줄였다.
- `ObjectsPagePanes.tsx`의 tree/list/details/context-menu pane host와 fallback/idle-load helper를 별도 파일로 분리해 page panes facade를 `26` lines로 줄였다.
- 최종 품질 검사에서 `useObjectsDnd`의 lazy drop runtime cold import가 기본 `waitFor` timeout을 넘기며 테스트 호출이 다음 케이스로 흘러가던 문제를 보강했다.
- 외부 사용처가 없는 Objects list/preview/new-folder helper return/runtime type export와 pane helper prop type export를 내부 type으로 좁혔다.
- `useObjectsPageViewState`의 긴 return surface 매핑을 pure `buildObjectsPageViewState` helper로 분리해 hook 본문은 view helper wiring만 담당하게 했다.
- `useObjectsLocationState`의 scoped persistence와 기존 외부 return surface 매핑을 `useObjectsLocationPersistence`, `buildObjectsLocationState`로 분리해 route-level hook 본문을 navigation/bookmark/path modal wiring 중심으로 좁혔다.
- `ObjectsBucketPicker.tsx`의 entry model, entry list presenter, desktop popover layout lifecycle을 별도 파일로 분리해 responsive picker 본문을 desktop/mobile 렌더링 조립 중심으로 좁혔다.
- `ObjectsGlobalSearchDrawer.tsx`의 search/filter controls, index management panel, result card/table rendering을 별도 presenter로 분리해 drawer 본문을 overlay/prerequisite/error/result section 조립 중심으로 좁혔다.
- `ObjectsListRowItems.tsx`의 prefix/object row adaptor를 `ObjectsPrefixRowItem.tsx`, `ObjectsObjectRowItem.tsx`로 분리하고 기존 파일은 import 호환 re-export facade로 줄였다.
- `ObjectsListRow.tsx`의 prefix/object row presenter와 공통 keyboard/menu primitive를 `ObjectsPrefixRow.tsx`, `ObjectsObjectRow.tsx`, `ObjectsListRowPrimitives.tsx`로 분리하고 기존 파일은 import 호환 re-export facade로 줄였다.
- `ObjectsDetailsContent.tsx`의 object actions, metadata descriptions, thumbnail/preview rendering을 `ObjectsDetailsActions.tsx`, `ObjectsDetailsMetadata.tsx`, `ObjectsDetailsMediaSections.tsx` presenter로 분리해 details 본문을 prerequisite/meta state 조립 중심으로 좁혔다.
- `ObjectsImageViewerModal.tsx`의 pan/zoom state, viewer footer controls, viewer body state rendering을 `useObjectsImageViewerPanZoom`, `ObjectsImageViewerFooter`, `ObjectsImageViewerBody`로 분리해 modal session 본문을 preview orchestration 중심으로 좁혔다.

추가 검증:

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run check:e2e:geometry`
- `npm --prefix frontend run bundle:budget`
- `npm --prefix frontend run check:bundle-report`
- `npm --prefix frontend run test:unit`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectsLocationState.test.tsx src/pages/objects/__tests__/useObjectsPageViewState.test.tsx src/pages/objects/__tests__/useObjectsPageData.test.tsx`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectsClipboard.test.tsx src/pages/objects/__tests__/useObjectsDnd.test.tsx src/pages/objects/__tests__/useObjectsScreenListInteractions.test.tsx`
- query key expectation 변경 검증: `17` unit test files, `93` tests passed
- `npm --prefix frontend run test:unit -- src/lib/__tests__/storageResetRegistry.test.ts src/pages/__tests__/SettingsPage.test.tsx`
- `npm --prefix frontend run test:unit -- src/components/__tests__/MenuPopover.test.tsx src/pages/objects/__tests__/ObjectsMenuPopover.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/objects-layout-density.spec.ts --project=chromium`
- `npm --prefix frontend run test:e2e -- tests/objects-new-folder.spec.ts --project=chromium`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/objectsNewFolderRuntime.test.ts src/pages/objects/__tests__/objectsQueryCache.test.ts src/pages/objects/__tests__/useObjectsNewFolder.test.tsx`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectPreview.test.tsx`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsImageViewerModal.test.tsx src/pages/objects/__tests__/ObjectsDetailsContent.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-image-preview.spec.ts --project=chromium`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/objectsActionCatalog.test.tsx src/pages/objects/__tests__/useObjectsScreenListInteractions.test.tsx`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectsLocationState.test.tsx src/pages/objects/__tests__/useObjectsPageData.test.tsx src/pages/objects/__tests__/buildObjectsPageDataState.test.ts`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsBucketPicker.test.tsx src/pages/objects/__tests__/ObjectsToolbar.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-bucket-picker.spec.ts --project=chromium`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsGlobalSearchDrawer.test.tsx src/pages/objects/__tests__/useObjectsGlobalSearchState.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-global-search.spec.ts --project=chromium`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsListRow.test.tsx src/pages/objects/__tests__/useObjectsScreenList.test.tsx src/pages/objects/__tests__/useObjectsObjectGridRenderer.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-layout-density.spec.ts --project=chromium`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectsScreenToolbar.test.tsx src/pages/objects/__tests__/useObjectsContextMenu.test.tsx src/pages/objects/__tests__/useObjectsScreenList.test.tsx`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/ObjectsPagePanes.test.tsx`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectsScreenComposition.test.tsx src/pages/objects/__tests__/useObjectsScreenList.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/objects-clipboard-paste.spec.ts --project=chromium`
- `npm --prefix frontend run test:e2e -- tests/objects-dnd-upload.spec.ts --project=chromium`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectsScreenList.test.tsx src/pages/objects/__tests__/useObjectsScreenComposition.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/bucket-governance.spec.ts --project=chromium`
- `npm --prefix frontend run test:e2e -- tests/transfers-presigned.spec.ts --project=chromium`
- `npm --prefix frontend run test:unit -- src/components/transfers/__tests__/uploadRuntimeRetry.test.ts src/components/transfers/__tests__/useTransfersUploadRuntime.test.tsx`
- `npm --prefix frontend run test:unit -- src/components/transfers/__tests__/uploadRuntimePreview.test.ts src/components/transfers/__tests__/useTransfersUploadRuntime.test.tsx`
- `npm --prefix frontend run test:unit -- src/components/transfers/__tests__/uploadRuntimeFallback.test.ts src/components/transfers/__tests__/useTransfersUploadRuntime.test.tsx`
- `npm --prefix frontend run test:unit -- src/components/transfers/__tests__/uploadRuntimeTask.test.ts`
- `npm --prefix frontend run test:unit -- src/components/transfers/__tests__/uploadRuntimeTask.test.ts src/components/transfers/__tests__/uploadRuntimeFallback.test.ts src/components/transfers/__tests__/uploadRuntimeSession.test.ts src/components/transfers/__tests__/uploadRuntimePlanning.test.ts src/components/transfers/__tests__/uploadRuntimeAttempt.test.ts`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/buildObjectsPageDataState.test.ts src/pages/objects/__tests__/useObjectsScreenList.test.tsx src/pages/objects/__tests__/useObjectsScreenComposition.test.tsx`
- `npm --prefix frontend run test:unit -- src/pages/objects/__tests__/useObjectsPageData.test.tsx`
- `npm --prefix frontend run test:unit -- src/pages/buckets/__tests__/BucketGovernanceModal.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/uploads-folder.spec.ts --project=chromium`

남은 관리 포인트:

- `objects-layout-density.spec.ts`에는 더 이상 active DOM geometry probe가 없다. folders status, capped local search status, global search table, favorites drawer, folder tree drawer, compact action/list controls, toolbar navigation, long-bucket switching 상태는 semantic/task-flow assertion으로 전환됐다.
- `ObjectsPage` gzip budget은 `63.0 kB` 기준 실제 `60.3 kB`로 budget을 통과하고 headroom `2.7 kB`를 확보해 review 후보에서 빠졌다. 신규 기능 추가 시 계속 budget gate를 먼저 확인한다.
- action catalog는 `objectsActionCatalog.tsx` facade와 `objectsObjectActionCatalog.tsx`, `objectsPrefixActionCatalog.tsx`, `objectsSelectionActionCatalog.tsx`, `objectsGlobalActionCatalog.tsx`, `objectsActionCatalogTypes.ts`로 분리됐다. `objectsActionCatalog.tsx`는 이제 상위 `ObjectsPage` module breakdown에서 빠졌다.
- `useObjectsScreenListInteractions.tsx`는 이제 route-level return surface만 조립하고, action runtime은 `useObjectsScreenListActionRuntime.ts`, list/catalog/grid/breadcrumb wiring은 `useObjectsScreenListRendering.tsx`가 담당한다. 기존 `2.3 kB` top module 항목은 사라지고 `useObjectsScreenListRendering.tsx`가 약 `2.0 kB`로 남았다.
- `ObjectsPagePanes.tsx`는 이제 layout composition만 담당하고, `ObjectsListPaneHost.tsx`, `ObjectsTreePaneHost.tsx`, `ObjectsDetailsPaneHost.tsx`, `ObjectsContextMenuPortalHost.tsx`, `ObjectsPagePaneTypes.ts`, `objectsPaneIdle.ts`로 pane-level 책임이 분리됐다. 기존 `2.1 kB` top module 항목은 사라졌다.
- `ObjectsBucketPicker.tsx`는 `493` lines에서 `300` lines로 줄었고, `ObjectsBucketPickerEntryList.tsx`, `objectsBucketPickerModel.ts`, `useObjectsBucketPickerDesktopLayout.ts`가 각각 list presenter, entry ordering/filtering, desktop popover measurement/close lifecycle을 담당한다.
- `ObjectsGlobalSearchDrawer.tsx`는 `466` lines에서 `165` lines로 줄었고, `ObjectsGlobalSearchControls.tsx`, `ObjectsGlobalSearchIndexPanel.tsx`, `ObjectsGlobalSearchResults.tsx`가 각각 filter controls, index management, result card/table rendering을 담당한다.
- `ObjectsListRowItems.tsx`는 `388` lines에서 `2` lines re-export facade로 줄었고, `ObjectsPrefixRowItem.tsx`, `ObjectsObjectRowItem.tsx`가 각각 prefix/object row action wiring을 담당한다. 상위 `ObjectsPage` module breakdown에는 `ObjectsListRowItems.tsx` 대신 `ObjectsObjectRowItem.tsx`가 약 `1.4 kB`로 남는다.
- `ObjectsListRow.tsx`는 `385` lines에서 `2` lines re-export facade로 줄었고, `ObjectsPrefixRow.tsx`, `ObjectsObjectRow.tsx`, `ObjectsListRowPrimitives.tsx`가 각각 prefix row presenter, object row presenter, shared keyboard/menu/row-style primitive를 담당한다.
- `ObjectsDetailsContent.tsx`는 `352` lines에서 `133` lines로 줄었고, details actions, metadata descriptions, thumbnail/preview rendering이 별도 presenter 파일로 분리됐다.
- `ObjectsImageViewerModal.tsx`는 `358` lines에서 `153` lines로 줄었고, pan/zoom hook, footer presenter, body presenter가 zoom/drag, action controls, state rendering을 나눠 담당한다. lazy viewer chunk는 현재 약 `3.1 kB` gzip이며 route budget에는 실리지 않는다.
- `UploadsPageExperience` gzip budget은 `4.4 kB` 기준 실제 `4.1 kB`로 authenticated upload workspace를 별도 감시한다.
- governance provider controls는 공통 mutation runner, `ControlSection[]` renderer, editor card helper, provider별 field editor/presenter subcomponent, request/summary helper, provider form body presenter로 좁혀졌다. 남은 관리는 새 provider action이 추가될 때 이 경계를 유지하는 것이다.

## Codebase Snapshot

- 프론트엔드 스택: React 19, Vite 7, React Router 7, TanStack Query/Table/Virtual, Ant Design 6, TypeScript strict mode.
- 프로덕션 `frontend/src` TS/TSX/CSS 파일: 약 `574`개.
- 프로덕션 `frontend/src` TS/TSX/CSS 라인 수: 약 `75,907` LOC.
- 프론트엔드 unit test 파일: `236`개.
- Playwright spec 파일: `54`개.
- `Objects` 영역: `201`개 파일, 약 `27,367` LOC.
- `Buckets` 영역: `71`개 파일, 약 `9,591` LOC.

큰 파일/핫스팟:

- `frontend/src/pages/objects/ObjectsListView.module.css`: `957` lines
- `frontend/src/pages/objects/ObjectsShell.module.css`: `618` lines
- `frontend/src/pages/objects/ObjectsSearch.module.css`: `604` lines
- `frontend/src/pages/buckets/BucketPolicyModal.tsx`: `556` lines
- `frontend/src/pages/buckets/governance/shell.tsx`: `377` lines
- `frontend/src/pages/buckets/governance/GCSControlBodies.tsx`: `254` lines
- `frontend/src/pages/buckets/governance/requestBuilders.ts`: `248` lines
- `frontend/src/pages/buckets/governance/azure-controls.tsx`: `245` lines
- `frontend/src/pages/buckets/governance/gcs-controls.tsx`: `240` lines
- `frontend/src/components/transfers/uploadRuntimeTask.ts`: `233` lines
- `frontend/src/pages/buckets/governance/OCIControlBodies.tsx`: `220` lines
- `frontend/src/pages/buckets/governance/aws-controls.tsx`: `219` lines
- `frontend/src/components/transfers/useTransfersUploadRuntime.ts`: `174` lines

## Executive Summary

현재 프론트엔드는 실패하는 코드베이스가 아니다. strict TypeScript, OpenAPI 기반 타입 생성, React Query, lazy route chunking, mobile/e2e 문서, 풍부한 unit coverage가 이미 갖춰져 있다.

부족한 점은 기능 미완성보다 "복잡한 운영형 UI를 장기적으로 안전하게 바꾸기 위한 경계"에 집중되어 있다. 특히 `Objects`, transfer runtime, bucket governance, CSS token/design-system 일관성, query key/storage key registry가 다음 유지보수 비용을 만든다.

우선순위는 다음 순서가 현실적이다.

1. 깨진/정의되지 않은 CSS design token 정리 완료 및 lint gate 유지
2. `Objects`의 거대한 view-model surface 축소
3. transfer upload runtime state machine 분리
4. bucket governance provider controls 중복 제거
5. query key와 localStorage key registry 통합
6. feedback/toast copy 체계화
7. responsive E2E는 task-completion 중심으로 유지하고 geometry gate를 회귀 방지 장치로 사용하기

## Strengths

### 1. 기본 품질 게이트가 좋다

- `strict` TypeScript가 켜져 있다.
- lint, typecheck, unit tests가 현재 통과한다.
- Playwright suite가 desktop, mobile, live, webview, transfer, chaos 성격으로 잘 나뉘어 있다.
- `check:e2e:geometry`가 있어 Playwright 테스트에 저신호 layout probe가 무분별하게 들어오는 것을 막는다.

### 2. API contract 기반이 좋다

- `frontend/src/api/openapi.ts`는 `openapi-typescript`로 생성된다.
- `frontend/src/api/types.ts`가 생성 타입을 앱 타입으로 노출한다.
- `frontend/scripts/check-openapi-drift.mjs`가 API 타입 drift를 별도 검증한다.

### 3. 초기 로딩 성능 의식이 있다

- route-level `lazy()` 분할이 적용되어 있다.
- transfer runtime은 `TransfersShell`에서 요청 시 lazy bridge로 로드된다.
- Vite `manualChunks`와 bundle budget tooling이 존재한다.
- 현재 `dist/index.html` 기준 초기 preload gzip은 대략 `86 kB` 수준이다.

### 4. 접근성 기반 컴포넌트가 있다

- `A11yLiveRegions`, `AntdToastAnnouncer`, `OverlaySheet`, `DialogModal`, `useOverlayLayer`, `AppTabs`가 있다.
- focus trap, Escape 처리, body scroll lock, tab keyboard navigation 같은 기본기가 구현되어 있다.

## Findings

### P0. CSS design token alias와 lint gate가 적용됐다

영향:

- danger/warning/surface alias가 `frontend/src/index.css`에 정의되어 오류/위험/표면 색상 token이 무효 처리되지 않는다.
- CSS token 사용처는 lint gate에서 검사되어 새 미정의 `--s3d-*` 사용이 들어오면 실패한다.

근거:

- `frontend/src/index.css`는 light/dark theme 모두에서 다음 alias를 정의한다.
  - `--s3d-color-danger: var(--s3d-color-error)`
  - `--s3d-color-danger-bg: var(--s3d-color-error-bg)`
  - `--s3d-color-warning: var(--s3d-color-warning-border)`
  - `--s3d-color-surface: var(--s3d-color-bg-card)`
- `frontend/scripts/check-css-tokens.mjs`는 CSS 파일의 `--s3d-*` 정의와 `var(...)` 사용처를 비교한다.
- `frontend/package.json`의 `lint` script는 ESLint 뒤에 `npm run check:css-tokens`를 실행한다.
- 현재 `npm --prefix frontend run lint`는 `47 CSS files, 71 tokens` 기준으로 통과한다.

권고:

- 새 design token을 추가할 때는 light/dark 정의를 함께 추가한다.
- fallback 없는 `var(--s3d-*)` 사용은 lint gate가 막도록 유지한다.

### P1. `Objects` 상태 surface는 slice 중심으로 축소됐다

영향:

- 작은 UI 변경도 location/search/filter/selection/actions/preview/tree/query 상태를 함께 이해해야 한다.
- 컴포넌트 분리는 되어 있고, `buildObjectsPageDataState`는 slice VM을 직접 만들도록 정리됐다.
- `ObjectsPageScreen` -> `useObjectsScreenComposition` -> `useObjectsScreenList` production path는 이제 전체 `data` bag 대신 필요한 slice VM을 받는다.
- legacy flat spread를 제거해 `buildObjectsPageDataState`는 `locationVm`, `listVm`, `selectionVm`, `operationVm`, `paneVm`만 반환한다.
- `useObjectsPageCoreState`는 environment/location/bootstrap 조립만 남기고 tree/view/query hook argument wiring을 helper로 분리했다.
- path modal, bookmark/path option, scoped drawer, auto-scan readiness, layout width observer는 별도 helper로 분리됐다.
- tab/history navigation은 `useObjectsLocationTabs`, invalid-bucket cleanup은 `useObjectsInvalidLocationCleanup`으로 분리됐다.
- scoped location persistence는 `useObjectsLocationPersistence`, 기존 return surface 매핑은 `buildObjectsLocationState`로 분리됐다.
- search/filter 조립은 `useObjectsPageViewFilters`, mode/cache/TTL 파생 상태는 `useObjectsViewModeState`, layout composition은 `useObjectsPageLayoutState`, path keyboard shortcut은 `useObjectsPathKeyboardShortcut`으로 분리됐다.
- 남은 위험은 `buildObjectsLocationState`와 `buildObjectsPageViewState` 같은 route-level surface 매핑 지점이 새 기능 추가 시 다시 커질 수 있다는 점이다.

근거:

- `frontend/src/pages/objects/useObjectsPageData.ts`는 `83` lines다.
- `frontend/src/pages/objects/useObjectsPageCoreState.ts`는 `49` lines다.
- `frontend/src/pages/objects/useObjectsPageTreeState.ts`는 `26` lines다.
- `frontend/src/pages/objects/useObjectsPageViewControls.ts`는 `31` lines다.
- `frontend/src/pages/objects/useObjectsPageQueryState.ts`는 `43` lines다.
- `frontend/src/pages/objects/useObjectsLocationState.ts`는 `96` lines다.
- `frontend/src/pages/objects/useObjectsLocationPersistence.ts`는 `87` lines다.
- `frontend/src/pages/objects/buildObjectsLocationState.ts`는 `58` lines이며 location helper 반환값을 기존 외부 surface로 명시 매핑한다.
- `frontend/src/pages/objects/useObjectsLocationTabs.ts`는 `182` lines다.
- `frontend/src/pages/objects/useObjectsInvalidLocationCleanup.ts`는 `85` lines다.
- `frontend/src/pages/objects/useObjectsPageViewState.ts`는 `76` lines다.
- `frontend/src/pages/objects/buildObjectsPageViewState.ts`는 `123` lines이며 view helper 반환값을 기존 외부 surface로 명시 매핑한다.
- `frontend/src/pages/objects/useObjectsPageViewFilters.ts`는 `34` lines다.
- `frontend/src/pages/objects/useObjectsViewModeState.ts`는 `95` lines다.
- `frontend/src/pages/objects/useObjectsPageLayoutState.ts`는 `41` lines다.
- `frontend/src/pages/objects/useObjectsPathKeyboardShortcut.ts`는 `17` lines다.
- `frontend/src/pages/objects/useObjectsPathModalState.ts`는 `94` lines다.
- `frontend/src/pages/objects/useObjectsPathBookmarks.ts`는 `55` lines다.
- `frontend/src/pages/objects/useObjectsScopedDrawers.ts`는 `39` lines다.
- `frontend/src/pages/objects/useObjectsAutoScanReadiness.ts`는 `26` lines다.
- `frontend/src/pages/objects/useObjectsLayoutWidth.ts`는 `24` lines다.
- `frontend/src/pages/objects/useObjectsPageLocationSync.ts`는 `35` lines다.
- selection controls는 `frontend/src/pages/objects/useObjectsPageSelectionControls.ts`, tree navigation은 `frontend/src/pages/objects/useObjectsTreeNavigation.ts`, zip/indexing jobs는 `frontend/src/pages/objects/useObjectsPageJobs.ts`로 분리됐다.
- search state는 `frontend/src/pages/objects/useObjectsPageSearchState.ts`, prefetch controls는 `frontend/src/pages/objects/useObjectsPagePrefetchControls.ts`로 분리됐다.
- location validation과 route state sync는 `frontend/src/pages/objects/useObjectsPageLocationSync.ts`로 분리됐다.
- `frontend/src/pages/objects/useObjectsNewFolder.tsx`는 `234` lines이고 dialog state/mutation shell만 보유한다.
- `frontend/src/pages/objects/objectsNewFolderRuntime.ts`는 `145` lines로 action-time folder plan/create/visibility 계산을 담당한다.
- `frontend/src/pages/objects/objectsCreatedPrefix.ts`는 `16` lines로 생성된 folder marker의 visible prefix 계산을 공유한다.
- `frontend/src/pages/objects/useObjectsPageTreeState.ts`가 tree 초기화 인자 매핑을 담당한다.
- `frontend/src/pages/objects/useObjectsPageViewControls.ts`가 view state 초기화 인자 매핑을 담당한다.
- `frontend/src/pages/objects/useObjectsPageQueryState.ts`가 query 초기화와 location sync 연결을 담당한다.
- `frontend/src/pages/objects/buildObjectsPageDataState.ts`는 `locationVm`, `listVm`, `selectionVm`, `operationVm`, `paneVm`만 반환한다.
- `frontend/src/pages/ObjectsPageScreen.tsx`는 slice VM을 명시적으로 `useObjectsScreenComposition`에 전달한다.
- `frontend/src/pages/objects/useObjectsScreenComposition.tsx`와 `frontend/src/pages/objects/useObjectsScreenList.tsx`는 더 이상 `data` prop을 받지 않는다.

권고:

- 다음 단계는 Objects route state facade가 다시 커지지 않도록 새 상태를 slice별 helper에만 추가하고, `ObjectsPage` bundle review 후보 상태를 계속 추적하는 것이다.
  - `locationVm`: bucket, prefix, tabs, path modal, navigation
  - `listVm`: rows, virtualizer inputs, search/filter/sort, empty state
  - `selectionVm`: selected keys, range selection, bulk actions
  - `operationVm`: upload/download/delete/copy/move/zip/index actions
  - `paneVm`: tree/details/global search/filter drawer visibility
- 새 Objects state를 추가할 때는 flat `data` 확장 대신 위 slice 중 하나에 명시적으로 넣는다.

### P1. Transfer upload runtime state machine은 hook 밖으로 분리됐다

영향:

- `useTransfersUploadRuntime.ts`는 이제 retry re-selection, queue scheduling, job event bridge, React state 연결만 담당한다.
- presigned/direct/staging upload 선택, resume, chunk planning, fallback, progress, commit, job handoff는 `runUploadTask`와 하위 helper로 이동했다.
- upload failure나 fallback UX를 바꿀 때는 hook보다 `uploadRuntimeTask`와 하위 helper 단위에서 검증할 수 있다.

근거:

- `frontend/src/components/transfers/useTransfersUploadRuntime.ts`는 `174` lines다.
- `frontend/src/components/transfers/uploadRuntimeTask.ts`는 `233` lines다.
- `frontend/src/components/transfers/__tests__/uploadRuntimeTask.test.ts`는 `373` lines, `7`개 task-orchestration branch 테스트를 갖는다.
- `uploadRuntimeTask`, `uploadRuntimePlanning`, `uploadRuntimeSession`, `uploadRuntimeResume`, `uploadRuntimeAttempt`, `uploadRuntimeRetry`, `uploadRuntimePreview`, `uploadRuntimeFallback`, `uploadRuntimeCommit`으로 주요 계산/실행 경로를 분리했다.
- bundle report에서 `Transfers` gzip은 `14.5 kB` budget 대비 실제 `12.4 kB`이며 review 후보가 없다.

권고:

- `uploadRuntimeTask` 직접 단위 테스트가 success, invalid resume settings, resumable chunk reuse/failure, provider fallback state, session maxBytes cleanup, abort cleanup branch를 커버한다.
- hook은 현재처럼 task queue scheduling과 React state update만 담당하게 유지한다.

### P1. Bucket governance provider controls는 공통 shell과 helper로 좁혀졌다

영향:

- AWS/GCS/Azure/OCI controls가 provider별로 커지던 가장 큰 반복부는 공통 shell, provider field editor/presenter, request builder, summary tag builder로 분리됐다.
- provider별 차이를 유지해야 하는 것은 맞지만, 현재는 공통 control contract보다 컴포넌트 내부 절차가 더 강하다.
- mutation scope, stale response guard, feedback, refresh invalidation은 `useGovernanceControlMutation` runner로 모였다.
- save button, loading, disabled, actions, section wrapper는 `GovernanceControlSections` 공통 renderer가 담당한다.
- GCS binding, Azure stored access policy, OCI retention/PAR의 반복 card/list shell은 governance shell helper가 담당한다.
- GCS binding, Azure stored access policy, OCI retention/PAR field update body는 provider별 editor card subcomponent가 담당한다.
- Azure protection body와 OCI sharing success feedback도 provider 파일 밖 presenter가 담당한다.
- API request payload assembly는 `requestBuilders.ts`, summary chip 계산은 `summaryTags.ts`가 담당한다.
- AWS/GCS/Azure/OCI inline control form body는 provider별 `*ControlBodies.tsx` presenter가 담당한다.

근거:

- `frontend/src/pages/buckets/governance/aws-controls.tsx`: `219` lines
- `frontend/src/pages/buckets/governance/AWSControlBodies.tsx`: `208` lines
- `frontend/src/pages/buckets/governance/gcs-controls.tsx`: `240` lines
- `frontend/src/pages/buckets/governance/GCSControlBodies.tsx`: `254` lines
- `frontend/src/pages/buckets/governance/GCSBindingEditorCard.tsx`: `154` lines
- `frontend/src/pages/buckets/governance/azure-controls.tsx`: `245` lines
- `frontend/src/pages/buckets/governance/AzureControlBodies.tsx`: `148` lines
- `frontend/src/pages/buckets/governance/AzureStoredAccessPolicyEditorCard.tsx`: `120` lines
- `frontend/src/pages/buckets/governance/AzureProtectionControlsBody.tsx`: `203` lines
- `frontend/src/pages/buckets/governance/oci-controls.tsx`: `213` lines
- `frontend/src/pages/buckets/governance/OCIControlBodies.tsx`: `220` lines
- `frontend/src/pages/buckets/governance/OCIRetentionRuleEditorCard.tsx`: `86` lines
- `frontend/src/pages/buckets/governance/OCIPreauthenticatedRequestEditorCard.tsx`: `144` lines
- `frontend/src/pages/buckets/governance/OCISharingCreatedRequests.tsx`: `28` lines
- `frontend/src/pages/buckets/governance/requestBuilders.ts`: `248` lines
- `frontend/src/pages/buckets/governance/summaryTags.ts`: `115` lines
- `frontend/src/pages/buckets/governance/shell.tsx` exposes `GovernanceControlSections`, `GovernanceControlSectionModel`, `GovernanceEditorCard`, `GovernanceEditorList`, `GovernanceNestedSectionCard`.
- `frontend/src/pages/buckets/governance/useScopedGovernanceMutation.ts` exposes `useGovernanceControlMutation`.

권고:

- provider별 파일은 control state, mutation, section schema만 보유하게 한다.
- 공통 mutation runner, section renderer, field-array card shell, provider별 field editor/presenter subcomponent, request/summary helper는 도입됐다.
- 새 provider action을 추가할 때는 inline JSX를 provider controls 파일에 누적하지 말고 `*ControlBodies.tsx`, field editor card, request/summary helper 중 하나로 먼저 위치를 정한다.

### P1. Query key 중앙화는 production과 test expectation에 반영됐다

영향:

- React Query cache invalidation drift 위험이 줄었다.
- query key 형태를 바꿀 때 production 호출부와 feature test expectation이 같은 helper 계약을 따른다.

근거:

- `frontend/src/api/queryKeys.ts`가 `buckets.policy`, `buckets.governance`, `jobs.uploadEtags`, `jobs.scope`, `jobs.detail`, `profiles.*`, `objects.*` key builder를 제공한다.
- `frontend/src/pages/buckets/useBucketPolicyQuery.ts`, `frontend/src/pages/buckets/useBucketPolicyMutations.ts`, `frontend/src/pages/buckets/BucketGovernanceModal.tsx`, `frontend/src/pages/buckets/governance/invalidation.ts`, `frontend/src/pages/jobs/useJobsUploadDetails.ts`는 raw array 대신 `queryKeys.*`를 사용한다.
- Objects/Jobs/Buckets/Profiles feature test의 invalidation expectation도 `queryKeys.*`를 사용한다.
- raw key 배열은 `frontend/src/api/__tests__/queryKeys.test.ts`처럼 query key contract 자체를 검증하는 위치에만 남긴다.

권고:

- 새 React Query key를 추가할 때는 `frontend/src/api/queryKeys.ts`를 먼저 확장한다.
- feature test는 raw array 기대값 대신 `queryKeys.*` 결과를 기준으로 맞춘다.
- raw array expectation은 query key builder 자체를 검증하는 API 단위 테스트에만 둔다.

### P2. Reset 가능한 UI storage registry가 도입됐다

영향:

- `SettingsPage`의 reset 동작이 화면 내부 상수 목록이 아니라 공통 registry를 통해 실행된다.
- profile/server scoped UI state는 prefix 기반으로 함께 정리되어 reset drift 위험이 줄었다.
- API token 같은 credential 성격의 storage는 reset 대상에서 제외된다.

근거:

- `frontend/src/lib/storageResetRegistry.ts`가 `RESETTABLE_UI_STATE_KEYS`, `RESETTABLE_UI_STATE_PREFIXES`, `clearResettableUiState`를 제공한다.
- `frontend/src/pages/SettingsPage.tsx`는 `clearResettableUiState()`만 호출한다.
- `frontend/src/lib/__tests__/storageResetRegistry.test.ts`는 registry reset이 UI keys와 scoped prefixes를 지우면서 unrelated secrets를 유지하는지 검증한다.
- `frontend/src/pages/__tests__/SettingsPage.test.tsx`는 Settings reset 버튼이 legacy/global/scoped UI state를 실제로 제거하는지 검증한다.

권고:

- 새 persistent UI state를 추가할 때는 key 또는 prefix가 `storageResetRegistry`에 포함되는지 먼저 결정한다.
- credential, provider secret, dismissed dialog preference처럼 별도 reset 정책을 가진 항목은 UI state reset에 섞지 않는다.
- reset 테스트는 새 scope prefix나 key class가 추가될 때 함께 확장한다.

### P2. 사용자 feedback copy는 adapter 중심으로 수렴됐다

영향:

- Ant Design `message.*` 호출 경계가 `appFeedback`으로 좁혀졌다.
- feature별 feedback adapter가 copy ownership을 가지므로 같은 상황의 문구 drift 위험이 줄었다.
- 장기 작업 상태와 일회성 toast의 경계는 feature adapter에서 계속 관리해야 한다.

근거:

- production source의 직접 `message.*` 호출은 `frontend/src/lib/appFeedback.ts`에만 남아 있다.
- Objects, Jobs, Buckets, Profiles, Uploads, Transfers는 각각 `objectsFeedback`, `jobsFeedback`, `bucketsFeedback`, `profilesFeedback`, `uploadsFeedback`, `transfersFeedback` adapter를 사용한다.
- 공유 action copy는 `frontend/src/lib/actionHints.ts`, provider operation result copy는 `frontend/src/lib/providerOperationFeedback.ts`로 분리됐다.

권고:

- 새 toast는 `appFeedback` 직접 호출보다 feature feedback adapter에 먼저 추가한다.
- provider별 ok=false/validation copy는 `providerOperationFeedback`을 재사용한다.
- 장기 작업 상태는 toast보다 task row, drawer, inline alert로 우선 노출한다.

### P2. `Objects` responsive E2E는 task-flow 중심으로 정리됐다

영향:

- 기존 숫자 기반 layout assertion은 UI refactor 때 false failure를 만들기 쉬웠다.
- `MOBILE_RESPONSIVE_E2E.md`의 "task completion over geometry" 원칙에 맞춰 Objects responsive coverage를 실제 작업 완료 흐름 중심으로 정리했다.

근거:

- `frontend/scripts/check-e2e-geometry-probes.mjs`는 통과한다.
- `frontend/tests/objects-layout-density.spec.ts`에는 active DOM geometry probe가 남아 있지 않다.
- `frontend/tests/support/densityMetrics.ts`는 더 이상 사용되지 않아 제거됐다.
- `objects-layout-density.spec.ts`는 `673` lines로 여전히 큰 Playwright spec 중 하나다.

권고:

- 새 responsive E2E는 "실제 작업을 완료할 수 있는가"와 semantic state 중심으로 추가한다.
- density contract가 정말 필요한 항목이 생기면 먼저 제품 요구사항으로 명확히 적고, `check:e2e:geometry` 예외를 코드 리뷰에서 별도로 정당화한다.
  - bucket/prefix 이동
  - drawer에서 필터 적용
  - 선택 후 작업 실행
  - preview 열고 닫기
  - transfer queue 확인

### P2. Custom menu/popover keyboard contract가 명확해졌다

영향:

- `role="menu"`와 `role="menuitem"`에 맞는 기본 keyboard navigation이 구현됐다.
- trigger focus restore, Escape 처리, disabled item inert behavior, submenu open/close가 테스트로 고정됐다.
- menu semantics를 유지하는 동안 새 menu surface도 같은 helper를 공유할 수 있다.

근거:

- `frontend/src/components/menuKeyboard.ts`가 ArrowDown/ArrowUp/Home/End와 typeahead focus 이동을 담당한다.
- `frontend/src/components/MenuPopover.tsx`는 root menu에 `handleMenuKeyboardNavigation`을 연결한다.
- `frontend/src/components/__tests__/MenuPopover.test.tsx`는 focus restore, close source, disabled item, Arrow/Home/End, typeahead, nested submenu behavior를 검증한다.
- `frontend/src/pages/objects/__tests__/ObjectsMenuPopover.test.tsx`도 Objects action menu의 keyboard focus movement를 검증한다.

권고:

- 새 custom menu는 `MenuPopover` 또는 `handleMenuKeyboardNavigation`을 재사용한다.
- submenu depth가 더 깊어질 경우 현재 group semantics와 focus model이 충분한지 별도 테스트를 추가한다.

### P3. Bundle risk는 관리되고 있지만 계속 예산 감시가 필요하다

영향:

- 현재 lazy split은 괜찮지만, Ant Design과 Objects route가 계속 커질 가능성이 높다.

근거:

- 현재 `dist` 기준 gzip 상위 JS:
  - `vendor-ui`: 약 `162.1 kB`
  - `ObjectsPage`: 약 `60.3 kB`
  - `vendor-react-dom`: 약 `55.0 kB`
  - `vendor-data`: 약 `29.6 kB`
  - `FullApp`: 약 `27.5 kB`
- 초기 HTML preload는 상대적으로 작지만, Objects/Buckets governance 기능을 열 때 큰 chunk가 따라온다.
- Objects drag-and-drop drop execution은 `objectsDndRuntime`, clipboard paste parsing/request assembly는 `objectsClipboardRuntime`으로 분리되어 기본 route chunk에 실리지 않는다.
- Objects new-folder submit path는 `objectsNewFolderRuntime`으로 분리되어 기본 route chunk의 first-render 계산 표면을 줄였다.
- Objects preview load path는 `objectPreviewRuntime`으로 분리되어 preview fetch, thumbnail cache, formatting/error handling이 user action 이후에 로드된다.
- Objects action catalog는 domain별 builder로 분리되어 `objectsActionCatalog.tsx` 단일 모듈이 더 이상 `ObjectsPage` top module breakdown에 나타나지 않는다.
- Objects list interaction orchestration은 action runtime과 rendering wiring으로 분리되어 `useObjectsScreenListInteractions.tsx` 단일 모듈이 더 이상 `ObjectsPage` top module breakdown에 나타나지 않는다.
- Objects panes composition은 pane host별 파일로 분리되어 `ObjectsPagePanes.tsx` 단일 모듈이 더 이상 `ObjectsPage` top module breakdown에 나타나지 않는다.
- bundle report 기준 `ObjectsPage`는 `63.0 kB` budget 대비 실제 `60.3 kB`, headroom `2.7 kB`이며 budget review candidate가 없다.

권고:

- `npm run bundle:budget`를 release gate에서 계속 유지한다.
- governance/policy/preview/editor 계열은 지금처럼 route 또는 modal-level lazy loading을 유지한다.
- `ObjectsPage` chunk가 다시 커질 때는 global search, local-device modal, action-time-only behavior 중 실제 first-render에 필요 없는 runtime을 우선 lazy split한다.

## Recommended Execution Plan

### Immediate

- `Objects` E2E는 현재 geometry-free 흐름으로 유지하고, 새 responsive assertion은 task-flow/semantic state를 기본값으로 둔다.
- 신규 query key, storage key, feedback copy가 생기면 기존 registry/adapter 경계를 먼저 확장한다.
- bundle budget report에서 tight headroom route가 생기면 action-time runtime split 후보를 먼저 확인한다.

### Next

- Objects route에 새 action을 추가할 때 first-render state와 action-time runtime을 분리해 `ObjectsPage` budget headroom을 유지한다.
- provider-specific governance form body가 다시 커지지 않도록 `*ControlBodies.tsx` presenter 경계를 유지한다.
- upload mode/fallback 정책을 바꿀 때는 현재 `uploadRuntimeTask` branch coverage 목록에 새 branch를 추가한다.

### Later

- shared CSS module hot spots를 token/utility/presenter 단위로 점진적으로 줄인다.
- provider governance에 새 cloud/provider action이 들어오면 request/summary/body presenter 경계를 유지하는 단위 테스트를 추가한다.
- 모바일 responsive coverage는 계속 task completion flow 중심으로 유지한다.

## Non-Goals

- Ant Design을 교체할 필요는 없다. 현재 문제는 컴포넌트 라이브러리 선택보다 feature boundary와 token/feedback governance에 가깝다.
- `Objects`를 한 번에 다시 쓰는 것은 권장하지 않는다. 현재 테스트가 풍부하므로 slice별 view-model 축소가 더 안전하다.
- E2E geometry assertion을 전부 제거할 필요는 없다. 밀도 contract가 실제 제품 요구사항인 곳은 남겨도 된다.
