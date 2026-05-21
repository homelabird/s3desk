# S3Desk 프론트엔드 기능 마찰 재감사 리포트 - 2026-05-22

> 참고: 이 문서는 2차 구현 전 정적 재감사 메모다. 실제 반영 내역과 최종 검증 결과는 `FRONTEND_FEATURE_FRICTION_AUDIT_ROUND2_2026-05-22.md`를 우선 기준으로 본다. 두 문서가 다른 판단을 담는 경우 최종 구현 리포트를 따른다.

대상: `frontend` 현재 구현, 기존 `FRONTEND_FEATURE_FRICTION_AUDIT_2026-05-22.md` 이후 상태.

목적: 현재 프론트엔드에 기능은 존재하지만 기본 사용자 작업을 방해하거나, 사용자에게 선택 부담을 주는 요소가 남아 있는지 프론트엔드 전문가 관점에서 재점검한다. 이 문서는 기능의 존재 여부보다 노출 위치, 우선순위, 중복 진입점, 모바일 가독성을 중심으로 판단한다.

## 결론 요약

이전 감사에서 지적된 큰 문제는 상당 부분 개선되어 있다. `Objects` 기본 화면의 고급 기능 노출, 전송 raw tuning, 백업/복원 drawer, Profiles/Buckets 행 메뉴의 고위험 기능은 현재 구현에서 이미 많이 내려가 있다.

현재 남아 있는 핵심 불편은 "기능이 너무 많다"보다 "같은 작업을 시작하는 경로가 여러 개이고, 기본 진입점의 우선순위가 사용자의 일상 작업과 어긋난다"는 점이다. 특히 업로드와 작업(Activity) 흐름이 Objects, hidden Uploads route, Activity page에 나뉘어 있어 사용자는 어떤 화면에서 시작해야 하는지 추론해야 한다.

가장 우선순위가 높은 개선 후보는 다음이다.

1. `/uploads`는 primary nav에 없지만 keyboard shortcut과 route로 접근 가능하다. 숨겨진 독립 업로드 화면은 Objects/Activity 업로드 흐름과 중복된다.
2. 로그인 후 기본 route와 nav 순서가 `Profiles`를 먼저 강조한다. 이미 profile이 선택된 사용자의 주 작업은 보통 `Objects`다.
3. Indexed Search 결과 table은 긴 object key에서 key, size, last modified 컬럼이 시각적으로 충돌한다.
4. `Activity`는 모니터링/복구 화면이면서 동시에 Upload/Download/Delete job launcher 역할을 한다. 작업 시작과 작업 복구가 섞인다.
5. Bucket policy workspace는 개선되었지만, 첫 화면에서 recommended route와 advanced route가 동시에 크게 보이며 여전히 설명량이 많다.

## 분석 방법

- 정적 코드 검토: route, shell nav, keyboard shortcuts, Objects, Uploads, Jobs, Settings, Buckets policy, Backup drawer.
- 기존 리포트 검토: `docs/FRONTEND_FEATURE_FRICTION_AUDIT_2026-05-22.md`.
- Playwright visual regression 직접 실행: `npm run test:e2e:visual -- --project=chromium`.
- 주요 visual snapshot 확인: Objects global search drawer, mobile objects grid, settings drawer, jobs filters sheet, bucket policy sheet, transfers drawer.
- 디자인 모범 사례 대조:
  - GOV.UK Design Principles: user needs, do less, make things simple.
  - NN/g progressive disclosure: 드물거나 고급인 기능은 필요 시점에 점진적으로 노출.
  - Ant Design Button guidance: 한 구역의 primary action은 제한하고, 위험 action은 danger affordance를 명확히 사용.
  - Material Design / WAI-ARIA menu patterns: menu는 임시 선택지와 보조 action에 적합하며, primary navigation이나 복잡한 workflow 설명을 대신하지 않는다.

## 현재 검증 상태

Visual suite는 현재 UI가 안정적으로 렌더링되는지 확인하는 기준선으로 실행했다.

```bash
cd /home/homelab/Downloads/project/s3desk/frontend
npm run test:e2e:visual -- --project=chromium
```

결과:

- Playwright visual 18개 시나리오 통과
- 실행 시간: 약 42.4초
- 의미: layout regression은 없지만, 안정적으로 렌더링되는 화면 안에 사용성 마찰이 남아 있을 수 있다.

## 이미 개선되어 유지할 부분

다음 항목은 현재 구현에서 이전보다 좋은 방향으로 정리되어 있으므로 제거 대상으로 보지 않는다.

- `Objects` 기본 mode가 `simple`이며, advanced-only action이 기본 toolbar에서 크게 내려가 있다.
- `Objects`의 `More` 메뉴는 이전보다 간소화되었고, Indexed Search도 기본 overflow menu에서 과도하게 튀어나오지 않는다.
- `Transfers` raw concurrency, batch, chunk tuning은 `Expert transfer tuning` collapse 뒤로 이동했다.
- `Backup and restore` drawer는 export, restore, portable import, cleanup을 task selector로 분리했다.
- `Profiles`의 Benchmark, YAML은 `Advanced` submenu로 내려갔다.
- `Buckets`의 policy/delete는 row-level primary action이 아니라 `Manage` menu로 들어갔다.
- `Jobs`의 queue health status는 filter action으로 작동해 운영 화면의 즉시성이 좋아졌다.

## 상세 발견 사항

### P1. 숨겨진 `/uploads` route와 shortcut이 업로드 workflow를 중복시킨다

근거:

- `FullAppRoutes.tsx`는 `/uploads` route를 별도 lazy page로 제공한다.
- `FullAppShellChrome.tsx`의 primary nav에는 `Uploads`가 없다.
- `useFullAppShellState.ts`는 `/uploads`에서 selected nav key를 `/objects`로 처리한다.
- `useKeyboardShortcuts.ts`와 `KeyboardShortcutGuide.tsx`는 `G then U`를 `Go to Uploads`로 노출한다.
- `UploadsPageShell.tsx`는 bucket, prefix, source 선택, queue upload를 독립 workflow로 제공한다.

사용자 불편:

- UI는 Uploads를 주요 화면으로 보여주지 않지만 shortcut guide는 주요 이동 대상으로 소개한다.
- Objects에서도 upload를 시작할 수 있고, Activity에서도 upload job을 시작할 수 있다. 같은 목적의 entry point가 셋으로 나뉜다.
- `/uploads`에 들어가면 nav는 Objects가 선택된 것처럼 보여 현재 위치와 실제 화면 제목이 어긋난다.

권장안:

- 1차 개선: `G then U` shortcut과 guide 항목을 제거하고, `/uploads`는 `/objects`의 upload flow로 redirect한다.
- 대안: Uploads를 정말 독립 기능으로 유지할 경우 primary nav에 명시하고 이름을 `Upload queue`처럼 고유한 가치가 드러나는 label로 바꾼다.
- 권장 방향은 제거/흡수다. 현재 구조에서는 독립 Uploads page가 사용자에게 새 기능을 주기보다 시작 지점을 분산시킨다.

### P1. 인증 후 기본 진입점과 nav 우선순위가 일상 작업보다 설정을 강조한다

근거:

- `/` route는 profile 존재 여부와 관계없이 `ProfilesPage`를 렌더링한다.
- primary nav 순서는 `Profiles`, `Buckets`, `Objects`, `Activity`다.
- brand link는 profile이 있으면 `/objects`로 이동하므로, nav 우선순위와 brand behavior가 서로 다른 신호를 준다.

사용자 불편:

- 이미 profile을 선택한 사용자가 앱을 열었을 때 연결 설정 화면으로 돌아간다.
- 일상 작업인 object 탐색, 업로드, 다운로드보다 setup/admin 성격의 Profiles가 먼저 보인다.
- 사용자는 "S3Desk에서 무엇을 먼저 해야 하는지"를 nav 구조만 보고 판단하기 어렵다.

권장안:

- profile이 선택되어 있으면 `/`를 `/objects`로 redirect한다.
- nav 순서를 `Objects`, `Buckets`, `Activity`, `Profiles`로 재정렬한다.
- profile이 없을 때만 Profiles를 first-run setup entry로 강조한다.
- `Profiles`는 "Connections" 또는 "Profiles" 중 제품 언어를 정하고, setup/admin screen임을 더 명확히 한다.

### P1. Indexed Search 결과 table의 긴 key 가독성이 깨진다

근거:

- `ObjectsGlobalSearchResults.tsx`는 desktop/wide mode에서 table layout을 사용한다.
- `ObjectsSearch.module.css`는 table을 `table-layout: fixed`로 두고, actions column 260px, modified column 220px, size column 120px를 예약한다.
- key text는 `inline-block`, `white-space: nowrap`, `max-width: 520px`를 사용한다.
- 확인한 visual snapshot에서 긴 object key가 Size/Last modified 영역과 시각적으로 충돌한다.

사용자 불편:

- 검색 결과에서 가장 중요한 정보는 object key인데, 긴 path가 이웃 컬럼과 겹치면 행을 비교하기 어렵다.
- row action과 metadata를 잘못 읽을 수 있어 download/open 같은 action 선택 실수로 이어질 수 있다.

권장안:

- key cell에 `min-width: 0`, `max-width: 100%`, block formatting을 적용하고 table cell 내부 overflow를 확실히 제한한다.
- desktop에서도 2-line clamp 또는 wrap-anywhere card row를 검토한다.
- actions column width를 줄이거나 icon-only action에 tooltip을 붙여 key column 공간을 회복한다.
- 긴 key fixture를 가진 visual test를 추가해 겹침을 회귀 테스트한다.

### P2. Activity가 모니터링 화면과 job launcher를 동시에 맡는다

근거:

- `JobsToolbar.tsx`의 page title은 `Activity`이고 subtitle은 background work, failures, recent queue history를 말한다.
- 같은 header에 primary `Upload` 버튼과 `New job` menu가 있다.
- `JobsEmptyState.tsx`는 upload, download, delete job을 시작하라고 안내한다.

사용자 불편:

- Activity는 실패/진행/기록을 확인하는 화면처럼 보이지만, 실제로는 새 작업을 만드는 화면이기도 하다.
- Upload 시작점이 Objects, Uploads, Activity로 분산된다.
- delete job처럼 위험도가 있는 작업이 empty state의 "새 작업 만들기" 문맥에 같이 들어간다.

권장안:

- Activity의 primary action은 `Retry`, `Show failed`, `Open logs`, `Refresh`처럼 운영/복구 중심으로 제한한다.
- 새 upload/download/delete job 생성은 Objects/Buckets context에서 시작하게 한다.
- Activity에 남겨야 한다면 `New job` 하나로 묶고, upload를 header primary로 두지 않는다.
- empty state는 "아직 기록 없음"과 "작업 시작"을 분리한다. 작업 시작 CTA는 보조 action으로 낮춘다.

### P2. Bucket policy workspace는 여전히 첫 화면 설명량이 많다

근거:

- `BucketPolicyWorkspaceHeader.tsx`는 recommended route와 advanced route를 같은 grid에 크게 노출한다.
- controls shortcut banner의 `Open Controls`는 recommended path지만 primary button이 아니다.
- `BucketPolicyContentTabs.tsx`는 S3에서 raw JSON editor를 기본 open 상태로 둔다.

사용자 불편:

- 사용자가 "권장되는 다음 행동"을 바로 선택하기보다, 두 개의 큰 설명 카드와 validation/editor 영역을 함께 읽어야 한다.
- policy는 위험도가 높은 작업이므로 recommended route와 advanced route를 같은 시각적 무게로 보여주면 초보 사용자가 advanced path를 정상 기본 경로로 오해할 수 있다.

권장안:

- 첫 화면은 `Open Controls`를 primary next action으로 만들고 advanced JSON 편집은 명시적 secondary disclosure로 내린다.
- S3처럼 JSON-only인 경우에도 "Controls first"와 "Edit raw policy"를 task selector로 나누어 사용자가 의도를 먼저 선택하게 한다.
- recommended/advanced 설명 list는 1줄 요약 + details disclosure로 줄인다.

### P2. Advanced mode가 전역 localStorage로 지속되어 UI 무게가 다시 올라갈 수 있다

근거:

- `useObjectsViewModeState.ts`는 `objectsUIMode`를 localStorage에 저장하고 기본값은 `simple`이다.
- advanced로 전환하면 이후 session/profile에서도 advanced UI가 유지된다.

사용자 불편:

- 사용자가 한 번 advanced mode를 켠 뒤 돌아오는 길을 잊으면, 앱이 계속 복잡한 상태로 남는다.
- profile이나 provider별로 필요한 고급 UI가 다를 수 있는데 브라우저 전체 설정처럼 동작한다.

권장안:

- advanced mode는 명확한 "Return to simple mode" affordance를 지속적으로 보여준다.
- 또는 profile-scoped setting으로 바꾸어 특정 profile의 고급 작업 맥락에 묶는다.
- reset saved UI state와 별개로 Objects 화면 안에서 simple mode 복귀를 더 쉽게 만든다.

### P3. Transfers의 고속 preset은 expert 안에 있지만 위험 신호가 약하다

근거:

- `TransfersSettingsSection.tsx`는 `High throughput` preset을 제공한다.
- 이 preset은 batch concurrency 32, batch size 128 MiB, chunk size 256 MiB, chunk concurrency 16, threshold 512 MiB를 한 번에 설정한다.
- 설명은 있지만 위험 affordance나 confirmation은 없다.

사용자 불편:

- 고속 preset은 성능 향상처럼 보이지만 provider throttling, browser memory pressure, request cost를 높일 수 있다.
- expert 영역 안에 있다는 사실만으로 충분한 경고가 되지는 않는다.

권장안:

- `High throughput` label을 `High throughput (more memory)`처럼 결과 중심으로 바꾼다.
- preset 클릭 후 바로 적용하지 않고 draft 상태임을 더 명확히 보여준다.
- 극단값으로 갈 때 warning text를 표시한다.

### P3. Settings의 proxy 설정 label이 구현 중심이다

근거:

- Transfers tab 안에 `Downloads and previews: Use server proxy`가 있다.
- 설명은 `/download-proxy`, presigned URL, CORS fallback을 언급한다.

사용자 불편:

- 사용자는 "다운로드/미리보기 라우팅" 문제를 해결하려는 것이지 `/download-proxy` 구현을 고르려는 것이 아니다.
- preview에도 영향을 주는 설정이 Transfers 안에 있어, 이미지 preview 문제가 생긴 사용자가 찾기 어렵다.

권장안:

- label을 `Preview and download routing` 또는 `Use server proxy for previews/downloads`로 바꾼다.
- 위치는 Transfers보다 Access 또는 Advanced/Network 쪽이 더 자연스럽다.
- CORS fallback 설명은 details/help text로 낮춘다.

### P3. Bucket/Profiles의 destructive action은 더 분리할 수 있다

근거:

- `BucketActions.tsx`의 `Manage` menu에는 Controls, Advanced policy, Delete bucket이 함께 있다.
- `ProfilesTable.tsx`의 row menu에는 routine action, Advanced submenu, Delete가 한 menu 안에 있다.

현재 평가는 "수용 가능하지만 더 개선 가능"이다. danger 표시와 divider가 있어 즉시 위험하지는 않다. 다만 storage tool에서 삭제는 반복 row menu보다 별도 danger zone이나 confirmation-first sheet로 분리하면 더 안전하다.

권장안:

- Bucket delete는 Manage menu의 마지막 danger item으로 유지하되, bucket management sheet를 만든다면 danger zone으로 분리한다.
- Profile delete도 routine action menu 안에 두기보다 profile detail/edit dialog의 danger zone으로 옮길 수 있다.

## 제거 또는 흡수 후보

현재 코드에서 "쓸데없는 기능"으로 가장 가깝게 볼 수 있는 것은 기능 자체가 아니라 독립 진입점이다.

| 후보 | 판단 | 이유 |
| --- | --- | --- |
| 독립 `/uploads` route | 제거/흡수 권장 | primary nav에는 없지만 shortcut으로 노출되고 Objects/Activity upload와 중복된다. |
| `G then U` shortcut | 제거 권장 | 숨겨진 route를 공식 shortcut처럼 만든다. |
| Activity header의 primary Upload | demote 권장 | Activity의 모니터링/복구 성격과 충돌한다. |
| Activity empty state의 delete job CTA | demote 권장 | 위험 action이 빈 상태의 시작 CTA와 같이 노출된다. |
| Bucket policy advanced route card | collapse 권장 | 권장 경로와 같은 시각적 무게로 노출된다. |
| High throughput transfer preset | 유지하되 warning 강화 | power user에게 필요하지만 기본 선택처럼 보이면 위험하다. |

## 유지하되 맥락화할 기능

다음 기능은 제거하지 않는 편이 좋다. S3Desk의 전문 도구 성격상 실제 가치가 있으나, 기본 사용자 여정과 분리되어야 한다.

- Indexed Search: 많은 object를 다루는 사용자에게 필요하다. 다만 결과 table 가독성은 고쳐야 한다.
- Command palette: power user용으로 유지하되 기본 menu의 중요한 선택지와 경쟁하지 않게 한다.
- Backup/restore: 운영상 중요하다. 현재 task selector 방향은 적절하다.
- YAML export/edit, Benchmark: profile diagnostics/advanced 영역에 유지한다.
- Raw bucket policy editor: 필요한 기능이다. 다만 Controls-first 원칙을 더 강하게 해야 한다.
- Expert transfer tuning: 유지하되 위험 preset과 proxy wording을 다듬는다.

## 권장 실행 순서

### 1단계. 진입점 정리

- `/`에서 profile이 있으면 `/objects`로 이동.
- primary nav 순서를 `Objects`, `Buckets`, `Activity`, `Profiles`로 변경.
- `G then U` shortcut과 keyboard guide 항목 제거.
- `/uploads`를 `/objects` upload flow로 redirect하거나, Uploads를 명시적 nav 기능으로 승격할지 제품 결정을 내린다.

기대 효과: 사용자가 "파일을 보고 옮기는 앱"이라는 기본 mental model을 더 빨리 잡는다.

### 2단계. 검색 결과 가독성 수정

- Indexed Search table의 key cell overflow 수정.
- 긴 key fixture로 visual regression 추가.
- actions column의 공간 사용량 재검토.

기대 효과: 많은 object를 다루는 실제 사용자의 핵심 workflow가 안정된다.

### 3단계. Activity 역할 축소

- Activity header의 `Upload` primary button 제거 또는 secondary로 demote.
- `New job` menu를 유지하더라도 download/delete는 Objects/Buckets 맥락에서 시작하도록 안내.
- empty state는 queue history 설명과 job 생성 CTA를 분리.

기대 효과: Activity가 "복구와 상태 확인" 화면으로 선명해진다.

### 4단계. 고위험/고급 기능의 선택 구조 개선

- Bucket policy 첫 화면을 Controls-first로 더 강하게 정리.
- Cleanup, delete, high throughput 같은 위험 작업은 danger affordance와 warning copy 강화.
- Advanced mode가 장기 지속될 때 simple mode 복귀 경로를 더 명확히 제공.

기대 효과: 기능은 유지하면서 초보 사용자와 반복 사용자의 실수 가능성을 낮춘다.

## 디자인 모범 사례와의 비교

- GOV.UK의 "Start with user needs"와 "Do less" 관점에서 보면, `/uploads`처럼 숨겨진 중복 entry point는 사용자 니즈보다 구현상 라우팅을 노출하는 경향이 있다. <https://www.gov.uk/guidance/government-design-principles>
- NN/g의 progressive disclosure 관점에서 보면, Bucket policy advanced route와 transfer high-throughput tuning은 필요 시점에 더 늦게, 더 명확한 의도 선택 후 노출되는 편이 낫다. <https://www.nngroup.com/articles/progressive-disclosure/>
- Ant Design Button guidance 관점에서 보면, Activity의 `Upload` primary와 job launcher는 화면의 주 목적을 흐릴 수 있다. Primary action은 구역의 추천/완료 action에 제한하는 것이 좋다. <https://ant-design.antgroup.com/docs/spec/buttons>
- WAI-ARIA APG menu button pattern 관점에서 보면, menu는 보조 command에 적합하다. 숨겨진 route나 주요 workflow를 menu/shortcut 안에만 두면 발견성과 예측 가능성이 떨어진다. <https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/>
- Material Design menu guidance 관점에서도 menu는 일시적 선택지에 적합하며, 사용자의 주요 여정을 대신하는 구조로 쓰면 선택 부담이 커진다. <https://m3.material.io/components/menus/overview>

## 최종 판단

현재 프론트엔드는 "기능 과다"의 1차 문제는 많이 해결되어 있다. 다음 개선의 핵심은 기능 삭제가 아니라 entry point 통합과 역할 분리다.

가장 먼저 손댈 곳은 `/uploads`와 Activity다. 둘 다 유용한 기능을 담고 있지만, 현재는 Objects의 기본 workflow와 겹쳐 사용자가 시작 위치를 고민하게 만든다. 그 다음은 Indexed Search table 가독성이다. 이 문제는 기능 노출보다 직접적인 읽기/선택 오류를 만들 수 있으므로 빠르게 고치는 편이 좋다.
