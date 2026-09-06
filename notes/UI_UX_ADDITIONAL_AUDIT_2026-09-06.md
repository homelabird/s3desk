# Additional UI/UX browser audit — 2026-09-06

## 구현 결과

네 항목을 수정했다. 아래 원본 조사와 수정 전 증거는 보존한다.

| 항목 | 최종 동작 |
| --- | --- |
| 선택 교체 안내 | 첫 선택은 Add from device, 선택 후에는 Replace selection으로 표시한다. 기존 안내 줄에서 교체 동작을 설명하며, 선택기 취소는 현재 파일을 유지한다. |
| 화면 왕복 | 같은 인증·프로필 범위에서 선택한 파일과 폴더 정보를 메모리에 보존한다. 큐 등록·Clear selection·범위 변경 시 초안을 비운다. 초안 초기화 때문에 다른 화면을 추가로 재생성하지 않는다. 브라우저 새로고침 후 복구는 포함하지 않는다. |
| 작업 상세 이동 | 전송 창을 닫고 기록의 프로필로 전환한 뒤 해당 Job Details를 연다. 업로드와 작업 산출물 다운로드에 적용했다. 같은 작업을 다시 열 수 있으며 삭제된 작업의 오류 창을 닫으면 이력으로 돌아간다. |
| 검색 실패 구분 | 최초 검색 실패와 인덱스 미생성 때 No results를 숨긴다. 정상 빈 검색에는 표시하고, 기존 성공 결과가 있는 재조회 실패에서는 결과와 오류를 함께 유지한다. |

실행 명령, 최종 결과와 환경 한계는 [검증 기록](../frontend/docs/DESIGN_AUDIT_VALIDATION_LOG.md#2026-09-06-additional-findings-follow-up)에 있다. 재현·회귀 검증은 기존 Uploads, Transfers, Objects 검색 테스트에 추가했다.

## 원본 조사

직전 조사에서 수정한 다섯 항목 이후, 현재 작업 트리에서 추가 문제 네 개를 재현했다. 이번 조사는 제품 코드·테스트·기준 이미지를 변경하지 않았다. 아래 항목은 모두 미수정이며, P2는 반복 작업·탐색·상태 해석을 방해하는 문제를 뜻한다. 서버 파일 삭제나 실제 업로드 데이터 손실을 확인한 것은 아니다.

| 순서 | 우선순위 | 추가 문제 | 영향 |
| --- | --- | --- | --- |
| 1 | P2 | Uploads의 Add from device가 기존 선택을 교체한다. | 파일을 추가했다고 생각해도 이전 선택이 업로드 대상에서 빠진다. |
| 2 | P2 | Uploads에서 다른 화면으로 이동했다 돌아오면 선택 파일이 사라진다. | 목적지 Prefix만 남고 파일을 다시 골라야 한다. |
| 3 | P2 | Transfers의 Jobs 버튼이 전송 창을 닫지 않고 해당 작업도 지정하지 않는다. | 이동한 Activity 화면이 가려지고 사용자가 작업을 다시 찾아야 한다. |
| 4 | P2 | Objects 전체 검색 실패에도 No results를 표시한다. | 검색하지 못한 상태를 일치하는 파일이 없는 상태로 오해할 수 있다. |

## 1. Add from device의 동작과 이름 불일치

- 재현: Uploads에서 `alpha.txt`, `beta.txt` 선택 → 같은 `Add from device…`로 `gamma.txt` 선택.
- 결과: 요약과 Queue upload가 2개에서 1개로 바뀌고, 목록에는 `gamma.txt`만 남았다. 390×844와 1440×900 모두 동일했다. 기존 파일은 디스크에서 삭제되지 않으며, 아직 큐에 넣지 않은 선택만 교체된다.
- 원인: `frontend/src/pages/uploads/UploadsSelectionSection.tsx:52`는 선택 유무와 관계없이 Add를 표시한다. `useUploadsPageSelectionActions.ts:147`은 새 배열로 `setSelectedFiles(files)`를 호출한다. 폴더 선택도 같은 교체 정책이다.
- 최소 개선: 교체가 의도라면 선택 후 버튼과 안내를 `Replace selection…`으로 바꾼다. 추가가 의도라면 기존 선택에 합치는 동작과 중복·폴더 충돌 규칙을 정한다.
- 확인 기준: 두 파일 뒤 한 파일을 고를 때, 표시된 추가/교체 동작과 최종 큐 대상이 일치해야 한다. 파일 선택기 취소 시 기존 선택을 유지해야 한다.
- 증거: [첫 선택](/tmp/s3desk-browser-ux-additional/uploads-first-selection.png), [두 번째 Add](/tmp/s3desk-browser-ux-additional/uploads-second-add.png), [데스크톱](/tmp/s3desk-browser-ux-additional/uploads-desktop-second-add.png), [선택 전후 JSON](/tmp/s3desk-browser-ux-additional/uploads-add-result.json).

## 2. 화면 왕복 시 업로드 초안의 파일만 초기화

- 재현: 파일을 선택하고 Prefix를 `draft/`로 입력 → 앱 탐색 메뉴로 Profiles 이동 → Uploads 복귀. 큐 등록이나 페이지 새로고침은 하지 않았다.
- 결과: 파일 목록과 Queue upload가 없어지고 `Add files or a folder first.`가 표시됐다. Prefix는 `draft/`로 유지됐다. 네이티브 확인 대화상자는 0회였고 앱 내부 이탈 확인도 없이 화면 이동이 완료됐다. 데스크톱에서는 `desktop-draft/`로 같은 결과를 확인했다.
- 원인: `frontend/src/pages/uploads/useUploadsPageScopedStorageState.ts:25`의 Prefix는 저장소 상태지만 `:29`의 파일 배열은 경로 컴포넌트의 `useState([])`다. 경로를 나갔다 돌아오면 파일 상태가 다시 생성된다.
- 최소 개선: 선택 파일이 있을 때 이탈 전에 소실을 알리거나, 같은 프로필 범위의 화면 왕복 동안 메모리에서 초안을 유지한다. 브라우저 재시작 후 파일 복구까지 요구하는 문제는 아니다.
- 확인 기준: 업로드 전 Profiles/Buckets/Activity를 들렀다 돌아와도 선택을 보존하거나, 버리기 전에 사용자가 선택할 수 있어야 한다. 다른 프로필의 목적지로 초안이 섞이지 않아야 한다.
- 증거: [복귀 화면](/tmp/s3desk-browser-ux-additional/uploads-return-after-navigation.png), [모바일 관측값](/tmp/s3desk-browser-ux-additional/uploads-navigation-result.json), [데스크톱 관측값](/tmp/s3desk-browser-ux-additional/uploads-desktop-result.json).

## 3. Transfers → Jobs 이동에서 창과 작업 문맥이 남음

- 재현: 작업 ID가 있는 전송 기록을 복원한 상태에서 Uploads → Transfers → 해당 업로드의 Jobs 클릭.
- 결과: URL은 `/jobs`로 바뀌지만 Transfers 대화상자가 계속 열려 있다. Job Details는 열리지 않으며, Activity 이력은 전송 창 뒤에 가려진다. 390×844에서 화면과 DOM으로 확인했다.
- 원인: `frontend/src/components/transfers/TransfersRuntimeUiHost.tsx:15`의 `handleOpenJobs`는 `navigate('/jobs')`만 실행한다. `TransferUploadRow.tsx:140`도 `t.jobId`를 전달하지 않는다. 다운로드의 작업 산출물 행 역시 같은 인자 없는 콜백을 사용한다. 다운로드 행은 소스에서 확인했으며 브라우저 재현은 업로드 행으로 수행했다.
- 최소 개선: Jobs 이동 시 Transfers를 닫는다. 행에 연결된 jobId를 전달하여 해당 작업의 상세를 열거나 검색·강조한다. 현재 프로필과 다른 전송 기록의 이동 범위도 확인한다.
- 확인 기준: 클릭 한 번으로 해당 작업을 볼 수 있고, Transfers가 목적지 화면을 가리지 않아야 한다. 연결된 작업이 삭제된 경우에도 일반 이력으로 이동할 수 있어야 한다.
- 증거: [클릭 후 화면](/tmp/s3desk-browser-ux-additional/transfers-jobs-after-click.png), [URL·대화상자 관측값](/tmp/s3desk-browser-ux-additional/transfers-jobs-result.json).

## 4. 전체 검색 실패와 정상 빈 결과가 같은 안내를 사용

- 재현: Objects → Search bucket → `alpha` 입력. 검색 API에 503을 반환하고 재시도가 끝날 때까지 기다린다.
- 결과: `Search failed` 오류와 `No results`가 동시에 표시된다. 정상 200 빈 응답으로 바꾸고 기존 Refresh를 누르면 오류는 사라지고 `No results`만 남는다. 따라서 Refresh 부재가 아니라 실패/빈 결과 표현의 혼동이다.
- 원인: `frontend/src/pages/objects/ObjectsGlobalSearchDrawer.tsx:103`에서 오류를 표시한 뒤 `:138`에서 결과 컴포넌트를 계속 렌더링한다. `ObjectsGlobalSearchResults.tsx:173`은 오류 상태를 받지 않고 빈 배열이면 `No results`를 표시한다.
- 최소 개선: 최초 검색 실패·인덱스 미생성 상태에서는 정상 빈 결과 안내를 숨긴다. 이전 성공 결과가 있는 재조회 실패라면 기존 결과와 갱신 실패 안내를 함께 유지한다.
- 확인 기준: 첫 검색 실패, 성공한 빈 검색, 인덱스 미생성, 기존 결과를 가진 재조회 실패를 구분한다. 검색어·필터와 기존 Refresh 동작을 유지한다.
- 증거: [오류와 빈 결과 동시 표시](/tmp/s3desk-browser-ux-additional/objects-search-failed-empty.png), [오류 상태 JSON](/tmp/s3desk-browser-ux-additional/objects-search-error.json), [실패→정상 빈 응답 비교](/tmp/s3desk-browser-ux-additional/objects-search-recovery-control.json).

## 조사 범위와 검증 한계

로컬 Chromium에서 Uploads 파일 선택·화면 왕복, Transfers→Activity 이동, Objects 검색 오류·빈 응답 복구를 직접 조작했다. 모바일은 390×844와 320×568 터치 에뮬레이션, 데스크톱은 1440×900을 사용했다. Profiles는 화면 왕복 경로로 확인했으며 이번에 모든 화면·상태를 재감사한 것은 아니다.

`rtk proxy sh -c 'node /tmp/s3desk-ux-additional-browser.mjs > /tmp/s3desk-ux-additional-browser.log 2>&1'`로 기존 Vite와 `frontend/tests/support/` fixture·조작 헬퍼를 재사용했다. 업로드 파일은 합성 텍스트이고, 전송 기록은 테스트용 세션 데이터다. 검색은 503과 200 빈 응답을 제어했다. SSE/realtime의 미연결 fixture 표시는 제품 장애로 집계하지 않았다. 임시 도구의 초기 탭 대기 시간 초과도 제품 결함 근거로 사용하지 않았다.

화면과 JSON은 `/tmp/s3desk-browser-ux-additional/`의 로컬 임시 증거다. 제품 변경이 없어 단위·E2E 회귀 게이트를 다시 실행하지 않았고, 이전 1,094/149개 통과를 이 네 문제의 검증으로 사용하지 않았다. 문서 변경 후 `git diff --check`와 링크 대상 존재 여부를 확인했다. 실제 공급자·배포 환경·물리 기기·스크린리더 검증은 포함하지 않는다.
