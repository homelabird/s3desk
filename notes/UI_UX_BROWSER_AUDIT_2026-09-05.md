# UI/UX browser audit — 2026-09-05

## 2026-09-06 구현 결과

아래 원본 조사에서 제안한 다섯 항목을 수정하고 로컬 검증했다. 원본 재현과 수정 전 관측값은 그대로 보존한다.

| 항목 | 구현 결과 |
| --- | --- |
| Transfers 정리 | Clear finished는 완료·실패·취소 기록만 지우고 모든 진행 중 상태를 보존한다. 개별 Remove도 종료된 항목에만 제공한다. 명시적 Cancel의 서버 작업 취소를 별도로 검증했다. |
| 모바일 Job Details | 액션을 스크롤 본문으로 옮기고 상태·진행률을 앞에 배치했다. 320×568 고정 헤더는 249px에서 81px로 줄었고 첫 화면에서 상태를 읽을 수 있다. |
| 모바일 Uploads | 요약을 한 줄로 줄이고 목적지 바로 뒤에 큐 실행 버튼을 배치했다. 390px에서 Prefix와 버튼의 상단 위치 차이는 약 1,094px에서 64px로 줄었다. |
| 자동 재시도 안내 | 안내를 요청별로 관리하고 성공·소진·중단 시 해당 안내만 해제한다. 다른 요청의 성공이 동시 실패 안내를 지우지 않도록 검증했다. |
| 좁은 모바일 Objects | 상단 배치와 여백을 줄여 320×568 첫 화면에서 첫 파일 행 전체가 보인다. 검색·업로드·메뉴와 터치 영역을 유지했다. |

단위 테스트 1,094개와 브라우저 테스트 149개가 통과했다. [현재 검증 기록](../frontend/docs/DESIGN_AUDIT_VALIDATION_LOG.md#2026-09-06-browser-audit-follow-up)에 실행 명령, 화면 증거, 갱신한 기준 이미지와 환경 한계를 기록했다. 실제 공급자·실기기·배포 환경 검증은 포함하지 않는다.

## 원본 조사

Chromium에서 실제 화면을 열고 파일 선택, 목적지 입력, 업로드 큐 등록, 전송 정리, 버킷 재시도, 파일 선택/메뉴, 프로필 입력 검증, 작업 상세/로그, 설정, 로그인 오류를 조작했다. 모바일은 320×568 및 390×844 터치 에뮬레이션, 데스크톱은 1440×900을 사용했다. 데스크톱 크기로 리사이즈한 비교 화면도 포함한다. 로그인에서는 밝은/어두운 테마를 확인했다.

현재 작업 트리 기준의 조사다. 이 조사에서는 제품 코드와 테스트를 수정하지 않았다. 기존 변경 사항을 유지했다. 아래 우선순위는 P1=진행 중 작업의 상태/제어 혼동, P2=반복되는 조작·정보 확인의 불편, P3=사용성 개선 제안이다.

| 우선순위 | 화면 | 브라우저에서 확인한 문제 | 권장 개선 |
| --- | --- | --- | --- |
| P1 | Transfers, 모바일·데스크톱 공통 동작 | 실행 중 업로드에서 Clear all 후 활성 표시와 목록이 사라지지만 서버 작업 취소 요청은 없다. | 진행 중 항목을 유지하고 완료 기록 정리와 취소 동작을 명확하게 구분한다. |
| P2 | 모바일 Job Details | 320×568에서 고정 헤더가 249px를 차지한다. 상태를 보려면 본문을 스크롤해야 한다. | 제목·닫기는 한 줄로, 주요 동작은 짧은 행으로 배치하고 보조 동작은 메뉴로 옮긴다. |
| P2 | 모바일 Uploads | 파일 하나를 선택해도 실행 버튼과 목적지 입력란이 약 1,094px 떨어진다. | 목적지 입력과 실행을 인접 배치하고 요약을 줄인다. |
| P2 | Buckets 오류 복구, 데스크톱 재현 | 목록 복구 후에도 Auto-retry in 1s 경고가 남는다. | 재시도 상태를 해당 요청의 완료·복구와 함께 갱신한다. |
| P3 | 좁은 모바일 Objects | 320×568 첫 화면에서는 첫 파일 이름조차 끝까지 보이지 않는다. | 모바일 도구 영역을 압축하고 파일 목록을 더 일찍 보여준다. |

## 1. Clear all 이후 진행 중 업로드가 보이지 않음

재현: 파일 추가 → Queue upload → 서버 적용 단계의 Transferring 확인 → Clear all.

실제 업로드 UI를 통해 생성·파일 전송·commit 요청을 수행하고, fixture의 서버 작업을 running으로 유지했다. 데스크톱에서 활성 작업과 Cancel/Remove를 확인한 뒤 모바일 크기에서 Clear all을 눌렀다. 결과는 `No uploads yet`, 활성 배지 소멸, 취소 API 호출 0회였다. 모의 서버의 작업 상태는 running이었다. 사용자는 이 전송 화면에서 진행 중 작업의 존재와 상태를 더 이상 알 수 없다. Activity의 작업 기록까지 삭제됐다는 의미는 아니다.

- 화면: [실행 중 데스크톱](/tmp/s3desk-browser-ux-audit/transfers-desktop-running.png), [실행 중 모바일](/tmp/s3desk-browser-ux-audit/transfers-mobile-running.png), [정리 직후 모바일](/tmp/s3desk-browser-ux-audit/transfers-mobile-cleared-running.png)
- 관측값: [transfers-clear-result.json](/tmp/s3desk-browser-ux-audit/transfers-clear-result.json)
- 원인 위치: `frontend/src/components/transfers/TransfersDrawer.tsx:129`의 직접 Clear all 연결, `useTransfersTaskActions.ts:125`의 commit 이외 업로드 제거. 서버 작업 취소는 별도 `useTransfersRuntimeController.ts:169`의 cancelUploadTask에 있다.
- 최소 개선: 우선 Clear done을 기본 정리 동작으로 사용하고 진행 중 항목을 보존한다. 진행 중 작업을 숨기는 기능이 필요하다면 서버 작업이 계속된다는 설명과 구분된 이름을 제공한다.
- 확인 기준: queued/staging/commit/waiting_job 및 완료 항목이 섞인 상태에서 기록 정리가 진행 중 작업 추적을 지우지 않아야 한다. Cancel은 실제 취소 응답 상태를 반영해야 한다.

## 2. 모바일 작업 상세의 고정 헤더가 너무 큼

재현: Activity → 실행 중 작업 Details → 390px 또는 320px 세로 화면.

Refresh, 비활성 Delete, Open logs가 세로로 쌓이고 닫기도 아래 줄로 밀린다. 320×568에서 헤더 높이 249px(43.8%), 스크롤 가능한 본문 높이 319px를 측정했다. 첫 화면은 ID·기술적인 작업 종류·요약까지만 보여주며 Status는 아래에 있다. 390×844에서도 같은 헤더가 약 30%를 차지한다. 데스크톱에서는 버튼이 한 줄로 배치된다.

- 화면: [320px 상세](/tmp/s3desk-browser-ux-audit/activity-mobile-320-details.png), [390px 상세](/tmp/s3desk-browser-ux-audit/activity-mobile-details.png), [데스크톱 비교](/tmp/s3desk-browser-ux-audit/activity-desktop-details.png)
- 관측값: [job-details-geometry.json](/tmp/s3desk-browser-ux-audit/job-details-geometry.json)
- 원인 위치: `frontend/src/pages/jobs/JobsDetailsDrawer.tsx:275`, `JobsShared.module.css:146`의 480px 이하 세로 배치, `frontend/src/components/OverlaySheet.tsx:93`의 제목·액션·닫기 구성.
- 최소 개선: 제목과 닫기를 첫 행에 유지하고 Refresh/Open logs를 짧은 행에 둔다. Delete는 보조 메뉴로 옮긴다. 상태와 진행 정보를 내부 작업 유형 설명보다 앞에 배치한다. 터치 영역은 줄이지 않는다.
- 확인 기준: 320×568에서 스크롤 없이 작업 상태를 읽을 수 있어야 하며, 주요 버튼과 닫기의 터치·키보드 접근성이 유지돼야 한다.

## 3. 모바일 업로드의 목적지 입력과 실행 버튼이 멀리 떨어짐

재현: Uploads → Add from device → 파일 하나 선택 → 아래로 이동해 Prefix 수정 → 업로드 실행 시도.

390×844에서 파일 하나를 선택한 직후 Queue upload의 y=202.47px, Prefix의 y=1296.44px로 약 1,094px 차이가 났다. 요약 카드 네 개와 파일 미리보기가 목적지 입력보다 앞에 있다. 목적지를 편집하면 Queue upload가 화면 위로 사라져 다시 올라가야 한다. 데스크톱 1440×900에서는 두 요소가 같은 화면에 들어왔다.

- 화면: [파일 선택 직후](/tmp/s3desk-browser-ux-audit/uploads-mobile-selected.png), [목적지 편집 위치](/tmp/s3desk-browser-ux-audit/uploads-mobile-destination.png), [데스크톱 비교](/tmp/s3desk-browser-ux-audit/uploads-desktop-selected.png)
- 관측값: [uploads-geometry.json](/tmp/s3desk-browser-ux-audit/uploads-geometry.json). 내부 스크롤 컨테이너를 사용하므로 window.scrollY만으로 이동량을 해석하면 안 된다.
- 원인 위치: `frontend/src/pages/uploads/UploadsPageShell.tsx:20`의 헤더 전용 실행 버튼과 `:91`의 Selection→Target 순서, `UploadsSelectionSection.tsx:59`의 네 요약 카드, `frontend/src/pages/UploadsPage.module.css:176`의 작은 화면 배치.
- 최소 개선: 파일 수·용량을 한 줄 요약으로 줄이고 목적지 바로 뒤에 실행 버튼을 둔다. 필요하면 기존 레이아웃 안에서 모바일 하단 고정 실행 영역을 사용한다.
- 확인 기준: 320/390px에서 목적지 확인·수정 후 위로 되돌아가지 않고 큐에 넣을 수 있어야 한다. 파일·Prefix 보존과 긴 경로 줄바꿈을 유지한다.

## 4. 수동 복구 후에도 이전 자동 재시도 안내가 남음

재현: Buckets 목록 요청에 503 반환 → 자동 재시도 소진 → Retry loading buckets → 정상 목록 응답.

정상 버킷 행이 표시된 순간 상단에는 `Temporary request failure (HTTP 503). Auto-retry in 1s.`가 남았다. 네 번의 실패 응답 뒤 성공 응답을 받았고 성공 약 120ms 후 화면과 경고를 함께 캡처했다. 동일 요청 내부 재시도 성공은 상태를 지우지만 새 수동 요청의 첫 시도 성공은 기존 경고를 지우지 않는 코드와 일치한다. 경고가 영구히 남는 것은 아니며 unstable 표시의 타이머는 10초다.

- 화면: [복구된 목록과 남은 경고](/tmp/s3desk-browser-ux-audit/buckets-desktop-recovered-banner.png)
- 관측값: [bucket-recovery-result.json](/tmp/s3desk-browser-ux-audit/bucket-recovery-result.json)
- 원인 위치: `frontend/src/api/retryTransport.ts:137`의 `attempt > 0 && res.ok`, `frontend/src/components/NetworkStatusBanner.tsx:50`의 시간 기반 해제.
- 최소 개선: 동일 작업의 수동 복구나 재시도 종료와 안내 상태를 연결한다. 다른 요청 하나가 성공했다는 이유로 동시 실패 경고를 전부 지우는 방식은 피한다.
- 확인 기준: 자동 재시도 소진과 수동 복구 시점에 현재 상태를 정확히 표시하고, 동시에 실패 중인 별도 요청의 안내를 잃지 않아야 한다.

## 5. 좁은 모바일 Objects의 첫 화면에 파일이 거의 보이지 않음

재현: 320×568에서 폴더 하나와 파일 세 개가 있는 버킷을 기본 목록 상태로 연다.

앱 헤더·프로필 선택·화면 제목·Upload/More·버킷·검색/필터/보기 전환·표 헤더가 연속으로 놓인다. 첫 폴더는 보이지만 첫 파일 alpha.txt의 텍스트 위치가 y=556.06px라 아래가 잘린다. 스크롤하면 파일 선택과 행 메뉴를 사용할 수 있으므로 기능 차단이나 접근성 기준 위반으로 판정하지 않았다. 데이터 탐색에 도달하기까지의 마찰을 줄일 수 있다는 개선 제안이다.

- 화면: [320px 첫 화면](/tmp/s3desk-browser-ux-audit/objects-mobile-320.png), [스크롤 후 파일 선택](/tmp/s3desk-browser-ux-audit/objects-mobile-selected.png), [데스크톱 비교](/tmp/s3desk-browser-ux-audit/objects-desktop-selected.png)
- 수정 대상: `frontend/src/pages/objects/ObjectsPageHeader.tsx`, `ObjectsToolbar.tsx`, `ObjectsToolbarSection.tsx`, `ObjectsShell.module.css:473`의 모바일 배치.
- 최소 개선: 상단 도구의 중복 높이와 여백을 줄이고, 덜 쓰는 보기 설정을 기존 More/Filters 안에 모은다.
- 확인 기준: 폴더·파일이 섞인 목록에서 320×568 첫 화면에 최소 한 파일 행을 읽을 수 있게 하되 검색과 주요 작업의 발견 가능성을 유지한다.

## 조사 범위와 증거의 한계

- Profiles: 모바일 목록과 생성 폼, 데스크톱 크기 비교, 빈 필수 입력으로 Create 시 필드별 오류 표시 확인.
- Buckets: 데스크톱 목록 오류→수동 복구.
- Objects: 320px 목록, 파일 선택, 행 메뉴 열기/닫기, 데스크톱 크기 비교.
- Uploads/Transfers: 모바일 파일 선택·목적지 편집, 데스크톱 큐 등록·서버 적용 상태, 모바일 정리 동작.
- Activity: 모바일 이력·작업 상세·로그, 320/390px 및 데스크톱 상세 비교. Jobs fixture의 오래된 유형 대신 실제 등록된 `transfer_sync_staging_to_s3` 유형으로 확인했다.
- Settings: Access 화면의 모바일·데스크톱 비교. Login: 모바일 밝은/어두운 테마와 잘못된 토큰 오류. 로그인 화면의 가로 폭은 390px에 scrollWidth 390px였다.
- Playwright로 실제 Chromium을 조작하되 저장소·서버 응답은 기존 `frontend/tests/support/` fixture와 필요한 응답 제어를 사용했다. 실제 공급자 업로드·배포 환경, 실기기 가상 키보드, iOS Safari, 스크린리더 결과가 아니다. SSE 연결 중단 fixture 표시는 제품 연결 장애로 집계하지 않았다.
- 조사 도구: `/tmp/s3desk-ux-browser.mjs`를 Node로 실행해 기존 Vite와 fixture를 재사용했다. 스크린샷과 JSON 관측값은 `/tmp/s3desk-browser-ux-audit/`의 로컬 임시 산출물이며 버전 관리에 추가하지 않았다.
- 이 조사에서는 단위/E2E 회귀 테스트나 `./scripts/check.sh fast/full`을 실행하지 않았다. 직접 브라우저 관찰과 관련 소스 추적으로 판단했으며 제품 코드 수정은 없다. 보고서 추가 후 `git diff --check`를 실행했다.
