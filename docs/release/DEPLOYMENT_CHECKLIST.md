# 배포 전 체크리스트

## 설정

- `ALLOW_REMOTE` 사용 여부를 명확히 결정한다.
- `ALLOW_REMOTE=true`라면 `ALLOWED_HOSTS`가 실제 외부 접근 호스트와 일치하는지 확인한다.
- `ALLOW_REMOTE=true`라면 `ALLOWED_LOCAL_DIRS`가 비어 있지 않은지 확인한다.
- reverse proxy를 쓰는 경우 `Origin`이 실제 public host 기준으로 전달되는지 확인한다.
- HTTPS를 쓰는 경우 `Strict-Transport-Security` 적용이 운영 정책과 충돌하지 않는지 확인한다.

## 검증

- `bash ./scripts/check_ci_pair.sh` 실행
- 필요 시 `bash ./scripts/check.sh full` 실행
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

## 롤백 준비

- 이전 배포 버전의 env 파일을 보관
- 이전 태그/이미지로 즉시 되돌릴 수 있는지 확인
- remote 설정 변경 전후 차이를 배포 기록에 남김
