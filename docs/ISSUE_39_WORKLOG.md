# Issue #39 작업 현황

기준: 2026-09-27, [사용자 이슈 #39](https://github.com/homelabird/s3desk/issues/39).
현재 worktree의 로컬 변경과 검증 기록이다. 배포·공급자 검증·이슈 전체 완료 기록이 아니다.

## 항목별 분석과 진행

| 항목 | 코드에서 확인한 내용 | 이번 변경 / 남은 작업 |
|---|---|---|
| S3D-001 다국어 업로드 | Direct multipart 및 chunk 전송이 상대 경로를 HTTP 헤더에 그대로 넣어 Latin-1 검증에서 실패한다. | UTF-8 percent encoding과 명시적 encoding 헤더를 추가했다. 서버는 표시된 요청만 한 번 복원하고 기존 unencoded 클라이언트는 그대로 받는다. OpenAPI·생성 타입·CORS를 함께 변경했다. 실제 공급자 업로드·조회·실패 후 복구 검증은 남았다. |
| S3D-002 WebSocket | CONNECTING 중 cleanup 또는 1.5초 fallback timer가 close를 호출할 수 있다. WS 실패 후 SSE fallback, 재연결 sequence, 연결 중단 polling 구현이 존재한다. | timeout 후 close 이벤트에 의존하던 SSE 전환과 late-open 상태 덮어쓰기를 보완했다. Jobs/Transfers 단위 테스트 30개 통과. 보고된 경고의 실제 원인은 아직 미확정이다. 느린 handshake·빠른 화면 전환·서버 로그·실제 Transfers 상태 갱신을 연결해 재현해야 한다. 경고를 숨기기 위한 변경은 하지 않았다. |
| S3D-003 MP4 썸네일 | Grid는 목록 메타데이터, 큰 미리보기는 독립적인 `/objects/meta` 응답을 사용한다. 서버는 thumbnail 생성 전에 다시 stat한다. ffmpeg 누락은 400 `thumbnail_engine_missing`, 지원 대상의 decode 실패는 이번 수정 후 415 `thumbnail_decode_failed`로 구분된다. 추가로 256MB 이하 tail-index MP4가 pipe 입력에서 실패하고 seekable fallback 없이 끝나는 결함을 실제 ffmpeg로 재현했다. | 작은 영상의 pipe decode 실패 시 기존 임시 파일 디코더를 재사용하도록 수정했다. 실제 ffmpeg로 만든 MP4를 48/360px HTTP 썸네일 요청으로 디코딩해 JPEG 응답을 확인했다. rclone 전송은 테스트 hook이므로 provider 증거가 아니다. 늦은 폴더 응답이 선택한 영상에 반영되지 않는 로컬 회귀 테스트도 추가했다. 제보된 원본 객체의 415 본문과 실제 stat 불일치 원인은 남았다. |
| S3D-004 Favorites | 빈 keys를 `append([]string(nil), keys...)`로 복사해 JSON null을 반환한다. 클라이언트 pagination의 spread가 TypeError를 내고 공통 오류 안내가 Network error로 분류한다. | 서버 빈 배열을 보장하고 클라이언트 양쪽 hydrate 경로에 배열/항목 검증을 추가했다. 잘못된 응답은 빈 목록으로 숨기지 않고 데이터 오류로 표시한다. API·hook 39개 테스트 및 Go 테스트 통과. |
| S3D-005 중복 체크 | 실제 Checkbox 외에 별도 ✓ span이 존재한다. 모바일에서는 Checkbox 자체를 숨긴다. | 별도 span/CSS를 삭제하고 모바일도 기존 Checkbox 하나를 사용한다. 선택 버튼과 접근성 상태는 유지한다. 데스크톱 렌더 및 모바일 선택·해제 흐름 확인. |
| S3D-006 6열 Grid | container 계산이 desktop 최소 8열이고 최대 제한이 없다. Grid 이미지 요청은 48px, 미디어 영역은 64px이다. | desktop 6열, 좁은 화면은 기존 가변 열 수를 유지한다. 이미지 요청 160px, regular 미디어 영역 120px로 확대했다. CSS와 virtualizer가 같은 열 수 계산을 사용한다. 1280/1366/1440/1920px의 simple/advanced 8개 사례, 둘째 행·가상화 및 Navbar 복원 검증 통과. |
| S3D-007 Details overflow | 1201px 이상 창에서 breadcrumb와 controls를 고정 최소 폭 칼럼으로 나누고, 내부 controls도 최소 220px 검색 칼럼을 강제한다. 창이 넓어도 pane이 좁으면 넘칠 수 있다. | 바깥 고정 칼럼 분할을 제거하고 내부 검색·버튼을 flex wrap으로 배치한다. 1920px 고정 창에서 Details 및 Navbar 반복 토글, 컨트롤 경계·겹침 및 List/Grid 조작 검증 통과. |
| S3D-008 Navbar 토글 | desktop 토글이 page Header 안에 있고 Sidebar가 0px로 접힌다. | 토글을 Sidebar 브랜드와 같은 상단 행으로 이동했다. 접힌 48px rail에서 동일 버튼과 포커스를 유지한다. 모바일은 기존 drawer trigger를 유지한다. 위치·키보드·재로딩 복원 및 모바일 포커스 테스트 통과. |
| S3D-009 정책 신뢰성 | 검증 전용 경로에 provider switch가 있으나 PUT 경로는 그 함수를 거치지 않는다. 기존 static validator 자체도 warning 위주의 미완성 검증이다. | PUT에 provider validator를 강제했다. GCS ETag 필수·충돌/부분 적용 보고·조회 응답 검증, Azure ARM versioning 및 생성 사전 검사, AWS 미확인 ownership 처리와 각 공급자 필드 검증을 보완했다. 공식 규칙 전체 매트릭스·효과 확인·추적 가능한 감사 정보·실제 공급자 증거는 미완료다. 세부 수정과 검증은 아래 기록을 따른다. |

## 현재 완료 판정과 다음 작업

이전 중단 이후 사용자 요청으로 작업을 재개했다. 아래 잔여 목록과 문서 끝의 추가 기록을 기준으로 진행한다. 마지막 백엔드 전체 테스트와 `git diff --check`는 통과했으며, 커밋·푸시·배포는 하지 않았다.

2026-09-27 현재 코드를 다시 대조했다. 이슈 전체는 **미완료**이며 아래는 완료 증거를 대체하지 않는 잔여 작업 목록이다.

| 요구 | 현재 확인한 증거 | 남은 작업 / 완료에 필요한 증거 |
|---|---|---|
| 업로드·Favorites·선택·레이아웃 | 코드 수정, 단위/API 테스트, 기록된 Chromium 렌더 증거 | 다국어 업로드의 실제 공급자 저장·재조회·복구 확인 |
| WebSocket 복구 | timeout/late-open 단위 테스트 | 느린 실제 handshake와 화면 전환에서 경고 원인 및 Transfers 상태 갱신 재현 |
| MP4·메타데이터 | 합성 768,531,432바이트 tail-index 영상의 48/360px 디코딩, 늦은 폴더 응답 차단 테스트, null stat 차단 | 원본 영상, 실제 415 본문과 stat 결과로 제보 원인 확인 |
| 공급자별 입력 검증 | raw PUT/typed validator, HTTP 우회 회귀, 공식 근거 매트릭스 및 rules r21 | 실제 제품/버전 식별과 계정·조직·replication·lifecycle 조합의 공급자 수락/거부 검증; Ceph는 AWS로 대체 불가 |
| 저장 결과 비교 | versioning HTTP 전후 조회·상태 비교; AWS lifecycle 교체/삭제·ownership·public access, OCI visibility, Azure ACL 공개 범위/저장 정책은 adapter에서 제한 시간 재조회 및 비교 | AWS encryption, GCS typed IAM 및 metadata(protection/versioning/PAP), Azure soft delete의 재조회 비교를 추가했다. Azure immutability/legal hold도 최종 상태 재조회 비교를 추가했다. OCI retention/PAR 최종 목록 비교도 추가했다. raw policy 변경 경로도 최종 조회 비교와 본문 없는 관측 로그를 추가했다. raw 정규화와 typed 항목별 변경 전후 감사 관측도 연결했다. Azure ACL은 정책 목록 완전성·날짜 정규화·보존 필드도 확인하지만 실제 권한 효과와 동시 수정 방지는 별도 |
| UI 완료 표시 | raw/typed 쓰기 오류와 adapter의 unconfirmed를 오류로 전달하며 UI 재조회 실패도 성공 알림을 막음. 승인 화면은 설정 확인과 실효 권한을 구분 | 실제 공급자의 전파 지연·부분 적용·권한 효과와 UI 결과를 연결해 검증 |
| 동시 수정·승인 | GCS IAM ETag 필수와 409/412 처리, draft/scope 변경에 대한 기존 검증 무효화 | typed 19개 변경의 대상/전후값 승인, 고정된 요청, 승인 후 기준 상태 조회를 추가했다. raw 저장의 대상/diff 승인과 PUT/DELETE 기준 상태 재확인도 연결했다. provider 조건부 쓰기 범위 확대는 남음; CAS 없는 경쟁 조건은 유지된다. |
| 감사 추적 | policy_audit.go에 actor credential fingerprint/대상/request ID/rule version/접수 결과, versioning 상태 관찰 로그 | raw 및 typed 6개 항목에 민감값 제외 전후 요약·최종 관측을 연결했다. 요약에 없는 상세 차이, 개인 사용자 식별과 로그 보존은 현 배포 인증/로그 설정 범위 확인 필요 |
| 저장소 검사 | r21 전체 gate exit 0: backend/security/notices, frontend 269 files/1394 tests, build, Chromium smoke 2개 통과 | `/tmp/s3desk-issue39-r21-full.log`; 배포/공급자 증거는 아님 |
| 실환경·효과 | 로컬/가짜 공급자/합성 fixture 증거만 확보 | 승인된 격리 대상과 권한으로 허용·거부 동작, 저장 결과, 실패·충돌 시나리오 검증 |

다음 단계는 **격리된 실제 공급자 환경과 원본 장애 대상에서 남은 완료 조건을 확인하는 것**이다. 설정 경로, 제보 서비스 주소 및 원본 MP4 위치를 요청했으나 아직 확보되지 않았다. 로컬 fixture 성공으로 이 증거를 대체하지 않는다. 공식 매트릭스의 환경별 제약과 경쟁 조건은 계속 미검증으로 유지한다.

## S3D-002 추가 수정

Jobs와 Transfers의 handshake timeout이 `ws.close()` 후 close 이벤트에만 의존했다.
이벤트가 지연되거나 close가 실패해도 기존 disconnect 처리로 SSE 전환을 시작하도록
수정했다. 실패한 WebSocket의 늦은 open은 SSE 연결 상태를 덮어쓰지 않는다.
close 이벤트 없는 fixture와 late-open 회귀 테스트를 추가했다.
브라우저의 정상 CONNECTING cleanup 경고 제거 또는 실서버 복구 증거는 아니다.

## S3D-003 조사 단서

추가 확인: `ffmpeg -f lavfi -i testsrc2=size=320x240:rate=25 -t 3 -c:v mpeg4 -q:v 2`
로 생성한 일반 MP4는 moov 인덱스가 mdat 뒤에 있다. 기존 디코더와 같은 pipe 명령은
`partial file`로 실패했다. 수정 후 `TestThumbnailTailIndexedMP4WithRealFFmpeg`가
48/360px 둘 다 HTTP 200 및 유효 JPEG를 확인한다. ffmpeg 미설치 환경에서는 이 테스트를
명시적으로 skip하며 mock 성공으로 대체하지 않는다.

[rclone lsjson 공식 문서](https://rclone.org/commands/rclone_lsjson/)는 bucket 기반
backend의 `--stat`이 존재하지 않는 항목에도 빈 디렉터리를 반환할 수 있다고 설명한다.
현재 `rcloneStat`은 이 결과를 그대로 반환한다. 따라서 `inode/directory`와 size=0은
프론트엔드 상태 혼합 외에도 stat 대상 또는 존재 여부 문제일 가능성이 있다.
이는 조사 가설이며 사용자가 보고한 대상에서 확인한 원인은 아니다.

### 대용량 영상 테스트 증거의 추가 한계

`installThumbnailProcessHooks`의 `cat` mock은 인수의 `--offset`/`--count`를
해석하지 않고 매번 streamFactory 전체를 반환한다. 따라서 기존 큰 영상의 mock
성공은 실제 range 위치·길이 또는 seekable 복원 성공 증거가 아니다. 작은 MP4의
전체 파일 fallback 회귀는 이 한계와 별개로 실제 ffmpeg를 실행했다.
추가 검증 `TestThumbnailLargeTailIndexedMP4WithRealFFmpeg`는 실제 ffmpeg 영상의
mdat 뒤에 sparse free atom을 삽입해 정확히 768,531,432바이트로 만들고 tail moov를
유지한다. 별도 전송 hook은 offset/count를 io.SectionReader에 정확히 적용한다.
48/360px HTTP 요청 모두 200 및 JPEG decode에 성공했고 nonzero tail offset 읽기도
확인했다. 실행 명령: `go test ./internal/api -run TestThumbnailLargeTailIndexedMP4WithRealFFmpeg -count=1 -v`.
이는 크기와 tail index를 가진 합성 fixture 증거다. 원본 영상·실제 provider 전송·
메타데이터 불일치 원인을 재현한 것은 아니며, 큰 크기만으로 발생하는 실패라는
가설을 뒷받침하지 않는다.

### 썸네일 실패 분류

HTTP 415 상태는 유지하되, 지원 대상 image/video 종류의 디코딩 실패는
`thumbnail_decode_failed`로 구분한다. 객체 종류 자체가 미지원이면 기존
`unsupported`를 유지한다. decoder/attempts 상세 정보도 유지하며 메트릭은
`decode_failed`로 분리했다. OpenAPI 설명 및 생성 타입을 갱신했다.
이 분류는 잘못된 데이터·코덱 미지원·부분 읽기 부족을 서로 확정 구분하는 것은 아니다.

## S3D-009 현재 코드의 편집 범위

2026-09-27 `backend/internal/bucketgov/capabilities.go`, 각 provider adapter,
`backend/internal/bucketpolicy/service.go`를 대조했다. 아래는 구현된 호출 범위이며
실제 제품/버전별 검증 완료 또는 운영 지원 보장이 아니다. 모든 실제 공급자 증거는
환경 미설정으로 **SKIPPED / 미검증**이다.

| 프로필 / 제품 | Raw 정책 경로 | Typed governance 편집 항목 | 적용 범위 / 남은 식별 |
|---|---|---|---|
| AWS S3 | bucket policy JSON 읽기·교체·삭제 | Public Access Block, Object Ownership, versioning, default encryption, lifecycle | bucket; 실제 계정·region·권한 및 요청별 제약 검증 필요 |
| S3-compatible / Ceph 포함 | S3 bucket policy 읽기·교체·삭제 | raw policy capability만 활성화 | 실제 제품·Ceph 버전·endpoint 미확인; AWS 검증 결과로 대체 불가 |
| GCP GCS | IAM JSON 읽기·교체; 삭제 미지원 | IAM bindings/조건, 공개 접근, Public Access Prevention, uniform access, versioning, retention | bucket IAM 및 bucket metadata; 프로젝트·권한·uniform access 상태 확인 필요 |
| Azure Blob | container ACL을 publicAccess/storedAccessPolicies JSON으로 읽기·교체·초기화 | 공개 접근, stored access policy, versioning, soft delete, immutability | container ACL 외 account/service 및 ARM 범위가 있으므로 항목별 적용 리소스를 추가 대조해야 함 |
| OCI Object Storage | raw policy 미지원 | 공개 접근, versioning, retention, PAR | bucket 및 retention/PAR 하위 리소스; tenancy IAM 편집으로 해석하면 안 됨 |

공통 capability map에 존재한다는 이유만으로 각 provider의 모든 기능을 활성화하지 않는다.
예를 들어 S3-compatible의 typed versioning/encryption/lifecycle은 현재 활성화되지 않는다.
CORS는 이 governance capability 목록에 없으며 이번 정책 검증 완료 범위에 넣지 않는다.

이 표는 요구된 범위 식별의 코드 측 기준이다. API 버전·필드별 단위/경계·공식 근거·
환경 조건·실제 저장 결과를 결합한 완성된 공급자 검증 매트릭스는 아직 아니다.

## S3D-009 남은 작업

추가 수정: GCS `bindings[].members`의 scalar/object/null 및 비문자열 항목을 거부한다.
이전 `extractStringList` 사용은 scalar를 허용하고 잘못된 배열 항목을 조용히 버려
검증 성공으로 표시할 수 있었다. [GCS setIamPolicy 계약](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/setIamPolicy)의
문자열 배열 구조를 따른다. 7개 malformed fixture와 기존 정책 테스트가 통과했다.
이 검사는 principal 존재 여부나 실제 권한 효과를 검증하지 않는다.
추가로 GCS 정책 버전은 0/1/3, 조건부 정책은 version 3, condition 객체, title/expression 문자열,
선택 description 문자열을 서버에서 검사한다. 잘못된 버전·조건 fixture 10개와
version 누락 시 PUT이 provider 호출 전에 400을 반환하는 HTTP 회귀 검증을 추가했다.
CEL 구문·권한 효과는 공급자 검증 대상이며 로컬 성공으로 보장하지 않는다.
공통 GCS IAM 조회에는 `optionsRequestedPolicyVersion=3`을 추가했다.
[공식 getIamPolicy 계약](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/getIamPolicy)은
조건부 정책 조회에 이 버전을 요구한다. raw 정책과 typed governance 호출자가 같은
함수를 사용한다. 로컬 HTTP fixture가 버전 없는 GET을 거부하고, 정상 GET→PUT에서
condition/version/etag와 원문 보존을 검증한다. 실제 GCS 증거는 아니다.

추가 수정: GCS 폼이 원본 binding의 `condition`과 폼에 없는 필드를 보존한다.
초기 로드 및 JSON→폼 전환 후 members를 변경해도 조건을 유지하는 회귀 검증을 추가했다.
Azure 폼도 원본 필드를 유지하지만 공급자 변환 전체의 무손실 보장을 뜻하지 않는다.
GCS 조건이 있는 정책에서는 공개 접근 단축 토글을 비활성화하고 JSON 검토를 안내한다.
기존 토글이 조건부 binding에 allUsers를 추가할 수 있었기 때문이다.
조건 보존 테스트와 Modal 회귀 테스트를 함께 실행했다.

Azure 공통 ACL 조회는 malformed XML, 잘못된 root, ID 없는 항목을 빈 정책으로
성공 처리하지 않고 오류로 반환한다. raw policy와 typed governance가 이 함수를 공유한다.
[Azure Get Container ACL 계약](https://learn.microsoft.com/en-us/rest/api/storageservices/get-container-acl)에
따라 정상적인 빈 응답은 유지했다. 로컬 HTTP fixture 검증이며 실제 Azure 증거는 아니다.

추가 수정: 정책 삭제 확인을 연 뒤 draft가 변경되면 기존 확인으로 삭제하지 않는다.
현재 editor의 입력과 busy 상태를 확인하고, 변경된 입력은 재검토·재확인을 안내한다.
기존 닫기/재열기 stale callback 보호와 함께 Modal 회귀 테스트로 검증한다.

Azure stored policy의 start/expiry/permission이 제공되면 문자열이어야 한다.
기존 검증은 null 및 다른 타입을 무시했고, Go JSON decode는 null을 빈 문자열로
받아 기존 제한값이 생략될 수 있었다. 잘못된 타입 15개와 직접 PUT의 null 필드
3개를 차단하는 검증을 추가했다. 필드 자체의 생략은 기존 계약대로 유지한다.

검증 버튼의 `Validate with provider` 표시는 실제 정적 검사 구현과 달랐다.
`Run static checks`로 변경하고 성공 상태에도 공급자 수락·권한 효과가 미검증임을
표시한다. 실제 API는 공급자 호출 없이 구조만 검사하며 이 변경은 검증 범위를
확대하지 않는다. Modal/decision guide/feedback 단위 테스트 29개와 타입 검사 통과.

AWS Object Ownership 조회의 누락/알 수 없는 응답을 BucketOwnerEnforced로 바꾸는
서버 기본값을 제거했다. 명시적 설정 없음은 objectOwnership 생략 및 warning으로,
잘못된 성공 응답은 오류로 반환한다. 공식 근거:
https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketOwnershipControls.html
확인일 2026-09-27. bucketgov 전체 테스트 통과(로컬 fixture).
프론트엔드도 mode 누락 시 빈 선택 상태를 유지한다. 미설정 안내와 함께 Save를
비활성화하고 사용자가 명시적으로 모드를 선택해야 요청을 보낸다. mutation에도
빈 값 guard를 적용했다. 미설정→명시적 선택→정확한 PUT payload를 회귀 검증한다.
이는 실제 AWS 권한 효과나 공급자 통합 검증을 대체하지 않는다.

Raw 정책 저장/삭제 실패 후에도 policy 및 연결된 GCS/Azure governance 조회를
무효화해 현재 상태를 다시 읽는다. typed governance에 이미 있던 실패 후 재조회와
동일한 방향이다. 입력 draft를 보존하고 변경 요청을 자동 재시도하지 않는다.
이는 적용 결과의 자동 대조·부분 적용 판정 전체 구현은 아니며 그 작업은 남는다.

Raw 정책 저장/삭제의 성공 응답 뒤 재조회 실패를 더 이상 성공 toast와 editor 닫기로
처리하지 않는다. 요청은 수락됐으나 현재 상태 확인이 안 됐다고 안내하고 draft를
유지한다. 재조회 성공은 읽기 성공만 뜻하며 입력과 의미적으로 동일한지 자동 대조하는
구현은 아직 남는다.

S3 Statement.Effect는 필수이며 정확히 Allow/Deny여야 한다. 누락은 이전에 warning,
임의의 문자열은 성공 처리됐으므로 공통 서버 검사에서 오류로 변경했다.
공식 근거(2026-09-27): https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_effect.html
AWS/S3-compatible 경로의 정상/잘못된 타입·대소문자·공백 사례 및 직접 PUT 차단을
검증한다. 이 공통 구조 검사는 Ceph 제품별 지원 기능·권한 의미 검증을 대체하지 않는다.

S3 Statement의 Action/NotAction, Resource/NotResource, Principal/NotPrincipal은
각 쌍 중 하나만 필수로 허용한다. 기존 검사는 정상 Not*를 누락 경고로 표시하고,
실제 누락·양쪽 동시 지정도 차단하지 않았다. 12개 정상/부정형/누락/중복 fixture를
추가했다. 근거(2026-09-27):
https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_grammar.html
이는 키 조합 검사이며 각 값의 공급자별 의미 검증은 별도다.

S3 Action/Resource 및 Not* 값은 비어 있지 않은 문자열 또는 문자열 배열인지
검사한다. Principal/NotPrincipal은 * 또는 비어 있지 않은 principal map이며 map의
ID 값도 같은 문자열 타입 검사를 적용한다. 42개 잘못된 타입 fixture와 정상
wildcard/AWS/Service principal 사례를 추가했다. 공식 IAM grammar의 값 구조를
근거로 하며 principal 실제 존재·액션/리소스 조합의 의미를 확인한 것은 아니다.

S3 최상위 Statement 누락도 warning에서 오류로 변경했다. 필수 statement block은
앞서 확인한 공식 IAM grammar에 따른다. 빈 배열·삭제 요청의 의미는 별도이며
이 변경은 Statement 키 자체의 누락을 차단한다.

GCS/Azure JSON을 폼으로 표시하기 전에 알려진 필드의 표현 가능성을 검사한다.
잘못된 members 항목·binding·etag 타입이나 알 수 없는 Azure visibility가 있으면
초기 화면을 원본 JSON으로 유지하고 폼 전환을 거절한다. filter/default 처리로
항목을 조용히 버리던 경로를 막았다. 상태/Modal 28개 및 추가 malformed 초기
로드 회귀 테스트와 타입 검사를 실행했다. 이는 전체 정책 의미 검증과 별개다.

Azure raw 정책의 알 수 없는 top-level/stored-policy 필드는 정적 검사에서 거부한다.
공통 azureacl 저장 decoder에도 DisallowUnknownFields와 단일 문서 검사를 적용해
변환할 수 없는 값을 버리고 저장하지 않도록 했다. permissions 오타·unknown
필드·후행 문서가 네트워크 요청 전에 실패하는 회귀 검증을 추가했다.
폼은 원본 필드를 보존하지만 공급자 계약에 없는 필드를 저장해 준다고 보장하지 않는다.

Azure raw PUT의 publicAccess 및 storedAccessPolicies는 명시적으로 요구한다.
누락을 private/빈 배열로 치환하지 않으며 빈 publicAccess도 거부한다. 명시적인
private + [] 초기화는 허용하고 별도 DELETE reset 동작은 유지한다. OpenAPI 설명과
생성 타입을 갱신했으며 누락·빈 값·null·명시적 초기화 6개 fixture를 검증한다.

Typed governance도 변경 성공 알림 전에 현재 설정 재조회를 기다리도록 보완했다.
조회 실패 시 요청 수락/상태 미확인을 안내한다. 화면 전환 뒤에는 원래 캐시를 갱신하되
새 화면의 알림/상태를 건드리지 않는다. 실패한 write의 기존 재조회도 유지한다.
저장값의 의미적 동등성 대조 및 실환경 권한 효과 확인은 여전히 별도 미완료다.

S3 Version이 제공되면 공식 grammar의 2008-10-17 또는 2012-10-17만 허용한다.
GCS etag가 제공되면 빈 값·null·비문자열은 오류로 차단한다. etag 누락은 기존
경고로 유지하므로 동시 수정 보호를 모든 요청에 강제한 것은 아니다. 정상/잘못된
버전·etag 13개 fixture와 기존 정책 검사를 실행했다.

GCS typed IAM 쓰기의 공급자 409/412를 bucket_policy_conflict(HTTP 409)로 구분한다.
기존 요청 etag가 있으면 최신 조회 etag로 교체하지 않음을 독립 fixture로 검증했다.
충돌 시 자동 재전송 없이 재조회·검토를 안내한다. etag 없는 요청의 최신값 fallback은
아직 존재하므로 전체 편집 세션의 동시 수정 보호를 완료한 것은 아니다.
Bucketgov 전체 테스트 통과, access/public-exposure OpenAPI 409 응답을 추가했다.

Raw GCS PUT의 409/412도 typed 경로와 동일한 bucket_policy_conflict(409) 및
재조회·검토 안내로 매핑한다. 기존 upstream 진단 redaction은 유지한다.
응답 매핑 회귀와 관련 정책 테스트 통과; raw PUT OpenAPI 409 응답/생성 타입 갱신.

1. 위 코드 범위 표를 API 버전·필드별 제약·공식 근거·환경 조건까지 확장한다.
   현재 raw policy switch는 AWS/S3-compatible, GCS IAM, Azure container policy를 다룬다.
   OCI는 raw policy가 아니라 별도 typed governance 경로를 조사해야 한다.
2. static validator의 허용/거부 규칙을 공식 문서 및 독립 fixture와 대조한다.
   S3 필수/상호배타/기본 타입, GCS members/조건, Azure 누락·unknown 필드는 보완했다.
   남은 규칙은 S3 Condition의 구조·의미와 principal 종류, GCS principal/role
   조합, Azure permission 순서/시간 조합·provider별 typed 설정의 범위/단위 등이다. Ceph를 AWS와 동일한 지원으로 가정하지 않는다.
3. 폼 필드 보존·입력 변경 시 검증 무효화·stale 삭제 승인·실패 후 재조회는 보완했다.
   남은 핵심은 외부 동시 수정에 대한 공급자 조건부 변경, 승인 당시 기존 상태의
   일치 확인, 저장 후 요청값과 읽은 값의 의미적 대조, timeout 결과 불명과 부분 적용의
   지속적인 상태 표시, 민감정보를 제외한 변경 전후/규칙 버전/작업자 감사 기록이다.
   현재 재조회 성공은 효과 확인이나 요청 내용과의 동등성 증거가 아니다.
4. provider별 권한·실패·경계·경쟁 조건 테스트를 추가하고 격리 환경에서
   실제 저장 상태 및 허용/거부 효과를 확인한다. 단순 listing smoke는 정책 검증이 아니다.
5. 실제 공급자 검증이 없으므로 운영 준비 완료로 판정하지 않는다.
   이번 preflight에서 AWS/GCS/Azure/OCI/Ceph의 필수 환경값이 모두 미설정이다.
   자격증명을 출력하거나 운영 정책을 시험 변경하지 않았다.

## 실행한 검증

- 최신 누적 정책 UI: `npm run test:unit -- src/pages/buckets/__tests__ src/pages/buckets/governance/mutationScope.test.tsx` 22개 파일·110개 테스트 통과.
- 누적 Go 검사에서 bucketgov/azureacl/gcsiam 통과. API는 GCS version 오류 문구의 이전 HTTP 기대값 1개가 실패해 새 계약 문구로 갱신했다. 이후 `go test ./internal/api -count=1` 전체 재실행 통과(25초).

- GCS raw HTTP 충돌 회귀: `go test ./internal/api -run 'TestRawGCS' -count=1 -v` 2개 통과. 로컬 HTTP 서버로 편집 당시 etag 전달, provider 412 → API 409 `bucket_policy_conflict`, 요청 1회(자동 재시도 없음)를 확인했다. 실제 GCS 증거는 아니다.
- 충돌 응답 OpenAPI 갱신 후 `npm run check:openapi`: 통과.
- 충돌 회귀 추가 후 `go test ./internal/api ./internal/bucketgov ./internal/azureacl ./internal/gcsiam -count=1`: 4개 패키지 모두 통과. `git diff --check`: 통과.

- 최신 누적 정책/재조회 변경: `npm run test:unit -- src/pages/buckets/__tests__ src/pages/buckets/governance/mutationScope.test.tsx` 21개 파일·107개 테스트 통과.
- 같은 상태의 `go test ./internal/api ./internal/bucketgov ./internal/azureacl ./internal/gcsiam -count=1`: 모두 통과.

- Azure 명시적 필드 계약 및 정책 폼 보존 변경 후 `npm run check:openapi`, `npm run lint`: 통과.

- 누적 정책 UI 수정 후 `npm run test:unit -- src/pages/buckets/__tests__`: 20개 파일, 103개 테스트 통과.
- S3 타입 검사까지 `go test ./internal/api ./internal/bucketgov ./internal/bucketpolicy -count=1`: 통과(bucketpolicy 테스트 없음).

- AWS 조회/UI 변경 후 `go test ./internal/api ./internal/bucketgov ./internal/gcsiam ./internal/azureacl -count=1` 및 frontend `npm run lint`: 통과.

- 누적 정책·실시간 수정 후 `cd frontend && npm run lint`: ESLint, CSS token, import cycle 검사 모두 통과.

- 실시간 fallback 수정 후 Jobs/Transfers 단위 테스트: 30개 통과. `npm run typecheck` 통과.
- 삭제 승인 입력 변경 회귀 포함 Modal 테스트: 23개 통과. 안내 추가 후 삭제 관련 2개 재통과.

- GCS 조회 버전 수정 후 `cd backend && go test ./internal/gcsiam ./internal/bucketgov ./internal/api -count=1`: 모두 통과.

- Azure 응답 검증 수정 후 `cd backend && go test ./internal/azureacl ./internal/bucketgov ./internal/api -count=1`: 통과.
- 정책 필드 보존 수정 후 frontend 정책 상태·Modal 단위 테스트 및 `npm run typecheck`: 통과.

- 추가 `cd backend && go test ./internal/api -run 'TestThumbnailTailIndexedMP4WithRealFFmpeg|TestHandleGetObjectThumbnail' -count=1 -v`: 7개 통과. 실제 ffmpeg 회귀 테스트 실행됨(skip 아님).
- 영상 fallback 수정 후 `go test ./internal/api -count=1`: 통과.
- GCS 타입 검증 수정 후 `go test ./internal/api -run 'Test.*BucketPolicy|TestGCSMembers' -count=1`: 통과.

- `cd backend && go test ./internal/api ./internal/bucketpolicy -count=1`: 통과.
  API package 전체; bucketpolicy package에는 독립 테스트가 없다.
- `cd frontend && npm run test:unit -- src/api/__tests__/objects.test.ts src/pages/objects/__tests__/useObjectsFavorites.test.tsx`: 39개 통과.
- `npm run test:unit -- src/api/__tests__/uploads.domain.test.ts`: 11개 통과.
- `npm run test:unit -- src/pages/objects/__tests__/objectsGridLayout.test.ts src/pages/objects/__tests__/useObjectsObjectGridRenderer.test.tsx`: 24개 통과.
- `npm run test:unit -- src/components/transfers/__tests__/useTransfersUploadJobEvents.test.tsx src/pages/objects/__tests__/useObjectPreview.test.tsx`: 20개 통과.
- `npm run test:unit -- src/pages/objects/__tests__/ObjectsListContent.test.tsx src/pages/objects/__tests__/ObjectsListControls.test.tsx src/__tests__/FullAppInner.smoke.test.tsx`: 13개 통과.
- `npm run typecheck`, `npm run lint`, `npm run gen:openapi`, `npm run check:openapi`: 통과.
- `npx playwright test tests/objects-layout-density.spec.ts --project=chromium --grep 'Dense object grid' --workers=2`: 기존 변경 검증 9개 통과.
- 추가 `--grep 'keeps controls usable'`: Details 반복 토글 검증 1개 통과.
- `PLAYWRIGHT_WEB_SERVER_PORT=18081 npx playwright test tests/objects-mobile-responsive.spec.ts --project=mobile-iphone-13 --grep 'four-column grid|toggles separate grid|restores navigation focus'`: 3개 통과. Chromium 모바일 에뮬레이션이며 실기기 증거가 아니다.
- `./scripts/check.sh fast`: 실패. 변경하지 않은 `check_demo_seaweedfs_test.py`의
  `test_missing_or_invalid_public_host_is_rejected`가 실패했다. 테스트는 미지정 host를
  거부하도록 기대하지만 `scripts/compose.sh`는 `0.0.0.0`을 기본값으로 허용한다.
  따라서 broad gate 전체 통과가 아니며 이 단계 뒤 검증은 별도 명령의 범위만 확인했다.
- `python3 scripts/check_live_evidence_env.py --scope aws --scope azure --scope ceph --scope gcs --scope oci --format markdown`: 필수 설정 누락으로 exit 1. 실제 provider 테스트 미실행.

로컬 화면 확인: `/tmp/s3desk-issue39-grid.png`, `/tmp/s3desk-issue39-details.png`.
커밋·push·배포·이슈 댓글 작성은 수행하지 않았다.

### Azure 저장 정책 ID 제약 보완

- 공식 [stored access policy 문서](https://learn.microsoft.com/en-us/rest/api/storageservices/define-stored-access-policy)의 고유 ID·최대 64자 제약을 raw static validator에서 오류로 처리한다. 길이는 UTF-8 바이트가 아닌 문자 수로 검사한다.
- raw/typed가 공유하는 Azure XML 저장 경로에서도 빈 ID, 길이 초과, 중복 ID, 5개 초과를 요청 전에 거부한다. 기존 빈 ID 항목을 조용히 버리던 경로를 제거했다.
- ID 비교는 기존 저장 경로의 공백 제거와 일치하며 대소문자는 구분한다. 64자 경계, 다국어 ID, 65자, 중복·대소문자 구분 회귀를 추가했다.
- 권한 문자열의 공급자 버전별 허용 집합·순서 및 시간 조합 검증은 아직 남아 있다.

- 위 변경 후 `go test ./internal/azureacl ./internal/api ./internal/bucketgov -count=1`: 세 패키지 모두 통과. `git diff --check`: 통과.

### Azure Blob 권한 문자 검증 및 UI 보존

- [공식 service SAS 권한 표](https://learn.microsoft.com/en-us/rest/api/storageservices/create-service-sas)에 따라 현재 요청 버전 2020-10-02의 Blob 권한 문자를 허용한다. Queue 전용 u·대문자·중복은 거부한다. raw static 검사, typed 검증, 공통 XML 저장이 같은 검사 함수를 사용한다.
- frontend raw/생성 입력 검사와 governance 체크박스도 같은 문자 집합으로 맞췄다. Process로 잘못 표시하던 p는 Permissions로 바꿨다.
- governance 조회/저장 정규화는 기존 문자열을 보존한다. 기존 미지원 문자를 조용히 삭제하지 않으며 서버가 거부한다. 체크박스로 변경할 때도 미지원 문자를 남긴다.
- 이것은 문자/중복 검사다. 계정 HNS·SAS 자원별 실제 효과, 권한 순서 전체 검증, 시간 형식/조합은 별도 미완료 항목이다.

- 검증: `go test ./internal/bucketgov ./internal/azureacl -count=1`, API Azure 집중 테스트, frontend governance/권한 보존 25개 테스트, `npm run typecheck`, `git diff --check` 통과.
- 최초 API 전체 실행은 변경된 오류 문구의 이전 기대값에서 실패했고 기대값 수정 후 Azure 집중 검사를 통과했다. 최초 frontend 정책 테스트는 105개 통과·1개 정렬 기대 실패였으며 체크박스 정렬 수정 후 관련 25개를 재검증했다.

- 위 frontend 수정 후 `npm run lint`: ESLint·CSS token·import cycle 검사 모두 통과.

### Azure ID 검증 경로 일치

- typed `ValidateAccessPut`도 64문자 제한을 요청 처리 전에 적용한다. raw/XML 경로와 달랐던 대소문자 변환을 제거했다.
- raw UI·생성 UI·governance 직렬화도 공백 제거 후 대소문자 구분, Unicode 문자 수 제한으로 맞췄다. governance 중복 ID는 저장 호출 전에 거부한다.
- `go test ./internal/bucketgov -count=1`, frontend ID 보존/생성 모달 9개 테스트, `npm run typecheck`, `git diff --check` 통과.

### GCS 정책 버전 검사

- 조건이 없는 정책에서도 제공된 version은 숫자 0/1/3만 허용한다. 문자열, null, 소수, 2/4/음수는 저장 전 static 검사에서 거부한다. 무조건부 정책의 생략은 허용한다.
- 조건부 binding은 version 3을 요구한다. Cloud Storage 문서의 “3 or greater”만 적용하던 검사를 [IAM Policy 명세](https://docs.cloud.google.com/iam/docs/reference/rest/v1/Policy)의 실제 허용 버전 집합과 함께 적용했다.
- `go test ./internal/api -run 'TestGCS|TestValidateBucketPolicy' -count=1`: 통과. etag 누락에 대한 전체 동시성 보장, principal/role 및 CEL 의미 검증은 미완료다.

### GCS 폼 버전 보존

- GCS form builder의 `gcsVersion || 1`을 제거해 명시적 version 0이 1로 바뀌지 않게 했다. 폼 변환 허용 버전도 서버와 같은 0/1/3으로 맞췄다.
- 잘못된 버전은 JSON 편집 상태를 유지하며 서버 검증에서 거부된다. 지원 버전별 round trip 및 문자열/null/소수/미지원 버전 회귀 4개 테스트 통과. `git diff --check` 통과.

### GCS typed binding 기본 검증

- typed Access의 기존 validator가 GCS role/members를 검사하지 않아 공백 principal이 adapter의 compactStrings에서 사라질 수 있었다. 빈 role, 빈 members, 공백 member를 validator에서 거부한다.
- raw 정책의 빈 binding.members도 경고에서 오류로 바꿨다. 전체 bindings=[]를 통한 명시적 비우기는 별도 동작으로 유지한다.
- `go test ./internal/bucketgov ./internal/api -run 'TestGCS|TestValidateBucketPolicy|Test.*Access' -count=1`: 통과. 최초 추가 fixture는 오류 필드명 기대에서 실패해 오류에 binding.members 경로를 명시했다.

### GCS 조건 객체 검사 통일

- `gcsiam.ValidateCondition`을 raw/typed에서 공유한다. 객체 여부, title/expression 필수 문자열, description/location 선택 문자열을 검사한다. CEL 구문/효과 검증은 아니다.
- typed 경로의 null은 조건 없음으로 조용히 변환되기 전에 거부한다. 조건 생략은 허용한다. 9개 typed fixture를 추가했다.
- `go test ./internal/bucketgov ./internal/gcsiam -count=1` 전체 및 API GCS/정책 집중 검사 통과. create_defaults_live_test의 가짜 HTTP GCS fixture가 expression 없이 성공을 기대하던 것을 유효 조건으로 수정했다. 파일명과 달리 실제 GCS 증거가 아니다.

### GCS typed UI의 빈 조건 보존

- 빈 condition 객체를 disabled로 바꾸어 저장 시 누락시키던 변환을 수정했다. 객체가 있으면 조건 편집을 활성화하며 필수 title/expression을 요구한다. 사용자가 명시적으로 조건을 끄는 동작은 유지한다.
- members가 비어 있는 binding은 직렬화 단계에서 차단한다. bindings=[]로 전체를 비우는 동작은 별도 유지한다.
- GCS 회귀/거버넌스 모달 26개 테스트, `npm run typecheck`, `git diff --check` 통과.

### S3 Condition JSON 구조 검사

- [IAM grammar](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_grammar.html)의 연산자→키→값 구조를 static validator에서 검사한다. null/배열 Condition, 비객체 연산자 값, 빈 키 객체/값 배열, 중첩 객체/배열 값을 거부한다.
- 문자열뿐 아니라 JSON 숫자·boolean과 빈 문자열 값도 허용한다. 연산자별 값의 의미나 실제 접근 효과는 이 검사로 증명하지 않는다. S3-compatible 제품별 연산자 지원 여부도 별도 미검증이다.
- S3/정책/직접 PUT 집중 Go 테스트 및 `git diff --check` 통과. 독립 Condition fixture 12개 추가.

- S3 Condition 실제 HTTP PUT 경로 회귀 추가: AWS/S3-compatible 모두 잘못된 조건 4종이 provider 서비스 없이 400을 반환한다. 정상 Bool=false 조건은 요청 준비 과정에서 그대로 유지된다. `go test ./internal/api -run TestS3Condition -count=1 -v` 2개 테스트 및 `git diff --check` 통과. 실제 공급자 호출/권한 효과 증거는 아니다.

### GCS 공개 읽기와 조건부 binding 분리

- `gcsEnsurePublicRead`가 동일 역할의 조건부 binding에 allUsers를 추가하거나 조건부 allUsers를 보고 완료로 판단하던 오류를 수정했다. 조건부 binding은 그대로 보존하며 무조건부 objectViewer binding만 재사용/추가한다.
- 기존 사용자·allUsers 조건부 binding 보존과 반복 호출 중복 방지 회귀를 추가했다. `go test ./internal/bucketgov -count=1` 전체 통과. 실제 GCS 공개 접근 효과는 검증하지 않았다.

### GCS null 조회 응답 차단

- typed IAM 조회에서 HTTP 200 + JSON null이 Go zero-value 정책으로 디코딩되어 빈 접근 설정으로 표시되거나 다음 저장의 기반으로 쓰이던 문제를 수정했다. null은 upstream decode 오류로 처리한다.
- Access 조회 및 Access/PublicExposure 변경이 오류로 끝나고 provider 쓰기 호출이 0회인 회귀를 추가했다. `go test ./internal/bucketgov -count=1` 전체 통과.

### GCS 조회 클라이언트 미구성 오류

- IAM getPolicy 미구성을 빈 정책 성공으로 반환하지 않고 upstream 구성 오류로 반환한다. 조회 없이 저장으로 진행할 수 없도록 한다.
- 조회 실패 및 쓰기 0회 회귀 추가. 기존 Protection/Versioning 테스트가 PublicExposure도 조회하면서 IAM 클라이언트를 생략하던 fixture에는 명시적 빈 정책 응답을 추가했다.
- `go test ./internal/bucketgov -count=1` 전체 및 `git diff --check` 통과.

### GCS metadata 불명 상태 처리

- 버킷 metadata 조회 클라이언트 미구성 또는 HTTP 200/null을 빈 metadata 성공으로 반환하지 않는다. Protection/Versioning이 기본 disabled 값으로 표시되는 것을 차단한다.
- 두 상황의 조회 오류 회귀를 추가하고, 기존 공개 접근 테스트에 실제로 필요한 metadata 응답을 명시했다. `go test ./internal/bucketgov -count=1` 전체 통과.

### Azure 알 수 없는 공개 접근 응답 차단

- 공통 Azure ACL 조회가 미지원 x-ms-blob-public-access 값을 반환하면 오류로 처리한다. typed normalizer에서 이를 private으로 바꾸는 경로에 도달하지 않는다. 헤더 생략은 Azure 계약대로 private이며 blob/container는 유지한다.
- 로컬 HTTP 응답 4종 회귀 및 `go test ./internal/azureacl ./internal/bucketgov -count=1` 전체 통과. 실제 Azure 상태 증거는 아니다.

### Azure typed 조회 불명 상태 차단

- getPolicy 미구성은 panic 대신 구성 오류로, JSON null은 private/빈 정책 대신 decode 오류로 처리한다.
- 두 상황에서 Access/PublicExposure 조회가 실패하고 후속 Access 쓰기 호출이 0회임을 검증했다. `go test ./internal/bucketgov -count=1` 전체 통과.

### Azure ARM 실패 시 불변성 보호 상태 유지

- 컨테이너 properties에서 확인한 HasImmutabilityPolicy를 초기 enabled 값으로 사용한다. ARM 상세 조회가 실패하면 확인된 보호 상태를 false로 바꾸지 않으며 Editable=false와 원인을 반환한다.
- 기존 ARM 실패 회귀에 enabled 유지/편집 금지 단언을 추가했다. `go test ./internal/bucketgov -count=1` 전체 통과.
- 이 변경 직전까지 누적 조회 오류 수정의 `go test ./internal/api ./internal/bucketgov ./internal/azureacl ./internal/gcsiam -count=1`도 4개 패키지 모두 통과했다.

### Azure 불변성 편집 제한 UI 검증

- editable=false에서 기존 request builder가 immutability 변경을 보내지 않고 softDelete만 보내는 것을 회귀 검증했다(enabled true/false 모두).
- 편집 불가 안내가 무조건 자격증명 누락으로 단정하지 않도록 조회 경고/ARM 구성 확인 및 재조회 안내로 수정했다. Azure 순수 회귀 테스트 3개와 `git diff --check` 통과.

### Azure ARM 불변성 null 응답

- 불변성 조회와 저장 응답의 JSON null을 정상 zero-value 정책으로 사용하지 않고 decode 오류로 반환한다. 조회 실패는 앞서 추가한 편집 제한 경로로 전달된다. 저장 응답 오류는 요청 미적용을 뜻하지 않으며 기존 실패 후 재조회 경로에서 실제 상태를 확인한다.
- 조회/저장 null 회귀와 `go test ./internal/bucketgov -count=1` 전체 통과.

### Azure 불변성 조회 클라이언트 누락과 실제 부재 구분

- ARM 조회 클라이언트 미구성을 정책 없음(nil 성공)으로 처리하지 않는다. 실제 404만 기존 정책 부재로 다룬다.
- ARM 프로필은 있으나 조회 클라이언트가 없는 상태에서 PutProtection이 생성 요청을 보내지 않음을 검증했다. `go test ./internal/bucketgov -count=1` 전체 통과.

### Azure Blob service properties null 차단

- JSON null을 빈 서비스 설정으로 처리하지 않아 버전 관리의 false 표시 및 soft delete 변경 시 기존 설정 유실 가능성을 차단한다.
- 버전 조회 실패, soft delete 변경 실패, 서비스 쓰기 0회 회귀 및 `go test ./internal/bucketgov -count=1` 전체 통과.

### Azure container properties 불명 상태

- 컨테이너 properties 조회 미구성 및 JSON null을 legal hold/불변성 false 값으로 처리하지 않고 조회 오류로 반환한다. 정상 service properties가 있어도 컨테이너 보호 상태를 모르면 Protection 조회가 실패한다.
- 두 실패 조건 회귀 및 `go test ./internal/bucketgov -count=1` 전체 통과.

### Azure legal hold 조회 오류 구분

- ARM 컨테이너 조회 클라이언트 미구성·JSON null을 legal hold 없음/빈 태그로 처리하지 않는다. 오류가 기존 legal-hold 편집 비활성화 및 쓰기 중단 경로로 전파된다.
- 두 불명 상태 회귀 및 `go test ./internal/bucketgov -count=1` 전체 통과.

### 신규 확인: Azure versioning API 경로 재검증 필요

- `azureacl/service_properties.go`의 서비스 XML은 IsVersioningEnabled를 포함하며 false는 omitempty로 누락한다. typed Azure Get/PutVersioning이 이 경로를 사용한다.
- 공식 [Set Blob Service Properties](https://learn.microsoft.com/en-us/rest/api/storageservices/set-blob-service-properties)의 XML 계약에는 IsVersioningEnabled가 없고, [versioning 관리 절차](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-enable)는 ARM blobServices 리소스의 isVersioningEnabled를 사용한다. 따라서 현재 로컬 fake 성공은 Azure 버전 관리 동작 증거가 아니며 요청 owner 자체를 ARM 경로와 대조·수정해야 한다.
- XML false 생략만 수정해 완료로 판정하지 않았다. 기존 ARM 인증/endpoint owner를 재사용하는 구현, capability/프로필 제약, account 범위 안내, 응답 재조회, 기존 fake fixture 수정이 남아 있다.

### Azure versioning ARM 요청 owner 추가 (연결 진행 중)

- 기존 ARM Client의 인증/HTTP 정책을 재사용해 account-level blobServices/default GET 및 versioning PUT 메서드를 추가했다. API 버전 2024-01-01, properties.isVersioningEnabled JSON을 사용하며 false도 명시한다.
- 실제 네트워크 없는 transport 회귀로 리소스 경로·버전·GET/PUT·false 본문을 확인했다. `go test ./internal/azurearmimmutability -count=1` 전체 통과.
- 아직 governance adapter가 새 메서드를 호출하지 않는다. 기존 XML versioning 경로 교체 및 프로필/응답/fixture 수정이 다음 작업이며 기능 수정 완료가 아니다.

### Azure versioning governance 연결

- Azure Get/PutVersioning을 기존 XML 경로에서 ARM Client로 교체했다. GET은 properties.isVersioningEnabled의 명시적 boolean을 요구하며 누락/null은 오류다. PUT은 ARM 200만 성공으로 처리한다.
- ARM 구성 없는 프로필의 통합 governance는 versioning capability를 비활성화하고 상태를 추정하지 않는다. 직접 Get/PutVersioning도 구성 오류를 반환한다.
- 기존 data-plane 기반 fixture를 ARM 응답/호출 fixture로 변경했다. bucketgov/azurearmimmutability 집중 패키지 검증 수행. XML 잔여 versioning 필드 정리, API/프로필/UI 통합 검사 및 실제 공급자 검증은 남아 있다.

### Azure 데이터 API versioning 필드 제거

- azureacl 서비스 JSON/XML 모델에서 IsVersioningEnabled를 제거했다. soft delete 수정/rollback은 data-plane 필드만 다루며 versioning은 ARM owner만 사용한다.
- 실제 로컬 HTTP 전송에서 soft delete false가 명시되고 IsVersioningEnabled XML이 없는지 확인했다.
- `go test ./internal/api ./internal/bucketgov ./internal/azureacl ./internal/azurearmimmutability -count=1` 4개 패키지 전체 통과. 추가 전송 회귀 후 azureacl 전체 재검증도 통과. UI capability 동작/ARM 에러 응답 및 실서비스 검증은 남아 있다.

### Azure versioning capability UI 연결

- 서버가 ARM 미구성으로 versioning capability를 끄거나 상태가 없으면 Azure controls는 사용 불가 이유를 표시하고 combobox/저장을 막는다. 요약도 disabled로 추정하지 않고 unavailable을 표시한다.
- ARM 미구성 모달 회귀 포함 governance 25개 테스트 통과.

### Azure ARM versioning 응답/실패 회귀

- true/false, null/필드 누락/잘못된 타입 7종 조회 응답을 검사했다. 명시적 bool만 상태가 되며 불명 응답은 오류다.
- disable 요청이 false로 전달되며 401/403/409/500은 성공 처리하지 않고 요청 1회로 종료함을 확인했다. `go test ./internal/bucketgov ./internal/azurearmimmutability -count=1` 전체 및 `git diff --check` 통과. 실제 ARM 증거는 아니다.

### Azure create defaults ARM preflight

- Reject Azure versioning defaults without ARM profile configuration before creating the container, preventing a predictable partially applied create operation.
- HTTP regression test uses a nil bucket operation service to establish that creation is never reached and checks the `defaults.versioning` field error.
- Validation: `go test ./internal/api -run TestBucketHTTPService -count=1` passed; `git diff --check` passed. These are local checks, not Azure deployment or provider evidence.

### Azure ARM profile guidance alignment

- Profile connection help and setup checklist now name versioning and legal-hold editing alongside immutability as ARM-dependent features.
- Updated provider and release-gate documentation to identify versioning reads/writes as ARM-backed and account-scoped, including unavailable status without ARM configuration.
- Validation: profileModalChecklist unit suite passed (5 tests); `git diff --check` passed. This copy/documentation change does not establish live Azure behavior.

### Azure versioning mutation response confirmation

- ARM PUT now requires a valid explicit `properties.isVersioningEnabled` matching the requested value, rather than treating any HTTP 200 as confirmed success. Missing, malformed, or mismatched state returns an error instructing a reload before retry; no automatic mutation retry occurs.
- Contract: https://learn.microsoft.com/en-us/rest/api/storagerp/blob-services/set-service-properties?view=rest-storagerp-2024-01-01 returns BlobServiceProperties on 200. Response confirmation does not replace independent live readback.
- Updated success fixtures and added six invalid/mismatched response cases with one-call assertions. `go test ./internal/bucketgov -count=1` and `git diff --check` passed.

### Azure integration recheck and GCS concurrency follow-up

- After ARM response confirmation and create preflight changes, `go test ./internal/api ./internal/bucketgov ./internal/azureacl ./internal/azurearmimmutability -count=1` passed across all four packages (API 21.154s). This is local integration evidence only.
- Rechecked issue requirements against the implementation: `gcsAdapter.PutAccess` still substitutes the latest server ETag when the edited request omits it; the typed UI explicitly advertises that behavior. This can defeat detection of changes since the user loaded the draft.
- Follow-up must cover both typed updates and `ApplyCreateDefaults`, which currently calls the same service with initially unversioned bindings. Requiring ETag only in the browser would leave API bypass open; requiring it in the shared validator without handling creation would break create defaults. Raw policy writes and public-exposure read/modify/write need separate concurrency review. No claim of concurrency completion.

### GCS typed access requires the edited policy revision

- Removed latest-ETag substitution from gcsAdapter.PutAccess. Missing/blank ETag now fails before provider reads or writes; a supplied stale revision remains intact for provider conflict detection.
- ApplyCreateDefaults explicitly reads the newly created policy revision into a copy of the access request. Missing revision still blocks the write; caller-owned defaults remain unchanged.
- Updated UI guidance, OpenAPI description, and generated frontend types. Added missing-ETag/no-provider-call and create-default revision tests; existing null-policy tests retain explicit revisions so they still exercise read failures.
- `go test ./internal/bucketgov ./internal/api -count=1` passed; bucketgov passed again after fixture coverage adjustment. Raw policy/public-exposure concurrency and real-provider concurrency evidence remain separate unfinished work.

### GCS raw policy revision requirement

- Static validation now rejects missing ETag for GCS raw IAM edits instead of emitting a warning. The existing PUT validation gate therefore blocks missing/blank revisions before provider calls; the validation-only endpoint reports the same requirement.
- Added HTTP missing/empty/whitespace ETag cases with an absent provider service, retained edited-revision conflict coverage, and updated valid condition/version fixtures to include loaded revisions. Updated policy editor guidance and provider documentation.
- API full suite initially found one valid condition fixture missing ETag; corrected that fixture. Final `go test ./internal/api -count=1` passed (21.644s), BucketPolicyModal unit suite passed (26 tests), and `git diff --check` passed. These remain local/mock checks, not live GCS concurrency proof.

### GCS public-exposure IAM revision guard

- Added an ETag requirement to the shared typed IAM writer, covering public-exposure read/modify/write as well as access edits. A provider read without a revision can no longer cause an unconditional IAM replacement.
- Regression checks missing revision causes zero writes and a preserved revision receiving 412 becomes bucket_policy_conflict after exactly one write. `go test ./internal/bucketgov -count=1` passed.
- This protects the read-to-write interval; it does not bind public-exposure changes to the UI draft revision or address bucket metadata concurrency/partial application. Live GCS verification remains unexecuted.

### GCS public-exposure partial-operation reporting

- When IAM update receives success but the following public-access-prevention patch fails, return bucket_public_exposure_partial with explicit IAM acceptance and unknown prevention state, advising reload before retry. No rollback or retry is attempted.
- PAP-only failures retain their original error and are not mislabeled as partial IAM changes. Tests assert one call per attempted step and both combined/PAP-only outcomes. `go test ./internal/bucketgov -count=1` passed; `git diff --check` passed. Traceable operation audit and independently verified final provider state remain unfinished.

### GCS partial-operation UI regression

- Added a governance modal test using the actual APIError class and bucket_public_exposure_partial response. It verifies the actionable partial-operation message, absence of success feedback, exactly one mutation, refresh, and controls reflecting returned public IAM / disabled prevention state.
- Existing shared mutation handling already satisfies this local flow; no duplicate UI error handler added. Focused test passed (1 selected, 25 skipped), frontend typecheck and git diff --check passed. Mock readback does not prove live provider state.

### GCS typed editor missing-revision validation

- Existing GCS access request builder rejects empty/whitespace ETag before calling the API and tells the user to reload. The server guard remains authoritative for API bypass.
- Added modal regression clearing a loaded ETag, asserting actionable error feedback, zero access mutation calls, and no success feedback. Focused test passed (1 selected, 26 skipped); git diff --check passed.

### Combined policy frontend verification

- After GCS revision guards and partial-operation UI coverage, ran both BucketGovernanceModal and BucketPolicyModal suites together: 53/53 tests passed (17.07s).
- Full `npm run lint` passed, including CSS token and runtime import-cycle checks. `npm run check:openapi` passed against the generated client.
- These checks verify local frontend regression and generated-contract consistency; provider semantics, original incident runtime evidence, and release/deployment readiness remain unproven.

### GCS policy serialization contract review

- Compared the actual Storage JSON API getIamPolicy contract (https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/getIamPolicy): auditConfigs is not part of this response contract; kind/resourceId are ignored in requests. No speculative audit-config preservation implementation added.
- Removed omitempty from policy bindings so intentional clearing sends explicit [] rather than dropping the field. Regression checks both typed access clear and removal of the last public grant.
- bucketgov full tests and git diff --check passed. This proves serialization shape, not that omission previously caused a live provider incident.

### GCS unknown policy-version read boundary

- Typed IAM reads now reject versions outside the supported 0/1/3 set. Previously unknown higher versions were forwarded by access edits and version 2 could be retained without being understood.
- Regression covers -1/2/4 responses across GetAccess, PutAccess, and public-exposure edits, with provider writes forbidden. bucketgov full suite and git diff --check passed. This does not validate CEL semantics or establish live GCS compatibility.

### Full backend regression after GCS contract changes

- `go test ./... -count=1` from backend completed successfully across all packages (39 tested packages, 5 without tests). API suite took 24.208s. Output: /tmp/s3desk-issue39-backend-all.log.
- This extends local evidence beyond focused adapters to uploads, thumbnails, favorites, jobs, store, policy, and websocket package tests. It does not establish real-provider, browser-to-server incident reproduction, or deployment readiness; optional environment-dependent tests may skip.

### GCS malformed provider binding read guard

- Reused ValidateAccessPut on decoded provider bindings before exposing or editing a typed policy; conditional reads also require version 3. Malformed role/member/condition data is no longer silently normalized or discarded by a public-exposure replacement.
- Four malformed read cases assert no policy write. The initial suite exposed an existing title-only condition fixture; supplied its required expression. Final bucketgov suite and git diff --check passed. CEL semantics and live provider evidence remain unverified.

### Full frontend unit regression

- `npm run test:unit` completed: 267 test files and 1,361 tests passed in 52.38s. Output: /tmp/s3desk-issue39-frontend-all.log. Covers local upload/retry/resume, realtime, favorites, objects layout logic, and policy/governance unit suites.
- This is unit/DOM/mock evidence, not browser visual, physical-device, live-provider, or original-incident reproduction proof. Updated the opening S3D-009 summary to reflect implemented guards and remaining scope.

### Azure stored-policy supported date formats

- Official Set Container ACL documents date-only and minute-precision timestamps in addition to second/fraction precision: https://learn.microsoft.com/en-us/rest/api/storageservices/set-container-acl. Existing RFC3339-only guards incorrectly rejected the first two forms.
- Added shared azureacl date validation using Go time parsing and reused it in raw/typed server validators. Updated create-form validation and Azure labels to ISO 8601, preserving submitted strings.
- Focused Azure/API/bucketgov tests passed; frontend Azure tests passed (4) after correcting a test helper name. git diff --check passed. Actual Azure acceptance, precision limits, and start/expiry ordering remain separate checks.

### Azure date-form integration alignment

- Updated browser-test label selectors after the ISO 8601 label change. Changed the existing Azure governance modal flow to save a date-only start and minute-precision expiry, asserting exact unchanged values in the API request.
- Documented accepted forms on BucketStoredAccessPolicy start/expiry in OpenAPI and regenerated the frontend types. Focused Azure modal test passed; git diff --check passed. Browser suite itself was not rerun in this step.

### Azure date forms in Chromium

- Focused Azure governance Playwright test passed with the updated ISO 8601 labels. Extended that test to input date-only start and minute-precision expiry and assert both exact values in the intercepted write body. Rerun passed (1 test, 5.8s).
- Command: `npm exec playwright test tests/bucket-governance.spec.ts -- --project=chromium --grep "Azure governance access"`. Managed local Vite server and mocked API routes; this is browser evidence, not Azure provider evidence. git diff --check passed.

### Combined governance Chromium regression

- `npm exec playwright test tests/bucket-governance.spec.ts -- --project=chromium` passed all 8 tests in 50.3s. Covered GCS binding editing, Azure date-form editing, OCI sharing URL lifetime at 1280/390 widths, draft-scoped static validation, controls/policy load retry, and draft survival through failed reconnect refresh.
- Managed local Vite and mocked APIs; no provider mutation or live compatibility evidence.

### Azure ACL writer date boundary

- The shared XML-producing PutContainerPolicy path now reuses ValidateStoredPolicyTime for nonempty start/expiry values, preventing internal callers from bypassing API date validation. Optional empty times remain allowed.
- Three invalid-date direct-call regressions verify rejection before client configuration/network setup. azureacl and bucketgov full suites plus git diff --check passed.

### Azure create-form calendar validity

- Extended the existing Azure date helper to reject invalid calendar dates and out-of-range clock/offset components, using native Date parsing plus a date round-trip check. Date-only and minute-precision forms remain supported.
- Added invalid day/month/non-leap-year, hour/minute, and missing-zone cases plus a leap-year positive case. Azure frontend unit suite passed (5 tests); git diff --check passed.

### Azure existing-policy form date parity

- Existing-policy serialization now reuses the create-form date helper for nonempty start/expiry values. Invalid dates are rejected before API submission; valid date-only/minute-precision values remain unchanged.
- Azure unit suite passed (6 tests), import-cycle check passed, and git diff --check passed. Server validation remains authoritative for raw/API callers.

### S3 resource lint bucket boundary

- Replaced substring bucket matching with exact bucket or bucket/slash matching for the existing arn:aws:s3 resource lint. demo-backup no longer appears to explicitly target demo. Wildcards receive a precise non-explicit-target warning rather than a false claim of no possible match.
- Five fixtures cover bucket, object prefix, overlapping name, unrelated path, and wildcard. Focused S3/API validation tests and git diff --check passed. This remains a static warning, not provider authorization/effect validation or support for every ARN partition.

### S3 principal-map type names

- Static validation now rejects unrecognized/case-mismatched Principal and NotPrincipal map keys; recognizes AWS, Service, Federated, and CanonicalUser as IAM grammar keys. This is grammar validation only: Federated/service-specific eligibility and identity existence still need resource/provider validation.
- Source: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html. Sixteen principal-key cases and focused S3/API tests passed; git diff --check passed. No live AWS/Ceph compatibility claim.

### S3 principal API bypass regression

- Added actual PUT-handler tests for unknown Principal/NotPrincipal kinds under both AWS and S3-compatible profiles. With no provider service installed, all four cases return 400 with the principal-type error before any write path is reachable.
- Focused S3Principal tests and git diff --check passed. S3-compatible coverage here establishes application validation only, not Ceph/product compatibility.

### Latest date/principal integration verification

- After Azure shared date validation and S3 principal-kind changes, frontend `npm run typecheck` passed. `go test ./internal/api ./internal/bucketgov ./internal/azureacl -count=1` passed all three full suites (API 25.746s).
- This confirms current local integration; live provider tests and the original incident runtime evidence remain outstanding.

### S3D-003 metadata key-encoding boundary

- Re-inspected getObjectMeta URLSearchParams construction and server Query().Get decoding: no extra unescape occurs in this path. Added regressions for Unicode, literal plus, space, and literal %2F; frontend preserves the exact key and backend decodes it once.
- Frontend objects API suite passed (19 tests); focused Go ObjectMeta tests and git diff --check passed. This narrows one hypothesis only: it does not reproduce the original inode/directory versus MP4 metadata discrepancy or establish the actual provider key/stat response.

### S3D-003 folder-to-video metadata race regression

- Added a deferred folder metadata response while switching to the reported plus-containing MP4 key with the reported size. Verified cancellation of the folder request, preservation of video metadata after the late folder result, and the same video metadata in large preview.
- Existing cache/query ownership handled this case; no production code change. Hook tests passed (2), typecheck and git diff --check passed. Mock evidence rules out this tested selection-race path only, not the original runtime stat mismatch.

### S3D-003 stat response boundary

- rcloneStat builds lsjson --stat with the supplied target; no cache or additional URL decoding exists there. Found that JSON null decoded into a zero-value entry and appeared successful. Changed the shared decoder to reject null explicitly.
- Added a process-hook regression asserting the plus-containing target is unchanged and null returns an error. Focused ObjectMeta/RcloneStat/Thumbnail tests and git diff --check passed. This defect is not established as the original directory/MP4 mismatch cause; actual provider stat output remains missing.

### Policy operation-record owner audit

- Existing internal/operationreceipt is a bounded 24-hour replay store keyed by an optional Idempotency-Key, scoped after authentication. It is not an audit trail or an exactly-once provider transaction.
- Current api.go wraps object deletion/folder creation, upload session/complete/commit, job creation/retry. Raw policy and every governance mutation route are not wrapped. Therefore existing receipt support is not evidence of durable policy outcome tracking.
- The receipt wrapper explicitly excludes responses containing credentials/signed URLs; OCI sharing can return such URLs, so blanket governance wrapping would violate its contract. Policy outcome tracking needs sanitized metadata and per-operation handling; merely adding the wrapper would not fulfill the issue requirement. No existing receipt implementation or unrelated recovery work was modified.

### Audit requirement scope correction

- Re-read issue S3D-009 audit requirement: actor, target, before/after difference, validation-rule version, request ID, and final state must be traceable without sensitive values. It does not prescribe unlimited retention or a new audit database. Earlier references to permanent records overstated that requirement.
- Store has no existing audit owner. Existing structured application logs are the first integration option to assess; their deployment retention must be documented separately. The 24-hour replay receipt is still insufficient as-is, but this does not justify inventing a parallel persistent subsystem.
- Remaining work is the actual sanitized audit event contract, capture of verifiable before/after state, unknown/partial outcome handling, and evidence that configured log collection retains the required events. No audit-completion claim.

### Audit integration points established

- middleware_logging.go already emits request_id, route, path, method, HTTP status and profile header, without request/response bodies. HTTP status is not verified provider outcome; the profile header alone is not authenticated actor identity.
- bucketgov/service_helpers.go centralizes typed validation and mutation but has no HTTP actor/request-ID fields; raw policy routes use a separate owner. Placing a generic log only in servicePut would miss raw policy and response-returning sharing operations.
- Logging.InfoFields/WarnFields provide the maintained sink. A complete implementation must attach authenticated credential identity (shared API-token identity, not an invented human), sanitized target/change evidence, rule version, and independently supported outcome at both mutation owners, retaining request correlation. Before/after read failures must remain unknown. These are concrete integration findings, not implemented audit coverage.

### Policy audit request/outcome metadata implementation

- Added policyAudit middleware after API-token/profile authorization on raw-policy and typed-governance route groups. PUT/DELETE emit start and response events through existing logging; GET and validation POST do not emit mutation events.
- Events include credential fingerprint (shared API credential, not human identity), authenticated profile/provider, bucket, request ID, method/path, HTTP status, and audit schema version. Bodies, query strings, provider secrets, and sharing URLs are excluded. 2xx is accepted_unverified; errors are unconfirmed, not assumed rolled back.
- Focused PolicyAudit/BucketGovernance/BucketPolicy tests and git diff --check passed. Remaining audit work: tested middleware lifecycle/routing, sanitized before/after differences, validation-rule version, readback-derived outcomes and deployment log retention. Start without response must not be interpreted as failed-before-write.

### Policy audit middleware lifecycle verification

- Added isolated subprocess coverage with the real JSON logging sink, avoiding mutation of the main test process global logger. GET/validation-style POST produce no change events; PUT/DELETE each emit start and accepted_unverified response events.
- Verified status/header/body pass-through and no response signed URL in captured logs. Focused PolicyAudit tests and git diff --check passed. Authentication route integration and before/after evidence remain separate work.

### Policy audit validation provenance

- Audit events now include local validation_rules_version and app_version separately from audit_schema_version. Documented where to bump the local rules version and the distinction from provider API/live validation in BUCKET_GOVERNANCE.md.
- Documented event outcomes, credential-versus-human identity, deployment-owned log retention, omitted sensitive fields, and missing before/after/readback evidence. Focused PolicyAudit tests and git diff --check passed.

### Versioning before/after observation and confirmation

- Versioning PUT now validates then reads the current status before mutation; failed initial lookup blocks writes. After one write attempt it reads status again, emits sanitized before/requested/after observations with request correlation, and preserves any write error.
- Successful write followed by failed/mismatched readback returns 502 bucket_versioning_unconfirmed rather than 204. Matching readback produces observed_match audit evidence; it does not prove long-term enforcement or attribution under concurrent changes.
- Added matching/mismatch/readback-failure/initial-failure cases and corrected an existing success fixture that returned empty metadata. Focused governance/versioning tests and git diff --check passed. Other governance sections and raw policies still need equivalent evidence.

### Versioning write-error/readback precedence

- Expanded HTTP readback regression to preserve a provider 403 even when subsequent observed state matches the requested value, and when readback also fails. Matching current state cannot turn a denied write into success.
- Every case now asserts exact read/write counts: one initial read, at most one write, and one readback after attempted writes; no automatic mutation retries. Six cases passed in the focused VersioningWrite test; git diff --check passed.

### AWS versioning unknown response guard

- AWS GetVersioning now rejects a nil response or an unknown nonempty status instead of reporting disabled. The documented empty status for a never-versioned bucket still maps to disabled.
- Contract: https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketVersioning.html
- Added missing-response and unknown-status regression cases; existing enabled and empty-status cases retained.
- Validation: `go test ./internal/bucketgov ./internal/api -run 'Versioning|PolicyAudit' -count=1` and `git diff --check` passed. Local unit evidence only.
- Remaining: OCI status normalization and broader policy observation coverage; original MP4/provider reproduction remains unverified.

### OCI versioning provider contract correction

- Official OCI UpdateBucketDetails accepts Enabled/Suspended, not Disabled: https://docs.oracle.com/en-us/iaas/tools/python/latest/api/object_storage/models/oci.object_storage.models.UpdateBucketDetails.html
- Fixed shared validation, OCI adapter writes, draft state, and control options to enable/suspend. OCI reads preserve Suspended and reject missing/unknown states; Disabled remains a valid initial read state.
- OpenAPI documents provider-specific request states; generated frontend types refreshed. Validation audit rule version advanced to 2026-09-27.2.
- Regression coverage checks all three read states, missing/unknown responses, disabled rejection before writes, and UI Suspended request.
- Passed: full tests for `go test ./internal/bucketgov ./internal/api -count=1` (API 24.310s), governance modal 27 tests, frontend typecheck, focused ESLint, OpenAPI drift, and git diff --check. These are local tests, not OCI live evidence.

### Versioning readback after caller cancellation

- Found the result lookup reused the canceled mutation context, preventing observation after a disconnect/timeout. Only the post-write read now uses context.WithoutCancel with a 10-second deadline; the mutation still uses the original request and runs once.
- Regression cancels the caller during the provider write, verifies the read receives a live bounded context with authenticated values, and verifies the original write error is retained (no success inference or retry).
- Passed `go test ./internal/api -run 'Versioning|PolicyAudit' -count=1` and `git diff --check`. Local evidence only; other policy section observation coverage remains incomplete.

### AWS encryption malformed response handling

- Shared encryption-rule decoding now rejects missing responses/configuration, missing or multiple rules, and missing algorithm. These previously became implicit SSE-S3 or a false BucketKeyEnabled value.
- Both display reads and the KMS write prerequisite use the guard. The explicit ServerSideEncryptionConfigurationNotFoundError behavior is retained.
- Official response contract checked: https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketEncryption.html . Multiple rules are rejected because the current editor only represents one; no claim that all provider APIs forbid multiple rules.
- Regression cases prove invalid responses produce errors and no KMS provider write. `go test ./internal/bucketgov -count=1` and `git diff --check` passed.
- Remaining encryption gaps include preservation of unsupported fields/algorithms and post-write observation; live provider behavior is not proven.

### Preserve AWS encryption restrictions on writes

- Confirmed AWS ServerSideEncryptionRule includes BlockedEncryptionTypes: https://docs.aws.amazon.com/AmazonS3/latest/API/API_ServerSideEncryptionRule.html . The former newly constructed rule omitted this unedited SSE-C upload restriction.
- Reused the existing prerequisite read as currentEncryptionRule for both SSE-S3 and SSE-KMS. Copy the rule and replace only the selected default encryption; preserve blocked types and explicit true/false BucketKeyEnabled for KMS. Remove the KMS-only bucket key setting when selecting SSE-S3.
- Tests cover both modes, SSE-C preservation, explicit false, and no source configuration mutation. Full bucketgov/API package tests passed (API 23.768s); git diff --check passed.
- This does not establish conditional-write protection against external changes or live AWS behavior. DSSE-KMS representation and post-write observation remain open.

### Preserve DSSE-KMS during KMS key edits

- Existing view mapped DSSE-KMS to the editor's KMS mode, but save always emitted standard aws:kms. Now the current DSSE-KMS algorithm is retained for KMS-mode writes; explicit SSE-S3 selection still changes algorithms. Updated user-visible warning and documented the editor limitation.
- Contract checked: https://docs.aws.amazon.com/AmazonS3/latest/API/API_ServerSideEncryptionByDefault.html (aws:kms:dsse accepts KMSMasterKeyID).
- Regression covers reading DSSE-KMS, changing its key without changing algorithm, and explicit SSE-S3 conversion. `go test ./internal/bucketgov -count=1` and `git diff --check` passed. No live AWS proof or new DSSE creation control.

### Unknown encryption algorithms blocked on direct writes

- Read UI already rejected unknown algorithms, but direct writes accepted the existing rule and replaced its algorithm. The write prerequisite now reuses the same view validation before constructing a replacement.
- Regression covers direct SSE-S3 and SSE-KMS updates: unsupported-algorithm error, no provider write.
- `go test ./internal/bucketgov -count=1` and `git diff --check` passed after fixing a missing test import. Broader provider/runtime completion remains unverified.

### Broad validation after encryption and versioning changes

- `./scripts/check.sh fast` failed at `ComposeWrapperTests.test_missing_or_invalid_public_host_is_rejected`. Reproduction isolated the failing input to missing DEMO_PUBLIC_HOST: scripts/compose.sh defaults it to 0.0.0.0 and exits 0; the test expects nonzero. Scheme/port/path invalid inputs all correctly exit 1. These owners were not modified for issue 39. The fast gate is not passing; downstream checks are not implied.
- Independently ran `go test ./... -count=1`: passed all backend packages. Log: /tmp/s3desk-issue39-backend-current.log.
- Independently ran `npm run test:unit`: 267 files, 1366 tests passed (54.95s). Log: /tmp/s3desk-issue39-frontend-current.log.
- `git diff --check` passed. Browser/live/provider/release evidence is not established by these results.

### Lifecycle null/delete and unsupported field distinction

- Found `rules:null` decoded to nil and triggered DeleteBucketLifecycle. Rules must now be an explicit array: only [] expresses deletion. This aligns with the existing OpenAPI array contract.
- The existing AWS lifecycle parser now rejects unknown fields at every typed nesting level instead of dropping them before save, and retains rejection of trailing JSON.
- Direct adapter regressions cover null, null entries, trailing JSON, unknown top-level actions and unknown nested expiration fields; no provider write/delete is allowed. Existing explicit-empty-array deletion coverage retained.
- Validation audit rules version advanced to 2026-09-27.3. Focused lifecycle/policy-audit tests and git diff --check passed after adding the missing test import. Live environment and broader lifecycle semantic constraints remain pending.

### Lifecycle filter text and legacy prefix preservation

- Removed trimming of prefixes, tag keys/values, and rule IDs during conversion. A whitespace-only prefix previously became all objects; leading/trailing spaces in tags changed matching. Reads now also preserve the deprecated SDK LifecycleRule.Prefix when no modern Filter exists.
- Regression covers whitespace-only prefixes, leading/trailing spaces, Unicode/+/%2F, both legacy and modern prefix reads, and an AND filter/tag JSON round trip.
- Contract references: https://docs.aws.amazon.com/AmazonS3/latest/API/API_LifecycleRuleFilter.html and https://docs.aws.amazon.com/AmazonS3/latest/API/API_Tag.html . Local SDK LifecycleRule documents legacy prefix support.
- Focused lifecycle/policy-audit tests and git diff --check passed. Audit validation version is 2026-09-27.4. Empty tag value support and broader lifecycle combination/range validation remain separate work.

### Lifecycle scheduling boundary corrections

- Official Transition API allows zero or positive Days; Expiration Days remains strictly positive. Removed the incorrect zero-day transition rejection.
- Both expiration and transition dates now require midnight UTC after timezone normalization, including zero fractional seconds.
- Sources: https://docs.aws.amazon.com/AmazonS3/latest/API/API_Transition.html and https://docs.aws.amazon.com/AmazonS3/latest/API/API_LifecycleExpiration.html .
- Regressions cover zero/negative days, UTC midnight, equivalent +09:00 timestamp, one-second and fractional-second violations. Focused lifecycle/policy-audit tests and git diff --check passed. Audit rule version is 2026-09-27.5.
- Date/day mutual exclusion and storage-class-specific minimum transition durations still need separate validation; these tests do not prove the full semantic matrix.

### Lifecycle cross-field combinations

- Confirmed same-rule Date/Days mixing is forbidden, including different actions in one rule. Confirmed tag filters cannot accompany AbortIncompleteMultipartUpload or ExpiredObjectDeleteMarker. Source: https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-configuration-examples.html .
- Added rule-level checks after existing field conversion, shared by validation and direct writes. NoncurrentDays is not treated as the current-version Days field.
- Five direct-write regression cases cover same-action dates/days, cross-action and cross-transition mixing, direct tags and AND tags; all block before provider mutation. Focused lifecycle/policy-audit tests and git diff --check passed. Audit rule version advanced to 2026-09-27.6.
- Storage class ordering/minimum duration, size predicates, and live behavior remain separate verification work.

### Missing lifecycle response guard

- GetLifecycle dereferenced a nil provider response. It now returns bucket_lifecycle_error without claiming an empty configuration. Explicit NoSuchLifecycleConfiguration still returns [] through the existing separate branch.
- Added regression for nil output/no provider error; existing no-configuration test retained. Full `go test ./internal/bucketgov -count=1` and git diff --check passed. No live/provider claims.

### Preserve lifecycle transition minimum-size default

- Lifecycle writes previously sent only rules, omitting the existing TransitionDefaultMinimumObjectSize setting. Nonempty updates now read and carry it into the provider request. Explicit NoSuchLifecycleConfiguration permits creation; nil/failed reads block writes. Explicit [] deletion remains separate.
- Official setting contract: https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketLifecycleConfiguration.html .
- Tests cover legacy varies_by_storage_class and modern all_storage_classes_128K preservation, missing response, access denial, and existing create/delete paths. Full bucketgov package tests and git diff --check passed.
- Preserves a provider setting at the read instant; no conditional-write/concurrency or live AWS guarantee.

### Lifecycle size filter bounds and AND cardinality

- Shared size validation rejects negatives and equal/reversed lower/upper bounds in direct and AND filters. AND now requires at least two predicates. Zero lower bounds remain valid.
- Contract: https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-filters.html and https://docs.aws.amazon.com/AmazonS3/latest/API/API_LifecycleRuleFilter.html .
- Eight boundary/cardinality cases plus focused lifecycle/policy-audit tests passed; git diff --check passed. Audit validation version 2026-09-27.7.
- Maximum byte-size ceiling and tag uniqueness/value semantics still require separate work; this is not complete lifecycle/provider validation.

### Lifecycle optional tag value and unique keys

- Lifecycle tag values now preserve absent versus explicit empty string using the existing payload's pointer field. Both are allowed instead of rejecting empty values. AND tag keys must be unique without trimming or case folding.
- Official source: https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-filters.html explicitly permits a key without a value and requires unique keys.
- Round-trip tests cover absent/empty values; uniqueness tests cover identical, case-distinct and whitespace-distinct keys. Focused lifecycle/policy-audit tests and git diff --check passed. Validation rule version 2026-09-27.8.

### Noncurrent retention upper bound

- Both noncurrent expiration and transition now reject NewerNoncurrentVersions above 100, matching their official API contracts. Existing lower-bound behavior is unchanged pending separate confirmation; no claim that the full noncurrent constraint matrix is complete.
- Sources: https://docs.aws.amazon.com/AmazonS3/latest/API/API_NoncurrentVersionExpiration.html and https://docs.aws.amazon.com/AmazonS3/latest/API/API_NoncurrentVersionTransition.html .
- Tests cover 99, 100 and 101 on both paths. Focused lifecycle/policy-audit tests and git diff --check passed. Audit rule version 2026-09-27.9.

### Lifecycle HTTP boundary and backend regression verification

- Ran full `go test ./... -count=1` after accumulated lifecycle changes: passed. Log /tmp/s3desk-issue39-backend-lifecycle-current.log.
- Added HTTP PUT boundary tests for null, unknown nested fields, date/day mixing, reversed size bounds and retention count 101. All return 400 without invoking the fake provider; focused `go test ./internal/api -run Lifecycle -count=1` passed after the test addition.
- git diff --check passed. This strengthens UI-bypass/server-validation evidence, not live provider or full-goal completion.

### Lifecycle rule count and ID limits

- Enforced maximum 1000 rules, unique nonempty IDs and maximum 255 Unicode characters per ID. IDs remain optional and untrimmed.
- Sources: https://docs.aws.amazon.com/AmazonS3/latest/API/API_LifecycleRule.html and previously checked PutBucketLifecycleConfiguration/SDK contract (1000 rules).
- Tests cover 1000/1001 rules, 255/256 Korean-character IDs and duplicates. Focused lifecycle/policy-audit tests and git diff --check passed. Audit rules version 2026-09-27.10.

### Lifecycle deletion observed-state confirmation

- AWS lifecycle [] deletion now reads provider state with an independent 10-second deadline, including after a write error. Only explicit no-configuration or a valid empty response confirms a successful delete request. Remaining rules, missing response or read failure return bucket_lifecycle_unconfirmed; original write errors retain precedence. No retry is introduced.
- Tests cover confirmed empty/absent state, remaining rules, nil response, read failure and original write-error precedence. Full bucketgov tests and git diff --check passed.
- Nonempty replacement readback, policy audit before/after details and live AWS confirmation remain incomplete.

### Unconfirmed lifecycle deletion UI regression

- Added a modal flow that clears existing rules, receives bucket_lifecycle_unconfirmed, and proves the error remains visible via feedback, success is not emitted, the modal stays open, the provider state is refreshed, and exactly one [] write occurs.
- Focused Vitest test passed (1 selected, 27 skipped); frontend typecheck and git diff --check passed. This is mocked UI evidence, not live provider or browser integration proof.

### Lifecycle replacement readback

- Nonempty AWS lifecycle writes now re-read with an independent 10-second deadline, retain original write-error precedence, and reject missing/error/mismatching state as bucket_lifecycle_unconfirmed. Preserved minimum-size settings are also compared.
- Comparison reuses existing rule serialization, ignores rule ordering, permits generated IDs only where the request omitted an ID, and preserves explicit IDs and duplicate counts. It does not claim lifecycle actions have executed.
- Six comparison cases plus adapter missing/empty/error readback cases pass; full bucketgov tests and git diff --check passed. Existing fake provider now reflects successful writes to exercise real readback behavior.
- Remaining: audit before/after information, concurrent external changes, and live AWS confirmation; other governance sections still need result comparisons.

### Lifecycle cancellation observation regression

- Extended the readback fake with independent write/read counts and context snapshots. Regression cancels the caller during a failed replacement, returns matching observed rules, and verifies the original error is retained, one mutation and one readback occur, and readback has a live context with at most a 10-second deadline.
- `go test ./internal/bucketgov -run Lifecycle -count=1` and git diff --check passed. This proves local control flow, not the real provider's cancellation behavior.

### AWS Object Ownership observed-state confirmation

- PutAccess now reuses GetAccess after the write with an independent 10-second deadline. Only the requested ownership mode confirms success; nil/failed/mismatching reads return bucket_access_unconfirmed. Original write errors retain precedence, with no mutation retry.
- Existing successful-write test now supplies a matching response; new tests cover different mode, missing output and read error. Full bucketgov tests and git diff --check passed.
- This confirms a configuration observation only; ACL behavior, concurrent updates and real-provider evidence remain unverified.

### AWS Public Access Block readback

- Writes now read back all four flags with a bounded independent context and return bucket_public_exposure_unconfirmed when any flag differs or the read fails. Original write errors remain authoritative.
- Missing output/configuration no longer becomes an all-false/public view. Explicit NoSuchPublicAccessBlockConfiguration handling remains separate.
- Existing write fixture now reflects applied state; added nil/configuration-missing and one-of-four mismatch regression. Full bucketgov tests and git diff --check passed. Actual effective public access can also depend on account/policy settings and is not proven here.

### Public Access Block incomplete flag handling

- Missing individual response flags no longer become false through derefBool. GetPublicExposure requires all four flags before returning a confirmed view; write readback therefore cannot confirm false using omitted values. Explicit NoSuchPublicAccessBlockConfiguration remains a separate known-absence branch.
- Four regressions omit each flag in turn, with explicit false fixtures retained. Full bucketgov tests and git diff --check passed. This is a conservative client completeness requirement, not a claim that the AWS schema marks every field required.

### Readback error HTTP propagation and broad backend validation

- Full `go test ./... -count=1` passed after AWS lifecycle/ownership/public-access readback changes; log /tmp/s3desk-issue39-readback-backend.log.
- Added HTTP regressions for access, public-exposure and lifecycle unconfirmed results: response retains 502, exact error code and reload guidance instead of 204/success. Focused test passed after correcting missing imports; git diff --check passed.
- These are adapter-error propagation tests, not real AWS transport or effect validation.

### OCI visibility observed-state confirmation

- OCI public exposure updates now re-read bucket visibility using a bounded independent context. The update response alone cannot confirm success; missing/different visibility returns bucket_public_exposure_unconfirmed. Original update errors retain precedence.
- Tests cover matching, unchanged-private and missing visibility, with exactly one write and one read. Existing combined OCI fixture updated to provide actual readback. Full bucketgov tests and git diff --check passed. No real OCI permission-effect evidence.

### OCI unknown visibility must not imply private

- GetPublicExposure now rejects missing/unknown public-access-type instead of normalizing it to private. Only explicit NoPublicAccess produces private.
- Tests cover all three supported values and empty/unknown values; full bucketgov tests and git diff --check passed. No OCI live claims.

### Azure visibility observed-state confirmation

- Azure public-access changes keep the existing ACL read/modify/write and now perform bounded independent readback. A failed read or mismatching visibility returns bucket_public_exposure_unconfirmed; write errors retain precedence.
- Existing stored-policy preservation test now returns the applied state; new tests verify unchanged visibility/read failure, two reads and one write. Full bucketgov tests and git diff --check passed.
- Comparison currently covers publicAccess only. Stored-policy semantic readback and actual account-level public access effects remain unverified.

### Azure 공개 범위 응답 정규화 보완

- 공통 `getContainerPolicy`에서 누락되거나 알 수 없는 `publicAccess`를 오류로 처리한다. 이전의 private 기본값 때문에 잘못된 응답이 변경 후 확인에 성공하는 경로를 제거했다.
- 실제 Azure ACL 클라이언트는 공개 헤더가 없을 때 명시적인 private 값을 반환하므로 정상 비공개 컨테이너는 유지된다.
- 검증: `cd backend && go test ./internal/bucketgov -count=1` 통과. private/blob/container 및 빈 값/미지원 값 회귀 검사 포함. 실제 Azure 환경 증거는 아니다.
- 추가 검증: 최근 OCI/Azure 공개 범위 재조회 변경을 포함한 `cd backend && go test ./... -count=1` 전체 통과, `git diff --check` 통과.

### Azure 공개 범위 변경 후 저장 액세스 정책 보존 확인

- 공개 범위 변경 뒤 재조회에서 공개 값뿐 아니라 기존 저장 액세스 정책의 ID, 권한, 시작/만료 시각까지 비교한다. 정책 순서는 무시하고 개수 및 중복은 확인한다.
- 정책이 사라지거나 바뀌면 `bucket_public_exposure_unconfirmed`로 반환하며 자동으로 쓰기를 재시도하지 않는다.
- 검증: `cd backend && go test ./internal/bucketgov -count=1` 통과. 정상/순서 변경/삭제/중복/권한 변경/만료 제거를 검사하고 각 요청의 쓰기가 한 번뿐임을 확인했다. `git diff --check` 통과.
- 이 재조회는 관측된 설정의 보존 검사이며, 동시 변경 방지 또는 실제 Azure 권한 효과 증거는 아니다.

### Azure 저장 액세스 정책 수정의 재조회 확인

- 공통 `putContainerPolicy`에 변경 후 확인을 통합해 공개 범위 및 저장 정책 수정 모두 요청 정책과 보존 대상 공개 범위를 비교한다. 저장 정책 변경 후 미확인은 `bucket_access_unconfirmed`이며 쓰기를 재시도하지 않는다.
- 요청 취소와 분리된 10초 제한 재조회, 기존 쓰기 오류 우선 반환을 유지했다.
- Azure ACL 날짜 검증기의 파서를 재사용해 날짜/분 단위/초 단위/시간대 표기가 달라도 같은 시각이면 일치로 판단한다. ID, 권한 및 정책 개수는 그대로 비교한다.
- 검증: `cd backend && go test ./internal/bucketgov ./internal/azureacl -count=1` 통과. 정상, 동등 날짜, 정책 누락, 공개 범위 변경, 읽기 실패, 쓰기 취소 및 오류 보존을 검사했다. `git diff --check` 통과.
- 공식 근거: https://learn.microsoft.com/en-us/rest/api/storageservices/set-container-acl — 지원 ISO 날짜 형식 및 변경 효과에 최대 30초가 걸릴 수 있다는 설명. 현재 검사는 관측 설정 확인이며 SAS 권한 효과 또는 동시 변경 방지의 증거가 아니다.

### Azure ACL 응답 목록 완전성

- 내부 Azure ACL 응답의 `storedAccessPolicies` 누락/null을 빈 배열과 구분한다. 실제 ACL 클라이언트는 빈 정책을 명시적 배열로 반환한다.
- 변경 전 불완전 응답은 쓰기를 차단하고, 변경 후 불완전 응답은 `bucket_access_unconfirmed`로 반환한다. 빈 정책으로 삭제하는 요청도 불완전 응답을 성공 증거로 사용하지 않는다.
- 검증: `cd backend && go test ./internal/bucketgov -count=1` 통과. 누락/null 각각 변경 전후 회귀 검사 포함. `git diff --check` 통과.
- 추가 검증: 최근 Azure ACL 공통 재조회·날짜 정규화·목록 완전성 변경을 포함한 `cd backend && go test ./... -count=1` 전체 통과. 상단 저장 결과 비교 현황도 현재 코드에 맞게 갱신했다.

### AWS 암호화 저장 결과 확인

- PutEncryption의 기존 사전 조회/보존 로직에 저장 후 독립적인 10초 제한 조회를 추가했다. 요청 취소 후에도 조회하며 쓰기 오류가 있으면 그 오류를 우선 반환한다.
- 알고리즘(DSSE 포함), KMS 식별자, Bucket Key, 보존된 SSE-C 제한이 요청과 다르거나 응답이 누락/조회 실패이면 502 `bucket_encryption_unconfirmed`를 반환한다. Bucket Key 생략/false는 동일하게 비교한다. 자동 쓰기 재시도는 없다.
- 기존 HTTP 오류 전달과 governance UI 오류/재조회 처리를 사용한다. KMS alias/ID/ARN의 실제 동일 키 여부를 추정하지 않으므로 표현이 바뀌면 미확인으로 남긴다. KMS 권한, 실제 객체 암호화 효과, 동시 변경 방지 및 감사 전후 차이 구현은 별도다.
- 계약 근거: https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketEncryption.html 및 https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketEncryption.html (2026-09-27 확인).
- 회귀 검사는 일치, 알고리즘/키/Bucket Key/제한 불일치, 응답 누락, 읽기/쓰기 실패, 취소 후 조회와 호출 횟수를 확인한다. 기존 가짜 클라이언트의 성공 저장은 이후 조회에 제출 설정을 반환하도록 수정했다.
- 검증: `cd backend && go test ./internal/bucketgov ./internal/api -count=1` 모두 통과(API 29.880초), `git diff --check` 통과. 최초 루트에서 실행한 Go 명령은 모듈 위치 오류로 종료했고 backend에서 재실행했다. 실제 AWS·브라우저·전체 local gate는 이번 작업에서 실행하지 않았다.

### GCS metadata 저장 결과 비교 및 전체 검사 재개

- 공통 `patchBucketMetadata`가 protection(uniform access/retention), versioning, Public Access Prevention의 저장 후 독립적인 10초 제한 재조회를 수행한다. 쓰기 오류를 우선 반환하며 자동 재시도하지 않는다.
- 원본 응답에서 요청한 필드만 비교한다. 누락된 false를 false 확인으로 취급하지 않고, retention은 반올림된 일수 대신 정확한 초 문자열을 비교한다. 명시적 retention 삭제는 응답의 필드 부재/null과 비교한다.
- 불일치/조회 실패는 항목별 `bucket_*_unconfirmed`; IAM 성공 후 PAP 미확인은 기존 partial 경로로 전달된다. 저장 상태 관측이며 권한 효과·동시 수정 방지 증거는 아니다.
- 공식 근거: https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/patch (2026-09-27 확인). 문서도 저장 직후 조회 가능성과 효과 전파 지연을 구분한다.
- `cd backend && go test ./internal/bucketgov ./internal/api -count=1` 통과(API 22.128초). 정상 fixture 두 개를 실제 저장값 재조회 방식으로 수정했고, 누락/불일치/취소/오류 우선순위 회귀를 추가했다.
- SeaweedFS 검사에서 미지정 host 거부 기대를 현재 `docs/SEAWEEDFS_DEMO.md`와 wrapper의 `0.0.0.0` 기본값에 맞췄다. 잘못된 URL/포트/path 거부는 유지하며 `python3 scripts/check_demo_seaweedfs_test.py` 34개 통과.
- live preflight를 다시 실행했으나 AWS/Azure/Ceph/GCS/OCI 필수 설정 모두 누락(exit 1). 실제 대상 및 원본 MP4 서비스 위치를 사용자에게 요청했다. 코드 작업은 계속 가능하므로 전체 목표를 중단하거나 완료 처리하지 않는다.

### 전체 local gate에서 확인한 추가 정리

- `./scripts/check.sh full`은 frontend 267개 파일/1,367개 단위 테스트, 빌드, Chromium smoke 2개를 통과했다. 전체 backend Go 테스트도 통과했지만 호스트 Go 1.26.8과 Go 1.25 빌드 staticcheck의 불일치로 보안 lane이 실패하여 전체 gate는 실패다. 로그: `/tmp/s3desk-issue39-full-check.log`.
- CI 및 go.mod가 지정한 `GOTOOLCHAIN=go1.25.13`으로 보안 검사를 재개했다. 발견한 미사용 내부 함수 4개(다운로드 metadata helper 2개, auth limiter reset, S3 HTTP client helper)를 호출 검색 후 삭제했다. Azure 오류 문자열 첫 글자를 소문자로 바꿨다.
- AWS legacy lifecycle Prefix는 실제 응답 보존에 필요하므로 해당 두 줄과 회귀 fixture에만 SA1019 사유를 명시했다. 보안 검사 전체 규칙을 끄지 않았다.
- native S3 ListPage는 int32 변환 전에 1..1000 범위를 직접 검사한다. nil client를 사용한 잘못된 limit 회귀로 공급자 요청 전 거부를 확인한다. operationreceipt 파일 접근은 서버 설정 디렉터리와 내부 SHA-256 hex ID로만 구성됨을 호출 경로에서 확인하고 해당 G304 경고 3곳에 사유를 기록했다.
- 다음 구현 대상은 GCS IAM 저장 결과 비교, Azure/OCI protection의 최종 상태 확인, raw policy 결과 및 감사 전후 차이와 UI 연결이다. 전체 목표는 미완료 상태로 유지한다.
- 정리 후 Go 1.25.13 기준 s3client/operationreceipt/bucketgov/azureacl/API 전체 테스트 통과(API 24.648초), staticcheck·gosec 통과. govulncheck는 호출 경로 취약점 0개이며 미호출 import 패키지 취약점 3개를 별도로 보고했다. 같은 toolchain으로 full gate 재실행 중(`/tmp/s3desk-issue39-full-go125.log`).

### GCS IAM 및 Azure soft delete 확인 확대

- GCS typed IAM 공통 writer에 독립적인 10초 제한 재조회를 추가했다. Access 편집 및 공개 접근 read/modify/write 모두 binding/구성원/condition 보존을 비교한다. 구성원·binding 순서와 갱신된 ETag는 동등 비교에서 제외하되 응답 ETag는 필수이며 조건부 version 3 검증을 유지한다. 불일치/조회 실패는 항목별 unconfirmed, 공급자 409/412는 기존 conflict를 우선 반환한다.
- Azure soft delete 공통 writer는 적용 및 기존 rollback 쓰기 후 활성 상태와 활성 시 보존 일수를 확인한다. readback 실패/불일치는 `bucket_protection_unconfirmed`이며 자동 쓰기 재시도하지 않는다. 변경 전 정책 자체가 없으면 쓰기를 차단해 값이 생략된 no-op rollback을 예방한다.
- Azure XML 및 내부 JSON의 soft delete enabled 누락을 명시적인 false와 구분한다. 공식 Set Blob Service Properties 문서의 생략된 root 설정 보존 계약을 확인했다: https://learn.microsoft.com/en-us/rest/api/storageservices/set-blob-service-properties .
- GCS 회귀 추가 후 bucketgov 전체 통과. Azure 첫 readback 변경까지 bucketgov/API 전체 통과(API 21.325초), enabled 누락 경계 변경 후 bucketgov/azureacl 전체 통과. XML 경계 회귀를 추가하여 재검증한다.
- 앞서 시작한 `GOTOOLCHAIN=go1.25.13 CHECK_FRONTEND_DEPS_READY=1 ./scripts/check.sh full`은 exit 0 / `[check] ok`로 끝났다. 로그 `/tmp/s3desk-issue39-full-go125.log`. 실행 중 GCS IAM/Azure 변경을 진행했으므로 이 결과를 그 후속 변경 전체의 full gate 증거로 사용하지 않는다. 최신 변경에는 별도 집중 검사 결과를 적용한다.
- 최신 GCS IAM/Azure soft delete/XML 경계 변경 검증: Go 1.25.13으로 bucketgov/azureacl/API 전체 통과(API 25.555초), 두 변경 패키지 staticcheck 및 `git diff --check` 통과. 다음은 Azure immutability/legal hold와 OCI retention/PAR 확인, raw 정책 비교 및 감사/UI 연결이다.

### Azure 불변성 및 legal hold 최종 관측

- 불변성 생성/수정/잠금/연장/삭제와 legal hold 태그 수정 후 독립적인 10초 제한 재조회를 수행한다. 불변성의 존재 여부, mode, days, append flags 및 legal hold 전체 태그 집합/활성 여부가 요청과 일치해야 성공한다.
- 쓰기 오류는 재조회 결과보다 우선한다. 실패 후 기존 rollback 경로도 유지하며 재조회 일치 자체를 rollback 보장이나 실제 Blob 동작 효과로 해석하지 않는다.
- 기존 불변성 정책 변경은 편집 당시 ETag를 요구한다. current와 다르거나 그 정책이 사라졌으면 soft delete 등 다른 쓰기 전에 409 `bucket_policy_conflict`로 중단한다. 최신 ETag 자동 대체를 제거했고 ARM 409/412도 같은 충돌 코드로 전달한다. 생성/수정 응답에 ETag가 없으면 후속 lock 요청을 차단한다.
- 불변성 생성의 부재 확인~생성 구간 및 legal hold/soft delete는 아직 조건부 변경 보장이 없다. 이 경쟁 조건을 BUCKET_GOVERNANCE.md에 명시했다. 실제 환경 동시 수정/권한 효과는 미검증이다.
- OpenAPI ETag 계약 설명과 생성 타입을 갱신하고 validation rules version을 2026-09-27.11로 올렸다. 프런트엔드 기존 요청 builder는 조회한 immutability ETag를 전달한다.
- bucketgov 전체 테스트 통과. 생성/삭제/연장/잠금 각각 정상·불일치·읽기 실패·쓰기 실패, legal hold 태그 순서/대소문자 정규화·실패, 호출 횟수, 취소와 분리된 deadline, stale/missing/removed revision 및 missing lock ETag를 검사한다.

- API 전체 실행의 유일한 실패는 올린 rules version의 이전 기대값이었다. JSON 결과에서 해당 테스트 1개만 실패했음을 확인하고 2026-09-27.11로 갱신했다. 이후 `go test ./internal/api -run 'PolicyAudit|BucketGovernance' -count=1` 통과. bucketgov staticcheck, OpenAPI 생성/일치 검사 및 `git diff --check` 통과.
- Azure 요청 builder가 locked 모드에서 append flags를 무조건 false로 보내는 오류를 수정했다. 기존 readonly 설정과 편집 당시 ETag를 그대로 보내며 서버는 잠긴 설정 변경을 계속 거부한다. 프런트엔드 Azure 회귀 7개와 typecheck 통과. 이는 로컬 요청 보존 검사이며 실제 Azure 검증은 아니다.

### OCI retention 및 PAR 최종 목록 확인

- OCI 실제 계약에서 `time-rule-locked`는 boolean이 아닌 RFC3339 날짜/null이다. Go 모델을 `*time.Time`으로 수정하고 현재 시각과 비교하여 미래 잠금 예약과 이미 잠긴 상태를 구분한다. 기존 잘못된 boolean fixture를 실제 계약 형태로 교체했다.
- 공식 근거: https://docs.oracle.com/en-us/iaas/tools/python/latest/api/object_storage/models/oci.object_storage.models.RetentionRule.html 및 https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingretentionrules_topic-To_create_a_retention_rule.htm (2026-09-27 확인).
- retention 적용 후 독립적인 10초 제한 목록 조회로 전체 ID/이름/기간/잠금 시각을 비교한다. 새 ID를 요청 복사본에 연결하며 caller draft를 수정하지 않는다. 기존 기간을 바꾸지 않은 규칙은 원래 단위까지 그대로 보존됐는지 확인한다.
- PAR 최종 조회도 취소와 분리된 deadline을 사용하고, ID/이름/접근 종류/대상/목록 허용/만료를 요청과 비교한다. 읽기 실패나 불일치만으로 새 PAR을 자동 삭제하지 않고 `bucket_sharing_unconfirmed`를 반환한다. URI는 확인 성공 시 기존 응답 경로에서만 반환하며 로그/오류에 넣지 않는다.
- retention/PAR 목록의 data 누락/null, ID 누락/중복은 불완전 응답 오류다. 명시적인 빈 배열만 삭제 확인에 사용한다. validation rules version은 2026-09-27.12.
- 아직 OCI mutation 간 부분 실패 후 모든 최종 상태의 감사 관측, ETag 기반 경쟁 조건, 실제 공급자 확인은 미완료다. 현재 비교는 설정 관측이며 권한 효과를 입증하지 않는다.
- 검증: Go 1.25.13으로 bucketgov/API 전체 통과, 추가 기간/단위/이름/예약 잠금·ID 경계 회귀 후 bucketgov 재검증 및 staticcheck 통과. `git diff --check` 통과. 증거는 로컬 fixture이며 실서비스 호환 완료가 아니다.

### Raw 정책 변경의 최종 조회 확인

- raw PUT/DELETE 후 취소와 분리된 10초 제한으로 기존 GET owner를 호출한다. S3 삭제는 실제 NoSuchBucketPolicy만 확인 성공이며 NoSuchBucket/AccessDenied는 성공이 아니다. Azure 삭제는 private + 빈 저장 정책 목록을 비교한다.
- PUT은 JSON 객체 전체를 비교하고 GCS의 갱신되는 ETag만 제외하되 조회 ETag는 필수다. 숫자는 float64로 반올림하지 않는다. null/잘못된 JSON/추가 JSON 문서는 일치로 취급하지 않는다.
- 저장 오류 및 공급자 충돌 응답을 우선 유지하면서 오류 뒤에도 최종 상태를 조회한다. 성공 응답 뒤 불일치/읽기 실패는 502 bucket_policy_unconfirmed. 자동 쓰기 재시도는 하지 않는다.
- bucket.policy.observed 감사 이벤트에 기존 actor/대상/request ID/rules version과 configuration_confirmed 또는 unconfirmed를 남긴다. 정책 본문·구성원·서명 URI는 로그에 넣지 않는다. 변경 전후 차이 및 사용자별 식별은 아직 미완료다.
- 현 비교는 보수적으로 배열 순서/날짜 표현/공급자 기본값 정규화를 동일시하지 않는다. 따라서 공급자가 의미상 같은 정책을 정규화해도 미확인일 수 있으며 이 비교 개선은 후속 작업이다. 조회 일치는 실효 권한이나 동시 변경 방지를 증명하지 않는다.
- OpenAPI의 성공/미확인 의미와 생성 타입을 갱신했다. 규칙 버전 2026-09-27.13.
- 검증: Go 1.25.13 API 전체 통과(25.393초), 이후 S3 삭제/JSON 숫자 경계 및 최신 규칙 버전을 포함한 집중 회귀 통과. OpenAPI 생성/일치 검사 통과. 실제 공급자와 최신 전체 local gate는 실행하지 않았다.

### Raw 정책 정규화와 전후 감사 요약

- raw 비교에서 GCS bindings/members 순서, S3 Statement/Action/NotAction/Resource/NotResource/Principal 값의 배열 순서를 정규화한다. S3의 단일 statement 객체 및 문자열/단일 배열 표현도 비교한다. 알 수 없는 필드와 중복은 제거하지 않는다.
- Azure 저장 정책 순서를 정규화하고 기존 azureacl.ParseStoredPolicyTime을 재사용해 같은 시각의 날짜/시간대 표현을 비교한다. 공급자 기본값이나 모든 선택 필드 정규화를 완료한 것은 아니다.
- raw 변경 전에도 최대 10초의 조회를 수행한다. 조회 실패가 변경을 차단하지는 않으며 감사 before를 known=false로 남긴다. 변경 후에는 기존 독립 조회를 유지한다.
- 감사 이벤트에 before/after의 known, exists 및 Statement/bindings/storedAccessPolicies 개수와 configuration_matches_before를 기록한다. principal, resource, policy ID, URI, 정책 본문은 기록하지 않는다. 이전 상태와 일치하지 않는다는 관측은 해당 요청만이 변경 원인이라는 증거가 아니다.
- 규칙 버전 2026-09-27.14. Go 1.25.13 API 전체 테스트 통과(25.659초), 최신 정규화/감사 민감값 제외/규칙 버전 집중 회귀 통과. git diff --check 통과. 실제 공급자 및 최신 full gate 증거는 아니다.
- typed 항목별 전후 감사, 승인 대상/동시 수정/UI 연결, 공급자 공식 규칙 매트릭스 및 실환경 검증은 계속 남아 있다.

### Typed governance 전후 감사 관측 연결

- access/public exposure/protection/encryption/lifecycle/sharing HTTP 변경 경로에 공통 전후 관측을 연결했다. versioning은 기존 요청값 비교 감사 경로를 유지한다. 입력 검증을 먼저 수행해 잘못된 요청으로 공급자 조회를 발생시키지 않는다.
- 변경 전 조회는 요청 취소를 따르는 최대 10초, 변경 후 조회는 요청 취소와 분리된 최대 10초다. adapter의 저장 결과 확인에 추가되는 감사 조회이며 권한 부족 등 감사 조회 실패가 기존 저장 결과나 오류를 덮어쓰지 않는다. 따라서 성공·실패 모두 최대 두 번의 추가 읽기가 발생한다.
- before/after known, ownership/public exposure/encryption mode, protection 활성·일수·잠금 상태 및 binding/policy/rule/PAR 개수를 명시적 허용 목록으로 기록한다. 변경된 요약 필드 이름과 반환 view 전체의 정확한 동일 여부만 추가하며 본문/식별자/키/URI/태그 값은 기록하지 않는다.
- outcome=state_observed는 조회 성공만 의미한다. adapter의 요청값 일치 판단, 실효 권한, 요청이 변경 원인이라는 보장과 구분한다. 같은 개수에서 구성원이 바뀌는 경우 반환 view 동일 여부가 달라질 수 있지만 민감값별 전후 내용을 제공하지는 않는다.
- 회귀는 민감값 제외, 오류 응답 제외, 변경 요약 필드 및 취소된 쓰기 뒤 제한 시간 조회를 포함한다. 최신 API 전체 검사 결과는 아래 후속 기록에 남긴다.
- 검증: Go 1.25.13 API 전체 테스트 통과(26.717초), git diff --check 통과. 최신 full gate와 실제 공급자 검증은 아직 실행하지 않았다. 승인/동시 수정/UI 결과 연결과 공식 규칙 매트릭스 작업은 계속 남아 있다.

### Typed UI 저장 전 기준 상태 확인

- 네 공급자의 기존 공통 mutation runner에 저장 전 governance 조회를 연결했다. 편집 시작 view와 다르거나 조회 실패 시 쓰기를 보내지 않는다. 이 실패에서는 cache refresh/remount를 하지 않아 draft를 유지한다.
- 사전 조회 후 scope를 다시 검사해 창 닫기·대상/세션 변경 뒤 저장을 차단한다. scope key는 구분자 연결 대신 JSON 배열로 만들어 값에 콜론이 포함된 경우의 충돌을 피한다.
- 조회는 30초 제한이며 자동 mutation 재시도를 명시적으로 끈다. 실제 쓰기 실패 뒤에는 기존 refresh를 유지해 부분 적용 상태를 다시 읽는다.
- 비교는 기존 전체 view draft key를 재사용하므로 다른 항목/경고/표현 변경도 보수적으로 차단할 수 있다. 조회 이후 경쟁은 막지 못하며 ETag 없는 공급자의 원자적 변경 보장을 추가한 것이 아니다. 확인 창의 변경 diff·승인 UX는 아직 후속 작업이다.
- 사전 상태 변경/읽기 실패/조회 대기 중 창 닫기 회귀를 추가했다. 기존 부분 실패/readback fixture는 사전 조회와 변경 후 조회를 구분하도록 수정했다. 초기 31개 modal 테스트 및 최신 typecheck 통과; 관련 bucket UI 전체 검사 결과는 후속 기록에 남긴다.
- 최신 검증: bucket UI 22개 파일/123개 테스트 통과, typecheck 및 git diff --check 통과. 브라우저·실제 공급자·최신 full gate 검증은 이번 변경에서 실행하지 않았다.

### Typed 정책 변경 확인 화면

- 네 공급자의 19개 typed 변경에 공통 확인 화면을 연결했다. 버킷·공급자·프로필, 제출 필드별 현재/제안 값을 표시하고 Cancel 또는 Apply changes로 결정한다. 보존 설정에는 잠금의 비가역성을 안내한다.
- 요청 builder를 확인 전에 실행하고 요청을 복사해 고정한다. 승인 대기 중 draft가 바뀌어도 화면에서 검토한 요청만 제출한다. 승인 후 최신 governance 기준 상태와 scope를 다시 검사한다. 취소/창 닫기/대상 변경은 오류 알림이나 쓰기를 발생시키지 않는다.
- 기존 DialogModal의 focus trap/Escape/모바일 overlay 처리를 재사용하고 초기 포커스는 Cancel이다. PAR URL은 검토 JSON에서 숨긴다. 요청에 없는 필드는 표시하지 않으며 현재 조회값과 요청 표현을 구분한다.
- UI 전체 관련 22개 파일/124개 테스트, 추가 snapshot 회귀를 포함한 modal 33개 테스트, typecheck 및 변경 owner eslint 통과. Chromium governance 8개 흐름 통과. 1280/390px 확인 화면의 Cancel 초기 포커스와 screenshot도 검사했고 390px 렌더를 직접 확인했다. 모두 mock/local UI 증거다.
- raw 정책의 기존 승인 흐름은 이번 typed 확인 화면 변경에 포함하지 않았다. 공식 규칙 매트릭스, 원본 WS/MP4 재현, 실환경 효과 및 최신 전체 gate 검증은 여전히 남아 있다.

### 공식 규칙 매트릭스와 제한 오류 수정

- `BUCKET_GOVERNANCE_VALIDATION_MATRIX.md`에 AWS/GCS/Azure/OCI의 편집 항목별 필드·단위·조합·owner·공식 근거와 남은 증거를 정리했다. Ceph/S3-compatible은 제품/버전 미확정으로 AWS 결과를 대입하지 않는다. 매트릭스 작성이 모든 규칙 구현 완료를 뜻하지는 않는다.
- 공식 OCI PAR 문서는 개수 제한이 없다고 명시한다. 잘못된 API/UI 100개 제한을 삭제했다. retention 규칙 100개 제한과 PAR 목록의 기존 `--all` pagination은 유지한다. 중복 ID 검사는 유지한다.
- GCS 활성 retention은 1..36525일(3155760000초), Azure 활성 soft delete는 1..365일, immutability는 1..146000일로 제한했다. GCS 초 변환은 플랫폼 int 폭과 분리된 int64를 사용한다. OpenAPI 설명·생성 타입·규칙 버전 2026-09-27.15를 갱신했다.
- Azure versioning/soft delete는 선택한 컨테이너만의 설정이 아니므로 typed 승인 화면에 계정 전체 영향 범위를 명시했다.
- Go 1.25.13 bucketgov/API 전체 테스트 통과(API 25.320초), PAR 101번째 추가 UI 회귀 통과, OpenAPI 생성/일치 및 typecheck 통과. 변경 UI owner eslint와 git diff --check 통과. account scope 표시 회귀는 후속 검사한다.
- 매트릭스 대조로 OCI YEARS/indefinite의 손실 없는 표현, retention/versioning 조합 사전 검사, lifecycle 세부 조합 등의 잔여를 구체화했다. 실제 공급자 효과와 제품/버전 증거는 여전히 없다.
- Azure 승인 화면 account scope 집중 회귀 통과. 상단 잔여 표의 오래된 gate/감사/승인 상태도 현재 기록에 맞게 갱신했다.

### OCI retention/versioning 조합 사전 검사

- OCI 공식 retention/versioning 상호 제약을 adapter 공통 쓰기 경로에 반영했다. versioning 활성화 전 retention 목록이 명시적인 빈 배열이어야 하며, 하나라도 있거나 조회 실패/목록 누락이면 쓰지 않는다.
- 비어 있지 않은 retention 설정을 적용하기 전 versioning을 조회한다. Disabled/Suspended만 허용하며 Enabled, 누락, 알 수 없는 값, 조회 실패는 쓰기 전에 중단한다. 기존 입력/잠금 검증 이후 실행해 유효하지 않은 요청은 먼저 거부한다.
- versioning 중단과 retention 전체 삭제는 이 추가 조합 조회를 요구하지 않는다. 읽기~쓰기 경쟁이나 replication 대상/계정 제약을 모두 해결한 것은 아니다.
- 기존 rollback fixture에 실제로 허용되는 versioning 상태를 추가했다. 누락된 클라이언트 오류가 원래의 생성 실패 회귀를 대신 통과시키지 않도록 create-failure fixture도 보완했다. 새 회귀는 양방향 충돌/읽기 실패/누락/정상 상태와 쓰기 횟수를 확인한다.
- 규칙 버전 2026-09-27.16. bucketgov 전체 테스트 통과. API 전체 검사 결과는 후속 기록에 남긴다. 공급자 live 증거는 아니다.
- 최신 검증: Go 1.25.13 bucketgov/API 전체 통과(API 24.453초), git diff --check 통과. 최신 전체 local gate와 실환경 검증은 아직 남았다.

### OCI 기간 단위와 무기한 규칙 보존

- 기존 YEARS→365일 환산을 제거했다. rule 모델/OpenAPI에 years와 indefinite를 추가하고 days/years/indefinite=true 중 정확히 하나를 요구한다. 양수 기간만 허용하며 provider의 빈 duration은 무기한으로 표현한다. 잘못된 단위/0 기간/기간 없는 잠금 응답은 읽기 오류다.
- UI에서 Days/Years/Indefinite를 선택하고 해당 요청만 보낸다. 조회한 연도는 일수로 바꾸지 않으며 무기한 규칙도 다른 규칙과 함께 유지/수정할 수 있다. 잠긴 규칙의 단위 변경/기간 단축/무기한 전환을 거부한다. 잠금 예약 생성/해제 기능은 추가하지 않았다.
- OCI CLI writer에 단위를 직접 전달한다. 무기한 생성은 기간 옵션을 생략하고, 기존 기간 해제는 공식 update의 빈 --time-amount 인수를 사용한다. 인수 생성 공통 helper 회귀가 실제 빈 인수와 잘못된 조합 거부를 확인한다. 최종 목록에서는 단위/수량/null과 잠금 시각을 그대로 비교한다.
- 공식 근거: https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/os/retention-rule/create.html 및 https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/os/retention-rule/update.html . 문서 확인 버전과 배포 OCI CLI 버전 일치는 아직 live 증거가 없다.
- 규칙 버전 2026-09-27.17. Go 1.25.13 bucketgov/ocicli/API 전체 통과(API 27.676초), bucket UI 24개 파일/130개 테스트 통과, OpenAPI 생성/일치·typecheck·변경 UI eslint·git diff --check 통과.
- Chromium 1280/390px에서 연도 수정과 무기한 규칙 보존·승인·제출·재조회 흐름 2개 통과. mock/provider 함수 fixture 증거이며 실제 OCI 적용은 미검증이다. 최신 전체 gate, 원본 WS/MP4, 실제 provider 허용/거부 및 남은 규칙 조합 검증은 계속 남았다.

### 누적 변경 전체 local gate와 raw 변경 전 재확인

- OCI 기간 표현 변경까지 코드를 고정한 상태에서 `GOTOOLCHAIN=go1.25.13 CHECK_FRONTEND_DEPS_READY=1 ./scripts/check.sh full` 실행: exit 0, `[check] ok`. 로그 `/tmp/s3desk-issue39-current-full.log`. 프런트엔드 269개 파일/1378개 테스트, 빌드, Chromium smoke 2개, backend/security/third-party notices lane이 완료됐다. govulncheck는 호출 취약점 0, 미호출 import 패키지 취약점 3개를 별도로 보고했다.
- live 환경 preflight를 재실행했으나 AWS/Azure/Ceph/GCS/OCI 필수 설정은 모두 누락(exit 1). 실제 공급자 검증으로 대체하지 않았다. 원본 #39의 S3D-009 A~D 요구와 완료 기준을 다시 읽었고 raw 저장의 기준 상태 재확인이 아직 빠져 있음을 확인했다.
- full gate 종료 후 raw PUT/DELETE에 최대 30초의 최신 정책 조회를 추가했다. 편집 시작 정책을 고정하고 존재 여부·정책·버킷을 비교한다. 외부 변경, 조회 실패, 대기 중 편집/화면 변경은 쓰기를 막는다. preflight 오류에서는 query refresh를 건너뛰어 draft를 유지한다. 실제 쓰기 실패에는 기존 재조회를 유지한다.
- 비교는 보수적인 JSON 비교라 표현/순서 변경도 충돌로 볼 수 있다. provider CAS 없는 조회~쓰기 경쟁은 남는다. raw Save의 별도 승인 화면은 아직 후속 작업이다.
- 후속 raw modal 28개 테스트 통과. 기존 readback 실패 fixture는 사전 조회와 후속 조회를 분리했고 외부 변경 시 PUT/DELETE 차단 회귀를 추가했다. 이 후속 코드는 위 full gate 이후 변경이므로 그 gate의 검증 범위에 포함시키지 않는다.

### Raw 정책 저장 승인 화면

- raw Save에 기존 DialogModal과 unifiedDiff를 재사용한 승인 화면을 추가했다. 버킷/공급자/프로필, 정책 diff, 전체 문서 교체와 접근 권한 영향 안내를 표시한다. Cancel에 초기 포커스를 두고 취소하면 draft를 유지한다.
- 검토 요청을 복사해 고정하며 승인 대기 중 draft가 변경되면 저장을 거부한다. 승인 후 기존 preflight가 최신 정책과 편집 기준을 다시 비교한다. 화면 scope key도 JSON 배열로 구성해 구분자 포함 값의 충돌을 피한다.
- raw modal 31개 테스트, typecheck, 변경 owner eslint 및 diff check 통과. Chromium에서 재연결 실패 후 draft 보존/재시도와 1280/390px 승인·취소·저장 흐름 3개 통과. 이는 로컬 mock UI 증거다.
- 최신 전체 gate를 `/tmp/s3desk-issue39-raw-review-full.log`에 실행 중이다. 공급자 조합의 잔여 검증, 원본 WS/MP4 및 실제 공급자 효과는 계속 미완료다.

### Raw 승인 포함 전체 gate 및 AWS lifecycle 잔여 검증

- `/tmp/s3desk-issue39-raw-review-full2.log`: 전체 gate exit 0, `[check] ok`. frontend 269개 파일/1383개 테스트, build, Chromium smoke 2개 및 backend/security/notices 통과. 첫 실행은 새 브라우저 테스트의 직접 scrollWidth/clientWidth 측정이 저장소 authoring 규칙에 걸려 종료됐으며, 불필요한 측정을 제거한 뒤 재실행했다.
- 이후 AWS lifecycle 공통 parser에서 newerNoncurrentVersions의 0 허용을 1..100으로 수정하고 동작 없는 enabled/disabled 규칙을 거부했다. 빈 전체 rules 배열의 삭제 의미는 유지한다. 기존 Filter 정규화가 noncurrent 보존 개수 사용 시 필수 Filter도 제공함을 회귀로 확인했다.
- 공식 근거: https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html 및 https://docs.aws.amazon.com/AmazonS3/latest/userguide/ErrorCodeBilling.html . 2026년 7월 폐지된 IA 전환의 30일 제한은 도입하지 않았으며 days=0의 STANDARD_IA/ONEZONE_IA 수락을 검사한다.
- 테스트에서 텍스트/태그/ID만 검사하던 action 없는 fixture는 정상 expiration을 포함하도록 보완했다. HTTP 우회 입력에서 0 보존 개수 및 action 누락이 provider 쓰기 전 400으로 차단됨을 확인한다.
- 규칙 버전 2026-09-27.18. Go 1.25.13 bucketgov/API 전체 통과(API 24.137초), OpenAPI 생성/일치 및 git diff --check 통과. 이 lifecycle 후속 수정은 앞서 기록한 full gate 이후이므로 그 gate 범위로 주장하지 않는다.
- 다음 코드 대조 항목은 GCS uniform access 해제의 lockedTime/조건부 IAM 결합이다. 실제 환경/원본 WS·MP4 증거는 계속 미확보다.

### GCS uniform access 해제 사전 검사

- protection adapter의 공통 쓰기 전에 현재 enabled 상태를 명시적으로 확인한다. hierarchical namespace 사용 버킷은 해제를 차단하며, 활성 상태에서는 lockedTime이 읽을 수 있는 미래 시각이어야 한다. 만료/누락/잘못된 시각이면 쓰지 않는다.
- 활성 상태의 해제는 IAM 정책을 조회하고 revision 및 조건부 binding 부재를 확인한다. 읽기 실패/불완전 정책/조건부 binding은 retention을 함께 요청한 경우에도 전체 patch 전에 중단한다. 이미 비활성인 설정은 추가 IAM 조회를 요구하지 않는다.
- typed 승인 화면에 활성화 시 object ACL만으로 얻던 접근의 제거와 90일 후 해제 불가, 비활성화 시 기존 ACL 접근 복원 가능성을 표시했다.
- 규칙 버전 2026-09-27.19. 계층형 namespace, 미래/과거/누락/잘못된 deadline, IAM 읽기 실패/revision 누락/조건부 정책, 정상/이미 비활성의 10개 경로를 검사한다. Go 1.25.13 bucketgov/API 전체 통과(API 23.909초), UI 안내 회귀 2개, OpenAPI 생성/일치·typecheck·변경 owner eslint·git diff --check 통과.
- 근거: https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access 및 https://docs.cloud.google.com/storage/docs/json_api/v1/buckets . 조직 정책/managed folder 제약은 공급자가 판정하며, metadata/IAM 조회 이후 경쟁과 실제 ACL 권한 효과는 이 검사로 증명하지 않는다. 최신 전체 gate 재검증 및 실환경 증거는 남아 있다.

### r19 전체 gate 및 OCI PAR 대상 보존

- AWS lifecycle 경계/필수 action과 GCS uniform access preflight까지 포함해 코드를 고정하고 full gate를 실행했다. `/tmp/s3desk-issue39-r19-full.log`: exit 0, `[check] ok`, frontend 269개 파일/1385개 테스트, build, Chromium smoke 2개 및 backend/security/notices 통과.
- 원본 S3D-009의 A~D와 10개 완료 기준을 재대조했다. 실제 제품/버전, 공급자별 허용·거부·복구, 원본 업로드/WS/MP4 검증은 현재 증거로 완료 판정할 수 없다. live 환경 preflight를 재실행했고 AWS/Azure/Ceph/GCS/OCI 필수 설정 모두 누락(exit 1). 운영 대상에 쓰기는 하지 않았다.
- gate 이후 OCI PAR ObjectName의 TrimSpace를 UI builder, adapter 생성/조회/비교, CLI 인수에서 제거했다. 공백만 있는 prefix를 빈 값으로 바꾸면 bucket-wide로 범위가 확대되는 결함이다. 이제 공백·한글·+/%·탭을 원문대로 전달하며 readback도 정확히 비교한다. 빈 문자열만 기존 bucket-wide 의미를 유지한다.
- bucketgov/ocicli 전체 테스트 통과. 가짜 CLI 실행의 실제 argv, adapter 생성→목록→비교와 UI builder 5개 테스트가 공백 보존을 확인한다. 이 증거는 OCI 실서비스의 URL 효과를 증명하지 않는다. 후속 OCI 수정은 위 full gate 범위에 포함되지 않는다.
- 추가로 확인한 잔여 코드 대조: OCI UI가 기존 ObjectRead/ObjectWrite 계열을 AnyObjectRead로 치환하는지, 신규 write-only PAR의 ListObjects 조합 처리. 새로운 접근 기능 확장보다 기존 대상/권한의 손실 없는 보존부터 확인한다.

### OCI PAR 권한 유형 보존과 목록 조회 조합

- 기존 PAR을 draft 및 생성 결과 view로 옮길 때 ObjectRead/ObjectWrite/ObjectReadWrite 등을 AnyObjectRead로 치환하던 경로를 제거했다. 알려지지 않은 기존 유형도 원문으로 표시·보존하고 기존 항목은 계속 읽기 전용이다. 신규 생성 지원 범위는 기존 AnyObject 3종을 유지한다.
- 새 AnyObjectWrite PAR에서 ListObjects를 서버 validator가 거부한다. UI는 write-only 선택 시 Deny로 명시적으로 변경하고 목록 선택을 비활성화한다. 기존 PAR은 생성 규칙을 재적용해 덮어쓰지 않는다.
- 근거: https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/os/preauth-request/create.html 의 bucket-listing-action 계약. 규칙 버전 2026-09-27.20 및 OpenAPI 설명/생성 타입을 갱신했다.
- 기존 권한 4종 보존(미지 유형 포함), 대상 공백 보존, write-only 전환 등의 UI 10개 테스트 통과. Go 1.25.13 bucketgov/API 전체 통과(API 24.790초), 추가 직접 HTTP 우회 거부 회귀 통과. OpenAPI 생성/일치, typecheck, 변경 owner eslint 및 diff check 통과. 기존 governance modal을 함께 실행한 결과는 후속 기록한다.
- 실환경 권한 효과와 최신 전체 gate는 아직 이 후속 코드의 증거에 포함되지 않는다.

- 후속 UI 통합 회귀: BucketGovernanceModal + ociSharingLimit 2개 파일/46개 테스트 통과(`/tmp/s3desk-oci-sharing-ui.log`).

### OCI PAR 시각 정규화와 ID 비교

- OCI PAR readback과 기존 항목 불변성 검사에서 만료 시각을 문자열 비교하던 경로를 RFC3339 파싱 후 시각 비교로 변경했다. Z/+00:00/다른 시간대 및 0 소수초 표현은 같은 시각으로 처리하며, 실제 마이크로초 차이·누락·잘못된 값은 불일치다.
- PAR ID의 대소문자 무시 중복 검사를 제거하고 현재 inventory map/공급자 ID와 같은 정확한 비교를 사용한다. 실제 동일 ID 중복 거부는 유지한다. 규칙 버전 2026-09-27.21.
- 집중 회귀는 같은 시각의 표현 차이, 1마이크로초 차이, 누락/오류, 대소문자만 다른 ID와 정확히 중복된 ID를 포함한다. 최신 전체 검사 결과는 후속 기록한다.

### 완료 조건 재대조 (r21)

| 원본 요구 | 현재 로컬 근거 | 완료 판정에 남은 증거 |
|---|---|---|
| S3D-001 이름/상대경로/Retry | UTF-8 헤더 encode/decode 및 회귀 | 실제 공급자의 ASCII/다국어 업로드·키 재조회·Retry |
| S3D-002 실시간/정리/복구 | timeout/late-open 및 cleanup 단위 회귀 | 제보 환경의 handshake·전환·Transfers 상태와 서버 로그 |
| S3D-003 썸네일/메타데이터 | 실제 ffmpeg 합성 영상·seek fallback·선택 경합 회귀 | 원본 객체의 415·stat·작은/큰 실제 렌더 |
| S3D-004~008 Favorites/선택/Grid/Details/Navbar | 소유 코드 수정 및 기록된 API/브라우저/레이아웃/키보드 회귀 | 배포 환경 결과로 확대 해석하지 않음 |
| S3D-009 A 편집 범위/규칙 근거 | BUCKET_GOVERNANCE_VALIDATION_MATRIX.md와 owner 매핑 | 실제 제품/API·배포 버전·대상 환경 식별 |
| S3D-009 B 서버 검증/보존/결과 | 공통 validator·공급자 adapter·최종 readback·직접 HTTP 우회 회귀 | 실제 계정·권한·조직/replication 제약과 다단계 lifecycle 효과 |
| S3D-009 C 검증/승인/충돌/감사 | static-only 표시, raw/typed 승인·snapshot·기준 상태 조회, ETag 경로, 자동 재시도 제거, 전후 요약 감사 | CAS 없는 경쟁 및 실효 권한, 배포 인증의 개인 식별·로그 보존 |
| S3D-009 D 정상/실패/경계/회귀 | 공급자 fixture·단위/API·브라우저 로컬 검사 | 격리된 실제 공급자에서 허용/거부/실패/충돌/복구 |

- GCS 조건부 IAM의 uniform-access 및 조직 제약은 실제 GCS 변경 API의 수락/거부가 최종 판정한다. 공통 쓰기 경로는 거부/충돌/읽기 실패를 성공으로 바꾸지 않지만, 이를 공급자 호환 테스트 통과로 계산하지 않는다. 모든 계정·프로젝트·제품 조합을 로컬 fixture만으로 인증할 수 없다.
- 운영 적용 게이트는 여전히 미완료다. 로컬 코드와 검사 완료를 실제 제공자 통합 결과/원본 재현의 대체 근거로 사용하지 않는다.

- r21 최신 전체 gate: `GOTOOLCHAIN=go1.25.13 CHECK_FRONTEND_DEPS_READY=1 ./scripts/check.sh full` exit 0, `[check] ok`. 로그 `/tmp/s3desk-issue39-r21-full.log`; frontend 269개 파일/1394개 테스트, build, Chromium smoke 2개 및 backend/security/notices 통과. 해당 실행 중 제품 코드를 변경하지 않았다. 마지막 diff check도 통과했다.
- 남은 실제 환경 증거를 위해 격리 테스트 설정 경로와 제보 S3Desk 주소·원본 MP4 위치를 요청했다. 비밀값 자체는 요청하지 않았다. 현재 자격/대상은 확보되지 않았고 커밋·푸시·배포·외부 정책 변경은 하지 않았다.

- 환경 대기 재확인: `/tmp/s3desk-issue39-live-preflight-final.md`에서 5개 공급자 필수 설정 누락을 다시 확인했다(exit 1). 기존 전체 gate는 `[check] ok`로 종료됐으며 실행 중인 검사를 기다리는 상태가 아니다. 요청한 격리 환경/원본 대상 정보 없이는 남은 실제 환경 증거를 추가할 수 없다. 상단의 오래된 검사 수치와 UI 결과 연결 상태를 r21 기준으로 정리했다.
