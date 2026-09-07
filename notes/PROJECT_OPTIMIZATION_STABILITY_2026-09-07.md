# 최적화·안정화 진행 기록 — 2026-09-07

기준: `3a87d43`의 깨끗한 작업 트리에서 시작했다. 썸네일 요청·캐시, 업로드
정리·중단 복구·경쟁 조건, 실시간 연결, 객체·버킷·프로필의 비동기 처리를 개선했다.
22차까지 구현한 누적 변경의 전체 로컬 검증을 23차에서 완료했다. 최신 결과와
완료 범위는 마지막 절에 있으며, 앞선 단계의 결과는 해당 시점의 증거다.

## 재현과 수정

- **요청 시작 예외로 큐 정지:** `XMLHttpRequest.open/send`가 동기 예외를 던지면
  실행 슬롯이 반환되지 않았다. 기본 동시 실행 수인 4개만큼 실패하면 이후 요청이
  시작되지 않았고, 대기 중이던 요청의 시작 예외는 해당 Promise에 전달되지 않았다.
  공통 큐에서 예외를 요청 Promise로 전달하고 슬롯을 반환하도록 수정했다.
- **캐시 적중에도 전체 검색:** 동일 이미지·크기 조회도 모든 캐시 키를 분해하고
  후보를 정렬했다. 정확히 일치하는 키는 Map에서 직접 찾고, 다른 크기의 재사용은
  기존 검색을 유지한다. 인증 범위 분리, 크기 우선순위, LRU 갱신·해제를 검사했다.
- **실패 기록의 무제한 증가:** 성공 이미지에는 용량 제한이 있었지만 실패 기록은
  다시 조회하는 키만 만료시켰다. 실패 기록에도 기존 `maxEntries`를 적용하고,
  최근 실패를 보존하도록 갱신 순서를 반영했다.
- **성능 테스트의 모호한 선택자:** Jobs 로그 창 검사에서 `getByText('Job Logs')`가
  제목과 `Loading job logs…`를 동시에 선택해 실패했다. 기존 대화상자의 접근성
  이름으로 선택자를 좁혔다. 1초 성능 기준은 그대로 유지한다.
- **폼 로딩 전 접근성 스캔:** 다크 모드의 프로필 편집 검사가 실제 폼과 같은 이름의
  Suspense 대기 화면에 스캔 표식을 붙였다. 폼이 로드되어 대화상자가 교체되면
  axe가 검사 대상을 찾지 못했다. 기존 밝은 테마·모바일 테스트처럼 Name 필드의
  실제 초기값을 확인한 뒤 검사한다. 지연 시간 추가나 접근성 규칙 제외는 없다.

새 회귀 테스트는 수정 전 3개 실패와 처리되지 않은 Promise rejection 1건을
재현했다. 수정 후 관련 단위 테스트 4개 파일의 19개 테스트가 통과했다.
Chromium에서는 썸네일 시작을 4회 연속 실패시킨 뒤 다음 이미지의 실제 디코딩과
페이지 오류 부재를 검증했다. 해당 미리보기 파일의 비시각 테스트 6개가 통과했다.

## 성능 측정

같은 Node 프로세스에서 HEAD와 변경 소스를 각각 번들링했다. 각 캐시 크기에서
1,000회 준비 후 5,000회 조회를 5번 측정하고, 전후 순서를 번갈아 실행한 중앙값이다.
이는 동일 크기 메모리 캐시 적중의 합성 측정이며 페이지·네트워크·운영 지연은 아니다.

| 캐시 항목 수 | 수정 전 µs/조회 | 수정 후 µs/조회 |
| --- | ---: | ---: |
| 400 | 241.80 | 3.39 |
| 2,000 | 1,340.45 | 5.57 |

체크인한 단독 벤치마크 실행:

```bash
cd frontend
npx vitest bench --run src/lib/__benchmarks__/thumbnailCache.bench.ts
```

## 1차 검증

명령은 `rtk proxy`를 통해 실행했다. 아래 결과는 이 작업 트리의 로컬 검증이다.

| 검사 | 결과 |
| --- | --- |
| `./scripts/check.sh fast` 최초 실행 | 새 회귀 테스트를 추가한 중간 실행에서 수정 전 결함 3건으로 실패. 최종 게이트로 사용하지 않음 |
| frontend: 관련 캐시·큐·ObjectThumbnail·미리보기 상태 단위 검사 `--maxWorkers=2` | 4개 파일, 19개 통과 |
| frontend: `npm run test:e2e -- tests/objects-image-preview.spec.ts --project=chromium --workers=1 --grep-invert @visual` | 6개 통과 |
| `CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 PLAYWRIGHT_WEB_SERVER_PORT=18187 ./scripts/check.sh full` | 통과: OpenAPI, release/workflow 구조, Helm, Go vet·tests·security, frontend lint·254개 파일/1,111 tests·build·2 browser smoke, license snapshot 재현성 |
| backend: `go test -race ./internal/api ./internal/jobs ./internal/store` | 세 패키지 통과 |
| frontend: `npm run bundle:budget` | 통과, 예산 경고 없음. 초기 JS 164.4/170 KiB, Objects 68.4/72 KiB, Transfers 13.6/14.5 KiB gzip |
| frontend: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18189 npm run test:e2e:perf -- --workers=1` | production preview + mock API에서 4개 통과. Jobs 목록 647/2,000ms, 필터 116/300ms, 로그 창 96/1,000ms, Objects 목록 744/3,000ms |
| frontend: `npx eslint tests/jobs-perf.spec.ts --max-warnings 0` | 선택자 수정 후 통과 |
| frontend: 다크 모드 프로필 편집 접근성 검사 `--repeat-each=5 --workers=1` | production preview에서 5회 통과 |
| frontend: `npx eslint tests/dark-theme-accessibility.spec.ts --max-warnings 0` | 폼 대기 조건 수정 후 통과 |
| frontend: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18189 npm run test:e2e:core -- --workers=4` | 최종 170개 통과, 15개 환경 조건 skip. production preview + mock API |
| `git diff --check` | 통과 |

성능 검사 첫 실행은 모호한 선택자로 1개 실패/3개 통과했다. 선택자 수정은 전체
게이트 이후의 테스트 파일 변경이며, 위의 성능 재실행과 ESLint로 별도 검증했다.
Core 첫 실행은 169개 통과/1개 실패/15개 환경 조건 skip이었다. 실패한 다크 모드
검사의 폼 준비 조건을 보강한 뒤 전체 Core를 재실행해 170개 통과를 확인했다.
Core 결과에는 위 미리보기 6개가 포함되므로 중복 합산하지 않는다.

## 2차: 만료 업로드 정리와 실행 중인 원본 보존

- **실패 배치 뒤의 세션이 정리되지 않음:** 기존 코드는 매번 가장 오래된 200개를
  다시 읽었다. 첫 200개가 모두 실패하면 뒤의 정상 세션은 시도하지 않았다. 일부만
  실패하면 같은 정리 주기 안에서 실패 세션을 여러 번 호출했다. 재현 테스트에서
  실패 1개는 한 주기에 3번 호출됐고, 실패 200개 뒤 정상 201개는 호출되지 않았다.
- `ListExpiredUploadSessions`와 호출자인 maintenance에서 `(expires_at, id)`를
  기준으로 다음 배치를 읽는다. 삭제 실패 세션은 상태를 유지하고 다음 주기에
  재시도한다. 동일 만료 시각의 세션과 이미 삭제된 커서 행도 처리하며, 만료되지
  않은 세션은 제외한다. 기존 200개 배치와 배치별 자격 증명 재사용을 유지했다.
- **실행 중인 staging 전송의 원본 삭제:** 전송이 세션 TTL을 넘기면 maintenance가
  원본 파일과 세션을 삭제했다. 실제 임시 파일을 사용하는 테스트에서 삭제를 재현했다.
  정리 기준 시각을 먼저 고정하고, 실행 중인 staging 작업의 profile/upload ID를
  조회하여 보호한다. 이후 시작하는 작업은 기존 만료 검사에서 거절된다.
  실행 상태를 조회할 수 없으면 삭제를 멈춘다. 같은 프로필의 다른 만료 세션은
  계속 정리하고, 전송 종료 후 다음 정리 주기에는 보호했던 세션도 삭제한다.

SQL 검사는 기존 PostgreSQL transaction 테스트 그룹에 추가했다. 임시 PostgreSQL
15 컨테이너를 loopback에만 연결해 검사한 뒤 제거했다. 공개 HTTP API·스키마·배포
구성의 변경은 없다.

| 검사 | 결과 |
| --- | --- |
| backend: `go test ./internal/jobs ./internal/store -run 'TestCleanupExpiredUploadSessions\|TestListExpiredUploadSessionsPagination' -count=1` | SQLite 회귀 검사 통과 |
| backend: `go test -race ./internal/jobs ./internal/store` | 두 패키지 전체 통과; 실행 상태 조회 실패 시 삭제 중단 검사 포함 |
| backend: `go test -race ./internal/store -run TestPostgres -count=1 -v` | 임시 PostgreSQL에서 transaction 7개 하위 사례와 검색 계약 통과; 새 pagination 사례 포함 |
| `CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 PLAYWRIGHT_WEB_SERVER_PORT=18190 ./scripts/check.sh full` | 백엔드 보강 후 전체 로컬 게이트 통과: Go tests/vet/security, frontend 1,111 tests/build/lint, browser smoke 2개, 나머지 repository checks |
| frontend: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18191 npm run test:e2e -- tests/bucket-governance.spec.ts --project=chromium --workers=1 --trace=on` | 최종 2개 통과; GET → PUT → GET 응답이 모두 200으로 기록됨 |
| frontend: `npx eslint tests/bucket-governance.spec.ts --max-warnings 0` | 통과 |

Governance 테스트의 종료 조건 변경은 위 전체 게이트 실행 이후이며, 해당 브라우저
검사와 ESLint로 별도 검증했다. 1차 Core 170개 결과를 새 전체 Core 실행으로 세지 않는다.

Go 취약점 분석은 호출 경로에 영향을 주는 취약점 0건을 보고했다. 가져온 패키지의
비호출 취약점 3건은 별도이며, 모든 의존성이 무취약하다는 의미는 아니다.

실제 provider, 배포된 reverse proxy, 운영 복원, 물리 기기·보조기술 검증은
이 로컬 결과에 포함하지 않는다. 외부 변경·배포·커밋·푸시는 수행하지 않았다.
전체 mobile-responsive 및 visual 전용 lane은 이번에 실행하지 않았으며, Core에
포함된 320px reflow·모바일 접근성 검사를 해당 lane의 대체 증거로 사용하지 않는다.
1차 프리뷰 로그의 governance 요청 2건은 저장 요청 수신만 확인하고 테스트가 끝나며
저장 후 재조회가 teardown과 겹친 결과였다. 테스트가 성공 알림과 Refreshing 종료까지
기다리게 보강했다. 재검사에서 두 테스트 모두 저장 후 GET 200을 포함했고, 프리뷰의
추가 연결 오류는 0건이었다. realtime-ticket·다른 목록 요청의 종료 시점 분류는
남아 있으며, Core 통과로 모든 백그라운드 요청의 모킹 완전성을 주장하지 않는다.

## 3차: 실시간 연결 취소·실패 복구와 업로드 검사 완료 조건

- **불필요한 티켓 요청 유지:** Jobs/Objects의 공통 실시간 hook과 업로드 실시간
  hook 모두 티켓을 요청하는 fetch에 취소 signal이 없었다. 인증 범위 변경,
  업로드 완료, hook 해제 이후에도 요청이 남았다. Jobs에는 effect 수명의
  AbortController를 적용하고, 업로드에는 기존 controller의 signal을 전달했다.
  WS/SSE 요청 각각을 지연시키는 테스트에서 취소와 다음 연결의 새 signal,
  취소 후 추가 연결 부재를 검사한다.
- **WebSocket 생성 예외로 실시간 갱신 중단:** Jobs/Objects 공통 hook에서
  WebSocket 생성자가 없거나 예외를 던지면 처리되지 않은 rejection이 발생하고
  SSE 전환도 실행되지 않았다. 업로드 hook에 이미 있는 생성 예외 처리 패턴을
  적용해 기존 SSE 연결 경로로 복구한다. 새 연결 추상화·의존성은 추가하지 않았다.
- 수정 전 단위 검사는 6개 실패와 처리되지 않은 rejection 2개를 보고했다.
  수정 후 두 hook의 28개 검사가 통과했다. 브라우저에서도 생성자에 SecurityError를
  주입한 경우 기존 빌드는 오류와 갱신 중단을 보였고, 새 빌드는 SSE 메시지로
  작업 행을 succeeded로 바꾸며 페이지 오류가 없었다. 해당 검사에서 HTTP 목록의
  작업 상태는 running으로 유지하므로 SSE가 실제 갱신을 수행했는지 구분한다.

`transfers-presigned.spec.ts`의 세 기존 검사는 업로드 commit 요청 수신 직후
끝났다. trace에서는 후속 `/jobs?id=...&limit=1` 요청이 404였고, CORS 응답
조정 사례는 최초 `/jobs/{id}` 응답도 404였다. 기존 공통 fixture에 두 조회를
모두 제공하고 running → succeeded 전환 후 Transfers의 Done 표시를 검사한다.
완료 표시만 먼저 추가한 실행에서는 세 사례 모두 `not_found` 오류와 Transferring
상태로 남아 실패했다. fixture 수정 후 세 사례 모두 commit 201, 상세 조회 200,
후속 목록 조회 200, Done 표시를 확인했다. 업로드 경로 선택·재시도 횟수에 대한
기존 검사는 유지한다.

| 검사 | 결과 |
| --- | --- |
| frontend: `npx vitest run src/pages/jobs/__tests__/useJobsRealtimeEvents.test.tsx src/components/transfers/__tests__/useTransfersUploadJobEvents.test.tsx --maxWorkers=2` | 28개 통과 |
| `CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 PLAYWRIGHT_WEB_SERVER_PORT=18193 ./scripts/check.sh full` | 전체 로컬 게이트 통과: frontend 254개 파일/1,117 tests·lint·build, browser smoke 2개, backend tests/vet/security와 repository checks |
| frontend: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18192 npm run test:e2e -- tests/jobs-realtime-overlays.spec.ts tests/transfers-presigned.spec.ts tests/webview-realtime.spec.ts --project=chromium --workers=1 --trace=on` | production preview + mock API에서 9개 통과: 생성 실패 시 SSE 복구, overlay 유지/갱신, 업로드 3개 완료, 연결 끊김·재연결 |
| frontend: `npx eslint tests/transfers-presigned.spec.ts --max-warnings 0` | 전체 lint 실행 이후 보강한 fixture·완료 검사 통과 |
| frontend: `npm run bundle:budget` | 통과; 예산·순환 chunk 경고 없음 |
| `git diff --check` | 통과 |

최종 9개 브라우저 검사 전후 프리뷰 연결 오류 수는 3개로 같았다. 세 오류는
수정 전 첫 staging fallback 테스트의 teardown에서 발생했다. 이번 재검사에서
추가 오류는 0개지만, 이 결과로 1차 Core 전체의 나머지 목록·폴더 요청까지
해결됐다고 주장하지 않는다. 공통 실시간 hook의 요청 취소는 화면/인증 수명에 대한
수정이며, Playwright의 모든 teardown 연결 오류를 설명하는 것은 아니다.
3차에서는 전체 Core·mobile-responsive·visual 전용 lane을 재실행하지 않았다.
Webview 검사는 Chromium의 모의 환경이며 실제 WebView/물리 기기 증거가 아니다.

이번 단계 로그는 `/tmp/s3desk-realtime-{before,focused,full,bundle}-20260907.log`,
브라우저 결과는 `/tmp/s3desk-realtime-browser-final-20260907.{log,json}`와
같은 이름의 trace 디렉터리에 남겼다. 전체 목표는 계속 진행 중이다.

## 4차: 모바일 검증과 폴더 새로고침 안정화 — 2026-09-08

모바일 전체 lane을 3차 빌드에서 실행해 iPhone/Pixel의 110개 검사가 통과했다.
프로필 전환 후 펼침 상태 복원도 별도 브라우저 검사에서 정상 동작했으므로
해당 경로를 결함으로 분류하지 않았다.

폴더 생성 후 부모를 새로고침하는 흐름에서는 기존에 펼쳐 둔 하위 폴더가 사라졌다.
브라우저 재현에서 `docs/nested/`를 확인한 뒤 루트에 `new-folder/`를 생성하면,
생성 성공과 새 폴더는 표시되지만 펼쳐진 `docs` 아래 `nested`가 없어졌다.
원격 폴더 삭제가 아닌 클라이언트 트리 표시 문제다.

- `useObjectsTree`가 부모의 새 목록으로 자식 노드를 다시 만들면서 자식의 기존
  하위 트리 데이터를 버렸으나, 별도 캐시에는 해당 자식을 이미 불러왔다고 기록했다.
  재생성한 자식의 로드 기록을 지워 데이터와 캐시가 일치하게 했다.
- `SimpleTree`는 펼침 키가 새로 추가될 때만 로드했다. 같은 키의 노드가 교체되면
  펼침 상태가 유지되어 재조회가 일어나지 않았다. 두 Set 대신 현재 요청한 노드를
  기록하는 Map 하나로 처리한다. 동일 노드의 실패는 자동 반복하지 않으며,
  접었다 펼치면 명시적으로 다시 시도한다. 새 부모 목록에 나타난 펼친 자식은
  실제 노드가 생길 때 로드한다. 사라지거나 교체된 노드 기록은 제거한다.

각 원인을 별도 단위 검사로 재현했고, 수정 후 SimpleTree·Objects tree·기존
LocalPathBrowseModal 관련 14개 검사가 통과했다. 새 브라우저 회귀 검사는 폴더 생성
응답뿐 아니라 기존 하위 폴더를 선택해 해당 경로로 이동하는 결과까지 확인한다.
UI 스타일·새 의존성·공개 API 변경은 없다.

| 검사 | 결과 |
| --- | --- |
| frontend: `npx vitest run src/components/__tests__/SimpleTree.test.tsx src/components/__tests__/LocalPathBrowseModal.test.tsx src/pages/objects/__tests__/useObjectsTree.test.tsx --maxWorkers=2` | 14개 통과 |
| `CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 PLAYWRIGHT_WEB_SERVER_PORT=18195 ./scripts/check.sh full` | 전체 로컬 게이트 통과: 254개 파일/1,119 unit tests, frontend lint/build, smoke 2개, Go tests/vet/security, repository checks, license snapshot 재현성 |
| frontend: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18194 npm run test:e2e -- tests/objects-favorites-tree-details.spec.ts tests/objects-new-folder.spec.ts --project=chromium --workers=1 --trace=on` | production preview에서 9개 통과; 새 생성/재조회/하위 폴더 이동 회귀 포함 |
| frontend: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18194 npm run test:e2e:mobile-responsive -- --workers=3` | 변경 후 110개 통과, skip/flaky 0개 |
| frontend: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18194 npm run test:e2e:visual -- --workers=1` | 35개 통과, skip/flaky 0개; screenshot baseline 변경 없음 |
| frontend: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18194 npm run test:e2e:core -- --workers=3` | 172개 통과, `E2E_LIVE=1 required` 조건 skip 15개, 실패/flaky 0개 |
| frontend: `npm run bundle:budget` | 변경 후 통과; 예산 경고·순환 chunk 경고 없음 |
| `git diff --check` | 통과 |

새 폴더 회귀 trace에는 초기 root/docs 조회, 폴더 생성, root/docs 재조회,
선택한 docs/nested 조회가 모두 200으로 남았다. 데스크톱/모바일/시각 검사는
각각 별도 lane의 로컬 Chromium + mock 증거다. 실제 provider·물리 기기·배포
검증을 대신하지 않는다. 집중 브라우저 9개는 Core 172개에 포함되므로 합산하지 않는다.
Core의 15개 skip은 모두 실제 서버를 사용하는 환경 조건이며, 해당 검사를 통과한
것으로 세지 않는다. 프리뷰에는 테스트 종료와 겹친 백그라운드 연결 오류가 남아
있으므로 전체 모킹의 완전성을 주장하지 않는다.

4차 로그는 `/tmp/s3desk-tree-{focused,full,bundle}-20260908.log`, 브라우저 결과는
`/tmp/s3desk-{tree-browser,mobile,visual,core}-final-20260908.{log,json}`에 남겼다.
전체 최적화·안정화 목표는 진행 중이며, 외부 변경·배포·커밋·푸시는 수행하지 않았다.

## 5차: 진행 중인 폴더 조회와 생성 후 새로고침의 경합 — 2026-09-08

`refreshTreeNode`는 이미 읽는 중인 폴더의 새로고침을 무시했다. 브라우저에서
첫 폴더 응답을 보류한 채 새 폴더를 생성하면 생성 성공 알림과 일반 목록에는
새 폴더가 나타나지만, 뒤늦게 도착한 이전 응답으로 트리가 확정됐다.
수정 전 새 폴더의 treeitem 표시 검사가 실패했다.

기존 loader에 대기 중인 새로고침 키를 기록한다. 진행 중인 요청이 끝나면 같은
폴더의 새로고침 여러 건을 한 번으로 합쳐 첫 페이지부터 다시 읽는다. 오래된
응답의 추가 페이지나 오류는 적용하지 않는다. 최신 요청의 오류 표시와 명시적
재시도는 유지한다. 기존 scope 취소·epoch 검사에 맞춰 대기 기록도 폐기한다.
성공·실패 시 로딩 상태 정리는 공통 finally에서 처리한다.

수정 전 단위 검사 2개가 실패했다. 수정 후 SimpleTree와 Objects tree의 13개
검사가 통과했다. 같은 폴더의 새로고침 3건이 진행 중 조회 1개와 후속 조회 1개로
처리되며, 새 조회가 이전 continuation token을 이어 쓰지 않는지 검사한다.
프로필 전환 후 이전 대기 작업이 새 범위의 조회를 방해하지 않는 사례와 최신
조회 오류의 표시·재시도도 포함한다.

| 검사 | 결과 |
| --- | --- |
| frontend: `npx vitest run src/pages/objects/__tests__/useObjectsTree.test.tsx src/components/__tests__/SimpleTree.test.tsx --maxWorkers=2` | 13개 통과 |
| `CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 ./scripts/check.sh fast` | 통과: 254개 파일/1,121 unit tests, frontend lint/build, Go tests/vet, repository checks, license snapshot 재현성 |
| frontend: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18196 npm run test:e2e -- tests/objects-favorites-tree-details.spec.ts tests/objects-new-folder.spec.ts tests/objects-network-chaos.spec.ts --project=chromium --workers=1 --trace=on` | 최신 production preview에서 12개 통과, skip/flaky 0개 |

새 경합 회귀의 trace에는 폴더 생성 200과 트리 조회 두 건의 200 응답이 남았다.
첫 조회는 생성 전 목록을 반환하도록 보류하며, 생성 성공 뒤 이 응답을 풀어도
후속 조회가 새 폴더를 표시하는지 검사한다. 기존 하위 폴더 유지, 생성 후 표시
복구, 느린 목록의 상호작용, 일시적 목록 오류 뒤 새로고침도 함께 통과했다.

5차에서는 `full`의 backend security·smoke 및 전체 Core·mobile-responsive·visual
lane을 재실행하지 않았다. 위 4차 결과는 해당 단계의 증거이며, 이번 결과는 로컬
Chromium + mock API 검증이다. 실제 provider·물리 기기·배포 검증을 대신하지 않는다.

수정 전 실패 로그는 `/tmp/s3desk-tree-refresh-before-20260908.log`와
`/tmp/s3desk-tree-refresh-browser-before-20260908.log`, 수정 후 단위/fast 로그는
`/tmp/s3desk-tree-refresh-{focused,fast}-20260908.log`에 남겼다. 브라우저 결과는
`/tmp/s3desk-tree-refresh-browser-final-20260908.{log,json}`와 같은 이름의 trace
디렉터리에 있다. 전체 최적화·안정화 목표는 계속 진행 중이다.

## 6차: 청크 조립 중 프로세스 종료와 업로드 재개 — 2026-09-08

업로드 만료 정리와 작업 상태 전환을 대조했다. staging 작업은 만료 검사 전에
`running`으로 전환하며 실행 종료 뒤 terminal 상태를 기록하므로, 2차의 실행 중
업로드 보호와 맞는 순서다. 추가 수정은 조립·재개 소유 경로에 집중했다.

실제 자식 프로세스가 두 번째 청크를 읽는 도중 강제 종료되는 회귀 검사에서
서로 다른 두 실패를 확인했다. 기존 `.assemble.lock`은 파일 존재로 잠금을
판정하므로 프로세스 종료 뒤 재조립이 조용히 생략됐다. 이 잠금만 수정하면 최종
파일은 만들어지지만, 최종 경로 옆에 남은 조립 `.tmp`가 커밋 준비 검사를 막았다.

- `tryAssembleChunkFile`은 서버가 `DATA_DIR`을 독점하는 기존 토폴로지에 맞춰
  진행 중인 청크 디렉터리만 메모리에 기록한다. 같은 파일의 요청은 기존 조립이
  끝나기를 기다리고, 기다리는 요청의 취소는 반영한다. 성공·실패 시 기록을 지우므로
  프로세스 재시작이나 일반 읽기 오류 뒤 재시도를 막는 파일 잠금이 필요하지 않다.
- 조립 임시 파일을 청크 디렉터리에 둔다. 중단 후 재조립이 성공하면 원본 청크와
  중단된 조립 파일이 함께 정리된다. 완성 파일의 이동은 기존 rename을 사용한다.
- 재개 클라이언트는 상태 응답에 있는 청크를 다시 보내지 않는다. 기존 단건·묶음
  상태 조회는 모든 청크를 반환하면서 재조립을 호출하지 않아, 조립 수정만으로는
  실제 재개 흐름이 복구되지 않았다. 두 HTTP 경로의 공통 처리에서 모든 청크가
  있으면 조립을 마친 뒤 응답한다. 이미 완성된 파일도 크기와 staging 상태를 확인해
  모든 청크가 있음을 반환하므로 불필요한 재전송을 피한다.

단건·묶음 HTTP 회귀는 수정 전 모두 200/[0,1]을 반환했지만 완성 파일이 없어
실패했다. 수정 후 첫 재개와 후속 조회 모두 파일 내용·커밋 준비 상태·추적 용량
10바이트를 확인한다. 기존 동시 조립 검사도 각 호출이 반환될 때 완성 파일이
존재하는지 확인하도록 강화했다. 새 프로세스 종료 검사는 Linux FIFO로 복사 시점을
고정하며, 임의 sleep 후 운 좋게 프로세스를 종료하는 방식에 의존하지 않는다.

집중 race 검사 21개 top-level test가 통과했다. 첫 별도 govulncheck는 호스트의
`GOTOOLCHAIN=local` 설정으로 Go 1.25.12를 사용해 표준 라이브러리 취약점 6개를
보고했다. 저장소는 이미 `toolchain go1.25.13`을 지정한다. 전역 설정 변경 없이
`GOTOOLCHAIN=auto`로 Go 1.25.13을 확인하고 아래 최종 검사를 모두 통과했다.

| 검사 (backend 디렉터리, `GOTOOLCHAIN=auto`) | 결과 |
| --- | --- |
| `go vet ./...` + `go test ./...` | 전체 백엔드 검사 통과 |
| `go test -race ./internal/api -run 'TestTryAssembleChunkFile\|TestUploadChunkStatusRecoversPendingStagingAssembly' -count=20` | 조립·HTTP 재개 회귀 그룹 20회 반복 통과 |
| `staticcheck ./...` | 통과 |
| `gosec -quiet -exclude=G117,G702,G703,G704,G705 ./...` | 저장소 게이트와 같은 제외 규칙으로 통과 |
| `govulncheck ./...` | 통과; 호출 경로 취약점 0개, 호출하지 않는 가져온 패키지의 취약점 3개는 별도 표시됨 |

수정 전 실패 로그는 `/tmp/s3desk-assembly-recovery-before-20260908.log`,
`/tmp/s3desk-assembly-recovery-temp-before-20260908.log`,
`/tmp/s3desk-assembly-resume-before-20260908.log`다. 집중 검사는
`/tmp/s3desk-assembly-recovery-focused-20260908.log`, 최종 전체·race·보안 검사는
`/tmp/s3desk-assembly-recovery-{backend,security}-final-20260908.log`에 남겼다.
이번 단계에서는 frontend 코드·공개 API shape를 변경하지 않았으며, 저장소 전체
fast/full·브라우저 lane은 재실행하지 않았다. 이전 단계 결과와 합산하지 않는다.

기존 버전이 최종 파일 옆에 남긴 `.tmp`를 자동 삭제하는 마이그레이션은 포함하지
않는다. 새 위치의 중단 파일 정리와 기존 `.assemble.lock` 무시를 검증했으며,
기존 임시 파일의 임의 삭제나 운영 데이터 변경은 수행하지 않았다. 이번 증거는
로컬 파일·프로세스·HTTP 검사다. 전원 장애, 실제 provider, 배포 검증을 대신하지 않는다.
전체 최적화·안정화 목표는 계속 진행 중이다.

## 7차: 손상된 청크 재개와 용량 기록의 일치 — 2026-09-08

구버전의 `파일명.숫자.tmp`는 현재 업로드 경로 검증에서도 허용하는 사용자
파일명과 겹친다. 생성 시 소유 정보를 따로 기록하지 않았으므로 이름만으로
자동 삭제 대상을 확정하지 않았다. 기존 파일 복구는 이 구분 문제가 남아 있다.

재개 경로에서는 다음 다섯 회귀 사례를 수정 전 실패로 확인했다.

- 상태 조회 없이 청크를 재전송하면, 조립 함수가 다른 청크의 존재만 검사해
  5바이트 정상 청크와 3바이트 불완전 청크를 8바이트 완성 파일로 만들었다.
- 단건·묶음 상태 조회는 크기가 맞지 않는 청크를 삭제했지만 용량 기록은
  8바이트로 남겼다. 10바이트 한도에서 3바이트 청크를 5바이트로 교체하려는
  재전송이 각각 413으로 거부됐다.
- 기록이 이미 한도와 같거나, 기존 청크를 줄이면 한도 안으로 돌아오는 경우도
  기존 청크의 크기를 공제하기 전에 거부됐다.

조회는 유효하지 않은 청크를 응답에서 제외하되 파일을 보존한다. 재전송은 기존
크기와 새 크기의 차이만 반영하는 기존 DB 예약 처리를 사용한다. 청크 POST도
단건·묶음 조회와 같은 크기 검사를 거친 뒤 조립한다. 0바이트 청크도 정확한 크기와
일반 파일 여부를 확인한다. 읽기 한도 계산은 교체될 청크가 이미 차지한 용량을
반영하며, DB의 원자적 용량 예약·초과 검사도 유지한다.

다섯 사례 모두 수정 후 파일 내용 `helloworld`, 추적 용량 10바이트, 커밋을 막는
잔여 청크 없음까지 확인했다. 10바이트 한도에 도달한 상태의 새 0바이트 파일도
용량을 늘리지 않고 저장하는지 검증했다.

| 검사 (backend 디렉터리, `GOTOOLCHAIN=auto`, Go 1.25.13) | 결과 |
| --- | --- |
| `go test -race ./internal/api -run 'TestUploadStagingHTTPService\|TestBuildStagingMultipartChunkState\|TestUploadChunkStatus\|TestTryAssembleChunkFile\|TestUploadChunkAndCommitLifecycle' -count=1 -v` | top-level test 22개 통과; 하위 사례는 이 수에 별도 합산하지 않음 |
| `go vet ./...` + `go test ./...` | 전체 백엔드 검사 통과 |
| `go test -race ./internal/api ./internal/store` | 두 패키지 전체 race 검사 통과 |
| `staticcheck ./...` + `gosec -quiet -exclude=G117,G702,G703,G704,G705 ./...` | 통과 |
| `govulncheck ./...` | 통과; 호출 경로 취약점 0개, 호출하지 않는 가져온 패키지의 취약점 3개는 별도 표시됨 |
| `git diff --check` | 통과 |

로그는 `/tmp/s3desk-chunk-accounting-{before,focused,backend,security}-20260908.log`다.
공개 API shape·frontend 변경은 없으며, frontend/브라우저·실제 provider·배포 lane은
이번 단계에서 재실행하지 않았다. 로컬 파일·SQLite·HTTP 및 Go 검사 증거다.
전체 목표는 계속 진행 중이며, 커밋·푸시·운영 데이터 변경은 수행하지 않았다.

## 8차: 겹친 청크 재시도의 중복 용량 기록 — 2026-09-08

기존 청크 크기를 본문 수신 전에 읽고 그 값으로 용량 차이를 계산했다. 같은
청크의 두 요청이 함께 시작하면 둘 다 기존 크기를 0으로 보고, 두 번째 요청도
새 용량을 예약했다. 조립만 보호하던 잠금은 이 파일 반영 경합을 막지 못했다.

파이프로 두 요청이 본문 첫 바이트를 모두 소비하게 한 뒤 완료시키는 검사에서
수정 전 세 실패를 확인했다. 미완성 파일의 5바이트 청크가 10바이트로 기록됐고,
마지막 청크의 중복 요청은 413으로 거부됐다. 기존 파일 교체에서는 본문을 받기
전에 파일·용량을 해제하는 요청들이 충돌해 두 요청의 본문 수신이 성립하지 않았다.
이때의 5초는 검사 교착 방지 제한이며 성능 측정값이 아니다.

기존 조립 잠금을 같은 파일의 반영 단계와 공유한다. 요청 본문 수신은 잠금 밖에서
진행하고, 검증한 내용을 반영할 때 최신 청크 크기를 다시 확인한다. 동일 청크를
이미 저장했다면 크기 차이는 0이므로 용량을 중복 반영하지 않는다. 다른 요청이
조립을 마친 경우에는 중복 본문을 정리한다. 기존 파일 해제도 검증한 본문을
반영하는 단계로 옮겨 짧거나 잘못된 교체 요청이 원본을 먼저 삭제하지 않게 했다.

회귀 검사는 두 본문을 동시에 마치도록 보강했다. 두 요청의 병렬 본문 수신,
파일 내용 `helloworld`, 최종 용량 10바이트, 커밋을 막는 잔여 파일 없음을 확인한다.
별도 잘못된 교체 요청 검사에서는 기존 파일 `old-bytes`와 용량 9바이트가 유지된다.

`GOTOOLCHAIN=auto` / Go 1.25.13에서 관련 top-level race 검사 23개가 통과했다.
최종 검사는 아래와 같다.

| 검사 | 결과 |
| --- | --- |
| backend: `GOTOOLCHAIN=auto go test -race ./internal/api -run 'TestUploadStagingHTTPService_(OverlappingChunkRetriesCountBytesOnce\|ChunkReplacementRejectsShortBodyWithoutDeletingFinal)$' -count=20` | 동시 재시도·원본 보존 회귀 그룹 20회 반복 통과 |
| backend: `GOTOOLCHAIN=auto go test -race ./internal/api` | API 전체 race 검사 통과 |
| `GOTOOLCHAIN=auto CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 PLAYWRIGHT_WEB_SERVER_PORT=18198 ./scripts/check.sh full` | 누적 변경 전체 로컬 게이트 통과: frontend 254개 파일/1,121 unit tests, lint/build, browser smoke 2개, Go tests/vet/security, repository checks, license snapshot 재현성 |
| `git diff --check` | 통과 |

수정 전 실패 로그는 `/tmp/s3desk-chunk-concurrency-before-20260908.log`, 집중·반복
검사 로그는 `/tmp/s3desk-chunk-concurrency-{focused,repeat}-20260908.log`다.
단일 서버/단일 `DATA_DIR` 토폴로지를 유지하며 새 의존성이나 공개 API shape 변경은 없다.
전체 gate와 API race 로그는 `/tmp/s3desk-chunk-concurrency-{full,api-race}-20260908.log`다.
검증용 자식 프로세스와 18198 포트의 수신 프로세스가 종료됐음을 확인했다.
이번 결과는 로컬 파일·SQLite·Go 및 Chromium smoke 증거다. 전체 Core/mobile/visual,
실제 provider·배포 lane은 이번 단계에서 재실행하지 않았다. 전체 목표는 계속 진행 중이다.

## 9차: 완료 후 남은 청크가 완성 파일을 무효화하는 문제 — 2026-09-08

완성 파일을 원자적으로 이름 변경한 뒤 청크 폴더 정리가 끝나지 않으면, 기존
완료 판정은 남은 청크나 임시파일 때문에 미완성으로 판단했다. 실제 로컬 HTTP
라우터를 통한 9개 사례 중 수정 전 7개가 실패했다. 청크 재전송은 완성 파일을
삭제하거나 기록 용량을 10바이트에서 0으로 줄였다. 단건·묶음 상태 조회는
일부 청크 또는 임시파일만 남은 경우 업로드 확정을 막는 잔여물을 보존했다.

정상 크기의 일반 완성 파일을 발견하면 기존 파일별 잠금 안에서 청크 폴더의
잔여물을 정리한다. 본문 수신 전 확인, 수신 후 반영, 단건·묶음 상태 조회가
같은 완료 판정을 사용한다. 상태 조회의 크기 검증과 조립도 같은 잠금 안에서
실행해 검사한 청크가 조립 전에 바뀌지 않게 했다. 네트워크 본문 수신은 기존처럼
잠금 밖에서 진행한다. 기존 완료 판정과 마찬가지로 동일 경로·동일 파일 크기를
재시도로 취급하며, 새 콘텐츠 해시나 업로드 버전 메타데이터는 추가하지 않았다.

회귀 검사는 모든 청크 잔존, 일부 청크 잔존, 임시파일만 잔존한 상태를 각각
재전송·단건 조회·묶음 조회로 두 번 재시도한다. 파일 내용과 10바이트 용량 유지,
조회 응답 `[0, 1]`, 잔여물 제거를 확인하며 `os.SameFile`로 완성 파일을 불필요하게
재조립하지 않았는지도 확인한다. 초기 집중 race 검사 top-level 24개가 통과했다.

| 검사 (backend 디렉터리, `GOTOOLCHAIN=auto`, Go 1.25.13) | 결과 |
| --- | --- |
| `go test -race ./internal/api -run 'TestUploadChunkRetriesPreserveCompletedFileWithLeftovers$\|TestUploadStagingHTTPService_OverlappingChunkRetriesCountBytesOnce$' -count=20` | 완료 후 잔여물 9개 사례와 기존 동시 수신 그룹 20회 반복 통과 |
| `go vet ./...` + `go test ./...` | 백엔드 전체 검사 통과 |
| `go test -race ./internal/api` | API 전체 race 검사 통과 |
| `staticcheck ./...` + `gosec -quiet -exclude=G117,G702,G703,G704,G705 ./...` | 통과 |
| `govulncheck ./...` | 호출 경로 취약점 0개; 호출하지 않는 가져온 패키지의 취약점 3개는 별도 표시됨 |
| `git diff --check` | 통과 |

수정 전 실패와 집중 검사 로그는 `/tmp/s3desk-completed-chunk-{before,focused}-20260908.log`다.
최종 반복·백엔드·보안 검사 로그는 `/tmp/s3desk-completed-chunk-{repeat,backend,security}-20260908.log`다.
이 단계는 로컬 파일·SQLite·HTTP 증거다. 실제 provider·배포 검증이나 전원 장애
내구성 증거로 확대하지 않는다. 이전 버전이 최종 파일 옆에 남긴 모호한 `.tmp`
파일 자동 삭제는 여전히 포함하지 않는다. frontend·브라우저와 `check.sh full`은
이번 backend 변경 후 재실행하지 않았다. 전체 목표는 계속 진행 중이다.

## 10차: 조립과 임시파일 생성 사이의 경합 — 2026-09-08

청크 재시도는 경로 준비와 완료 여부 확인 후 본문 수신용 임시파일을 만든다.
그 사이 다른 요청이 조립과 청크 폴더 정리를 끝내면, 이미 완성 파일이 있는데도
임시파일 생성의 `ENOENT`를 저장 실패로 반환했다. 경로 준비 → 실제 조립·정리 →
지연된 쓰기의 순서를 재현한 API 내부 회귀 검사에서 수정 전 실패를 확인했다.
이 검사는 함수 경계의 실행 순서를 고정한 것으로, HTTP 스케줄러 경합 재현으로
표현하지 않는다.

임시파일 생성 단계에서 경로가 사라진 경우 기존 공통 상태 함수를 다시 호출한다.
이 함수가 파일별 잠금 안에서 완료를 확인하면 중복 요청을 성공 처리한다.
완료 파일이 없는 경우 저장 오류를 유지하며, 본문을 읽다가 발생한 오류에는
이 처리를 적용하지 않는다. 두 사례 모두 본문을 소비하거나 용량을 변경하지 않는다.

| 검사 (backend 디렉터리, `GOTOOLCHAIN=auto`, Go 1.25.13) | 결과 |
| --- | --- |
| 업로드·조립 관련 집중 `go test -race` | top-level 25개 통과 |
| `go test -race ./internal/api -run 'TestStagingChunkWriteAfterChunkDirectoryRemoval$\|TestUploadStagingHTTPService_OverlappingChunkRetriesCountBytesOnce$' -count=20` | 경로 제거 후 쓰기·기존 동시 수신 그룹 20회 반복 통과 |
| `go vet ./...` + `go test ./...` | 백엔드 전체 검사 통과 |
| `go test -race ./internal/api` | API 전체 race 검사 통과 |
| `staticcheck ./...` + `gosec -quiet -exclude=G117,G702,G703,G704,G705 ./...` + `govulncheck ./...` | 통과; 호출 경로 취약점 0개, 호출하지 않는 가져온 패키지의 취약점 3개는 별도 표시됨 |
| `git diff --check` | 통과 |

로그는 `/tmp/s3desk-chunk-open-{before,focused,repeat,backend,security}-20260908.log`다.
이 단계는 로컬 파일·SQLite·Go 검사 증거이며, frontend·브라우저·실제 provider·배포
검증은 재실행하지 않았다. 공개 API shape와 의존성 변경은 없다. 전체 목표는 계속 진행 중이다.

## 11차: 일반 폼 업로드의 동시 파일명 충돌 — 2026-09-08

일반 폼 업로드는 동일 이름을 교체하지 않고 `file-2.bin`처럼 별도 이름으로
보존한다. 그런데 본문 수신 전에 `uniqueFilePath`로 이름을 선택하므로, 같은
시점에 시작한 두 요청이 같은 빈 경로를 골랐다. 두 multipart 본문이 모두 첫
바이트를 수신한 뒤 완료시키는 검사에서 수정 전 다음 실패를 확인했다.

- 용량이 충분하면 두 응답은 성공해도 최종 파일은 하나만 남았다.
- 한도 때문에 한 요청이 거부되면 해당 요청의 정리가 성공한 요청의 파일까지
  삭제해 최종 파일이 하나도 남지 않았다.

본문은 기존 임시파일 쓰기 함수를 재사용해 병렬로 수신한다. 수신을 마친 뒤
디렉터리별 잠금 안에서 최신 파일 목록으로 이름을 선택하고 파일 반영·용량
기록·실패 정리를 마친다. `file.bin`의 다음 후보와 별도 요청의 `file-2.bin`도
충돌할 수 있으므로 이 구간은 원래 파일명별이 아닌 디렉터리별로 보호한다.
기존 경로 잠금 구현을 재사용하며, 별도의 잠금 레지스트리나 의존성을 추가하지
않았다. 이 잠금은 단일 서버/단일 `DATA_DIR` 범위이며 파일 본문 수신은 막지 않는다.

이름 조회는 `Lstat`에서 정확히 경로 부재를 확인했을 때만 후보를 반환한다.
기존 후보 9,999개를 모두 소진하면 원래 파일명으로 돌아가 덮어쓰던 동작도
오류 반환으로 바꿨다. 별도 검사에서 전체 후보가 존재하는 경우 경로를 반환하지
않는지 확인했다. 이 사례는 수정 후 검증이며 수정 전 실행 실패로 세지 않는다.

집중 race 검사 top-level 27개가 통과했다. 동시 폼 검사에는 동일 이름 보존,
용량 거부 후 성공 파일 보존, 기존 파일과 접미사 이름 충돌을 포함한다.
본문 수신 병렬성, 파일 이름·내용, 실제 파일 크기 합계와 DB 용량의 일치를 확인했다.

| 검사 | 결과 |
| --- | --- |
| backend: `GOTOOLCHAIN=auto go test -race ./internal/api -run 'TestUploadStagingHTTPService_(ConcurrentFormsPreserveSameNamedFiles\|OverlappingChunkRetriesCountBytesOnce)$' -count=20` | 폼·청크 동시 업로드 그룹 20회 반복 통과 |
| backend: `GOTOOLCHAIN=auto go test -race ./internal/api` | API 전체 race 검사 통과 |
| `GOTOOLCHAIN=auto CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 PLAYWRIGHT_WEB_SERVER_PORT=18199 ./scripts/check.sh full` | 누적 변경 전체 로컬 게이트 통과: frontend 254개 파일/1,121 unit tests, lint/build, Chromium smoke 2개, Go tests/vet/security, repository checks, license snapshot 재현성 |
| `git diff --check` | 통과 |

보안 분석의 호출 경로 취약점은 0개이며 호출하지 않는 가져온 패키지의 취약점
3개는 별도 표시됐다. 검증에 사용한 18199 포트의 수신 프로세스가 종료됐음을 확인했다.

수정 전 로그는 `/tmp/s3desk-form-collision-before-20260908.log`, 최종 집중 로그는
`/tmp/s3desk-form-collision-focused-final-20260908.log`다. 새 검사는 로컬 SQLite와
HTTP 서비스 함수, 실제 파일을 사용한다. 실제 provider·배포 증거로 확대하지 않는다.
반복·API race 로그는 `/tmp/s3desk-form-collision-{repeat,api-race}-20260908.log`다.
전체 gate 로그는 `/tmp/s3desk-form-collision-full-20260908.log`다. 전체 Core/mobile/visual,
실제 provider·배포 lane은 이번 단계에서 재실행하지 않았다. 공개 API shape·의존성
변경과 커밋·푸시는 없다.
전체 최적화·안정화 목표는 계속 진행 중이다.

## 12차: 한도에 도달한 세션의 빈 폼 파일 — 2026-09-08

공통 `uploadRemainingBytes`와 staging 폼 쓰기가 남은 용량 0을 초과로 취급했다.
수정 전 세 가지 빈 파일 요청이 413으로 거부되는 것을 확인했다. 이미 한도에
도달한 staging·direct 세션의 빈 파일, 그리고 같은 staging 폼 안에서 앞 파일이
한도를 채운 뒤의 빈 파일이다. direct 폼의 두 번째 경우는 기존에도 통과했다.

두 비교 조건을 `< 0`으로 바꿔 정확히 한도에 도달한 세션은 빈 파일을 받을 수
있게 했다. 본문 읽기 한도와 DB의 원자적 용량 예약은 유지한다. 내용이 있는
요청은 한도 검사로 거부하고, 이미 한도를 넘은 세션은 수신 전에 거부한다.

새 검사 8개 사례에서 두 업로드 모드의 빈 파일 허용, 앞 파일이 한도를 채운
multipart 요청, 내용이 있는 초과 파일 거부, 이미 초과한 세션 거부를 확인했다.
staging의 실제 파일 내용·빈 파일 존재와 DB 용량을 검사하고, direct는 기존
rclone hooks로 임시 객체 전송·승격·거부 시 정리와 0바이트 메타데이터를 확인한다.
direct 검사는 실제 provider 증거가 아니다.

관련 집중 race 검사 top-level 21개가 통과했다.

| 검사 (backend 디렉터리, `GOTOOLCHAIN=auto`, Go 1.25.13) | 결과 |
| --- | --- |
| `go test -race ./internal/api -run 'TestUploadMultipartFormByteLimitAllowsEmptyFiles$\|TestUploadDirectHTTPService_FormUpload\|TestUploadStagingHTTPService\|TestUploadChunkAndCommitLifecycle' -count=1 -v` | top-level 21개 통과; 새 8개 사례는 별도 합산하지 않음 |
| `go vet ./...` + `go test ./...` | 백엔드 전체 검사 통과 |
| `go test -race ./internal/api` | API 전체 race 검사 통과 |
| `staticcheck ./...` + `gosec -quiet -exclude=G117,G702,G703,G704,G705 ./...` + `govulncheck ./...` | 통과; 호출 경로 취약점 0개, 호출하지 않는 가져온 패키지의 취약점 3개는 별도 표시됨 |
| `git diff --check` | 통과 |

수정 전 확정 로그는 `/tmp/s3desk-empty-form-before-final-20260908.log`,
집중 검사 로그는 `/tmp/s3desk-empty-form-focused-20260908.log`다.
전체 백엔드·보안 로그는 `/tmp/s3desk-empty-form-{backend,security}-20260908.log`다.
이번 단계에서 frontend·브라우저·실제 provider·배포 검증은 재실행하지 않았다.
공개 API shape·의존성 변경은 없으며 전체 목표는 계속 진행 중이다.

## 13차: 대기한 즐겨찾기 변경의 프로필·인증 범위 — 2026-09-08

객체 목록·검색의 쿼리 키와 취소 신호를 확인한 뒤 즐겨찾기 변경을 점검했다.
현재 설치된 React Query는 같은 mutation observer의 옵션을 갱신하며, 대기한
요청을 시작할 때 그 옵션의 `mutationFn`을 사용한다. 범위를 식별하는 mutation
key가 없으면 프로필·인증 변경 후 새 클라이언트와 새 프로필로 요청이 실행됐다.

`onlineManager`로 대기 상태를 설정한 단위 검사에서 추가·삭제 각각의 프로필
전환과 인증 전환, 총 네 사례를 수정 전 실패로 확인했다. 프로필 전환 사례는
새 프로필·버킷으로, 인증 전환 사례는 새 API 클라이언트로 요청이 나갔다.

추가·삭제 mutation에 기존 즐겨찾기 query key와 작업 종류를 결합한 `mutationKey`를
지정했다. 프로필·버킷·인증이 바뀌면 React Query가 observer를 분리하므로 대기한
요청은 원래 옵션으로 계속 처리된다. 별도의 취소·큐 관리나 새 상태 저장소를
추가하지 않았고, 기존 범위별 pending 표시·캐시 갱신·오류 억제 동작을 유지했다.

브라우저 검사는 온라인에서 즐겨찾기 응답을 지연시킨 뒤 프로필을 전환했다.
새 프로필의 즐겨찾기는 바뀌지 않고 원래 프로필로 돌아오면 완료된 표시를 볼 수
있었다. 단위 검사의 offline 대기 상태와 브라우저의 응답 지연 조건은 서로 다른
검증이다. 실제 연결 단절 시점이나 오프라인 UI 클릭 가능성을 검증한 것으로
확대하지 않는다.

| 검사 (frontend 디렉터리) | 결과 |
| --- | --- |
| `npm run test:unit -- src/pages/objects/__tests__/useObjectsFavorites.test.tsx src/pages/objects/__tests__/useObjectsIndexedSearchQuery.test.tsx src/pages/objects/__tests__/useObjectsPageData.test.tsx` | 3개 파일, 28개 검사 통과 |
| `npm run test:unit -- --maxWorkers=4` | 254개 파일, 1,125개 검사 통과 |
| `npm run lint` + `npm run build` | 통과 |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18200 npx playwright test tests/objects-favorites-tree-details.spec.ts tests/objects-clipboard-paste.spec.ts --project=chromium --workers=2` | 프로덕션 프리뷰에서 9개 통과; skip/retry 없음 |
| `git diff --check` | 통과 |

로그는 `/tmp/s3desk-favorites-scope-{before-final,focused,unit,lint,build,browser}-20260908.log`다.
18200 프리뷰는 종료했고 수신 프로세스가 없는 것을 확인했다. 프리뷰 출력에는
검사 종료 시점의 `/api/v1/realtime-ticket?transport=ws` 요청이 로컬 8080 연결 거부로
끝난 기록이 있어, 브라우저 9개 통과를 모든 백그라운드 요청의 모킹 완전성으로
해석하지 않는다.

이번 결과는 로컬 React Query·mock API·Chromium 증거다. 전체 Core/mobile/visual,
backend gate, 실제 provider·배포 lane은 이번 frontend 변경 후 재실행하지 않았다.
공개 API shape·의존성·시각 기준 이미지 변경은 없다. 전체 목표는 계속 진행 중이다.

## 14차: 대기한 객체 삭제의 실행 대상 고정 — 2026-09-08

`useObjectsDelete`의 두 mutation과 `useObjectsDeleteConfirm`의 단건·선택·접두사
삭제 호출을 추적했다. 기존 context version 검사는 확인 대화상자의 오래된 제출과
늦게 도착한 응답을 억제했지만, 제출 후 전송 전에 대기한 mutation의 실행 대상은
고정하지 않았다. React Query가 대기 중인 observer 옵션을 새 렌더의 함수로 갱신해
삭제 대상 버킷 또는 API 클라이언트·작업 생성 함수가 바뀌었다.

직접 삭제·1,001개 키의 작업 기반 삭제·접두사 삭제 각각에 프로필만 변경,
버킷만 변경, 인증만 변경을 적용한 9개 검사 모두 수정 전 실패했다.
두 mutation에 기존 객체 목록 query key와 작업 종류를 결합한 `mutationKey`를
지정했다. 이제 이미 제출한 삭제는 원래 승인한 프로필·버킷·인증으로 실행된다.
새 화면의 선택·완료 메시지·트리 갱신을 건드리지 않으며 작업 캐시 무효화는 원래
프로필·인증 범위에 적용된다. 생산 코드 변경은 주석 포함 3줄이다.

| 검사 | 결과 |
| --- | --- |
| `cd frontend && npm run test:unit -- src/pages/objects/__tests__/useObjectsDelete.test.tsx src/pages/objects/__tests__/useObjectsDeleteConfirm.test.tsx` | 2개 파일, 25개 검사 통과; 신규 9개 red → green |
| `GOTOOLCHAIN=auto CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 PLAYWRIGHT_WEB_SERVER_PORT=18201 ./scripts/check.sh full` | 통과: frontend 254개 파일/1,134 tests·lint·build, Chromium smoke 2개, Go tests/vet/security, OpenAPI·workflow·Helm·license 등 repository checks |
| `cd frontend && PLAYWRIGHT_BASE_URL=http://127.0.0.1:18202 npx playwright test tests/demo-bucket-upload-delete-jobs.spec.ts --project=chromium --workers=1` | 첫 실행은 삭제·목록 갱신 후 작업 ID 텍스트 검사에서 실패; 아래 테스트 locator 수정 후 전체 흐름 1개 통과, skip/retry 없음 |
| `cd frontend && npx eslint tests/demo-bucket-upload-delete-jobs.spec.ts --max-warnings 0` | locator 수정 후 통과 |
| `git diff --check` | 통과 |

브라우저 첫 실패의 스크린샷과 접근성 트리를 확인했다. 작업은 성공 상태로
표시됐지만 `useJobsColumnsVisibility`의 기본값은 `id: false`였다. 데모의
`getByText('job-upload-1')`을 기존 `jobsTableRow` helper로 바꾸고 해당 행의
`succeeded` 상태를 확인하도록 수정했다. 제품 UI와 열 기본값은 바꾸지 않았다.
전체 게이트 이후 변경은 이 데모 locator뿐이며 해당 파일 lint와 브라우저를
재실행했다. 18201 관리 서버와 18202 프리뷰는 종료되어 수신 프로세스가 없다.

로그: `/tmp/s3desk-delete-scope-{before,focused,full,browser,browser-final,demo-lint}-20260908.log`.
대기 조건은 단위 검사에서 `onlineManager`로 제어했다. 실제 오프라인 UI 전환이나
실제 provider에서 삭제를 실행한 증거는 아니다. 데모는 로컬 mock API와 프로덕션
프리뷰의 온라인 확인·삭제·목록 갱신·작업 표시를 검증했다. Core/mobile/visual 전체와
provider·배포 lane은 이번 변경 후 실행하지 않았다. 이름 변경·복사·이동·새 폴더 등
다른 mutation의 전송 전 범위 보존은 이번 삭제 수정의 완료 범위에 포함하지 않는다.

## 15차: 이름 변경·복사·이동의 제출 범위 보존 — 2026-09-08

`useObjectsPageDialogActions`의 이름 변경·복사/이동·선택 이동 호출과 실제 요청을
생성하는 `objectsDeferredActionRuntime`을 추적했다. 네 mutation 모두 대기 중
observer 옵션 갱신으로 새 버킷이나 새 프로필·인증의 작업 생성 함수를 사용했다.
선택 이동은 같은 범위에서도 실행 시점의 `selectedKeys`를 읽어, 제출 후 선택이
달라지면 이동할 파일이 바뀌었다. 현재 접두사가 달라지면 목적지의 상대 경로도
바뀔 수 있었다.

네 mutation에 프로필·인증·버킷·접두사를 포함하는 기존 객체 query key와 작업
종류를 지정했다. 선택 이동의 키 배열은 제출 시 mutation 변수로 복사한다.
기존 대화상자 session 검사와 원래 범위의 jobs 캐시 무효화를 유지했다.

수정 전 실패한 신규 검사는 이름 변경 6개(객체/폴더 × 프로필/버킷/인증), 복사·이동
12개(객체/폴더 × 복사/이동 × 프로필/버킷/인증), 선택 이동 5개(프로필/버킷/인증/
접두사/선택 변경)다. 수정 후 세 hook의 기존 검사를 포함한 37개가 통과했다.

| 검사 (frontend 디렉터리) | 결과 |
| --- | --- |
| `npm run test:unit -- src/pages/objects/__tests__/useObjectsRename.test.tsx src/pages/objects/__tests__/useObjectsCopyMove.test.tsx src/pages/objects/__tests__/useObjectsSelectionMove.test.tsx` | 3개 파일, 37개 통과; 신규 23개 red → green |
| `npm run test:unit -- --maxWorkers=4` | 메뉴 후속 수정 전 254개 파일, 1,157개 통과 |
| `npm run lint` + `npm run build` | 통과 |

로그는 `/tmp/s3desk-move-scope-{before,focused-final,unit,lint,build}-20260908.log`다.
브라우저에서 F2 이름 변경의 실제 작업 제출 검사를 보강했고, 객체 우클릭 메뉴의
복사·이동 제출 검사 2개를 추가했다. 새 fixture의 중복 전체 API 등록과 메뉴의
아이콘을 포함하는 접근성 이름 selector를 수정한 뒤에도 첫 우클릭 메뉴가 조작되지
않는 제품 결함이 남아 아래 16차에서 처리했다. 대기 요청 재현은 `onlineManager`로
제어한 hook 검사이며 실제 provider·연결 단절 UI 증거는 아니다.

## 16차: 지연 로드된 우클릭 메뉴의 첫 위치 계산 — 2026-09-08

프로덕션 프리뷰의 첫 객체 우클릭에서 메뉴는 DOM과 접근성 트리에 있었지만
투명하게 남았고, 하단 복사·이동 항목은 뷰포트 밖에 있었다. Playwright trace의
실제 클릭은 `element is outside of the viewport`로 실패했다. 해당 메뉴는
`ObjectsPagePanes`에서 Suspense로 지연 로드한다. 부모 lifecycle의 layout effect가
먼저 실행되면 아직 ref가 없어 위치 계산을 건너뛰고, 나중에 portal만 마운트될 때
ref 객체가 바뀌어도 부모 effect를 다시 실행하지 않는 것이 원인이었다.

DOM 연결 callback ref에서 기존 `positionContextMenu`를 호출한다. public ref 타입은
이미 portal과 pane이 받는 `Ref<HTMLDivElement>`에 맞췄다. 기존 위치 계산·resize·
선택 변화·스크롤/키보드 닫기 로직과 CSS를 유지한다. 별도 타이머나 observer는 없다.

부모 hook을 렌더한 후 별도 root에서 메뉴 DOM을 연결하는 검사로 지연 마운트를
재현했다. 객체·폴더·빈 영역 메뉴 3개 모두 수정 전 opacity 0, pointer-events none,
원래 클릭 좌표로 남아 실패했고, 수정 후 보이고 클릭 가능한 뷰포트 안 위치가 됐다.

| 검사 (frontend 디렉터리) | 결과 |
| --- | --- |
| `npm run test:unit -- src/pages/objects/__tests__/useObjectsContextMenuLifecycle.test.tsx src/pages/objects/__tests__/useObjectsContextMenu.test.tsx src/pages/objects/__tests__/ObjectsContextMenuPortal.test.tsx` | 3개 파일, 8개 통과; 신규 3개 red → green |
| `npm run lint` + `npm run build` | 최종 callback ref 구현에서 통과 |
| `npm run test:unit -- --maxWorkers=4` | 최종 코드에서 254개 파일, 1,160개 통과 |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18203 npx playwright test tests/objects-keyboard.spec.ts tests/objects-context-menu.spec.ts tests/objects-context-menu-keyboard.spec.ts tests/objects-selection-move.spec.ts --project=chromium --workers=2` | 프로덕션 프리뷰에서 18개 통과; skip/retry 없음 |
| `npx eslint tests/objects-context-menu.spec.ts tests/objects-keyboard.spec.ts --max-warnings 0` + `npm run check:e2e:geometry` | 최종 browser locator 수정 후 통과 |
| `git diff --check` | 통과 |

메뉴 집중 검사 로그는 `/tmp/s3desk-menu-mount-{before,focused-final}-20260908.log`다.
최종 static/unit 로그는 `/tmp/s3desk-menu-mount-{lint-final,build-final,unit-final}-20260908.log`,
브라우저 로그는 `/tmp/s3desk-menu-mount-browser-verified-20260908.log`다.
브라우저 검사는 첫 우클릭 메뉴의 opacity 1, 표시된 원본으로 복사·이동 작업 제출,
F2 이름 변경 제출, 390px 선택 이동, 작은 뷰포트 및 키보드 context menu를 포함한다.
필수 표시가 있는 form label의 exact selector도 실제 label에 맞게 수정했다.

18203 프리뷰는 종료했고 수신 프로세스가 없는 것을 확인했다. 프리뷰 세션 출력에는
realtime-ticket 요청 3건의 로컬 8080 연결 거부가 있어 모든
백그라운드 요청의 모킹 완전성을 주장하지 않는다. 로컬 mock/Chromium 증거이며
실제 provider·물리 기기·배포 증거가 아니다. 최종 frontend 변경 후 `check.sh full`,
Core/mobile/visual 전체, backend gate는 재실행하지 않았다. API shape·의존성·CSS·
시각 기준 이미지 변경은 없다. 새 폴더·클립보드·ZIP·인덱싱 등 다른 mutation의
전송 전 범위 보존 검토와 전체 최적화·안정화 목표는 계속 진행 중이다.

## 17차: 나머지 객체 작업의 제출 범위와 새 폴더 결과 처리 — 2026-09-08

클립보드 붙여넣기·ZIP·인덱싱·새 폴더의 호출자와 요청 생성 흐름을 추적했다.
앞선 삭제·이동과 같은 observer 옵션 갱신으로, 오프라인 대기 중 프로필·인증·버킷이
바뀌면 재개된 요청이 새 범위를 사용했다. 선택 ZIP은 압축에서 제거할 접두사도
실행 시점의 화면에서 읽었다. 다섯 mutation에 기존 객체 query key와 작업 종류를
지정해 제출 시 범위를 보존한다. 새 폴더에는 별도로 선택한 상위 폴더도 포함한다.

새 폴더의 성공·오류 처리는 낙관적 캐시 context의 sessionId를 검사하고 있었다.
현재 목록 밖의 상위 폴더를 대상으로 하면 context가 null이고, 입력 검증에서
실패하면 context가 만들어지지 않아 성공 알림·대화상자 닫기·오류·부분 생성 결과가
누락됐다. 항상 존재하는 mutation 변수의 sessionId로 검사하도록 변경했다.
기존 캐시 복원과 이전 대화상자의 늦은 결과 억제는 유지한다.

신규 hook 검사 23개 중 수정 전 22개가 실패했다. 폴더 ZIP의 화면 접두사 변경
1개는 기존에도 요청 변수로 범위가 보존되는 대조 사례다. 첫 성공 결과의 지연
import를 `vi.dynamicImportSettled()`로 기다리도록 검사 코드를 보완했다.

| 검사 (frontend 디렉터리) | 결과 |
| --- | --- |
| `npm run test:unit -- src/pages/objects/__tests__/useObjectsNewFolder.test.tsx src/pages/objects/__tests__/useObjectsClipboard.test.tsx src/pages/objects/__tests__/useObjectsZipJobs.test.tsx src/pages/objects/__tests__/useObjectsIndexing.test.tsx` | 최종 4개 파일, 37개 통과; 22개 red → green |
| `npm run lint` + `npm run build` | 통과 |
| `npm run test:unit -- --maxWorkers=4` | 최종 코드에서 254개 파일, 1,183개 통과 |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18204 npx playwright test tests/objects-new-folder.spec.ts tests/objects-clipboard-paste.spec.ts --project=chromium --workers=2` | 프로덕션 프리뷰에서 9개 통과; skip/retry 없음 |
| `npx eslint src/pages/objects/__tests__/useObjectsNewFolder.test.tsx tests/objects-new-folder.spec.ts --max-warnings 0` + `npm run check:e2e:geometry` | 최종 테스트 수정 후 통과 |
| `git diff --check` | 통과 |

로그는 `/tmp/s3desk-remaining-object-scope-{before,focused-final,lint,build,unit-final,browser-final}-20260908.log`다.
지연 import 대기 보완 전 전체 단위 검사는 새 폴더 성공 사례 1개 실패/1,182개
통과였다. 브라우저 첫 실행의 알림 selector는 같은 문구가 접근성 상태 영역에도
있어 strict-mode 오류가 났고, 실제 알림 영역으로 좁힌 최종 실행에서 통과했다.
브라우저는 다른 상위 폴더의 생성 성공·잘못된 이름의 오류와 수정 후 재제출·
부분 생성 결과·복사·이동을 확인했다. 오프라인 대기 재현은 hook 검사다.

18204 프리뷰는 종료했고 수신 프로세스가 없는 것을 확인했다. 두 browser 실행을
포함한 프리뷰 출력에는 realtime-ticket 4건과 객체 트리 목록 2건의 로컬 8080
연결 거부가 있었다. 기존 fixture의 범용 응답도 있어 모든 백그라운드 요청의
모킹 완전성을 주장하지 않는다. 실제 provider·배포·물리 기기 증거는 아니다.
이번 frontend 변경 후 `check.sh full`, Core/mobile/visual 전체와 backend gate는
재실행하지 않았다. API shape·의존성·CSS·시각 기준 이미지 변경은 없다.

## 18차: 버킷 페이지 종료 후 늦은 결과와 부분 생성 캐시 — 2026-09-08

`FullAppRoutes`와 `useFullAppProfileState`까지 확인한 결과 버킷·객체 페이지는
프로필과 인증을 포함하는 key로 다시 생성된다. 정책·거버넌스 편집기도 대상별 key가
있다. 따라서 hook만 같은 인스턴스로 rerender한 프로필·인증 변경 재현을 실제
라우트의 잘못된 대상 전송 증거로 해석하지 않는다. 13~17차의 해당 hook 검사에도
이 한계가 적용된다. 같은 객체 페이지 안의 버킷·접두사·상위 폴더 변경 검증은
별개다. 이번 조사 중 추가했던 버킷 생성·삭제 mutation key는 제거했다.

실제 종료 경로에서는 `useBucketsPageScopeState`가 unmount 시 요청 버전과 최신
범위 ref를 무효화하지 않았다. 이 때문에 페이지를 떠난 뒤에도 생성·삭제의 성공·
오류 알림이 표시됐으며, 이전 삭제 확인 callback도 새 요청을 제출할 수 있었다.
기존 layout effect의 정리 함수에서 두 ref를 무효화하도록 변경했다. 초기 버전을
1로 두어 기존의 첫 마운트와 범위 변경 번호 계약을 유지한다.

버킷이 생성됐지만 기본 설정 적용만 실패한 응답은, 현재 화면 여부를 검사하기 전에
원래 버킷 목록을 무효화한다. 목록 갱신 뒤 현재 버전을 다시 확인해 다른 화면에서
경고를 표시하거나 대화상자를 닫지 않는다. 정상 생성·삭제의 기존 캐시 갱신과
현재 화면에서의 성공·오류 처리는 유지한다.

페이지 종료 후 대기 요청을 재개하는 검사 5개가 알림/닫기 callback 호출로 실패했고,
수정 후 모두 통과했다. 새 삭제 확인 검사도 종료 후 요청이 전송되지 않음을 확인한다.
테스트 provider도 함께 unmount되므로 `resumePausedMutations()`로 앱 전역 QueryClient의
재개를 재현한다. 요청 대상 변경을 가정하는 초기 검사 대신 실제 종료 동작을 남겼다.

브라우저에서도 생성 요청을 보류하고 실제 뒤로 가기로 Profiles로 이동한 뒤 응답을
반환했다. 수정 전 앞으로 가기로 복귀한 버킷 화면에 이전 경고 DOM이 남아 실패했다.
최종 fixture는 AWS 기본 설정을 켜고 암호화 적용 실패 응답을 반환한다. 정상 생성·
부분 생성과 삭제 후 목록 갱신 검사도 추가했다.

| 검사 | 결과 |
| --- | --- |
| `npm run test:unit -- src/pages/buckets/__tests__/useBucketsPageCreateState.test.tsx src/pages/buckets/__tests__/useBucketsPageDeleteFlow.test.tsx src/pages/buckets/__tests__/useBucketsPageState.test.tsx src/pages/buckets/__tests__/useBucketsPageScopeState.test.tsx` (frontend) | 최종 4개 파일, 15개 통과; 신규 5개 red → green, 종료 후 삭제 확인 1개 추가 |
| `GOTOOLCHAIN=auto CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 PLAYWRIGHT_WEB_SERVER_PORT=18207 ./scripts/check.sh full` | 통과; 단위 254개 파일/1,189개, smoke 2개, lint/build·Go vet/test·보안 분석·OpenAPI·workflow/Helm·라이선스 재현 포함 |
| `npx eslint tests/buckets-mobile-responsive.spec.ts --max-warnings 0` + `npm run check:e2e:geometry` (frontend) | 최종 fixture 보완 후 통과 |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18208 npx playwright test tests/buckets-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=2` (frontend) | 최종 프로덕션 프리뷰에서 20개 통과; skip/retry 없음 |
| `git diff --check` | 통과 |

집중 검사 로그는 `/tmp/s3desk-bucket-unmount-{before-final,focused}-20260908.log`,
브라우저 red 로그는 `/tmp/s3desk-bucket-unmount-browser-before-20260908.log`,
최종 전체 로그는 `/tmp/s3desk-bucket-unmount-full-final-20260908.log`다.
앞선 `/tmp/s3desk-bucket-crud-scope-full-20260908.log`의 전체 gate도 통과했으나
최종 종료 처리 변경 전 결과이므로 최종 코드 검증으로 사용하지 않는다.

최종 govulncheck는 호출되는 취약점 0개로 종료했지만, import한 패키지의 호출되지 않는
취약점 3개도 보고했다. 취약점이 전혀 없다고 해석하지 않는다. npm 10.9.7 사용에
대한 권장 버전 10.9.4 안내도 있었다. `check.sh full`은 번들 보고 스크립트 검사를
포함하지만 `bundle:budget` 실행이나 Core/mobile/visual 전체를 대체하지 않는다.

최종 모바일 로그는 `/tmp/s3desk-bucket-unmount-browser-final-20260908.log`다.
18205~18208 검사·프리뷰 포트의 수신 프로세스가 없는 것을 확인했다. 최종 18208
프리뷰에는 기존 검색 검사에서 Objects로 이동한 뒤 realtime-ticket·객체 목록·
즐겨찾기 요청이 각각 2건씩 로컬 8080 연결 거부로 기록됐다. 모든 백그라운드 요청의
모킹 완전성을 주장하지 않는다. 이 결과는 mock API와 iPhone/Pixel 화면 설정을
사용한 Chromium 검사이며 실제 기기·Safari·provider·배포 증거는 아니다.
전체 최적화·안정화 목표는 계속 진행 중이다.

## 19차: 누적 브라우저·번들 검증과 성능 검사의 지연 로딩 감지 — 2026-09-08

18차까지의 최종 제품 코드를 새로 분석 빌드한 뒤 같은 프로덕션 프리뷰에서 Core,
성능, 모바일 전체, 시각 회귀 검사를 실행했다. 성능 검사는 다른 브라우저 lane이
실행되지 않을 때 worker 1개로 측정했다. 모바일와 시각 검사는 출력 디렉터리를
분리해 동시에 실행했다. 실제 서버 검사는 `E2E_LIVE=0`으로 제외했다.

기존 Objects 성능 검사는 지연 로딩을 확인할 때 개발 서버의 `.tsx` 주소만 찾았다.
프로덕션의 `ObjectsPageOverlays-<hash>.js`와 `ObjectsImageViewerModal-<hash>.js`는
항상 검사에서 빠졌다. 측정 뒤 New folder를 열고 감지기가 실제 요청을 인식하는지
확인하도록 보강하자, 수정 전 대화상자가 열렸는데도 감지 결과가 false여서 실패했다.
개발 소스와 프로덕션 chunk를 모두 인식하도록 경로 검사를 수정했다. 초기 목록에서
요청이 없고 사용자 조작 뒤 요청이 있음을 함께 검증한다. 제품 코드·성능 기준·
의존성·시각 기준 이미지는 변경하지 않았다.

| 검사 (frontend) | 결과 |
| --- | --- |
| `npm run bundle:budget` | 통과; 예산 초과·순환 chunk 경고 없음 |
| `E2E_LIVE=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18209 npm run test:e2e:core -- --workers=3 --reporter=list,json` | 177개 통과, 15개 skip; unexpected/flaky 0개 |
| `E2E_LIVE=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18209 npm run test:e2e:perf -- --workers=1 --reporter=list,json` | 보강한 최종 검사 4개 통과; skip/flaky 없음 |
| `E2E_LIVE=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18209 npm run test:e2e:mobile-responsive -- --workers=2 --reporter=list,json` | 116개 통과; skip/flaky 없음 |
| `E2E_LIVE=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18209 npm run test:e2e:visual -- --workers=1 --reporter=list,json` | 35개 통과; skip/flaky 없음, 기준 이미지 변경 없음 |
| `npx eslint tests/jobs-perf.spec.ts --max-warnings 0` + `npm run check:e2e:geometry` + `git diff --check` | 통과 |

최종 gzip 크기는 초기 JS 164.4/170 KiB, Objects 68.6/72 KiB, Profiles 13.8/15.5 KiB,
Uploads 5.0/5.3 KiB, Transfers 13.6/14.5 KiB다. Transfers의 여유 0.9 KiB는 보고
스크립트의 검토 후보로 표시됐지만 예산 위반은 아니다. 이번 검증으로 번들을 더
축소했다거나 실행 성능을 개선했다는 주장은 하지 않는다.

| 로컬 mock 성능 검사 | 측정 / 기존 기준 |
| --- | --- |
| Jobs 목록 200개 표시 | 647 / 2,000ms |
| Jobs 필터 변경 후 100개 표시 | 107 / 300ms |
| Jobs 로그 대화상자 표시 | 105 / 1,000ms |
| Objects 목록 200개 중 첫 행 표시 | 730 / 3,000ms |

각 값은 해당 실행에서 한 번 측정한 브라우저 시간이며 운영 지연·실제 기기 성능·
통계적 개선이나 p95가 아니다. 지연 로딩의 추가 조작은 시간 측정 이후에 실행한다.
로그와 JSON 결과는 `/tmp/s3desk-cumulative-{bundle,core,perf,mobile,visual}-20260908.*`,
감지기 red 로그는 `/tmp/s3desk-perf-lazy-assert-before-20260908.log`다. bundle 결과는
`frontend/dist/bundle-report.md`에도 있다. JSON의 15개 skip 사유는 모두
`E2E_LIVE=1 required`였다. 앞선 단계의 집중 검사는 이 전체 lane에 중복 포함될 수
있으므로 합산하지 않는다.

18209 프리뷰를 종료하고 수신 프로세스가 없는 것을 확인했다. 여러 lane을 합친
프리뷰 출력에는 로컬 8080 연결 거부 22건(realtime-ticket 13, 객체 목록 3,
즐겨찾기 2, 기타 API 4)이 있었다. 검사한 UI 계약의 통과이며 모든 백그라운드 요청의
모킹 완전성은 아니다. 실제 provider·배포·물리 기기·Safari/Firefox·보조기술 검증은
포함하지 않는다. 이번 변경은 성능 검사 파일뿐이므로 backend와 전체 단위 검사는
다시 실행하지 않았고, 18차의 최종 `check.sh full` 결과와 구분한다.

## 20차: 프로필 삭제 완료가 다른 탭의 새 선택을 덮어쓰는 문제 — 2026-09-08

Profiles 라우트는 인증 변경 시 다시 생성되지만 활성 프로필 변경에는 같은 페이지를
유지한다. `useProfilesPageMutations`의 삭제 성공 처리는 목록 갱신을 기다린 뒤,
갱신 전 callback에 남아 있던 활성 프로필 ID를 사용해 `setProfileId(null)`을 호출했다.
그 사이 다른 탭에서 프로필을 선택하면 새 선택도 지워지고 첫 번째 남은 프로필로
바뀌었다. 프로필 선택은 `useFullAppProfileState`와 `useLocalStorageState`에서 이미
목록 유효성·대체 선택·탭 간 저장소 동기화를 처리하고 있었다.

삭제 hook의 중복 선택 초기화와 사용하지 않게 된 활성 프로필 인자를 제거했다.
기존 공통 상태가 유효한 선택을 유지하고, 삭제된 선택은 남은 프로필로 대체하며,
목록이 비면 null로 저장한다. 새 ref나 선택 상태·callback 계층은 추가하지 않았다.

단위 검사에서 목록 갱신 대기 중 선택을 바꿔도 삭제 완료가 null을 설정하는 것을
재현했다. 브라우저에서는 두 탭을 실제로 열고 첫 탭의 삭제 후 GET 목록 응답을
보류한 동안 둘째 탭에서 Chosen Profile을 선택했다. 첫 탭에도 그 선택이 반영된 것을
확인한 뒤 목록 응답을 반환하면, 수정 전 Backup Profile로 바뀌어 실패했다.
각 탭의 인증은 sessionStorage를 사용하는 실제 계약에 맞춰 별도로 fixture에 설정했다.

| 검사 (frontend) | 결과 |
| --- | --- |
| `npm run test:unit -- src/pages/profiles/__tests__/useProfilesPageMutations.test.tsx src/pages/profiles/__tests__/useProfilesPageState.test.tsx src/__tests__/useFullAppProfileState.test.tsx` | 3개 파일, 11개 통과; 삭제의 중복 선택 갱신 red → green, 공통 상태의 유지/대체/비우기 3개 추가 |
| `npm run lint` + `npm run build` | 통과 |
| `npm run test:unit -- --maxWorkers=4` | 최종 254개 파일, 1,193개 통과 |
| `E2E_LIVE=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18211 npx playwright test tests/profiles-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=2` | 최종 프로덕션 프리뷰에서 14개 통과; 두 탭 재현 포함, skip/retry 없음 |
| `git diff --check` | 통과 |

로그는 `/tmp/s3desk-profile-delete-selection-{before,focused,lint,build,unit,browser-final}-20260908.log`,
실제 브라우저 red 로그는 `/tmp/s3desk-profile-delete-selection-browser-before-final-20260908.log`다.
그 이전 browser-before 로그의 실패는 둘째 탭의 인증 fixture 누락이므로 제품 결함
재현으로 사용하지 않는다. 18210/18211 프리뷰를 종료하고 수신 프로세스가 없는 것을
확인했다. 최종 프리뷰 출력에는 API proxy 연결 오류가 없었다.

이번 결과는 mock API·실제 탭 간 storage 이벤트·Chromium의 iPhone/Pixel 화면 설정
증거다. 실제 provider·물리 기기·Safari·배포 검증은 아니다. 변경 후 `check.sh full`,
Core/mobile/visual 전체와 번들 예산은 재실행하지 않았고 18~19차 결과와 구분한다.

## 21차: 프로필 저장·삭제 중 페이지 이탈 시 후속 처리 누락 — 2026-09-08

`useProfilesPageMutations`는 생성·수정·삭제 성공 뒤의 목록 무효화를 페이지 활성
상태로 제한했다. 생성·수정의 mTLS 변경도 같은 조건 안에 있어, 요청 중 다른
라우트로 이동하면 프로필 저장은 완료되어도 별도 TLS 요청이 생략되었다.
`toCreateRequest`/`toUpdateRequest`에는 mTLS 인증서 변경이 포함되지 않으므로
프로필 API의 성공만으로 사용자가 제출한 설정 전체가 적용된 것은 아니었다.

실제 Profiles 라우트와 공통 프로필 상태를 확인했다. 페이지를 떠나면
`useProfilesPageScopeState`가 비활성화되지만 공통 목록 query는 계속 사용되고,
캐시 키는 인증 범위별로 분리되어 있다. 이에 세 mutation의 캐시 갱신과 생성·수정의
TLS 적용을 원래 요청의 API/token으로 끝내도록 수정했다. 활성 프로필 선택과 모달
닫기 등 UI 처리는 기존 범위 조건을 유지한다. TLS 대기 중 페이지를 떠났거나 더
새로운 요청이 시작된 경우에는 늦은 오류 알림을 표시하지 않도록 기존 요청 검사기를
응답 시점에 다시 호출한다. API 구조나 별도 상태 계층은 추가하지 않았다.

실제 scope hook과 TLS hook을 함께 실행하고 unmount한 단위 검사에서 생성·수정·삭제
후 목록 갱신 누락 3건을 재현했다. 생성·수정 TLS 응답 대기 중 unmount했을 때 늦은
오류가 표시되는 2건도 재현했고, 페이지가 유지되면 오류를 표시하는 양성 대조 2건을
함께 추가했다. 최종 수정 전 검사는 5개 실패/6개 통과, 수정 후 집중 검사는 22개
통과였다. 최초 검사에서 양성 대조 2개의 mock 호출 인자를 잘못 지정한 실패는
수정한 뒤 별도로 다시 실행했으며 제품 결함 수에 포함하지 않는다.

브라우저에서는 Buckets에서 Profiles로 이동해 이름과 mTLS 비활성화를 저장하고,
PATCH 응답을 보류한 동안 실제 뒤로 이동했다. 수정 전 빌드에서는 후속 TLS DELETE가
전송되지 않아 실패했다. 수정 후에는 Buckets에 머문 채 TLS DELETE가 전송되고 공통
프로필 선택기의 이름도 갱신되며, 앞으로 이동해 돌아온 목록에도 저장 결과가 보였다.
최초 브라우저 실행의 폼 label/접기 영역 selector 오류는 재현 증거로 사용하지 않았다.

| 검사 (frontend) | 결과 |
| --- | --- |
| `npm run test:unit -- src/pages/profiles/__tests__/useProfilesPageMutations.test.tsx src/pages/profiles/__tests__/useProfilesPageTLSState.test.tsx src/pages/profiles/__tests__/useProfilesPageScopeState.test.tsx src/pages/profiles/__tests__/useProfilesPageState.test.tsx src/__tests__/useFullAppProfileState.test.tsx` | 5개 파일, 22개 통과 |
| `npm run lint` + `npm run build` | 통과; 마지막 브라우저 TLS fixture 보완 후 `npx eslint tests/profiles-mobile-responsive.spec.ts --max-warnings 0`도 통과 |
| `npm run test:unit -- --maxWorkers=4` | 최종 254개 파일, 1,200개 통과 |
| `E2E_LIVE=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18213 npx playwright test tests/profiles-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=2` | 최종 프로덕션 프리뷰에서 16개 통과, skip/retry 없음 |
| `git diff --check` | 통과 |

로그는 `/tmp/s3desk-profile-unmount-{before-final,focused,lint,build,unit,browser-final}-20260908.log`다.
브라우저 red는 `/tmp/s3desk-profile-unmount-browser-before-final-20260908.log`,
마지막 테스트 파일 lint는 `/tmp/s3desk-profile-unmount-browser-lint-20260908.log`다.
18212/18213 프리뷰를 종료했고 수신 프로세스가 없다. 두 프리뷰 출력에는 API proxy
연결 오류가 없었다. 이번 수정은 프런트엔드 1개 제품 파일과 기존 단위·브라우저 검사
파일 2개에 한정된다. 20차의 다른 탭 선택 유지 검증도 같은 브라우저 lane에서 통과했다.

mock API·로컬 Chromium에서 확인한 결과다. 실제 provider의 인증서 적용, 물리 기기,
Safari·보조기술·배포 검증은 포함하지 않는다. 변경 후 backend/check.sh full,
Core/mobile/visual 전체, 번들 예산은 재실행하지 않았고 18~19차 결과와 구분한다.

## 22차: YAML 저장·가져오기의 목록 갱신과 새 초안 보존 — 2026-09-08

`useProfilesYamlImportExport`의 저장·가져오기 성공 처리는 모달/페이지가 활성인
경우에만 목록을 갱신했다. 또한 프로필 저장 뒤 TLS 적용이나 canonical YAML 재조회가
실패하면 이미 반영된 프로필 변경도 캐시에 알리지 않았다. 저장·가져오기 API가
성공한 뒤의 후속 처리를 `try/finally`로 묶어 원래 API/token 범위의 캐시를 갱신했다.
프로필 저장 자체가 실패한 경우에는 불필요한 무효화를 하지 않는다. TLS·재조회 오류는
계속 오류로 처리하며, 부분 성공을 전체 설정 성공으로 표시하지 않는다.

YAML 저장 응답의 요청 ID 검사도 확인했다. 응답/변수에 있던 과거 요청 ID를 그
요청의 context와 비교하고 있어 같은 프로필 창을 닫았다 다시 연 경우를 구분하지
못했다. 기존 최신 요청 ref와 비교하도록 수정해 새 세션의 초안과 오류 상태를
보호한다. 같은 창에서 저장 중 계속 입력한 경우에는 현재 초안이 제출 내용과 같을
때만 서버의 canonical YAML로 바꾼다. 새 ref나 modal 상태 계층은 추가하지 않았다.

scope hook과 실제 unmount를 결합한 단위 검사에서 저장·가져오기 후 목록 누락,
TLS/재조회 실패 후 부분 반영, API 저장 실패의 음성 대조를 확인했다. 같은 프로필
창을 재개한 뒤 오래된 성공/실패 응답이 새 초안에 적용되는 경우도 재현했다.
첫 집중 red는 8개 실패/5개 통과였으며, 같은 창의 입력 보존을 추가한 별도 red는
1개 실패/13개 통과였다. 인증 전환 페이지 검사 2개는 실제 `FullAppRoutes`와 같은
key로 페이지를 다시 생성하고, 현재 인증 범위가 아닌 원래 목록/TLS 키만 정확히
갱신하는 것을 확인하도록 바꿨다. 중간 전체 단위 검사 2개 실패는 이 두 검사의
이전 "무효화 없음" 기대값이 새 계약과 맞지 않아 발생했으며 최종 검사와 구분한다.

브라우저에서는 가져오기 요청을 보류한 채 창을 닫고 새 가져오기 초안을 입력했다.
수정 전에는 생성된 프로필이 목록에 나타나지 않았다. 저장 중 같은 창에서 계속
입력하는 경우도 실제 편집 내용이 Saved Profile로 되돌아가는 것을 재현했다.
YAML 창 재개, 같은 창 편집, 다음 가져오기 초안 보존을 최종 브라우저 검사에 포함했다.

| 검사 (frontend) | 결과 |
| --- | --- |
| `npm run test:unit -- src/pages/profiles/__tests__/useProfilesYamlImportExport.test.tsx src/pages/profiles/__tests__/profileYaml.test.ts src/pages/profiles/__tests__/useProfilesPageState.test.tsx src/pages/__tests__/ProfilesPage.import.test.tsx src/pages/__tests__/ProfilesPage.yaml.test.tsx` | 최종 5개 파일, 30개 통과 |
| `npm run lint` + `npm run build` | 최종 코드 통과 |
| `npm run test:unit -- --maxWorkers=4` | 최종 254개 파일, 1,210개 통과 |
| `E2E_LIVE=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18216 npx playwright test tests/profiles-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7 --workers=2` | 최종 프로덕션 프리뷰에서 22개 통과, skip/retry 없음 |
| `npm run check:e2e:geometry` + `git diff --check` | 통과 |

최종 로그는 `/tmp/s3desk-profile-yaml-{focused-final,lint-final,build-final,unit-final,browser-final-complete,geometry}-20260908.log`다.
최초 단위 red는 `/tmp/s3desk-profile-yaml-before-20260908.log`, 같은 창 편집의 단위 red는
`/tmp/s3desk-profile-yaml-draft-before-20260908.log`다. 가져오기 브라우저 red는
`/tmp/s3desk-profile-yaml-browser-before-final-20260908.log`의 import 케이스,
같은 창 편집 브라우저 red는 `/tmp/s3desk-profile-yaml-draft-browser-before-final-20260908.log`다.

중간 브라우저 실행에는 submenu/로딩 버튼 selector, YAML fixture의 필수 accessKeyId
누락이 있었다. 또한 처음 확장한 같은 창 편집 검사는 문자열 치환 대상이 없어 초안을
실제로 바꾸지 않았다. 이 실행들은 해당 결함의 red/green 근거로 사용하지 않는다.
마지막 draft-browser-before-final에서는 실제 다른 초안을 입력했으며, 같은 창은
덮어쓰기로 실패하고 창 재개는 통과했다. 그 뒤 초안 비교 조건을 추가한 최종 빌드가
위 22개 브라우저 검사와 전체 단위 검사를 통과했다.

18214/18215/18216 프리뷰를 종료하고 수신 프로세스가 없는 것을 확인했다. 각 프리뷰
출력에는 API proxy 연결 오류가 없었다. 이번 결과는 mock API·로컬 Chromium 증거다.
TLS를 포함한 다중 API 저장의 원자성, 실제 provider·물리 기기·Safari·보조기술·배포는
검증하지 않았다. 변경 후 backend/check.sh full, Core/mobile/visual 전체와 번들
예산은 재실행하지 않았고 18~19차 결과와 구분한다.

## 23차: 누적 변경의 전체 로컬 재검증 — 2026-09-08

20~22차 프로필 선택·저장·YAML 수정까지 포함한 현재 작업 트리에서 전체 검사를
다시 실행했다. 이 단계에서는 제품 코드, API shape, 의존성, 번들 기준, 시각 기준
이미지를 변경하지 않았다. 기준 HEAD는 `3a87d43`이며 누적 구현은 작업 트리에 있다.

`GOTOOLCHAIN=auto CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 PLAYWRIGHT_WEB_SERVER_PORT=18217 ./scripts/check.sh full`
이 통과했다. 프런트엔드 254개 파일/1,210개 단위 검사, lint/build, Chromium smoke
2개와 Go test/vet/security, OpenAPI·workflow·Helm·라이선스 재현 검사가 포함된다.
보안 분석은 호출 경로 취약점 0개와 비호출 imported-package 취약점 3개를 구분해
보고했다. npm 10.9.7은 권장 10.9.4와 다르다는 안내가 있었지만 요구 major를 충족했다.

백엔드에서 `GOTOOLCHAIN=auto go test -race ./internal/api ./internal/jobs ./internal/store -count=1`
도 세 패키지 모두 통과했다. 재실행 시간은 API 53.720초, jobs 13.433초, store
8.829초이며 실행 시간 개선의 비교값으로 사용하지 않는다. PostgreSQL 전용 환경
검사는 이번 race 명령의 통과에 포함시키지 않고, 2차의 임시 PostgreSQL 증거와 구분한다.

`npm run bundle:budget`은 새 분석 빌드에서 통과했다. 예산 초과·순환 chunk 경고가
없으며 gzip 크기는 초기 JS 164.4/170 KiB, Profiles 13.8/15.5 KiB,
Objects 68.6/72 KiB, Uploads 5.0/5.3 KiB, Transfers 13.6/14.5 KiB다.
Transfers의 여유 0.9 KiB는 기존 검토 후보이며 예산 위반이나 새 크기 증가가 아니다.
실제 수치는 `frontend/dist/bundle-report.md`에 있다. 이 분석 빌드를 이후 브라우저
검사에 사용하며 검사 중 dist를 다시 만들지 않는다.

브라우저 공통 환경은 `E2E_LIVE=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18218`이다.
각 lane은 `PLAYWRIGHT_OUTPUT_DIR`와 `PLAYWRIGHT_JSON_OUTPUT_NAME`을 별도로 지정했다.
Core가 끝난 뒤 mobile/visual을 worker 2개/1개로 병렬 실행했고, 두 lane 종료 후
perf는 worker 1개로 단독 실행했다. JSON의 unexpected/flaky와 전역 errors는 모두
0이었다. Core skip 15개의 사유는 모두 `E2E_LIVE=1 required`였다.

| 검사 (frontend) | 최종 결과 |
| --- | --- |
| `npm run test:e2e:core -- --workers=3 --reporter=list,json` | 177개 통과, 실제 서버 조건 15개 skip |
| `npm run test:e2e:mobile-responsive -- --workers=2 --reporter=list,json` | 126개 통과, skip/retry 없음 |
| `npm run test:e2e:visual -- --workers=1 --reporter=list,json` | 35개 통과, skip/retry 없음, 기준 이미지 변경 없음 |
| `npm run test:e2e:perf -- --workers=1 --reporter=list,json` | 4개 통과, skip/retry 없음 |
| `npx vitest bench --run src/lib/__benchmarks__/thumbnailCache.bench.ts` | 체크인한 400/2,000 항목 합성 벤치마크 실행 완료 |
| `git diff --check` | 통과 |

성능 검사 측정은 Jobs 목록 624/2,000ms, 필터 105/300ms, 로그 창 101/1,000ms,
Objects 목록 690/3,000ms였다. 단일 로컬 mock 실행이며 운영 p95나 이전 실행 대비
개선율을 뜻하지 않는다. 썸네일 합성 벤치마크의 평균은 400개에서 0.0047ms,
2,000개에서 0.0064ms였다. 1차의 전후 비교와 측정 방식이 다르므로 섞어서 비교하지
않는다. 벤치마크는 모든 브라우저 검사와 프리뷰가 종료된 뒤 실행했다.

| 누적 수정의 확인 항목 | 현재 근거와 범위 |
| --- | --- |
| 썸네일 시작 예외 후 큐 진행, 실패 캐시 제한, 정확한 크기 캐시 적중 | 현재 공통 queue/cache 구현, 단위 회귀, Core 이미지 흐름, 실행 가능한 합성 벤치마크 |
| 만료 세션 페이지 순회와 실행 중 작업의 원본 보존 | maintenance/store 구현, 전체 Go 검사와 jobs/store race; PostgreSQL은 2차의 별도 증거 |
| 업로드 중단 복구·정확한 크기·중복/동시 쓰기·용량 경계 | staging/chunk/multipart 공통 구현, 현재 API 전체 검사와 race; 로컬 파일·HTTP·프로세스 범위 |
| 실시간 취소/실패 복구, 트리 갱신, 범위가 바뀐 뒤 늦은 결과 격리 | 관련 공통 hook과 실제 라우트 소유권, 전체 단위/Core/mobile 검사; 18차에서 정정한 재현 범위 유지 |
| 탭 간 프로필 선택, 저장·삭제·YAML 후속 처리와 새 초안 보존 | 20~22차 owner 수정, 현재 단위·모바일의 실제 storage/뒤로 이동/모달 편집 흐름 |
| API·의존성·시각 계약과 저장소 품질 기준 | 공개 API/lockfile/기준 이미지 변경 없음, check.sh full·bundle budget·Core/mobile/visual/perf 통과 |

로그는 `/tmp/s3desk-cumulative-final-{full,race,bundle,core,mobile,visual,perf,thumbnail-bench}-20260908.log`다.
브라우저 JSON은 `/tmp/s3desk-cumulative-final-{core,mobile,visual,perf}-20260908.json`에 있다.
18217 관리 서버와 18218 프리뷰가 종료되어 수신 프로세스가 없는 것을 확인했다.
프리뷰 출력에는 로컬 8080 연결 거부 22건(realtime-ticket 13, objects 7,
favorites 2)이 있었다. 검사한 UI 계약의 통과이며 모든 백그라운드 요청의 모킹
완전성은 아니다. 이 배경 요청들을 실제 provider 실패나 통과로 해석하지 않는다.

요청한 저장소 최적화·안정화 변경과 로컬 회귀 검증을 완료했다. 이번 완료 판단은
위 구현·검사 항목을 근거로 하며 배포나 release 승인이 아니다. 실제 provider,
배포된 reverse proxy, 운영 복원, 물리 기기·Safari/Firefox·보조기술의 증거는 포함하지
않는다. 구버전의 소유 불명 `.tmp` 자동 삭제, 다중 API/파일·DB의 완전한 원자성,
다중 서버의 동일 DATA_DIR 공유도 구현 범위에 추가하지 않았다. 외부 변경·배포·
커밋·푸시는 수행하지 않았으며, 재현한 결함의 로컬 수정과 검증 결과를 작업 트리에 남겼다.
