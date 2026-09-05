# Mobile and desktop UI/UX browser review — 2026-09-06

## 구현 결과

네 항목을 기존 화면 소유자에서 수정했다.

| 항목 | 현재 동작 |
| --- | --- |
| 검색 범위 | 역전된 크기·날짜 범위를 입력란에서 안내하고 자동 검색·Refresh를 막는다. 수동 query refetch도 잘못된 조건을 API로 보내지 않는다. 값을 고치면 기존 검색어·나머지 필터로 검색을 재개한다. |
| 필터 라벨 | 크기·날짜·확장자 필드에 상시 라벨을 표시한다. 범위 오류는 두 입력의 접근성 설명으로 연결한다. |
| 로그 이동 | 바깥 시트와 가상 로그 목록을 함께 스크롤하고 로그 영역으로 포커스를 옮겨 최신 오류를 보이게 한다. |
| 버킷 검색 | 불러온 전체 목록을 대소문자 구분 없이 이름으로 검색한다. 결과 수·일치 항목 없음·Clear search를 제공하고 인증/프로필 전환 시 검색어를 비운다. |

실행 명령과 최종 결과는 [검증 기록](../frontend/docs/DESIGN_AUDIT_VALIDATION_LOG.md#2026-09-06-search-buckets-and-logs-follow-up)에 있다. [수정된 검색 화면](/tmp/s3desk-browser-ux-four-fixed/search-valid-desktop.png), [모바일 날짜 오류](/tmp/s3desk-browser-ux-four-fixed/search-invalid-dates-mobile-320.png), [모바일 로그 이동](/tmp/s3desk-browser-ux-four-fixed/logs-jump-fixed-mobile-320.png), [버킷 이름 검색](/tmp/s3desk-browser-ux-four-fixed/buckets-search-desktop.png)을 직접 확인했다. 아래 원본 조사와 수정 전 증거는 보존한다.

## 원본 조사

현재 작업 트리의 주요 화면을 Chromium에서 조작해 **새 개선 항목 네 개**를 확인했다. 두 개는 재현되는 동작 문제(P2), 두 개는 사용 편의 개선(P3)이다. 모두 이번 조사에서는 미수정이다. 이전 두 조사에서 수정한 아홉 항목과 구분한다.

| 우선순위 | 개선 항목 | 확인 환경 | 권장 변경 |
| --- | --- | --- | --- |
| P2 | 역전된 검색 범위를 화면과 다르게 요청 | 320×568, 1440×900 | 범위 오류를 표시하고 유효한 조건으로 검색하도록 안내 |
| P2 | 최신 오류로 이동해도 모바일 화면 밖에 남음 | 320×568 | 오류 행이 실제 시트 가시 영역에 들어오도록 스크롤 처리 |
| P3 | 검색 필터에 지속적으로 보이는 라벨이 없음 | 320×568, 1440×900 | 최소/최대 크기와 시작/종료 날짜 라벨을 상시 표시 |
| P3 | 버킷이 많을 때 이름으로 목록을 좁힐 수 없음 | 390×844, 1440×900, 합성 버킷 50개 | 현재 목록에 이름 검색과 결과 수 표시 |

## 1. 검색 범위의 입력값과 실제 요청 불일치 — P2

**재현:** Objects → Search bucket → 검색어 `file` → Minimum size에 `100`, Maximum size에 `1` 입력.

화면에는 최소 100MB·최대 1MB가 남지만 실제 요청은 `minSize=1048576&maxSize=104857600`, 즉 1~100MB다. 두 환경에서 경고가 없었다. 날짜도 시작 `2026-09-06`, 종료 `2026-09-01`을 입력하면 표시값을 유지한 채 요청의 시각 경계를 교환한다.

원인은 `frontend/src/pages/objects/useObjectsIndexedSearchQuery.ts:50`과 `:58`의 요청용 최솟값·최댓값 교환이다. 입력 상태를 변경하거나 잘못된 범위를 안내하지 않는다. 결과 목록은 고정 fixture 응답이므로, 결과 파일의 크기·날짜를 서버 필터링 정확성의 근거로 사용하지 않았다. 확인한 결함은 **입력과 송신 조건의 불일치**다.

최소 개선은 역전된 범위를 입력란 옆에 표시하고 해당 조건의 검색을 막는 것이다. 자동 교정을 선택한다면 화면의 값과 사용자 안내도 함께 갱신해야 한다.

확인 기준: 정상 범위, 한쪽만 입력, 같은 경계값, 역전된 크기·날짜에서 표시와 요청이 일치해야 한다. 기존 검색어와 다른 필터는 유지한다.

증거: [데스크톱 크기 입력](/tmp/s3desk-browser-ux-wide-review/objects-search-reversed-size-desktop.png), [모바일 크기 입력](/tmp/s3desk-browser-ux-wide-review/objects-search-reversed-size-mobile.png), [실제 요청과 입력 관측값](/tmp/s3desk-browser-ux-wide-review/search-observations.json).

## 2. 최신 로그 오류로 이동해도 화면 밖에 남음 — P2

**재현:** Activity → Logs → INFO/WARN/ERROR 세 줄이 있는 로그 → Follow 끄기 → Jump to latest error.

320×568에서 오류 메시지의 y 좌표는 클릭 전후 모두 약 678px였다. 화면 아래 568px 밖에 그대로 남았다. 로그 영역 자체는 `clientHeight=363`, `scrollHeight=363`, `scrollTop=0`으로 내부 스크롤 여유가 없고, 이를 담은 시트 본문을 내려야 오류가 보인다. 수동 스크롤로는 접근할 수 있다.

같은 세 줄은 390×844에서 y=644px, 1440×900에서 y=356px로 이미 화면 안에 보였다. 따라서 모든 모바일이나 모든 로그에서 실패한다고 일반화하지 않는다. 최종 비교에서는 세 환경 모두 로그 대화상자에 오류·폴링 경고가 없는 상태였다.

원인은 `frontend/src/pages/jobs/JobsLogsDrawer.tsx:255`가 로그 가상 목록의 `scrollToIndex`만 호출하는 데 있다. `JobsLogsDrawer.module.css:32`의 `max-height: 75dvh`는 시트 헤더와 도구 영역을 제외한 실제 남은 높이와 다르다.

개선 시 가상 목록 이동 후 대상 오류 행이 바깥 시트의 가시 영역에도 들어오는지 보장한다. 로그 영역 높이를 남은 공간에 맞추는 방법도 함께 검토한다.

확인 기준: 짧은 로그와 긴 가상 로그에서 버튼 한 번으로 마지막 오류 내용을 볼 수 있어야 한다. 320×568, 390×844, 데스크톱에서 확인하고 Follow 상태와 검색 필터도 유지한다.

증거: [320px에서 클릭 후](/tmp/s3desk-browser-ux-wide-review/jobs-logs-jump-320.png), [390px 비교](/tmp/s3desk-browser-ux-wide-review/jobs-logs-jump-390.png), [데스크톱 비교](/tmp/s3desk-browser-ux-wide-review/jobs-logs-jump-1440.png), [클릭 전후 좌표](/tmp/s3desk-browser-ux-wide-review/logs-jump-observations.json).

## 3. 값 입력 후 검색 필터의 의미가 보이지 않음 — P3

검색 필터의 크기 입력은 `Min MB…`/`Max MB…` placeholder에만 시각적 설명이 있다. 값을 넣으면 숫자만 남는다. 두 날짜 입력은 빈 상태에서도 동일한 날짜 형식만 보여 시작·종료를 구별하기 어렵다. 모바일에서는 이 네 입력이 세로로 배치되어 순서에 의존한다.

`frontend/src/pages/objects/ObjectsGlobalSearchControls.tsx:156`, `:167`, `:174`, `:183`에 접근성 이름은 존재한다. 문제는 시각적으로 지속되는 라벨의 부재이며, 접근성 이름 자체가 없다는 주장은 아니다.

기존 FormField 형태로 최소 크기(MB), 최대 크기(MB), 수정 시작일, 수정 종료일을 표시한다. 1번 범위 검증과 같은 화면에서 함께 정리하면 좋다.

확인 기준: 값이 채워져도 각 필터의 의미와 단위를 읽을 수 있어야 한다. 320px에서도 입력과 라벨이 연결되고 가로 넘침이 없어야 한다.

증거: [모바일에 숫자·날짜만 남는 화면](/tmp/s3desk-browser-ux-wide-review/objects-search-labels-mobile.png), [데스크톱 날짜 입력](/tmp/s3desk-browser-ux-wide-review/objects-search-reversed-dates-desktop.png), [접근성 이름과 label 관측값](/tmp/s3desk-browser-ux-wide-review/search-observations.json).

## 4. 큰 버킷 목록에서 이름 검색 부재 — P3

합성 버킷 `audit-bucket-01`부터 `audit-bucket-50`까지 넣어 확인했다. 모바일과 데스크톱 모두 Buckets 목록 안에 이름 검색 입력이 없다. 모바일 첫 화면에는 약 세 개 카드가 보였고, 본문 스크롤 높이는 9,166px였다. 데스크톱은 3,627px였다.

목록은 이미 가상화되어 있다. 처음 DOM에 있는 항목은 모바일 10개, 데스크톱 16개였으며 50번째 항목은 없었다. 이름을 아는 버킷을 빠르게 찾을 앱 내 수단이 필요한 상태다. 실제 운영 계정에 버킷 50개가 있다는 뜻은 아니며, 많은 버킷을 관리하는 경우의 편의 개선이다.

`frontend/src/pages/buckets/BucketsPageShell.tsx:15`의 헤더에서 `:90`의 목록까지 검색 UI가 없고, `BucketsList.tsx:25`는 전달받은 전체 배열을 가상화한다. 현재 불러온 버킷 배열에 이름 필터를 적용하고 일치 수·초기화·일치 항목 없음 상태를 제공하는 정도로 시작한다.

확인 기준: 50번째 이름 일부를 입력해 해당 버킷의 Open/Manage에 바로 접근하고, 필터 초기화 후 전체 목록으로 돌아갈 수 있어야 한다. 프로필 전환 시 이전 목록과 검색 결과가 섞이지 않아야 한다.

증거: [모바일 50개 목록](/tmp/s3desk-browser-ux-wide-review/buckets-50-mobile-390.png), [데스크톱 목록](/tmp/s3desk-browser-ux-wide-review/buckets-50-desktop.png), [목록 관측값](/tmp/s3desk-browser-ux-wide-review/buckets-observations.json).

## 확인한 화면과 정상 동작

| 화면 | 이번 조작·관찰 |
| --- | --- |
| Profiles | 모바일/데스크톱 목록과 생성 폼, 모바일 빈 제출 오류, YAML 가져오기 파싱 오류, 로그인 후 빈 프로필 안내 |
| Buckets | 모바일 생성 폼, 기본 목록, 모바일/데스크톱 50개 목록 |
| Objects | 데스크톱 목록, 모바일/데스크톱 전체 검색, 크기·날짜 필터와 송신 조건 |
| Uploads / Transfers | 모바일/데스크톱 파일 선택 및 Replace selection 안내, 목적지·큐 버튼, 빈 전송 창, fixture 요청 실패 후 전송 오류 행 |
| Activity | 모바일/데스크톱 목록과 로그, 세 화면 크기에서 최신 오류 이동 |
| Settings | 모바일 Access/Objects/Transfers/Support, 썸네일 토글 저장, 고급 전송 옵션, 데스크톱 다크 모드 |
| Login | 320px 다크 모드에서 잘못된 토큰 401 → 올바른 합성 토큰 200 → 빈 Profiles 진입, 데스크톱 로그인 화면 |

로그인 오류는 명확히 표시됐고 토큰을 수정해 복구할 수 있었다. Settings의 썸네일 토글은 즉시 브라우저 저장소에 반영됐다. 프로필 필수 입력 오류도 입력란 아래에 표시됐으며 YAML 오류는 textarea의 접근성 설명과 연결되어 있었다. 좁은 생성/가져오기 창의 토스트가 제목 위에 겹치는 현상은 관찰했지만, 오류 안내 자체가 사라지지는 않아 위 네 항목보다 낮은 시각적 정리 사항으로 남긴다.

## 실행 방법과 증거 한계

기존 Playwright와 Vite, `frontend/tests/support/`의 화면별 fixture 및 `ui.ts` 조작 헬퍼를 재사용했다. 임시 하네스 `/tmp/s3desk-ux-wide-browser.mjs`의 Vite(18132)와 로컬 RPC(18133)에서 Playwright를 조작했다. 사용한 브라우저는 Chromium 143.0.7499.4다. 주요 입력, 클릭, API 요청 파라미터, 스크롤 좌표와 PNG를 수집했다.

- 데스크톱: 1440×900. 모바일: 320×568 및 390×844, Chromium 터치 에뮬레이션. 라이트 모드 중심으로 검사하고 Login·Settings·Uploads·빈 Profiles에서 다크 모드를 추가 확인했다.
- API 데이터는 로컬 fixture다. 업로드 파일과 버킷 50개는 합성 데이터다. 파일 큐 등록 후 fixture가 지원하지 않는 요청에서 나온 `not_found`는 제품 결함에 포함하지 않았다. 전송 성공이나 실제 공급자 저장을 검증한 것은 아니다.
- fixture의 SSE 미연결 및 로그 폴링 경고는 제품 장애로 집계하지 않았다. 최종 로그 이동 비교는 Follow를 끄고 대화상자 경고가 없는 상태에서 재확인했다.
- 임시 조작 코드의 버튼 이름·placeholder 대기 실패는 실제 렌더링과 소스를 확인해 보정했다. 이를 제품 결함이나 테스트 통과 수로 집계하지 않았다.
- 증거는 `/tmp/s3desk-browser-ux-wide-review/`의 로컬 임시 파일이다. 전체 키보드 순서, 스크린리더, Firefox/WebKit, 물리 기기의 가상 키보드·터치, 실제 공급자와 배포 환경은 이번 범위에 포함하지 않는다.
- 이번 요청은 조사이므로 제품 코드·테스트·기준 이미지를 수정하지 않았다. 단위 테스트, `scripts/check.sh fast/full` 및 전체 E2E 게이트는 다시 실행하지 않았다. 이전 조사에서 통과한 테스트 수를 이번 증거로 사용하지 않는다.
- 문서 작성 전 기존 tracked diff가 시작 시점과 동일함을 확인했다. 문서 작성 후 `rtk proxy git diff --check`가 통과했다. Python 검사로 보고서의 증거 링크 13개가 모두 존재하고 문서 외 tracked diff가 보존됐음을 확인했다.
