# S3Desk 프론트엔드 디자인·사용성 진단 및 개선

작성일: 2026-10-11. 현재 작업 트리의 코드와 로컬 mock API를 사용한 브라우저 렌더링을 기준으로 작성한다. 과거 디자인 보고서나 스크린샷만으로 현재 품질을 판단하지 않는다.

## 판단

기본적인 색상 토큰, 명암 테마, 데스크톱 표와 모바일 카드 전환, 터치 영역, 주요 페이지의 제목과 버튼 위계는 갖춰져 있다. 하지만 작업 상태를 구별하는 표시, 실패 뒤 복구, 키보드 조작, 화면을 압축했을 때의 탐색에 실제 빈틈이 있다. 기능을 추가하기보다 이 부분의 완성도를 먼저 높여야 한다.

이번 작업은 Profiles, Buckets, Objects, Uploads, Activity, Transfers, 로그인과 Settings의 현재 화면·주요 컴포넌트를 검토하고, 재현 가능한 문제를 기존 소유 컴포넌트에서 수정한다. 배포나 아카이브 준비 완료를 판정하는 보고서는 아니다.

## 확인된 문제와 수정 기준

| 우선순위 | 문제와 사용자 영향 | 수정 전 근거 | 개선 기준 |
| --- | --- | --- | --- |
| P1 | Activity 진단 필터의 첫 입력에서 Tab을 누르면 팝오버가 닫혀 다음 입력으로 갈 수 없다. | `JobsToolbar.tsx`의 Diagnostics가 기본 `closeOnTab=true`를 사용한다. 같은 파일의 Table layout은 이미 이를 끈다. | 진단 폼 내부의 Tab 이동을 보장하고 Escape로 닫기를 유지한다. |
| P1 | Profiles 조회 실패 화면에서 재시도할 방법이 없어 새로고침에 의존한다. 캐시가 없는 실패를 빈 목록으로 보여 주면 원인도 혼동된다. | `ProfilesStatusSection.tsx`, `useProfilesPageState.ts`, `buildProfilesPagePresentationProps.ts` | 실패 메시지와 Retry를 함께 제공한다. 재시도 중 중복 요청을 막고, 캐시된 목록과 선택 상태를 보존한다. |
| P1 | Activity 작업 상세 조회가 실패했는데도 스피너가 계속 남아 대기 중으로 오해하게 한다. | `JobsDetailsDrawer.tsx`의 `detailsJobId && !job` 분기 | 초기 로딩, 실패, 재시도 로딩을 구분하고 실패 상태에서 회전을 끝낸다. |
| P2 | Activity Active / Failed / Succeeded 필터는 색만 다르고 현재 선택을 구별하지 못한다. | `JobsToolbar.tsx`, `JobsToolbar.module.css`의 health card | 실제 필터 선택을 `aria-pressed`와 테두리/배경으로 함께 표현한다. 상태를 나타내는 색과 선택 표시를 구별한다. |
| P2 | 데스크톱 사이드바를 접으면 48px 레일만 남고 탐색 링크가 모두 사라진다. 넓은 작업 영역을 쓰면서 페이지를 바꾸려면 다시 펼쳐야 한다. | `FullAppShellChrome.tsx`의 조건부 `AppNavigation`, `FullAppInner.module.css` | 접힌 레일에 기존 탐색 아이콘·선택 표시를 유지한다. 이름과 포커스를 보존하며 저장된 접힘 설정을 그대로 사용한다. |
| P2 | Profiles와 Activity 모바일 목록의 초기 로딩 스피너는 상태 이름이 없어 무엇을 불러오는지 알기 어렵다. | `ProfilesStatusSection.tsx`, `JobsTableSection.tsx` | 이름이 있는 status로 표시하고 오류 상태에서 초기 로딩 표시가 남지 않도록 한다. |
| P2 | 320px 화면에서 긴 마지막 폴더명이 경로 영역 밖으로 잘린다. 상위 폴더 메뉴의 이름은 `.../`뿐이고 경로 버튼의 키보드 포커스 윤곽도 제거돼 있다. | `ObjectsListView.module.css`, `useObjectsBreadcrumbItems.tsx`; 이전 CSS 재현 시 마지막 버튼의 오른쪽 좌표 458.8px | 긴 폴더명을 영역 안에서 줄바꿈하고, 상위 폴더 메뉴 이름·현재 위치·별도 포커스 윤곽을 제공한다. |
| P2 | 프로필은 있지만 활성 프로필이 없는 시작 안내에서 “프로필을 선택하라”는 문구 옆 기본 버튼이 “다른 프로필 생성”이다. | `ProfilesOnboardingCard.tsx`의 `hasProfile && !activeProfile` 상태 | “Choose a profile”을 기본 동작으로 제공하고 기존 목록으로 이동한다. 다른 프로필 생성은 보조 동작으로 둔다. |

## 디자인 관점의 평가

- **정보 위계:** 페이지 제목, 작업 버튼, 목록 컨테이너의 구분은 이미 명확하다. Activity의 선택 상태와 상세 실패 표시처럼 판단에 영향을 주는 정보를 먼저 보강한다.
- **작업 효율:** Objects의 검색·정렬·뷰 전환과 Uploads의 기기 선택·업로드 대상은 기존 구조를 유지한다. 접힌 탐색에서도 페이지 이동이 가능하도록 개선한다.
- **모바일:** 작은 화면에서 카드 전환과 주요 터치 영역은 이미 구현돼 있다. 긴 경로, 중간 너비, 폼 내부 포커스 이동은 루트 화면 스크린샷만으로 검증할 수 없어 별도로 확인한다.
- **피드백:** 성공 화면만큼 실패·복구·진행 중 상태가 중요하다. 실패 뒤 계속 도는 표시와 재시도 경로 누락을 수정한다.
- **일관성:** 기존 Ant Design, 공통 토큰, 팝오버와 상태 소유 경계를 사용한다. 새로운 디자인 시스템이나 추가 의존성은 만들지 않는다.

## 1차 검증 및 완료 기록

위의 여덟 항목을 기존 소유 컴포넌트에서 구현했다. API, 데이터 형식, 저장된 프로필·작업, 의존성은 변경하지 않았다. 접힌 사이드바는 64px 아이콘 레일로 바뀌며 기존 `appSidebarCollapsed` 설정을 계속 사용한다. 작업 상세 정보가 없는 동안에는 Delete도 비활성화한다.

| 확인 대상 | 검증 결과 |
| --- | --- |
| Profiles·Jobs·Objects 소유 단위 테스트 10개 파일 | Node 22에서 40개 통과. 오류/캐시/중복 요청, 초기 로딩, 진단 필터, 선택 상태, 상세 실패, 시작 안내, 경로 메뉴를 확인했다. |
| 앱 셸 및 사이드바 설정 단위 테스트 | 4개 + 8개 통과. 모바일 헤더와 데스크톱 접기·복원, 설정 저장을 확인했다. |
| Profiles 오류 → Retry → 성공 | iPhone/Pixel Chromium 에뮬레이션에서 빈 캐시·활성 프로필 캐시 조합 4개 통과. 320 CSS px에서 버튼 영역·선택 보존·이름 있는 로딩을 확인했다. |
| Activity 진단 필터와 작업 상세 실패 복구 | 브라우저 회귀 2개 통과. Tab/Shift+Tab/Escape 및 값 보존, 상세 데이터 없는 실패 후 Refresh 성공을 확인했다. |
| Activity 모바일 상태·주요 조작 | iPhone/Pixel Chromium 에뮬레이션 4개 통과. 320 CSS px와 기기 뷰포트에서 조작 영역 및 선택 상태를 확인하고 교정한 fixture의 기준 이미지와 비교했다. |
| 긴 경로 | 320/768/1440px 브라우저 회귀 3개 통과. 전체 폴더명 표시, 현재 위치, 포커스, 상위 폴더와 루트 이동을 확인했다. |
| 접힌 탐색 및 Objects 목록 | 브라우저 회귀 2개 통과. 목록 폭 재배치, 상세 패널 전환, 설정 복원, 아이콘으로 Uploads/Objects 이동을 확인했다. |
| Profiles 기존 성공 화면 | 데스크톱·모바일·다크 시각 회귀 2개 통과. 오류 알림 간격을 추가하면서 기존 성공 화면의 기준선은 보존했다. |
| 정적 검사 및 빌드 | `npm run lint`, `npm run typecheck`, `npm run build`, `npm run bundle:budget`, `npm run check:design`, `npm run check:e2e:geometry` 통과. |
| 전체 시각 회귀 | `npm run test:e2e:visual -- --workers=1`: 38개 중 36개 통과. 기존 Objects 데스크톱 명암 이미지 2개는 경로 코드 글자의 픽셀 차이로 실패했다. 아래 한계를 참조한다. |

소유 단위 테스트 실행은 `npm run test:unit -- <변경 소유 테스트 파일들> --maxWorkers=1 --testTimeout=30000`을 사용했다. 브라우저 회귀는 `jobs-flow.spec.ts`, `jobs-overlays.spec.ts`, `profiles-mobile-responsive.spec.ts`, `objects-breadcrumb-responsive.spec.ts`, `objects-layout-density.spec.ts`의 해당 사례를 실행했다. 로컬 호스트 부하로 초기 기본 제한 시간 실행에서 기존 테스트도 시간 초과했고, 저장소 제한을 바꾸지 않고 실행 시 제한 시간을 늘려 재검증했다. 최초 빌드는 종료 코드 143으로 끝났고 이후 정상 빌드와 bundle-budget의 분석 빌드가 통과했다.

`check:design-audit`는 61개 검토용 패턴을 알리는 advisory 검사다. 통과가 모든 시각 문제의 부재를 의미하지 않는다. 색 대비 검사는 등록된 토큰 조합을 검사하며, 전체 화면이나 보조공학 사용성 인증이 아니다.

### 화면 근거

- [접힌 탐색 기준 이미지](../tests/design-audit-visual.spec.ts-snapshots/design-audit-navigation-collapsed-chromium-linux.png): 다섯 경로, 현재 위치 강조, 키보드 포커스. 이름 툴팁은 별도 브라우저 assertion으로 확인했다.
- [모바일 Activity 선택 필터](../tests/design-audit-visual.spec.ts-snapshots/design-audit-jobs-selected-filter-mobile-chromium-linux.png): 상태 색과 현재 선택을 구별하는 테두리·배경.
- 작업 상세 오류: `/tmp/s3desk-jobs-capture/job-details-error.png`. 오류와 Refresh를 표시하고 스피너를 멈춘다.
- Profiles 캐시 유지와 재시도: `/tmp/s3desk-profiles-recovery/` 아래의 `profiles-error-cached-320.png`, `profiles-retry-empty-320.png`.
- 긴 경로 비교: `/tmp/s3desk-responsive-audit/breadcrumb-{before,after}-{320,768,1440}.png`.

임시 경로의 이미지는 이번 로컬 실행 산출물이며 저장소에 포함하지 않는다. 시각 기준 이미지는 직접 확인한 의도적인 변경만 반영한다.

긴 경로의 이전 화면 비교는 별도의 임시 브라우저에서 기존 `nowrap`·너비 제한 없는 CSS를 재적용한 재현 화면이다. 수정 뒤 화면은 현재 앱 코드의 렌더링이다. 320px에서 수정 뒤 마지막 버튼 오른쪽 좌표는 206.5px, 텍스트 scrollWidth/clientWidth는 177/177px이며 전체 이름이 세 줄로 표시된다. 768px과 1440px에서도 이름과 포커스가 확인됐고 기존 목록 구조를 유지한다.

Activity 화면을 검토하면서 발견한 `transfer_upload` 표기는 제품의 지원 작업 형식이 아니라 모바일 테스트 fixture에만 존재했다. 제품에 새 형식을 추가하지 않고 fixture를 지원되는 `transfer_sync_staging_to_s3`와 실제 폴더 payload로 교정했다. 1차에서는 시각 기준 이미지를 탐색 레일·선택 필터 2개 새로 추가하고, fixture를 사용하는 Activity 이미지 4개를 갱신했다. 그 외 기존 기준 이미지는 1차에서 변경하지 않았다.

### 검사 환경과 남은 한계

브라우저는 로컬 Vite와 mock API를 사용했다. Node 22.23.1을 사용했고, Fedora 호스트의 폰트 차이를 줄이기 위해 `/tmp`의 Liberation/DejaVu 폰트와 `FONTCONFIG_FILE=/tmp/s3desk-fonts/fontconfig.conf`를 사용했다. 앱 폰트나 의존성을 추가한 것은 아니다.

전체 시각 회귀는 38개 중 36개가 통과했다. 실패한 기존 Objects 데스크톱 명암 이미지의 차이는 경로 코드 글자 영역에 한정됐고 각각 142/136픽셀로 기존 100픽셀 허용 기준을 넘었다. 위치·크기나 다른 영역의 차이는 확인되지 않았다. 이 영역의 제품 스타일을 바꾸지 않았으며 폰트 보정 뒤 나머지 기존 이미지가 통과한 점에서 호스트의 폰트 렌더링 차이로 판단한다. 두 이미지의 기준선과 허용 기준은 보존했다. 동일한 기준 환경에서의 시각 회귀 재확인은 남아 있다.

실제 iOS/Android 기기, WebKit·Firefox, 스크린리더, 실제 공급자 연결, 배포 환경은 이번 검증 범위에 포함하지 않았다. `./scripts/check.sh fast/full`도 실행하지 않았다. 따라서 이 리포트는 디자인 개선의 로컬 근거이며 배포·아카이브 완료 근거가 아니다.

## 추가 디테일 검토 — 2차

1차에서 해결한 상태·탐색 문제에 이어, 실제 조작 순서와 행동의 시각적 의미를 검토했다. 우선 선택해야 하는 입력이 뒤에 있거나, 실행 버튼이 긴 미리보기 아래에 묻히거나, 적용 전후 입력 상태를 구별하지 못하는 문제를 개선했다.

| 우선순위 | 추가 문제와 수정 전 근거 | 개선 방향 |
| --- | --- | --- |
| P2 | Uploads는 버킷을 먼저 선택해야 파일을 추가할 수 있는데 Selection이 Destination보다 먼저 나온다. 320px 초기 화면에서 비활성 Add from device와 “Select a bucket first”가 실제 Bucket 입력보다 위에 있다. | Destination → Selection으로 배치하고 대상/출처의 역할을 구별한다. |
| P2 | 긴 파일명 6개와 긴 prefix를 선택하면 Queue upload가 320px 화면의 y=2093px까지 밀린다. 버튼은 141px, 보조 버튼은 128/125px로 좁고 다음 줄에 나뉜다. | 파일 수·용량 요약 바로 다음에 실행 버튼을 놓고, 360px 이하에서 버튼을 전체 폭으로 세로 배치한다. 전체 파일명과 대상은 계속 확인할 수 있다. |
| P2 | Uploads의 최초 버킷 조회는 입력 placeholder에만 표시돼 비활성 입력의 이유를 구별하기 어렵다. | 입력 가까이에 이름 있는 Loading buckets 상태를 표시하고 완료·실패 때 종료한다. |
| P1 | Buckets의 새로고침 오류 분기가 캐시 목록과 검색을 모두 숨긴다. 버킷 생성 후 inventory 조회가 실패하면 기존 버킷도 사라진 것처럼 보인다. | 마지막으로 읽은 목록과 검색을 유지하고, 갱신 실패·캐시 표시임을 warning으로 알린다. 초기 조회 실패는 기존 error로 구별한다. |
| P1 | 모바일 bucket Controls의 primary 버튼은 dark 배경 토큰을 글자색으로 사용해 대비가 3.04:1이다. 로컬 덮어쓰기를 제거해도 실제 ConfigProvider의 primary hover는 light 3.73:1, dark 4.46:1이다. | 로컬 버튼 덮어쓰기를 제거하고 Ant Design 토큰을 사용한다. 공통 hover를 최소 조정하고 실제 계산 토큰과 브라우저의 일반·hover·focus 대비를 검사한다. |
| P2 | Login에서 검증 실패 후 올바른 입력으로 수정해도 과거 오류가 남는다. 요청 중 입력을 수정하면 검증한 값과 표시하는 값도 어긋난다. 오류 상태를 연결한 뒤에도 공통 CSS가 오류 테두리를 파란색으로 덮는 것을 실제 이미지에서 확인했다. | 편집할 때 이전 검증 오류를 지우고 요청 중 입력을 잠근다. 공통 오류 상태 테두리는 명암 테마의 error 토큰을 사용하며 hover·키보드 focus에서도 유지한다. |
| P2 | Settings API token의 Apply가 값이 같아도 주요 동작으로 활성화돼 있다. 편집한 값이 아직 적용되지 않은 상태도 구별하지 못한다. | 실제 변경 때만 Apply를 활성화하고 미적용 안내를 표시한다. Enter 적용과 재열기 동작을 유지한다. |
| P2 | 공통 DialogModal·OverlaySheet의 닫기 버튼은 `outline: none`과 0px border로 키보드 포커스 윤곽이 보이지 않는다. New folder는 입력의 중복 autoFocus 때문에 닫은 뒤 여는 버튼으로 초점도 돌아오지 않는다. 실제 브라우저에서 두 문제를 재현했고 삭제 확인창의 코드에서도 동일한 중복을 확인했다. | 두 닫기 버튼에 동일한 2px focus 윤곽과 hover 배경을 적용한다. New folder와 삭제 확인창의 초기 입력 초점은 기존 overlay 소유자에 맡긴다. Escape와 초점 복원을 검사하며 파괴적 작업의 확인 입력·처리 중 잠금은 유지한다. |
| P2 | Transfers의 Remove는 끝난 전송 기록만 지우는데 빨간 휴지통으로 표시돼 저장소 파일 삭제처럼 보인다. 실제 소유 action은 종료된 행과 로컬 참조만 제거한다. | 중립 버튼과 닫기 아이콘으로 바꾸고 “Remove from transfer history”로 동작 범위를 설명한다. |
| P2 | Transfers의 긴 서버 오류가 모바일 Retry보다 먼저 나와 복구 버튼이 첫 전송 패널 밖으로 밀린다. 실제 320px 재현에서 Retry의 viewport ratio가 0이다. | 제목·실패 상태·복구 동작을 먼저 표시하고 상세 오류는 바로 아래에서 전체 줄바꿈한다. 오류를 숨기거나 잘라내지 않는다. |

검토했지만 수정하지 않은 항목도 있다. Buckets의 63자 무구분 이름과 Settings의 긴 프로필 ID는 320px에서 이미 전체 줄바꿈과 선택이 가능했다. 모양만 바꾸기 위한 스타일은 추가하지 않았다.

### 2차 검증 및 완료 기록

추가 열 항목을 기존 소유 컴포넌트와 공통 토큰에서 구현했다. 새로운 의존성이나 API 형식은 추가하지 않았다. 파괴적 작업의 확인 입력과 처리 중 잠금, 업로드 대상·파일명 확인 및 기존 콜백을 유지한다.

| 확인 대상 | 검증 결과 |
| --- | --- |
| Uploads section·builder 3개 파일 및 페이지 통합 | 12개 + 6개 통과. 대상 선행 순서, 요약 다음 실행 버튼, 최초 조회 상태와 기존 업로드 동작을 확인했다. |
| Login·Settings 소유 단위 2개 파일 | 17개 통과. 편집 후 오류 해제, 요청 중 입력 잠금, 미변경 Apply·Enter 차단, 변경된 토큰 적용과 미적용 안내를 확인했다. |
| DialogModal·OverlaySheet·Transfers 및 삭제 확인창 | 20개 + 4개 통과. 전송 콜백·기록 제거 설명, 초기 입력 초점, fine pointer에서 Escape 후 시작 버튼 복원과 처리 중 닫기 잠금을 확인했다. |
| Buckets shell·list·governance 3개 파일 | 서로 다른 47개 사례의 통과를 확인했다. Shell 6개, List/Governance 38개 통과 후 15초 제한에 걸린 GCS/Azure/OCI 3개를 분리 실행해 통과했다. 한 번의 전체 실행 통과를 의미하지 않는다. |
| 정적 검사·빌드 | `npm run lint`, `npm run bundle:budget`(타입 검사·분석 빌드 포함), `npm run check:design`, `npm run check:e2e:geometry` 통과. |
| 실제 테마 토큰 대비 | `npm run check:design-contrast -- --fail-on-findings` 통과. primary 일반·hover·active 모두 기준 이상이며 hover는 light 6.63:1, dark 4.58:1이다. |

단위 테스트는 Node 22와 `--maxWorkers=1`로 실행했다. Uploads 페이지·Login/Settings·Buckets shell·삭제 확인창 집중 실행에는 `--testTimeout=30000`을 사용했다. 최초 Buckets 47개 실행은 36개 통과·11개 시간 초과 및 worker RPC 시간 초과 1개로 끝났다. List/Governance 재실행은 38개 통과·3개 시간 초과였으며, 다음 분리 명령에서 나머지 세 사례가 기존 개별 15초 제한 안에 통과했다.

```bash
npm run test:unit -- src/pages/buckets/__tests__/BucketGovernanceModal.test.tsx --maxWorkers=1 --testNamePattern 'renders (GCS|Azure|OCI) controls and updates'
```

위 집중 실행과 재실행을 합쳐 서로 다른 단위 사례 106개의 통과를 확인했다. 전체 단위 테스트 모음을 한 번에 통과했다는 의미는 아니다.

### 2차 브라우저 검증과 화면 근거

최종 컴파일 결과를 로컬 Vite preview와 mock API로 확인한 브라우저 회귀는 25개 모두 통과했다. 데스크톱 Chromium 3개와 iPhone/Pixel Chromium 에뮬레이션 각 11개다.

| 확인 대상 | 브라우저에서 확인한 결과 |
| --- | --- |
| 공통 창·Transfers 3개 | New folder의 초기 입력 초점, 닫기 버튼의 2px 키보드 윤곽, Escape 후 시작 버튼 복원. 320/768px 전송 오류의 전체 줄바꿈, 화면 안의 Retry, 기록 제거 버튼의 설명과 중립 스타일. |
| Buckets 각 기기 6개 | 초기 오류/캐시 오류 후 복구, 검색·기존 목록 보존, 명암 테마 Save의 일반·실제 hover·키보드 focus 대비, Create 취소 및 policy/controls 닫기. |
| Login 각 기기 1개 | 명암 테마의 오류 테두리가 일반·hover·키보드 focus에서 유지됨, 편집 후 오류 해제와 요청 중 입력 잠금. |
| Settings 각 기기 2개 | 긴 프로필 ID 줄바꿈, 미변경 Apply 비활성·미적용 안내, 토큰 적용 후 닫기·재열기 값 보존. |
| Uploads 각 기기 2개 | 최초 조회 상태 종료, 대상 선행 순서, 긴 파일명 미리보기보다 앞선 실행 버튼과 320px 전체 폭 배치. |

검증 명령은 `frontend/`에서 다음과 같이 실행했다. `PATH=/tmp/s3desk-node22:$PATH`, `FONTCONFIG_FILE=/tmp/s3desk-fonts/fontconfig.conf`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18881`, `PLAYWRIGHT_TEST_TIMEOUT_MS=120000`, `PLAYWRIGHT_EXPECT_TIMEOUT_MS=15000`, `PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-detail-built-final`을 지정했다.

```bash
npm run test:e2e -- tests/design-details.spec.ts tests/buckets-mobile-responsive.spec.ts tests/settings-mobile-responsive.spec.ts tests/login-mobile-responsive.spec.ts tests/uploads-mobile-responsive.spec.ts --project=chromium --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=1 --grep 'dialog close button|transfer errors|recovers failed bucket inventory|keeps governance save text|opens and closes the create bucket flow|opens policy and controls overlays|long profile ID|login validation follows|settings access token survives|bucket loading|destination and queue controls'
```

Uploads 별도 캡처 2개도 통과했다. 동일한 320px·긴 파일명 6개·긴 prefix 조건에서 Queue upload는 y=2093px에서 823.2px로 이동했고, 세 실행/관리 버튼의 폭은 270px로 같아졌다. 캡처는 `/tmp/s3desk-detail-uploads/`의 `after-{initial,actions,selection,loading}-320.png`이며 이전 비교 화면도 같은 디렉터리에 있다. 최종 입력·오류·포커스 화면은 `/tmp/s3desk-detail-built-final/` 아래 각 사례의 PNG로 남겼다. 임시 캡처는 저장소에 포함하지 않는다.

개발 서버에서 먼저 실행한 모바일 22개는 18개 통과·4개 실패였다. 두 사례는 초기 Retry가 로딩 표시로 교체된 뒤에도 비활성 Retry를 기다린 테스트 가정이 잘못돼 수정했다. 나머지 두 사례는 동적 모듈 요청 실패였다. 최종 코드를 변경하지 않고 컴파일된 preview에서 위 25개를 다시 실행해 모두 통과했다.

전체 시각 검사는 `npm run test:e2e:visual -- --workers=1`로 최종 38개 중 36개가 통과했다. 위 preview·Node·폰트 환경에서 expect 제한만 10초로 지정했고, 최종 산출물은 `/tmp/s3desk-detail-visual-final/`에 남겼다.

갱신 전 실행은 30개 통과·8개 실패였다. 의도한 변화 6개는 예상/실제/차이 이미지를 직접 검토한 뒤 해당 사례만 `--update-snapshots`로 갱신했다. Uploads 모바일·데스크톱의 대상 선행 순서, Transfers 데스크톱의 중립 기록 제거와 오류 배치, Buckets 삭제 경고의 닫기 포커스, Settings 모바일·데스크톱의 비활성 Apply와 닫기 포커스다. 갱신 중 preview 종료로 3개 검사가 연결/준비 오류로 끝났고, preview 재시작 후 나머지 3개를 이어 갱신했다. 기준선 갱신 뒤 전체 실행에서 이 여섯 사례가 모두 통과했다.

- [Uploads 모바일 기준 이미지](../tests/design-audit-visual.spec.ts-snapshots/design-audit-uploads-mobile-chromium-linux.png): 대상 선택과 파일 선택의 순서.
- [Settings 모바일 기준 이미지](../tests/workflows-visual-regression.spec.ts-snapshots/settings-mobile-drawer-chromium-linux.png): 미변경 Apply 비활성과 닫기 버튼의 키보드 초점.

남은 실패 2개는 1차와 동일한 Objects 데스크톱 명암 이미지의 경로 코드 글자 차이 142/136픽셀이다. 검토한 이전 차이 이미지와 최종 차이 이미지의 SHA-256도 각각 같았다. 호스트 글꼴 렌더링 차이로 판단하며 해당 기준 이미지와 100픽셀 허용치는 변경하지 않았다. 시각 검사 전체 통과를 의미하지 않는다.

2차 정적 `check:design`도 61개 advisory 패턴을 알린다. 추가한 대비 검사는 실제 설치된 Ant Design의 계산 토큰을 명암 테마에서 확인하지만 전체 화면의 접근성을 인증하지 않는다. 실제 기기, WebKit·Firefox, 스크린리더, 공급자 연결·배포, 전체 단위 모음과 `./scripts/check.sh fast/full`은 실행하지 않았다. 동일한 기준 환경에서 Objects 시각 차이를 재확인하는 작업은 남아 있다.

## 추가 디테일 검토 — 3차

2차 수정이 반영된 작업 트리를 기준으로, 폼을 편집한 뒤의 레이블·유효성·처리 상태와 길거나 확장되는 작업 메뉴를 추가 검토했다. 아래 열 항목을 기존 소유 컴포넌트에서 개선했다.

| 문제와 수정 전 근거 | 반영한 개선 |
| --- | --- |
| 백업·복원·portable import의 비밀번호 입력은 placeholder에만 의존한다. 입력 뒤 용도와 필수 여부를 계속 확인할 수 없다. | 기존 FormField로 연결된 레이블을 유지하고 export의 두 필수 입력을 표시한다. 실제 비밀번호나 새 저장 방식은 추가하지 않는다. |
| 백업 export 비밀번호 확인이 달라도 Download가 활성이고, 클릭 뒤 별도 오류에서만 이유를 알 수 있다. | 입력 옆 mismatch 오류와 연결된 오류 상태를 제공하고, 비밀번호가 없거나 다르면 Download를 비활성화한다. 기존 제출 검증은 유지한다. |
| 백업 작업 선택 버튼은 현재 작업 상태를 보조공학에 전달하지 않는다. | 다섯 기존 버튼의 실제 선택 상태를 aria-pressed에 연결한다. |
| Profiles의 Browser endpoint·Azure ARM 등 접힌 고급 입력에 오류가 생겨도 내부 details가 계속 닫혀 있다. aria-invalid 입력의 테두리도 정상 파란색으로 남는다. | 제출 오류 입력의 모든 접힌 조상을 열고 첫 오류로 초점·스크롤을 이동한다. 반복 제출·오류 수정 중에도 열린 상태를 유지하며 모달 내부 오류 필드·Password wrapper에 오류 테두리를 표시한다. |
| Profiles 저장 중 footer만 잠기고 폼과 헤더 닫기는 편집 가능한 모습이다. 대기 중 바꾼 값은 제출된 값과 다르다. disabled를 반영해도 전역 !important가 입력의 정상 배경·텍스트를 유지하는 것을 캡처에서 확인했다. | 생성·편집 모두 native fieldset와 기존 Ant Design disabled 설정으로 입력·선택·토글을 잠근다. 기존 입력 변경 경로도 잠그고 헤더 닫기·Cancel에 같은 처리 상태를 표시한다. 저장 중 AntD 입력에는 기존 비활성 배경·텍스트 토큰을 적용한다. |
| Objects 상세의 최초 metadata 로딩·오류 중에는 선택 키 없이 작업 아이콘만 먼저 보인다. 320px 수정 전 캡처에서도 확인됐다. | metadata가 표시되지 않는 동안 선택 키를 작업 버튼보다 먼저 전체 줄바꿈한다. 성공 화면의 기존 Key 행과 중복하지 않는다. |
| Objects Rename·선택 Move는 확인 입력이 비어 있어도 주요 실행 버튼이 활성이다. 실제 hook은 제출 후 정확한 문구를 검사해 거절한다. | 버튼과 Enter 제출 준비 조건을 기존 정확한 RENAME/MOVE 확인 규칙에 맞춘다. 이름·선택·목적지·처리 중 상태도 반영하며 기존 mutation 검증을 유지한다. |
| 공통 Popover는 available-height를 계산하지만 CSS에서 사용하지 않는다. 568×320 Profiles tools 확장 메뉴가 화면 아래로 넘쳤다. | 계산된 최대 높이와 내부 스크롤을 사용하고 내용 크기가 변하면 기존 위치를 다시 계산한다. End·Escape와 초점 복원을 검사한다. |
| Objects 조상 메뉴의 긴 무공백 이름·깊은 경로는 패널 폭과 화면 높이를 넘는다. 320px 수정 전 검사에서 viewport 경계를 벗어났다. | 공통·Objects 메뉴 레이블을 영역 안에서 줄바꿈하고 최소 폭도 실제 가용 폭으로 제한한다. 깊은 경로의 마지막 조상으로 키보드 이동·선택을 확인한다. |
| NumberField는 각 키를 즉시 caller에 보내고 caller가 최솟값으로 보정한다. Upload chunk size에서 64를 입력하려고 첫 자리 6을 쓰면 실제 화면은 16이 된다. | 유효값·spinner 값은 기존처럼 즉시 적용한다. 빈값·범위 밖의 미완성 입력만 잠시 유지하고 blur/Enter 때 기존 caller의 범위 보정·기본값 규칙을 사용한다. |

새 의존성·API·공급자 설정 규칙은 추가하지 않았다. 프로필·작업·백업 데이터 형식과 숫자 설정의 기존 범위·기본값을 유지한다. 실제 작업에 사용되는 기존 컴포넌트를 수정했으며 production caller가 없는 HelpTooltip 등은 변경하지 않았다. 프로필 상태색은 모달 내부의 오류 필드와 비활성 입력에 한정하며 전역·일반 편집·읽기 전용 스타일은 유지한다. 저장 대기와 개별 Session Token 비활성 모두 실제 입력의 disabled 상태를 사용한다.

### 3차 검증 기록

| 집중 단위 범위 | 결과 |
| --- | --- |
| SidebarBackupAction | 23개 통과. 연결된 비밀번호 레이블, mismatch 후 차단·복구, 선택 작업 상태와 기존 export/restore/import 검증. |
| ObjectsDetailsContent·ObjectsDestructiveActionForms | 10개 통과. 로딩·캐시 포함 오류·성공의 대상 키와 Retry, Rename/Move dialog·sheet의 버튼/Enter 확인·대상·처리 중 조건. |
| ProfileModal·profileModalValidation | 16개 통과. 고급 오류 패널·초점, 반복 제출, 생성/편집 입력·선택·토글·닫기 잠금 및 재활성화. |
| NumberField·PopoverSurface | 15개 통과. 여러 자리 입력·허용 0·유효값 즉시 적용, 미완성 값의 blur/Enter 처리와 기존 Popover 위치·키보드 동작. |
| SettingsPage 기존 caller 통합 | 9개 통과. 숫자 입력 소유자 변경 뒤 기존 transfer/retry 설정의 즉시 저장과 설정 탭·범위 동작. |

각 소유 파일을 Node 22에서 `npm run test:unit -- <소유 테스트 파일> --maxWorkers=1`로 실행했다. Objects 두 파일에는 `--testTimeout=20000`을 사용했다. 서로 다른 73개는 해당 집중 실행을 합한 수이며 전체 unit 모음 결과는 아니다. 프로필 신규 unit의 초기 실패는 overlay의 초기 초점 대기, 필수 레이블의 별표 조회, 유효하지 않은 Azure UUID fixture를 교정했다. 빌드에서 단위 role 조회의 불필요한 Playwright 옵션을 발견해 제거한 뒤 Profiles 16개와 Settings 9개를 함께 재실행해 통과했다. 제품의 UUID 검증은 변경하지 않았다.

수정 전 컴파일 화면에서 백업 선택 상태, 짧은 화면의 확장 메뉴, 깊은 조상 메뉴, 숫자 첫 자리 보정, metadata 로딩 중 대상 키 누락을 재현했다. 처음 브라우저 준비에서 잘못 가정한 Settings 초기 탭과 아이콘을 포함한 menuitem 이름은 기존 테스트의 실제 진입/이름 규칙으로 교정했다. 교정 뒤 숫자 화면은 기대한 6 대신 16, 상세 대상은 없는 상태로 실패해 해당 문제를 확인했다. 수정 전 이미지와 trace는 `/tmp/s3desk-refinement-before/`, `/tmp/s3desk-refinement-before-common/`, `/tmp/s3desk-refinement-before-corrected/`에 남겼다.

| 3차 정적·빌드 범위 | 결과 |
| --- | --- |
| `npm run lint` | 통과. CSS 토큰과 runtime import cycle 검사도 통과했다. 최종 disabled selector·브라우저 조회 교정 뒤에는 CSS 토큰 검사와 해당 테스트의 ESLint를 다시 실행해 통과했다. |
| `npm run bundle:budget` | 통과. TypeScript 빌드·Vite 분석 빌드와 번들 예산 검사를 포함한다. |
| `npm run check:design` | 통과. 61개 advisory 패턴과 등록된 34개 토큰 대비 조합을 검사했다. 전체 화면의 접근성 인증을 의미하지 않는다. |
| `npm run check:e2e:geometry` | 통과. 백업·Objects 테스트 교정 뒤에도 다시 확인했다. |

### 3차 브라우저 검증과 화면 근거

이번 컴파일 결과를 로컬 Vite preview와 mock API로 확인했고, 아래 서로 다른 22개 브라우저 사례의 통과를 확인했다. Chromium 프로젝트에서 CSS viewport를 직접 지정한 결과이며 실제 모바일 기기 검증은 아니다. 백업·공통·Objects 소유자는 해당 실행 뒤 변경하지 않았고, 마지막 프로필 상태색 보완은 최종 빌드에서 Profile 10개를 재검증했다.

| 집중 브라우저 범위 | 결과와 확인 내용 |
| --- | --- |
| 백업 비밀번호·작업 선택 4개 | 320/768px × light/dark. 연결된 필수·선택 비밀번호 레이블, mismatch 오류·차단·복구, 작업별 aria-pressed와 가로 넘침을 확인했다. |
| 기존 백업 신뢰 흐름 2개 | 1280/390px. 신뢰 변경 뒤 preview 재실행 요구, partial import 및 recovery path 표시를 유지한다. |
| 공통 컨트롤 3개 | 568×320px 확장 메뉴 내부 스크롤·End·Escape·초점 복원, 320px 무공백 조상 이름 줄바꿈·마지막 경로 선택, 숫자 설정의 `6→64`·spinner·Enter·blur와 즉시 저장을 확인했다. |
| Objects 3개 | 320px 긴 키를 metadata 로딩·오류 중 먼저 표시하고 Retry 뒤 성공 Key 행과 중복하지 않는다. Rename과 390px Move의 정확한 확인·대상 조건 및 루트 목적지를 확인했다. |
| Profiles 10개 | 기존 provider/edit 2개와 320px/light·1440px/dark의 Browser endpoint 반복 오류·Azure ARM 두 패널·생성/편집 저장 대기 8개. 첫 오류 입력의 초점·viewport, 오류 테두리의 일반·hover·keyboard focus 및 편집 후 정상색 복원을 확인했다. 저장 중 Input·Password wrapper의 비활성 색·테두리·그림자, 개별 Session Token 지우기 선택/해제 후 색 복원, 변경/닫기 잠금과 완료 후 프로필 표시도 확인했다. 너비와 테마의 전체 2×2 조합은 아니다. |

첫 결합 실행에는 필수 별표까지 포함하는 label의 exact 조회와 GET 503 자동 재시도를 고려하지 않은 mock 오류가 있었다. label 조회와 실제 transport 재시도에 맞춘 mock을 교정했다. 첫 desktop 백업 진입에서는 동적 모듈 요청의 `ERR_NETWORK_CHANGED`도 trace에 남았고, 재실행에서 해당 사례가 통과했다. 제품의 FormField 레이블이나 API 재시도 동작은 변경하지 않았다.

교정 결합 실행은 14개가 통과한 뒤 Profiles의 같은 label 조회 대기에서 종료했다. 나머지 Profile 조회를 교정하고 Profile 10개를 별도로 실행해 모두 통과했다. 이후 캡처에서 확인한 프로필 상태색을 보완했으며, 새 Password wrapper 검사에서 잘못 지정한 상대 조회 범위도 교정했다. 최종 Profile 10개는 명암 상태색 assertion까지 43.4초에 모두 통과했다. 따라서 22개는 결합 실행의 14개와 최종 Profile 집중 실행의 10개에서 중복된 기존 Profile 2개를 제외한 수이며, 한 번의 22개 전체 실행 통과를 의미하지 않는다.

명령은 `frontend/`에서 실행했다. 공통 환경은 `PATH=/tmp/s3desk-node22:$PATH`, `FONTCONFIG_FILE=/tmp/s3desk-fonts/fontconfig.conf`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18881`, `PLAYWRIGHT_TEST_TIMEOUT_MS=90000`, `PLAYWRIGHT_EXPECT_TIMEOUT_MS=10000`이다. 결합 실행의 `PLAYWRIGHT_OUTPUT_DIR`는 `/tmp/s3desk-refinement-final-corrected`, 최종 Profile 집중 실행은 `/tmp/s3desk-refinement-profiles-appearance-corrected`이다.

```bash
npm run test:e2e -- tests/design-refinements.spec.ts tests/design-objects-refinements.spec.ts tests/common-controls-responsive.spec.ts tests/profiles-provider-forms.spec.ts tests/backup-trust.spec.ts --project=chromium --workers=1
npm run test:e2e -- tests/profiles-provider-forms.spec.ts --project=chromium --workers=1
```

위 두 임시 디렉터리의 PNG를 직접 검토했다. 백업의 명암 레이블·오류 줄바꿈·선택 작업, 메뉴의 내부 스크롤·긴 조상 이름, Objects의 대상→작업→오류/Retry 순서를 확인했다. 프로필 오류 테두리와 비활성 입력·footer도 명암에서 확인했다. 숫자 캡처는 빈 입력의 blur 뒤 기본값 128로 돌아온 상태다. 숫자 중간값·저장 및 스크롤로 마지막 메뉴 항목 접근, 화면 아래의 실행 버튼 활성은 별도의 브라우저 assertion 근거로 구분한다. 비밀번호는 합성 테스트 값이며 이미지에서 가려진 상태다. 캡처와 trace는 저장소에 포함하지 않는다. 프로필 상태색 보완 전 PNG 8개는 `/tmp/s3desk-refinement-profiles-final`에 별도로 보존했다.

### 3차 전체 시각 검사와 남은 한계

최종 빌드의 전체 시각 회귀는 다음 명령으로 **38개 중 36개 통과·2개 실패**했다. 위 preview·Node·폰트·timeout 환경을 사용했고, `PLAYWRIGHT_OUTPUT_DIR=/tmp/s3desk-refinement-visual-restarted`에 산출물을 남겼다.

```bash
npm run test:e2e:visual -- --workers=1
```

남은 두 실패는 이전과 같은 Objects 데스크톱 명암 이미지의 경로 코드 글자 차이 142/136픽셀이다. 최종 차이 이미지의 SHA-256도 2차 결과와 각각 같다. 호스트 글꼴 렌더링 차이로 판단하며 해당 기준 이미지와 기존 100픽셀 허용치는 보존했다. 이번 3차에서는 시각 기준 이미지를 추가하거나 갱신하지 않았다. 새 오류·대기 화면은 위 집중 브라우저 캡처로 확인하며, 전체 시각 검사의 기존 폼·목록 기준선도 유지한다.

상태색 보완 전의 시각 실행은 후속 보완을 위해 중단했다. 보완 후 첫 전체 실행에서는 로컬 preview 프로세스가 종료 코드 143으로 끝났고 후속 페이지 진입이 `ERR_CONNECTION_REFUSED`로 실패해 중단했다. 프로세스 종료 원인을 확인한 것은 아니다. preview를 다시 시작하고 같은 최종 빌드로 위 38개 전체 실행을 끝냈으며 이 재실행에는 연결 실패가 없었다. 제품 코드를 바꿔 연결 실패를 우회하거나 기준 이미지를 일괄 갱신하지 않았다.

전체 단위 테스트 모음과 `./scripts/check.sh fast/full`, 실제 기기·WebKit·Firefox·스크린리더, 실제 공급자 연결·배포 검증은 실행하지 않았다. 명암·좁은 화면·키보드의 로컬 mock 근거와 공급자/운영 환경의 검증을 구분한다. Objects 두 시각 차이는 동일한 기준 환경에서 다시 확인해야 한다. 검증 후 이번 작업의 임시 preview는 종료한다.

## 추가 디테일 검토 — 4차: 실제 작업에 필요한 정보

3차 결과를 기준으로 프론트엔드 사용 흐름과 고객이 읽는 화면을 함께 검토했다. 새 카드·배지·장식 대신 중복 정보, 잘못된 상태, 복구 동작을 개선한다.

| 확인한 문제 | 개선 |
| --- | --- |
| Profiles·Buckets·Uploads의 범용 영문 eyebrow와 긴 기능 소개가 제목·작업보다 먼저 읽힌다. | 세 eyebrow를 제거하고 Profiles는 연결 관리, Buckets는 실제 프로필 범위만 짧게 설명한다. |
| 모바일 프로필마다 내부 ID·일반 호환 옵션을 반복하고, 이미 Active인 행에 파란 Selected 버튼을 제공한다. | 내부 ID·일반 옵션은 목록에서 덜어내고 연결 정보·경고를 유지한다. Active는 상태로 표시하고 다른 프로필의 Use를 실제 주요 작업으로 제공한다. 상세 설정·YAML·Settings의 ID 접근은 유지한다. |
| 저장된 mTLS를 유지하는 편집 화면에서도 접힌 TLS 요약이 draft 개수만 세어 Off로 표시된다. | 저장 상태, 조회 대기·불명, 변경 의도를 구분한다. mTLS 저장 기능의 제한은 mTLS unavailable로 명시하며 인증서 검증 옵션의 가용성과 혼동하지 않는다. |
| 잘못된 API 토큰의 오류는 일시적인 toast에만 표시되고 입력 옆에는 Apply 안내가 남는다. | 기존 FormField에 지속되는 오류와 연결된 입력 상태를 표시한다. 편집하면 오류를 지우고 Apply 안내를 복원한다. 기존 토큰 문자·공백 검증은 유지한다. |
| Objects에서 필터만으로 결과가 없어지면 Clear search가 비활성으로 표시된다. | 적용 중인 검색·필터에 맞는 복구 버튼을 제공한다. 기존 Reset view·Clear search 소유 동작을 재사용한다. |
| 최초 Objects 조회 실패에도 Empty folder가 함께 표시된다. | 실패에는 오류·재시도를 제공하고 성공한 빈 폴더와 구분한다. 갱신 실패 시 이미 받은 목록은 유지한다. |
| Simple 모드의 Download·Delete가 제목 옆과 선택 바에 중복되어 320px 헤더가 한 줄 더 늘어난다. | 선택 바에서 작업을 제공하고 상단 중복 작업을 제거한다. |
| 완료·실패·취소 다운로드에 직전 속도·ETA 또는 빈 대시가 남는다. | 바이트 정보는 유지하고 속도·ETA는 전송 중에만 표시한다. |
| Transfers의 Clear finished는 현재 탭 밖의 기록도 정리하지만 적용 범위는 hover 설명에만 있다. | 실제 버튼 이름을 Clear all finished로 바꿔 두 큐 전체에 적용됨을 드러낸다. 기존 정리 동작을 유지한다. |

수정 전 390/1440px의 주요 화면과 320px Simple 선택 화면을 직접 확인했다. 필터 빈 결과는 비활성 Clear search, 최초 조회 실패는 오류와 Empty folder의 동시 표시로 재현했다. 임시 진단 캡처의 초기 row/table 준비 조건은 실제 모바일 list/card 구조로 교정했으며 제품 실패와 구분한다. 조회 오류 검사는 기존 React Query 재시도가 끝날 때까지 기다린 뒤 잘못된 빈 폴더 표시를 확인했다. 전송의 오래된 속도·ETA와 정리 범위는 수정 전 신규 단위 사례의 실패로도 확인했다.

수정 전 캡처는 `/tmp/s3desk-client-audit-before/`, `/tmp/s3desk-client-additional-before/`, `/tmp/s3desk-client-details-before/`, `/tmp/s3desk-client-error-before/`에 있다. 합성 토큰·전송·프로필 fixture만 사용하며 캡처·trace는 저장소에 포함하지 않는다.

### 4차 검증

집중 단위 검사는 `npm exec -- vitest run`으로 소유 파일을 나누어 실행했고, 서로 다른 19개 파일의 120개 사례가 통과했다. 반복 실행은 아래 수에 중복해서 더하지 않았다.

| 소유 범위 | 통과 |
| --- | --- |
| Objects 목록·파생 상태·pane·toolbar·선택·키보드 10개 파일 | 56개 |
| ProfilesTable·ProfileModal·SettingsPage·profileModalValidation 4개 파일 | 37개 |
| TransferDownloadRow·TransfersDrawer 2개 파일 | 12개 |
| Profiles·Buckets·Uploads PageShell 3개 파일 | 15개 |

`npm run lint`, `npm run bundle:budget`, `npm run check:design`, `npm run check:e2e:geometry`가 통과했다. 번들 검사는 TypeScript와 최종 Vite 분석 빌드를 포함한다. 전체 lint는 임시 진단 테스트를 삭제하고 제품 소스가 확정된 뒤 실행했다. 이후 새 브라우저 테스트의 조회·캡처·합성 완료 데이터 교정에는 해당 파일의 ESLint를 다시 실행했다. 빌드 초기에 Testing Library 역할 조회에 Playwright용 `exact` 옵션이 섞인 타입 오류가 있었으며, 단위 테스트 옵션만 교정한 최종 빌드가 통과했다. 제품의 조회·선택 동작은 변경하지 않았다.

컴파일된 결과를 로컬 Vite preview와 mock API로 확인했다. 서로 다른 브라우저 사례 33개가 통과했다. CSS viewport를 지정한 Chromium 21개와 iPhone 13·Pixel 7 설정의 Chromium 12개이며 실제 모바일 기기 결과는 아니다.

| 브라우저 범위 | 확인 내용 |
| --- | --- |
| `design-client-details.spec.ts` 16개 | 390/1280px 검색·필터별 복구, 최초 조회 실패의 재시도·허위 빈 폴더 제거, 갱신 실패의 캐시 목록 유지, 320px light·1280px dark의 Simple 중복 작업 제거·토큰 inline 오류·프로필 전환·저장 mTLS 요약·두 큐 정리 범위, 390px nested list/grid의 상위 이동과 필터 복구 |
| `transfers-drawer-actions.spec.ts` 기존 5개 | 업로드 취소·재시도·정리, 연결된 job 이동·프로필 전환, job 누락, 진행 중 작업 보존 |
| `profiles-mobile-responsive.spec.ts` 집중 12개 | 두 모바일 프로젝트 각각 캐시 유무별 inventory 복구, 카드 전환, 다른 탭의 선택 보존, 경고 가독성, 반응형 전환의 선택·스크롤 소유 유지 |

명령은 `frontend/`에서 실행했다. 공통 환경은 앞 절과 같은 Node 22·임시 fontconfig·preview 주소와 timeout 설정이다.

```bash
npm exec -- playwright test tests/design-client-details.spec.ts tests/transfers-drawer-actions.spec.ts --project=chromium --workers=1 --output=/tmp/s3desk-client-details-rerun
npm exec -- playwright test tests/design-client-details.spec.ts --grep 'nested' --project=chromium --workers=1 --output=/tmp/s3desk-client-nested-final
npm exec -- playwright test tests/design-client-details.spec.ts --grep 'finished transfer metrics' --project=chromium --workers=1 --output=/tmp/s3desk-client-transfer-capture-final
npm exec -- playwright test tests/profiles-mobile-responsive.spec.ts --grep 'recovers failed profile inventory|switches the active profile|preserves a selection made in another tab|keeps validation warning|keeps the selected profile' --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=1 --output=/tmp/s3desk-client-profiles-mobile-final
```

위 33개는 결합 실행의 20개, 조회 교정 후 nested 2개 중 중복 1개를 제외한 합과 모바일 12개의 합이다. 한 번의 33개 전체 실행 통과를 뜻하지 않는다. 전송의 완료 fixture에서 실패 메시지를 물려받는 모순도 교정했고 해당 2개 사례를 다시 통과했다. 첫 결합 실행 중 preview와 browser 실행이 종료 코드 143으로 중단됐으며, 후속 visual 페이지 진입에는 연결 거부가 발생했다. 종료 원인은 확인하지 못했다. 재시작 후 trace로 데스크톱 메뉴 이름과 Grid의 숨겨진 파일명 span까지 찾는 strict locator 오류를 확인해 테스트만 교정했다. 제품 오류 표시·Grid·재시도를 우회하지 않았다.

`/tmp/s3desk-client-details-rerun`, `/tmp/s3desk-client-nested-final`, `/tmp/s3desk-client-transfer-capture-final`의 실제 PNG를 직접 검토했다. 필터·오류·재시도·캐시 목록·Simple 선택·상위 이동 카드, 모바일 프로필 밀도와 경고·전환 버튼, 토큰 오류 테두리·줄바꿈, 종료 전송의 바이트·정리 버튼을 확인했다. TLS 요약은 첫 PNG에서 화면 아래에 있어 근거로 사용하지 않았고, summary까지 스크롤한 재캡처에서 320px light·1280px dark의 `mTLS enabled`와 footer 겹침 없음을 확인했다.

의도한 화면 변경은 expected/actual/diff를 검토한 뒤 기존 기준 이미지 10개만 갱신했다. Profiles desktop·mobile light/dark 3개, Buckets desktop/mobile 2개, Transfers desktop·mobile downloads/uploads 3개, Uploads desktop 1개, Settings desktop 1개다. Settings의 차이는 뒤에 보이는 Profiles 헤더·목록이며 drawer 자체는 유지된다. Transfers desktop의 realtime 재연결 배경은 expected/actual가 같고 정리 문구와 종료 행의 대시 제거만 차이가 있다. Objects 두 글꼴 차이의 기준 이미지와 100픽셀 허용치는 유지했다.

최종 전체 시각 검사는 다음 명령으로 38개 중 36개 통과·2개 실패했다. 이 실행에는 preview 연결 실패가 없었다.

```bash
npm run test:e2e:visual -- --workers=1 --output=/tmp/s3desk-client-visual-final
```

남은 Objects desktop light/dark의 차이는 각각 142/136픽셀이며 최종 diff의 SHA-256도 3차와 같다(`dcfcd972af6bc880a80b13632f8f269e069e2a75e1d43a6ecabc5c2710c34733`, `bd2277743054a8a613f959cee239747a7d6f58ef8313321f307871b517a251dd`). 기존 호스트 글꼴 렌더링 차이로 판단하며, 이번 화면 변경의 회귀로 단정하지 않는다. 같은 기준 환경에서 재확인이 필요하다.

`git diff --check`도 통과했다. 전체 단위 테스트 모음과 `./scripts/check.sh fast/full`, 실제 기기·WebKit·Firefox·스크린리더, 실제 공급자 연결·배포는 실행하지 않았다. 기존 작업과 이번 수정은 커밋·푸시하지 않았고, 검증용 임시 preview는 검증을 마친 뒤 종료한다.

## 추가 디테일 검토 — 5차 (2026-10-12): 대기·실패 뒤에도 이어지는 작업

4차 결과에서 작업 패널의 첫 조회, 저장 완료 시점, 키보드 탐색을 검토했다. 기존 컴포넌트의 상태와 실행 조건을 바로잡으며 장식이나 새 의존성은 추가하지 않는다.

| 확인한 문제 | 개선 |
| --- | --- |
| Job logs의 첫 조회 중 `Lines: 0`과 빈 테두리만 표시한다. | 첫 조회에는 읽을 수 있는 로딩 상태를 표시하고 성공한 빈 로그와 구분한다. 갱신 중 이미 받은 로그·개수는 유지한다. |
| Logs에 작업 ID가 없고 Details의 조회 실패·대기에서도 요청한 ID가 사라진다. | 해당 상태에서도 작업 ID를 표시한다. Details 성공 화면의 기존 ID 행과 중복하지 않는다. |
| 큰 미리보기의 metadata 조회가 실패해도 계속 `Fetching preview…`로 표시한다. | 기존 Alert에서 오류와 Retry metadata를 제공하고 파일명을 유지한다. 캐시 metadata가 있는 갱신 실패는 기존 미리보기를 보존한다. |
| ContextMenu·Shift+F10 메뉴를 Escape로 닫으면 목록의 키보드 탐색이 끊긴다. | 해당 context 메뉴의 Escape에만 목록 초점을 복원한다. 행 버튼으로 연 메뉴의 기존 초점 소유는 유지한다. |
| 단일 객체·폴더 Copy/Move의 실행 버튼이 기존 제출 검증과 다른 조건으로 활성화된다. | 목적지 공백·와일드카드·동일 경로·폴더의 하위 경로·정확한 MOVE 확인 조건을 버튼과 Enter에도 적용한다. 기존 제출 검증과 dry run 예외를 유지한다. |
| 접힌 Settings 입력이 초점 순서 끝에 남아 양방향 Tab 경계가 깨진다. | 공통 overlay에서 숨김·inert·닫힌 details의 입력을 제외한다. 첫 summary와 자식의 명시적 visibility 복원은 보존한다. |
| DialogModal이 기존 visualViewport 변수를 소비하지 않아 짧아진 표시 영역 아래에 실행 버튼이 놓인다. | 같은 표시 영역 높이·상단 변수를 CSS에서 사용하고 body 내부 스크롤을 유지한다. 일반 화면의 기존 크기는 유지한다. |
| 전송 기록을 키보드로 Remove하면 초점이 사라진다. | 화면에 남은 같은 큐의 다음·이전 Remove 또는 큐 탭으로 초점을 이어간다. 포인터로 제거할 때는 초점을 이동하지 않는다. |
| 빈 전송 큐로 초점을 복원해도 탭 테두리가 스크롤 영역에 잘려 오른쪽 선만 보인다. | 탭 버튼의 초점 outline을 안쪽에 그린다. 같은 AppTabs를 사용하는 설정·목록도 동일한 표시를 사용한다. |
| 비활성 Start move가 활성 버튼과 같은 진한 빨강·흰색으로 표시한다. | 공통 danger 기본 색상 선택자도 기존 hover·active와 같이 비활성 버튼을 제외한다. 실행 조건과 색상을 함께 확인한다. |
| 저장 중 Policy와 Controls의 닫기는 잠겨도 반대 설정 시트로 이동할 수 있다. | 같은 busy 상태를 전환 버튼과 handler에 적용하고 저장 종료 뒤 복원한다. |
| 프로필 편집에서 mTLS 저장 전에 성공을 알리고, mTLS 실패에도 편집창과 입력값을 잃는다. | 전체 편집 저장 완료 뒤 성공을 알린다. 부분 실패는 footer에 지속되는 오류를 표시하고 편집값을 유지해 같은 프로필에 재시도한다. 늦은 응답은 새 편집 세션·서버 범위에 영향을 주지 않는다. 프로필 생성 경로는 유지한다. |

수정 전 빌드에서 새 Jobs 4개, Objects 6개, Bucket/Profile 4개 브라우저 사례가 의도한 상태·초점·버튼 assertion에서 실패했다. Jobs의 새 단위 검사는 요청 ID 누락 2개를 재현한 뒤 수정 후 통과했다. 320px 로그의 허위 0과 빈 영역, 390px 미리보기의 멈추지 않는 로딩, 잘못 활성화된 Copy, 저장 중 열려 있는 Policy 전환, mTLS의 조기 성공·편집값 손실은 실제 PNG로도 확인했다.

수정 전 산출물은 `/tmp/s3desk-panel-details-before`, `/tmp/s3desk-preview-context-before`, `/tmp/s3desk-overlay-bucket-profile-before`에 있다. 합성 fixture만 사용하며 PNG·trace는 저장소에 포함하지 않는다.

공통 overlay의 첫 실행은 아이콘·단축키까지 포함된 accessible name에 exact 조회를 사용해 Settings·New folder 진입 전 멈췄다. trace에 근거해 테스트의 이름 조회와 준비 대기만 교정했다. `/tmp/s3desk-overlay-before-corrected`의 재실행에서는 세 사례 모두 실제 Tab 초점·표시 영역 경계·Remove 후 초점 assertion에서 실패했다. New folder는 390×900px 화면에서 visualViewport 높이 420px·상단 80px를 시뮬레이션했으며, 실행 버튼이 실제 viewport 바닥에 남는 PNG를 확인했다. 실제 운영체제 키보드를 연 결과는 아니다.

### 5차 집중 단위·정적 검증

소유 파일을 지정한 Vitest 집중 검사를 여러 실행으로 확인했다. 서로 다른 18개 파일의 145개 사례가 통과했으며 재실행을 중복 계산하지 않았다.

| 소유 범위 | 통과 |
| --- | --- |
| JobsDetailsDrawer·JobsLogsDrawer 2개 파일 | 11개 |
| Objects 폼·미리보기·metadata·context 메뉴·CopyMove hook 7개 파일 | 48개 |
| ProfileModal·useProfilesPageMutations·buildDialogs 3개 파일 | 35개 |
| BucketPolicyModal·BucketGovernanceModal 집중 패턴 2개 파일 | 9개 |
| useOverlayLayer·TransferDownloadRow·TransferUploadRow·TransfersDrawer 4개 파일 | 42개 |

Objects의 첫 단위 실행 중 ResizeObserver가 없는 폼 테스트 환경, Bucket의 일부 provider 테스트에서 전환 링크를 그리지 않는 advanced metadata fixture, Drawer의 기본 timeout과 비동기 초기 초점 대기는 해당 테스트만 교정했다. 재실행한 소유 사례가 모두 통과했다. 키보드 Remove 검사는 다음·이전·빈 큐, pointer, 실제로 제거하지 않은 요청, 새 대화상자에 초점을 두는 경우를 포함한다. 수정 전후의 제품 상태와 테스트 준비 실패를 구분한다.

전체 `npm run lint`와 `npm run check:design`, `npm run check:e2e:geometry`가 통과했다. 디자인 패턴 검사는 기존 advisory 61개를 출력하며 오류를 의미하지 않는다. 첫 lint에서 새 콜백의 React 의존성 표기를 교정했고, 뒤이어 추가된 단위 테스트의 Testing Library 역할 옵션 타입도 교정했다. 최종 단위 파일의 focused ESLint가 통과했다. API·생성 타입·의존성 변경은 없다.

컴파일된 첫 after 실행에서 실제 busy Save의 로딩 아이콘 이름, 성공 알림의 숨겨진 live region과 보이는 toast, native datalist의 combobox 역할을 잘못 조회한 테스트 실패를 확인했다. 해당 browser locator만 교정한 재실행은 17개 전체가 통과했다. 그 뒤 전후 캡처를 교차 검토해 위의 탭 초점 테두리와 비활성 Move 색상을 추가로 발견했고 공통 CSS 두 곳만 보완했다. 폼 검사는 활성·비활성 배경색 구분도 확인하도록 보강했다. 추가 CSS의 최종 빌드·검사는 아래에 구분해 기록한다.

### 5차 최종 화면·회귀 검증

최종 CSS까지 포함한 `npm run bundle:budget`가 통과했다. 이 명령의 TypeScript 검사와 Vite 빌드도 통과했으며, 이어서 `npm run check:design`, `npm run check:e2e:geometry`와 마지막 browser 파일의 focused ESLint를 통과했다. 최종 `git diff --check`도 통과했다. 앞선 회차의 변경을 보존한 작업 트리이며 깨끗한 작업 트리를 의미하지 않는다.

브라우저 검사는 Node 22.23.1, 임시 Fontconfig, 최종 빌드를 제공하는 `http://127.0.0.1:18881`에서 실행했다. 환경은 `PATH=/tmp/s3desk-node22:$PATH`, `FONTCONFIG_FILE=/tmp/s3desk-fonts/fontconfig.conf`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18881`, `PLAYWRIGHT_TEST_TIMEOUT_MS=90000`, `PLAYWRIGHT_EXPECT_TIMEOUT_MS=10000`이었다. 아래 세 실행의 서로 다른 집중 사례 36개가 모두 통과했다. API 응답은 합성 fixture이며 실제 provider를 사용한 결과가 아니다.

| 실행 | 결과 | 산출물 |
| --- | --- | --- |
| `design-detail-panels`, `design-preview-context-details`, `design-bucket-profile-details`, `design-overlay-details` 4개 spec, Chromium, worker 1 | 새 사례 17/17 통과 | `/tmp/s3desk-design-fifth-final-css` |
| 기존 Jobs 오류·긴 로그, Objects 미리보기·context 메뉴, 프로필 편집, 전송 취소·재시도·기록 삭제·연결 작업의 집중 패턴, Chromium, worker 1 | 기존 사례 15/15 통과 | `/tmp/s3desk-design-fifth-regression` |
| `jobs-mobile-responsive.spec.ts --grep 'latest error'`, `mobile-iphone-13`·`mobile-pixel-7`, worker 1 | 기존 사례 4/4 통과 | `/tmp/s3desk-design-fifth-logs-mobile` |

새 사례의 명령은 `npm exec -- playwright test tests/design-detail-panels.spec.ts tests/design-preview-context-details.spec.ts tests/design-bucket-profile-details.spec.ts tests/design-overlay-details.spec.ts --project=chromium --workers=1 --output=/tmp/s3desk-design-fifth-final-css`였다. 기존 desktop 회귀는 아래 명령을 사용했다.

```sh
npm exec -- playwright test tests/objects-image-preview.spec.ts tests/objects-context-menu-keyboard.spec.ts tests/jobs-overlays.spec.ts tests/profiles-provider-forms.spec.ts tests/transfers-drawer-actions.spec.ts --grep 'details panel viewer supports zoom|object actions can open the shared large|oversized images|Escape closes the context|outside the list|row menu|jumps to the latest error|failed details stop|profile edit drawer keeps|transfers drawer|opens the linked job' --project=chromium --workers=1 --output=/tmp/s3desk-design-fifth-regression
```

최종 PNG를 직접 검토해 320px의 작업 ID·로그 대기·mTLS 오류와 하단 버튼, 390px 미리보기 오류·재시도와 복구, simulated visualViewport 안의 실행 버튼을 확인했다. 마지막 CSS 이후 Object·Folder Move의 비활성 버튼은 회색으로 구분되고, 빈 전송 큐의 Downloads 탭은 완전한 초점 테두리를 표시한다. Policy·Controls의 저장 대기와 mTLS pending·부분 실패는 전후 캡처를 교차 검토했다. 검사는 지정한 320·390·1280px와 일부 light·dark 조합이며 모든 폭·테마 조합을 검사한 결과는 아니다. 모바일 프로젝트의 긴 로그 검사는 두 기기 설정에서 각각 320 CSS px로 실행했으며 실제 기기 검증이 아니다.

`npm run test:e2e:visual -- --workers=1 --output=/tmp/s3desk-design-fifth-visual-final`은 38개를 끝까지 실행해 36개 통과·2개 실패로 종료했다. 실패는 기존 Objects desktop light·dark의 상단 경로 글꼴 차이 두 건이다. 직접 본 diff PNG와 SHA-256이 앞선 회차와 동일했다.

- light: `dcfcd972af6bc880a80b13632f8f269e069e2a75e1d43a6ecabc5c2710c34733`
- dark: `bd2277743054a8a613f959cee239747a7d6f58ef8313321f307871b517a251dd`

5차에는 golden 이미지를 갱신하지 않았고 기존 100px 허용치도 유지했다. 첫 visual 실행은 30/38 진행 뒤 exit 143으로 중단돼 완료 결과로 계산하지 않는다. 당시 preview는 계속 실행 중이었으며 중단 원인은 확인하지 못했다. 위의 최종 실행은 38개를 완료했고 해당 중단과 구분한다.

전체 Vitest, `./scripts/check.sh fast`·`full`, 실제 모바일·운영체제 키보드, Firefox·WebKit, 보조공학, 실제 provider·배포 검증은 실행하지 않았다. 12개를 넘는 가상화 전송 목록의 스크롤 중 Remove 초점은 실제 브라우저로 검증하지 않았다. preview의 미연결 backend 실시간 ticket proxy 오류도 관찰됐으며 위 fixture 검사는 실시간 연결 성공의 증거가 아니다. 검사가 끝난 뒤 이번 작업에서 띄운 preview만 종료하고 18881 포트의 listener가 없는 것을 확인했다. 커밋·푸시·배포는 실행하지 않았다.

## 추가 디테일 검토 — 6차 (2026-10-12): 입력·초점·표시와 실제 작업의 일치

기존 화면을 사용하며 입력을 이어 쓰는 과정, 비동기 로딩 뒤 초점, 대상·진행률·보안 상태의 표시를 검토했다. 기존 소유 컴포넌트와 정규화 규칙을 수정했고 API·생성 타입·의존성 변경은 없다.

| 확인한 문제 | 개선 |
| --- | --- |
| Search bucket에 단어를 차례로 입력하면 공백이 즉시 또는 debounce 뒤 사라져 `annual report`를 쓰기 어렵다. | 입력 중 원문과 확정 검색어를 구분한다. 기존 길이 제한과 250ms debounce, 검색어 trim, 범위 전환·외부 초기화 동작은 유지한다. |
| 트리 폴더 로딩이 끝나면 이미 옮긴 검색창 초점을 트리로 빼앗는다. | 사용자가 요청한 트리 이동에만 초점을 준다. 가상화로 늦게 나타난 항목도 이전 초점 소유가 유지될 때만 이동하며 포인터 선택·키보드 탐색은 보존한다. |
| 공백뿐인 업로드 버킷으로 Queue upload가 활성화되고 선택 파일을 잃을 수 있다. | 목적지 버킷의 기존 trim 규칙을 표시·버튼·handler에 적용한다. 목적지가 없으면 큐 등록과 선택 교체를 막고 이미 고른 파일을 유지한다. |
| 업로드 Destination은 입력한 경로를 표시하지만 실제 요청은 다른 정규화 경로로 나간다. | 기존 `normalizeUploadPath`를 대상 표시에도 재사용한다. 입력값을 바꾸지 않고 표시와 요청의 버킷·경로를 일치시킨다. |
| 전체 크기를 모르는 다운로드에 `0%`와 빈 진행 막대가 나타난다. | 해당 상태에는 바이트와 `Total size unknown`을 표시한다. 총량을 알면 기존 진행률을 사용하며 알려진 0바이트·완료 상태는 구분한다. |
| 로그의 `Copy all`·`Download all`과 `Lines`는 일부만 받은 버퍼를 전체 로그로 오해하게 한다. | `Copy loaded`·`Download loaded`·`Loaded lines`로 실제 보관 범위를 표시한다. 필터의 visible 내보내기는 유지하고 장식 아이콘의 중복 낭독을 제거한다. |
| GCS·Azure 버킷 생성에서 공개 노출을 골라도 초록색 `Private baseline` 표시가 남는다. | private 값일 때만 기존 표시를 그린다. 공개 설정과 생성 요청 값은 유지한다. |
| 버킷 생성에서 잘못된 IAM binding·access policy 행을 제거해도 제출 오류가 남는다. | 기존 오류 초기화 함수를 Remove에도 적용한다. 정상 행과 입력값은 보존한다. |
| 프로필의 TLS 상태 조회 실패를 편집창 안에서 복구할 수 없다. | 기존 경고에 Retry TLS status를 제공한다. 재시도 중 오류·입력값을 유지하고 중복 요청·저장 중 실행·이전 프로필이나 서버의 늦은 응답을 차단한다. |

수정 전의 별도 빌드와 mock API에서 새 브라우저 사례 12개가 해당 assertion에서 실패했다. Search 2개, Tree 1개, Uploads 2개, 다운로드·로그 4개, GCS·Azure·TLS 3개다. GCS의 공개 설정에서도 남는 Private baseline, TLS 경고의 재시도 부재, 업로드의 잘못된 대상 표시, 검색 초점 이동, 허위 진행률·로그 범위 문구는 실제 PNG로 확인했다. 합성 fixture만 사용하며 PNG·trace는 저장소에 포함하지 않는다.

수정 전 산출물은 `/tmp/s3desk-design-sixth-search-before`, `/tmp/s3desk-design-sixth-tree-before`, `/tmp/s3desk-design-sixth-uploads-before`, `/tmp/s3desk-design-sixth-transfer-logs-before-corrected`, `/tmp/s3desk-design-sixth-provider-before`, `/tmp/s3desk-design-sixth-provider-before-corrected`에 있다. 첫 다운로드 검사의 history fixture가 실제 조회를 시작하지 않은 경우는 Jobs UI의 Download ZIP 흐름으로 교정했다. Uploads를 제외하는 Chromium 프로젝트의 No tests found는 모바일 프로젝트로 바꿨다. GCS fixture의 projectNumber 누락과 TLS 자동 재시도 전의 짧은 대기도 교정했다. 이 준비 실패들은 제품 문제 재현으로 계산하지 않는다.

### 6차 집중 단위·정적 검증

서로 다른 12개 파일의 집중 단위 테스트 99개가 통과했다. 최종 검색 상태 동기화와 TLS refetch 의존성 표기를 교정한 뒤 해당 20개도 다시 통과했으며 중복 계산하지 않았다.

| 소유 범위 | 통과 |
| --- | --- |
| Search state·SimpleTree·TransferDownloadRow·JobsLogsDrawer·useJobsLogsState 5개 파일 | 51개 |
| ProfileModal·BucketModal·TLS state·Profiles state·dialogs props 5개 파일 | 38개 |
| Upload selection actions·queued upload 2개 파일 | 10개 |

`npm run lint`, `npm run bundle:budget`, `npm run check:design`, `npm run check:e2e:geometry`가 통과했다. 번들 검사는 최종 소스의 TypeScript 검사와 Vite 분석 빌드를 포함한다. 디자인 검사에서 기존 advisory 61개를 출력했으며 오류가 아니다. 첫 lint가 지적한 검색 effect의 동기 상태 변경과 refetch 콜백 의존성은 기존 조건부 렌더 동기화 패턴과 함수 별칭으로 고쳤고 규칙을 끄지 않았다.

### 6차 최종 화면 검증

Node 22.23.1과 최종 빌드를 제공하는 `http://127.0.0.1:18881`에서 새 브라우저 사례 14개가 모두 통과했다. 공통 환경은 `PATH=/tmp/s3desk-node22:$PATH`, `FONTCONFIG_FILE=/tmp/s3desk-fonts/fontconfig.conf`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18881`, `PLAYWRIGHT_TEST_TIMEOUT_MS=90000`, `PLAYWRIGHT_EXPECT_TIMEOUT_MS=10000`이다. API 응답은 mock fixture다.

| 실행 | 통과 | 산출물 |
| --- | --- | --- |
| Search 390/1280px, Tree 1800px, 다운로드·로그 320/1280px, GCS 320px light·Azure 1280px dark·TLS 320px light, Chromium·worker 1 | 새 사례 10개 | `/tmp/s3desk-design-sixth-final` |
| Uploads 390 CSS px, mobile-iphone-13·mobile-pixel-7·worker 1 | 새 사례 4개 | `/tmp/s3desk-design-sixth-uploads-final` |

```sh
npm exec -- playwright test tests/design-transfer-log-details.spec.ts tests/objects-global-search.spec.ts tests/objects-favorites-tree-details.spec.ts tests/design-bucket-profile-details.spec.ts --grep 'unknown download totals|log exports describe|Search bucket preserves spaces during sequential typing|keeps search focus after asynchronous folder loading|create feedback matches exposure|TLS status retry preserves' --project=chromium --workers=1 --output=/tmp/s3desk-design-sixth-final
npm exec -- playwright test tests/uploads-mobile-responsive.spec.ts --grep 'whitespace-only bucket|upload destination matches the normalized request' --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=1 --output=/tmp/s3desk-design-sixth-uploads-final
```

전후의 실제 PNG를 직접 검토했다. 좁은 화면의 TLS 오류·재시도 버튼·대기 중 경고는 본문과 footer에 겹치지 않는다. 검색의 이어 쓴 `annual report`, 트리 로딩 뒤 검색창의 초점 테두리, 업로드의 원문 입력과 정규화 대상, 목적지가 없을 때 파일을 유지한 비활성 버튼, 총량 미확인 다운로드, 첫 로그가 6번인 2,000줄의 loaded 표기를 확인했다. 트리 검사는 82개 자식의 가상화 목록에서 End·Home·방향키·Enter도 통과했다. 새 다운로드 브라우저 사례는 실제 Jobs UI에서 링크 준비와 Ready to save까지이며, 진행 중 데이터 바이트와 크기를 뒤늦게 아는 경우는 단위 검사로 확인했다. 별도의 파일 저장 회귀는 아래에 구분한다. 모바일 프로젝트는 Chromium 기기 설정이며 실제 기기 결과가 아니다.

Azure 1280px dark에서 공개 Container 선택과 배지 제거, 정상 access policy를 보존한 오류 제거를 직접 확인했다. TLS 복구 캡처에는 `mTLS enabled`·`Keep current`와 겹치지 않는 footer가 보인다. Name 입력은 캡처의 스크롤 위에 있으므로 유지 여부는 브라우저 assertion 근거와 구분한다.

전체 화면 비교는 다음 명령으로 38개를 완료해 36개 통과·2개 실패했다.

```sh
npm run test:e2e:visual -- --workers=1 --output=/tmp/s3desk-design-sixth-visual-final
```

남은 두 실패는 Objects desktop light·dark 상단 경로의 기존 글꼴 렌더링 차이다. diff PNG를 직접 검토했으며 각각 142/136px이고 SHA-256도 앞선 회차와 같다. 6차에는 기준 이미지나 100px 허용치를 바꾸지 않았다.

- light: `dcfcd972af6bc880a80b13632f8f269e069e2a75e1d43a6ecabc5c2710c34733`
- dark: `bd2277743054a8a613f959cee239747a7d6f58ef8313321f307871b517a251dd`

### 6차 기존 흐름 회귀·한계

기존 흐름의 서로 다른 40개 사례도 통과했다. 위 새 사례 14개와 합하면 집중 브라우저 사례 54개다. 여러 실행의 합이며 한 번의 54개 실행을 뜻하지 않는다.

| 실행 | 결과 | 산출물 |
| --- | --- | --- |
| Search·Favorites/Tree·Bucket/Profile 저장·Jobs overlays·ZIP artifact 5개 spec의 기존 Chromium 사례 | 첫 실행 24개 중 21개 통과·오래된 ZIP fixture 3개 실패 | `/tmp/s3desk-design-sixth-regression-final` |
| 현재 native 다운로드 흐름에 맞춘 ZIP artifact spec 전체 | 5/5 통과. 앞 실행과 중복된 실패·취소 job 2개를 제외해 기존 desktop 사례는 총 24개 | `/tmp/s3desk-design-sixth-artifact-http-final` |
| 기존 Uploads 6개·Jobs 긴 로그 2개, 두 모바일 프로젝트 | 16/16 통과 | `/tmp/s3desk-design-sixth-mobile-regression-final` |

```sh
npm exec -- playwright test tests/objects-global-search.spec.ts tests/objects-favorites-tree-details.spec.ts tests/design-bucket-profile-details.spec.ts tests/jobs-overlays.spec.ts tests/transfers-job-artifact.spec.ts --grep-invert 'Search bucket preserves spaces during sequential typing|keeps search focus after asynchronous folder loading|create feedback matches exposure|TLS status retry preserves' --project=chromium --workers=1 --output=/tmp/s3desk-design-sixth-regression-final
npm exec -- playwright test tests/transfers-job-artifact.spec.ts --project=chromium --workers=1 --output=/tmp/s3desk-design-sixth-artifact-http-final
npm exec -- playwright test tests/uploads-mobile-responsive.spec.ts tests/jobs-mobile-responsive.spec.ts --grep 'bucket loading|destination and queue|prefix persists|source sheet|selected files can be cleared|queueing a mobile upload|latest error' --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=1 --output=/tmp/s3desk-design-sixth-mobile-regression-final
```

ZIP의 첫 세 실패는 fixture가 기존 `/artifact` 응답만 제공해 현재 `/artifact-url` 요청이 404가 된 결과였다. 링크 준비 fixture를 추가한 뒤에도 native 파일 요청이 Page·BrowserContext route를 거치지 않아 파일 수신은 취소됐다. trace의 링크 준비 성공·파일 바이트 응답 부재와 `download.path: canceled`를 확인했다. 파일명 assertion만 바꾼 시도는 통과로 계산하지 않는다.

최종 fixture는 기존 delay·error 시퀀스를 링크 준비에 사용하고, 테스트 안에서 임시 loopback HTTP 서버가 시도별 합성 파일을 제공한다. 브라우저 Save 클릭 뒤 원래의 `reports.zip`·`retried.zip` 파일명과 정확한 바이트, `Sent to browser`를 확인했다. 취소된 준비 요청의 늦은 응답이 종료해도 새 파일 내용과 상태가 유지되고, 취소한 시도의 파일 요청이 없는 것도 확인했다. 실패·취소 job은 링크 준비와 파일 요청 모두 0이다. 이 검증은 합성 파일 전송이며 실제 provider의 ZIP 생성이나 운영 파일의 디스크 저장을 입증하지 않는다. fixture 서버는 해당 page가 닫힐 때 종료한다. 제품의 다운로드 runtime·공유 mock helper는 수정하지 않았다.

마지막 fixture 교정 뒤 `npm exec -- eslint tests/transfers-job-artifact.spec.ts`와 `npm run typecheck`도 통과했다. 최종 `git diff --check`와 새 문서·spec의 후행 공백 검사도 통과했다. 앞선 작업의 변경을 보존한 작업 트리이며 커밋·푸시·배포는 실행하지 않았다.

전체 Vitest, `./scripts/check.sh fast`·`full`, 실제 모바일·운영체제 키보드, Firefox·WebKit·보조공학, 실제 provider·배포 검증은 실행하지 않았다. 검증 중 미연결 backend의 realtime ticket proxy 오류가 관찰됐으며 위 fixture 검사는 실시간 연결 성공의 증거가 아니다. Objects 글꼴 차이 두 건은 동일 기준 환경에서의 재확인이 남아 있다. 이번 작업의 임시 preview를 종료해 18881 포트 listener가 없는 것을 확인했고 마지막 파일 서버를 실행한 Playwright worker도 종료됐다.
