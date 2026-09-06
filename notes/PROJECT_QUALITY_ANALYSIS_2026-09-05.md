# 프로젝트 품질 분석 및 개선 — 2026-09-05

## 범위와 판단

기준은 `main`의 `daffc17`과 이번 작업 트리다. 시작 시 작업 트리는 깨끗했다.
기존 구조를 유지하면서 업로드·작업 상태 전이, 요청 재시도, 재개 메타데이터,
백업 복원 경계와 저장소의 로컬 검증 절차를 확인했다.

기존 테스트가 통과하는 것만으로 사용자 동작이 보장되지는 않았다. 전송 UI의
취소 버튼 테스트는 콜백 호출만 확인했고, 서버 작업 취소 요청의 누락을 발견하지
못했다. 파일명별 메타데이터 테스트도 JavaScript 객체의 상속 속성과 충돌하는
정상 파일명을 다루지 않았다. 두 결함을 재현하고 기존 소유 코드에서 수정했다.

## 수정한 결함

### P1: 서버로 넘긴 업로드의 취소가 화면에만 적용됨

- 소유 코드: `frontend/src/components/transfers/useTransfersRuntimeController.ts`.
- 재현: 업로드가 `waiting_job`에 도달한 뒤 Transfers의 Cancel을 누르면 화면은
  Canceled로 바뀌지만 `POST /jobs/{jobId}/cancel` 호출은 0회였다.
- 수정: 선택한 작업의 profile/job ID로 기존 취소 API를 호출하고, 응답을 기존
  작업 lifecycle 처리에 전달한다. 서버가 아직 running이면 추적을 유지한다.
  실패 시 진행 상태를 유지하고 오류를 표시한다. 교체된 job의 늦은 응답은 무시한다.
- 검증: 브라우저 재현 테스트가 수정 전 요청 횟수 `expected 1 / received 0`으로
  실패했다. 수정 후 서버 취소 요청과 Canceled 표시를 함께 검증한다. 단위 테스트는
  running/canceled/succeeded 응답, 요청 실패, job 교체를 확인한다.

### P1: 정상 파일명과 객체 상속 속성이 충돌함

- 소유 코드: `frontend/src/api/domains/uploads.ts`,
  `frontend/src/components/transfers/uploadRuntimePlanning.ts`,
  `frontend/src/components/transfers/uploadRuntimeResume.ts`.
- 재현: `constructor`, `toString`, `__proto__` 파일을 청크 업로드할 때 빈 경로별
  설정 객체의 상속 값을 읽어 `RangeError: Invalid array length`가 발생했다.
  `__proto__`의 청크 크기나 재개 정보도 일반 객체에 정상적으로 저장되지 않았다.
- 수정: API 경계에서 명시적으로 전달된 키만 Map으로 읽고, 경로별 메타데이터를
  prototype이 없는 객체에 저장한다. 공개 API 형식이나 파일명 규칙은 바꾸지 않는다.
- 검증: 수정 전 회귀 테스트 5개 실패. 수정 후 단일/다중 파일 청크 전송,
  재개 계획, batch 및 구버전 단일 조회 fallback을 포함한 관련 테스트 41개 통과.

### P2: 브라우저 픽스처가 현재 조회 계약을 반영하지 않음

- `frontend/tests/objects-global-search.spec.ts`: 공통 `buildFavoritesFixture`를
  사용해 필수 keys/count/hydrated 필드를 포함한다.
- `frontend/tests/transfers-job-artifact.spec.ts`: 대기 중 ZIP 작업의 진행을
  `GET /jobs?id=...` 일괄 조회에 연결하고 실제 요청 ID를 검증한다. 단건 조회만
  세던 이전 픽스처는 현재 실행 경로를 검증하지 못했다.
- `frontend/tests/objects-network-chaos.spec.ts`: 폴더 트리 조회와 파일 목록 오류를
  분리하고, 복구 시점을 명시한다. 병렬 조회가 고정된 4회 오류 응답을 소진해
  오류 화면이 사라지는 문제를 제거했다. 오류 표시와 Refresh 후 복구 검증을 유지한다.
- 최초 core 실행은 148개 통과, 5개 실패, 15개 환경 조건 skip이었다.
  위 세 파일의 실패를 수정했고 검색/목록 3개와 ZIP 다운로드 4개는 집중 검사에서 통과했다.

## 검증 기록

아래 명령은 `rtk proxy`를 통해 실행했다. frontend/backend 표시가 있는 명령은
해당 디렉터리에서 실행한다. 전체 게이트의 최초 실행은 의존성을 `npm ci`로 설치했다.

| 검사 | 결과 |
| --- | --- |
| `./scripts/check.sh full` 최초 실행 | 프런트엔드 1,141개 중 1개가 5초 시간 제한 초과. 전체 통과로 취급하지 않음 |
| frontend: `npm run test:unit -- src/pages/jobs/__tests__/JobsCreateModalsFeedback.test.tsx --maxWorkers=1` | 2개 통과. 시간 초과한 라벨 테스트는 단독 실행에서 약 0.85초 |
| 업로드 취소 관련 단위 테스트 3개 파일, `--maxWorkers=2` | 15개 통과 |
| 파일명·재개 관련 단위 테스트 5개 파일, `--maxWorkers=2` | 41개 통과 |
| frontend: `npm run test:e2e -- tests/transfers-drawer-actions.spec.ts --project=chromium --workers=1` | 2개 통과 |
| backend: `go test -race ./internal/api ./internal/jobs ./internal/store` | 세 패키지 통과 |
| frontend: `npm run check:design` | CSS token, 디자인 패턴, 추적하는 명암비 검사 통과 |
| frontend: `npm audit --omit=dev --json` | 운영 의존성 보고 취약점 0건 |
| `CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 ./scripts/check.sh full` | 최종 통과: OpenAPI, release/workflow 구조, Helm, gofmt/vet/Go tests/security, frontend lint·1,153 tests·build·2 browser smoke, license snapshot 재현성 |
| frontend: `npm run lint` (브라우저 픽스처 변경 후) | 통과: ESLint, CSS tokens, import cycles |
| frontend: `npm run test:e2e:core -- --workers=4` | 최종 153개 통과, 환경 조건 15개 skip. 앞서 실패한 5개 모두 통과 |
| frontend: `npm run test:e2e:mobile-responsive -- --workers=2` | 104개 통과; Chromium의 iPhone 13/Pixel 7 에뮬레이션 |
| frontend: `npm run test:e2e:visual -- --workers=2` | 35개 통과; 기준 이미지 변경 없음 |
| frontend: `npm run bundle:budget` | 통과, budget warnings 없음. 초기 JS gzip 163.9/170.0 KiB, Objects 68.3/72.0 KiB, Transfers 13.5/14.5 KiB |

전체 게이트 실행 중 새 회귀 테스트를 추가한 중간 실행은 수정 전 파일명 결함으로
실패했다. 최종 판정에는 수정이 끝난 작업 트리의 새 실행을 사용한다.
브라우저 재현의 첫 시도는 로컬 모듈 로딩의 `ERR_NETWORK_CHANGED`로 시작 화면에
도달하지 못했으며, 이 결과를 취소 결함의 재현으로 세지 않았다.
독립 Playwright 실행은 `PLAYWRIGHT_WEB_SERVER_PORT`와 `PLAYWRIGHT_OUTPUT_DIR`로
서버 포트·실패 증거 디렉터리를 분리했다. 전체 게이트 통과 후 변경은 세 브라우저
픽스처와 이 보고서이며, 해당 픽스처는 별도 브라우저 실행과 최종 lint로 검증했다.
최종 브라우저 결과는 smoke 2 + core 153 + mobile 104 + visual 35 = 294개 통과다.
환경 조건으로 건너뛴 15개는 통과 수에 포함하지 않는다.

## 검증 한계와 후속 우선순위

- Go 취약점 분석은 호출 경로에 영향을 주는 취약점 0건으로 보고했다. 가져오는
  패키지에 있는 비호출 취약점 3건은 별도 결과이며, 모든 의존성이 무취약하다는
  의미가 아니다.
- 초기 단위 테스트 시간 초과는 단독 실행에서 재현되지 않았다. 최종 전체 실행은
  기존 `CHECK_FRONTEND_MAX_WORKERS=4` 옵션을 사용한다. 개별 timeout을 늘리지는 않았다.
- 초기 JS 예산 사용률은 96.4%, Transfers는 93.2%다. 새 기능이 해당 청크를 키울 때
  기존 lazy 경계와 포함 모듈을 먼저 확인한다. 이번에는 예산 상한을 늘리지 않았다.
- provider별 실제 전송·취소·재개, reverse proxy, portable backup 운영 복원,
  PostgreSQL 외부 인스턴스, 물리 기기 및 보조기술 검증은 이번 로컬 결과로 증명하지 않는다.
- 배포, 원격 저장소 publication, tag 생성은 수행하지 않았다.
