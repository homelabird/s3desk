# SeaweedFS 통일 및 백엔드 연동 병목 조사

기준: 이번 대화에서 제공된 `s3desk-seaweedfs-demo.zip`. 소스 수정과 검증은
이 입력본을 기준으로 했다. 사용자 서버의 로그, 트레이스, 네트워크 또는 디스크
측정값은 제공되지 않았으므로 실제 운영 환경에서 느려지는 원인이 이 항목들뿐이라고
단정하지 않는다. 아래는 소스에서 확인한 문제, 집중 테스트로 재현한 특성,
그리고 실제로 실행하지 못한 통합 검증을 구분한 기록이다.

## 1. MinIO 데모 제거 범위

| 영역 | 변경 후 |
| --- | --- |
| 기본 데모 | SeaweedFS 4.47, S3 API 8333, `SeaweedFS Demo` 프로필 |
| API/provider E2E Compose | 동일 SeaweedFS 서버와 서명된 S3 초기화 검사 |
| Portable backup/restore smoke | SeaweedFS, 공통 rclone 시더 |
| 로컬 Playwright 실행 스크립트 | SeaweedFS 전용 임시 데이터/컨테이너, 제한된 준비 대기 |
| GitHub/GitLab 로컬 통합 검사 | SeaweedFS 이미지·주소·자격 증명 기본값 |
| UI 안내/현재 E2E fixture | SeaweedFS 명칭·8333·일치하는 테스트 자격 증명 |

`scripts/portable/seed-minio.sh`를 삭제했고, 로컬 실행 정의의 MinIO 이미지,
서비스, MINIO_* 환경 변수, minioadmin 기본값을 제거했다. 세 Compose 스택은
`scripts/demo/seed-seaweedfs.sh`와 `compose/demo/filer.toml`을 공유한다.
스토리지 볼륨은 스택마다 별도 이름을 유지한다. master/filer 상태 확인만으로
준비가 끝났다고 판단하지 않고 시더에서 인증된 S3 요청 성공도 확인한다.

GitLab은 서비스들을 먼저 detached 모드로 올린 뒤 API runner를 실행한다.
일회성 시더가 정상 종료했다는 이유로 `--abort-on-container-exit`가 다른
서비스까지 중단하는 구성을 피했다. 로컬 harness도 준비 실패 시 테스트를
계속 진행하지 않으며, 생성한 임시 SeaweedFS 데이터만 정리한다.

기존 사용자 데이터와 MinIO 볼륨은 삭제하지 않는다. 외부 S3-compatible
엔드포인트 지원, 과거의 릴리스 증빙, DB 마이그레이션 fixture는 보존한다.
이들은 MinIO 데모 실행 구성이 아니며 과거 증빙을 SeaweedFS 실측처럼 바꾸지 않았다.

## 2. 확인한 병목과 수정

### A. 페이지를 넘길 때마다 앞부분을 다시 읽는 목록 조회

기존 `backend/internal/api/handlers_object_list_http.go`는 매 요청마다
`rclone lsjson` 프로세스를 시작하고 이전 `o:` / `p:` 토큰까지 항목을
다시 읽어 버린 뒤 다음 항목을 반환했다. 목록의 뒤쪽으로 이동할수록
이미 읽은 항목을 반복 처리하는 구조였다.

신규 S3 목록 요청은 `ListObjectsV2`와 제공자의 continuation token을 사용한다.
한 페이지를 이어 읽기 위해 앞 페이지를 재생하지 않는다. 구현은 다음에 분리했다.

- `internal/s3listing`: 쿼리 범위에 묶인 토큰, 제한된 페이지 처리, 디렉터리 marker 처리.
- `internal/s3client/list.go`: AWS SDK 단일 페이지 어댑터. 항목별 HEAD 요청 없음.
- `internal/api/handlers_object_list_s3.go`: 요청 연결 및 정규화/비밀값을 숨기는 오류 응답.

토큰은 프로필·버킷·prefix·delimiter·prefixesOnly 범위가 달라지면 거절한다.
페이지 크기는 변경할 수 있어 프런트의 첫 페이지 200개/후속 800개 같은 동작을
유지한다. URL-encoded 키는 한 번만 디코딩하고 `+`, `%`, 한글을 보존한다.
반복 토큰/다음 토큰 없는 잘린 응답/MaxKeys를 무시한 과다 응답은 오류 처리한다.

필터링 때문에 한 API 응답에서 여러 제공자 페이지를 읽어야 할 때는 최대 8페이지로
제한한다. 빈 페이지에도 다음 토큰이 있을 수 있다. listing 결과를 캐시하지
않으므로 이 변경으로 객체 목록의 별도 캐시 무효화 문제를 만들지 않는다.

기존 `o:` / `p:` 토큰은 해당 조회가 끝날 때까지 원래 rclone 경로를 사용한다.
S3 이외 제공자, 작업/전송 엔진, 인덱싱 등은 계속 rclone을 사용한다.
새 경로는 AWS SDK의 재시도 처리를 사용하며 rclone 전용 retry 환경 변수는
그 경로에 적용되지 않는다. 제공자별 기능 지원 등급은 이번 변경으로 올리지 않았다.

### B. S3 요청마다 새 HTTP 연결 풀을 만드는 구조

`internal/s3client/client.go`는 클라이언트 생성 때마다 TLS 설정과 HTTP
transport를 새로 만들었다. 반복 메타데이터/버킷/API 요청 간에 동일한 연결 풀을
재사용하지 못하는 경로였다.

`internal/profilehttp`에 transport 캐시를 추가했다. 최대 32개, 생성 후 최대
5분, 만료/최소 최근 사용 항목 퇴출 방식이다. 새 요청 때 만료를 정리하며 별도
영구 타이머나 무제한 registry를 두지 않는다. 프로필 ID, 내부 endpoint,
TLS 신원/설정, 원격 접근 정책으로 풀을 구분한다. AWS 자격 증명과 목록 결과는
이 캐시에 저장하지 않고 요청마다 현재 자격 증명으로 서명한다.

TLS 설정이 바뀌면 새 풀을 사용한다. 인증서 검증을 건너뛰는 런타임 허용 여부는
캐시 hit에도 다시 검사한다. 요청/리디렉션 검증 및 새 연결의 DNS/IP 검증을
우회하지 않는다. transport의 idle 한도는 전체 64개, host당 16개다.
`guardedRoundTripper`도 `CloseIdleConnections`를 실제 transport로 전달하도록
수정하여 퇴출 시 유휴 연결이 정리되게 했다. 진행 중인 스트림은 끊지 않는다.

### C. 서로 다른 파일의 멀티파트 생성까지 묶는 전역 잠금

직접 스트리밍과 presigned multipart 초기화는 동일한 서버 전역 mutex를 잡은
상태에서 DB 조회/기록과 S3 create/abort를 수행했다. 한 파일의 느린 제공자
응답이 다른 파일의 초기화까지 기다리게 하는 직렬화 구간이었다.

`internal/keyedmutex`를 도입해 `(profileID, uploadID, path)`별로 직렬화한다.
같은 파일의 chunk들은 여전히 하나의 제공자 upload ID를 공유하며, 다른 파일은
독립적으로 진행한다. 대기 중 취소 요청은 빠져나올 수 있다. 사용이 끝난 키와
취소된 대기자의 참조는 제거해 파일명마다 잠금이 영구적으로 쌓이지 않게 했다.

이는 단일 S3Desk 프로세스 내부의 변경이다. 다중 replica의 분산 락/HA 지원을
추가한 것은 아니며 기존 단일 DATA_DIR 소유 모델을 유지한다.

### D. 빈 페이지를 목록 끝으로 잘못 판단하는 프런트엔드

객체 목록과 폴더 트리는 `items`와 `commonPrefixes`가 모두 비면 유효한
다음 토큰이 있어도 탐색을 멈췄다. 서버의 제한된 prefix 필터링과 결합하면
뒤쪽의 폴더를 누락할 수 있다.

페이지 종료 여부는 `isTruncated`와 다음 토큰으로 판단하도록 수정했다.
토큰 누락·동일 토큰 반복·이전에 본 토큰 순환 검사는 유지하며 트리의 기존
총 페이지 상한도 유지한다. 순수 helper는 `objectsContinuation.ts`로 분리했다.

## 3. 실행한 검증과 측정

| 검증 | 실제 결과 |
| --- | --- |
| 기존 데모 Python 검사 | 33개 통과 |
| 새 SeaweedFS 통일성 검사 | 16개 통과 |
| Go 핵심 패키지 테스트 | 55개 최상위 테스트 통과, `-race` 포함 |
| 프런트 순수 TypeScript pagination helper | Node 테스트 7개 통과 |
| 프런트 순수 helper 타입 검사 | `tsc --noEmit --strict` 통과 |
| 릴리스 정적 검사 | source-archive 모드 통과, Python 197개 포함 |

197개에는 앞의 Python 33+16개가 포함되어 있다. Go 검사는 실제 프로덕션 소스의
외부 의존성 없는 패키지들을 임시 모듈로 복사하여 설치된 Go 1.23.2로 실행했다.
프로젝트의 Go 1.25.13 설정과 의존성을 낮추거나 변경하지 않았다.

#### 목록 반복 읽기 모형

`TestOneHundredPagesVisitEachObjectOnce`에서 항목 10,000개를 100개씩
100페이지로 반환하는 가짜 제공자를 사용했다. 신규 경로는 제공자 페이지 100회,
항목 10,000개만 처리했다. 같은 페이지 조건으로 처음부터 재생하는 기존 구조의
처리 항목 수는 `100 × (1 + ... + 100) = 505,000`개다. 후자는 구조에 근거한
비교 모형이며 실제 rclone/SeaweedFS 처리 시간 측정이 아니다.

#### 집중 벤치마크

Linux amd64, Go 1.23.2, GOMAXPROCS=8, 각 경우 100 operations, 3회 반복.
표의 시간은 3회 결과의 중앙값이다.

| 모형 | 변경 전 방식 | 변경 후 방식 |
| --- | ---: | ---: |
| 매 연결에 2ms 지연을 주는 로컬 HTTP 서버 | 2.475178 ms/op | 0.061367 ms/op |
| 위 실험의 연결 수/요청 | 1.00 | 0.01 |
| 파일 초기화마다 1ms 대기, 8개 worker | 1.087394 ms/op, 전역 락 | 0.142168 ms/op, 파일별 락 |

실제로 관찰한 핵심은 100 HTTP 요청의 새 TCP 연결 수가 100개에서 1개로 줄고,
서로 다른 파일의 초기화 대기가 전역 직렬화되지 않는다는 점이다. 주입한 지연이
있는 합성 실험이므로 위 비율을 실제 SeaweedFS의 처리량 향상 배수로 해석하면 안 된다.
브라우저에서 S3로 직접 전송하는 데이터 경로 전체의 성능을 측정한 것도 아니다.

## 4. 실행하지 못했거나 통과를 주장하지 않는 검증

- 전체 Go API/AWS SDK 통합 테스트와 `check.sh fast`: 필요한 Go 1.25.13
  다운로드가 DNS/네트워크 차단으로 실패했다. 새 SDK 어댑터/API를 포함한
  전체 백엔드 빌드 성공을 확인한 상태는 아니다.
- 전체 프런트 타입 검사와 React/Vitest 테스트: node_modules가 없어서
  vite/client, node 타입과 vitest를 찾지 못했다. 순수 helper 검사는 이와 별개다.
- Docker/Podman/rclone이 없어 실제 SeaweedFS 기동, Compose 런타임 해석,
  브라우저 단일/멀티파트 업로드, CRUD, CORS, 재기동 데이터 보존은 실행하지 못했다.
- 입력 ZIP에는 원래 릴리스 Git 태그가 없다. 태그 `0.21v-rc3`를 사용하는
  증빙 비교는 실행되지 못했다. 가짜 태그나 live 통과 증빙을 만들지 않았다.
  source-archive 모드의 gate는 Git scope/audit/checklist 동기화를 명시적으로
  건너뛴다. 이 결과를 릴리스 승인이나 실환경 통과로 간주하지 않는다.

## 5. 실행과 호환성 되돌리기

```bash
# 프로젝트 루트에서
DEMO_PUBLIC_HOST=127.0.0.1 ./scripts/compose.sh demo up --build -d --remove-orphans
DEMO_PUBLIC_HOST=127.0.0.1 ./scripts/compose.sh demo ps -a
DEMO_PUBLIC_HOST=127.0.0.1 ./scripts/compose.sh demo logs seaweedfs-seed s3desk-seed
```

UI는 8080, S3 API는 8333이다. 두 시더의 종료 코드가 0이어야 한다. LAN 접속은
DEMO_PUBLIC_HOST를 실제 서버 IP로 바꾼다. 기존 MinIO 객체는 자동 이관하지
않으며 기존 볼륨과 ENCRYPTION_KEY를 유지한다. 전환 목적으로 `down -v`를
실행하지 않는다. `--remove-orphans`는 같은 Compose 프로젝트의 오래된
컨테이너만 정리하며 해당 named volume을 이관하거나 삭제하지 않는다.

제공자 호환성을 비교해야 할 경우:

```bash
DEMO_PUBLIC_HOST=127.0.0.1 S3_NATIVE_LIST=false \
  ./scripts/compose.sh demo up --build -d
# 객체 화면을 새로고침하여 기존 s3v2 토큰을 버린다.
```

기본값은 true다. CLI에서는 `--s3-native-list=false`를 쓸 수 있다. 이 스위치는
목록 구현만 되돌리고 HTTP 풀/파일별 잠금 수정과 SeaweedFS 구성은 유지한다.
모드를 바꾼 뒤 기존 native 토큰으로 요청하면 새로고침을 안내하는 오류를 반환한다.

## 6. 재현 명령 및 실제 스택 확인 항목

```bash
python3 scripts/check_demo_seaweedfs_test.py
python3 scripts/check_seaweedfs_unified_test.py
./scripts/check_backend_performance_offline.sh test
./scripts/check_backend_performance_offline.sh bench
node --experimental-strip-types --test scripts/frontend_pagination_offline.test.mjs

# Go 1.25.13, npm 의존성 및 컨테이너 사용 가능 환경에서
(cd backend && go test -race ./internal/api ./internal/s3client ./cmd/server)
(cd frontend && npm ci --no-audit --no-fund && npm run typecheck)
(cd frontend && npm run test:unit -- src/pages/objects/__tests__/useObjectsPageQueries.test.ts src/pages/objects/__tests__/useObjectsTree.test.tsx)
./scripts/run_live_e2e_local.sh
./scripts/run_portable_sqlite_to_postgres_smoke.sh
```

실제 환경에서는 목록 첫/후속 페이지의 서버 지연, 여러 파일의 multipart
초기화 지연, CPU/메모리/열린 연결 수, S3 오류 및 재시도를 같은 부하로
변경 전후 비교해야 한다. 한글·공백·플러스·퍼센트 키, 폴더 marker, 빈 필터링
페이지, 동시 생성/삭제 상황, 로컬/LAN/custom port, 잘못된 자격 증명,
취소/재개와 재기동 데이터 보존도 확인 대상이다. 측정 전에는 사용자 환경의
실제 p95 지연 또는 전송 대역폭 수치를 제시하지 않는다.

## 참고한 공식 근거

- Go `net/http` 문서: Client/Transport 재사용 및 동시 사용,
  https://pkg.go.dev/net/http#Transport
- S3 ListObjectsV2: opaque continuation token, MaxKeys, encoding-type,
  https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
- 사용 중인 AWS SDK operation 정의,
  https://github.com/aws/aws-sdk-go-v2/blob/service/s3/v1.97.3/service/s3/api_op_ListObjectsV2.go
- SeaweedFS 4.47 서버 옵션 및 기존 데모 설정 근거,
  https://github.com/seaweedfs/seaweedfs/blob/4.47/weed/command/server.go
