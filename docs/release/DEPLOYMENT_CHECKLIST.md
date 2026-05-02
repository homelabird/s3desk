# 배포 전 체크리스트

## 설정

- `ALLOW_REMOTE` 사용 여부를 명확히 결정한다.
- `ALLOW_REMOTE=true`라면 `ALLOWED_HOSTS`가 실제 외부 접근 호스트와 일치하는지 확인한다.
- `ALLOW_REMOTE=true`라면 `ALLOWED_LOCAL_DIRS`가 비어 있지 않은지 확인한다.
- reverse proxy를 쓰는 경우 `Origin`이 실제 public host 기준으로 전달되는지 확인한다.
- HTTPS를 쓰는 경우 `Strict-Transport-Security` 적용이 운영 정책과 충돌하지 않는지 확인한다.

## 검증

- `bash ./scripts/check_ci_pair.sh` 실행
  - 이 래퍼는 workflow lint + frontend build + backend test만 포함한다.
  - bundle-budget과 Playwright lane은 포함하지 않으므로 아래 browser 항목은 필요 시 별도로 계속 실행한다.
  - 이 결과만으로 required check가 충족되거나 release-ready라고 판단하면 안 된다.
- 필요 시 `bash ./scripts/check.sh full` 실행
- `.github/workflows/**`, workflow lint tooling, browser CI summary를 수정했으면 `bash ./scripts/check_github_workflows.sh` 실행
- bundle report script, budget manifest, report wording, bundle summary wiring을 수정했으면 `cd frontend && npm run check:bundle-report` 실행
  - 이 범위가 아니면 배포 기록에는 `Bundle Budget Contract: not applicable (...)`로 남긴다.
- frontend entrypoint, chunk split, shared vendor, dependency weight 변화가 있으면 `cd frontend && npm run bundle:budget` 실행
  - 이 범위가 아니면 배포 기록에는 `Bundle Budget: not applicable (...)`로 남긴다.
  - 배포 기록에는 `No budget warnings` / `No budget review candidates` 여부를 함께 남기고, 후보가 남아 있으면 해당 chunk 이름을 적는다.
- Playwright를 수정했으면 `cd frontend && npm run check:e2e:geometry` 실행
- auth, app shell, route-entry 같은 boot 흐름을 건드렸으면 `cd frontend && npm run test:e2e:smoke` 실행
- browser-surface desktop 회귀 가능성이 있으면 `cd frontend && npm run test:e2e:core` 실행
- mobile layout, drawer, sheet, card, tab, touch interaction을 건드렸으면 `cd frontend && npm run test:e2e:mobile-responsive` 실행
  - browser evidence는 `smoke`, `core`, `mobile-responsive`를 각각 별도 줄로 남기고, 실행하지 않은 lane은 `not applicable` 이유를 같이 적는다.
- realtime 경계만 다시 보고 싶으면 `bash ./scripts/repro_backend_focus.sh realtime`
- uploads 경계만 다시 보고 싶으면 `bash ./scripts/repro_backend_focus.sh uploads`
- multipart precondition만 다시 보고 싶으면 `bash ./scripts/repro_backend_focus.sh uploads-multipart-preconditions`

## 기능 스모크

- 로그인 후 메인 앱 진입 확인
- 프로필 생성/선택 확인
- bucket 생성/삭제 확인
- direct upload 확인
- staging upload 확인
- multipart complete/abort 확인
- backup export 확인
- restore bundle import 확인
- realtime SSE/WS 연결 확인

## 운영 리스크 확인

- fail-closed 변경으로 인해 startup error가 없는지 확인
- 브라우저에서 websocket/sse가 `403` 없이 정상 연결되는지 확인
- reverse proxy access log에 unexpected `Origin` mismatch가 없는지 확인
- remote 모드에서 허용되지 않은 host 접근이 실제로 차단되는지 확인
- live evidence 필요 여부는 `python3 scripts/check_release_evidence.py`로 먼저 확인한다.
- release blocker를 한 번에 확인하려면 `python3 scripts/check_release_readiness.py --candidate-id <tag-or-sha>`를 실행한다.
  - 이 명령은 scope/evidence/env preflight를 요약하며, provider/reverse-proxy evidence가 없으면 실패한다.
  - 이 명령만으로 `./scripts/check.sh full`, clean-snapshot 검증, browser lane evidence를 대체하면 안 된다.
- release 승인 전에는 `python3 scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <tag-or-sha>`가 통과해야 한다.
- reverse-proxy smoke 전 `python3 scripts/check_live_evidence_env.py --scope reverse-proxy`로 필수 환경변수 누락 여부를 확인한다.
- reverse-proxy smoke 증거가 필요하면 `DEPLOY_RELEASE_CANDIDATE=<tag-or-sha> DEPLOY_SMOKE_EVIDENCE_FILE=docs/release/evidence/reverse-proxy-smoke-<tag-or-sha>.md bash ./scripts/deploy_smoke.sh`로 evidence 파일을 남긴다.
- reverse-proxy evidence의 `Signed proxy URL root`는 `Expected external base URL`과 일치해야 하며, `## Expected Statuses` 예시만 남긴 파일은 release evidence로 인정하지 않는다.
- provider live validation 전 `python3 scripts/check_live_evidence_env.py --scope <provider>`로 필수 환경변수 누락 여부를 확인한다.
- provider/reverse-proxy evidence 명령과 target 파일은 `python3 scripts/check_release_evidence.py --format checklist`로 현재 변경 기준에서 재확인한다.
- provider/reverse-proxy evidence의 `S3Desk commit SHA or release tag`에는 실제 검증한 release tag 또는 commit SHA를 기록한다.
- provider-facing 변경이면 [PROVIDER_LIVE_VALIDATION_TEMPLATE.md](evidence/PROVIDER_LIVE_VALIDATION_TEMPLATE.md)를 사용해 영향받은 provider별 evidence를 남긴다.

## 롤백 준비

- 이전 배포 버전의 env 파일을 보관
- 이전 태그/이미지로 즉시 되돌릴 수 있는지 확인
- remote 설정 변경 전후 차이를 배포 기록에 남김
