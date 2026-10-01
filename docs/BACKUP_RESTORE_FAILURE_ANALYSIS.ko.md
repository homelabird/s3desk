# 백업 복원과 마이그레이션 실패 분석

이 문서는 S3Desk 운영자가 백업 생성부터 복원과 서비스 전환까지 각 실패의 데이터 영향을 판단하고, 재시도 또는 되돌리기를 선택하는 데 사용한다. 2026년 10월 1일 분석을 시작해 10월 2일 구현과 검증을 반영했다. 실제 provider와 배포 환경에서의 성공을 선언하는 문서가 아니다.

핵심은 DB 트랜잭션, 파일 교체, HTTP 응답, 서비스 전환이 서로 다른 완료 지점을 가진다는 점이다. `201` 또는 DB ping 하나로 모든 단계의 성공을 판단하지 않는다. 소스와 대상의 쓰기를 멈추고, 소스 및 대상의 독립 백업과 키를 보존한 뒤 전환해야 한다. 실패 이후 자동으로 이전 DB를 덮어쓰면 이미 발생한 정상 변경까지 잃을 수 있으므로 되돌리기는 운영자의 명시적 작업으로 수행한다.

## 현재 동작과 근거

| 대상 | 현재 구현 | 보장 범위 |
| --- | --- | --- |
| Full과 Cache 백업 | [snapshot export](../backend/internal/api/handlers_server_backup.go), [SQLite snapshot](../backend/internal/store/store_backup.go) | DB는 일관된 snapshot이다. 뒤이어 복사하는 runtime 파일과 같은 시점은 아니다. |
| Portable export | [논리 export](../backend/internal/store/store_portable.go), [bundle writer](../backend/internal/api/handlers_server_portable.go) | 9개 논리 entity와 선택적 썸네일. PostgreSQL export는 repeatable read를 사용한다. object 본문, 환경 설정, 키, staging 파일은 포함하지 않는다. |
| Snapshot restore | [복원과 검증](../backend/internal/api/handlers_server_backup.go), [staging commit](../backend/internal/api/handlers_server_restore_staging.go) | Full과 Cache SQLite만 받아 무결성 및 현재 모델의 column을 검사하고 별도 디렉터리에 저장한다. live DB를 교체하지 않는다. |
| Portable replace | [DB 교체](../backend/internal/store/store_portable.go), [파일 교체](../backend/internal/api/handlers_server_portable_apply.go) | DB 교체는 단일 트랜잭션이다. 썸네일 준비는 DB 교체 전, 파일 rename은 DB commit 뒤다. 파일 실패는 `partial`이다. |
| 프로세스와 요청 | [프로세스 잠금](../backend/internal/dirlock/lock.go), [서버 잠금](../backend/internal/api/server.go) | 한 DATA_DIR의 프로세스를 제한하고 restore/import끼리 직렬화한다. 모든 API writer와 background writer를 멈추는 maintenance mode는 아니다. |
| Cutover | [apply plan](../backend/internal/api/handlers_server_backup.go), [startup](../backend/internal/app/app.go) | helper는 환경 설정 예시다. 서비스를 중단하거나 mount, proxy, DNS를 변경하는 실행 스크립트가 아니다. startup은 migration, secret encryption 및 job recovery를 수행할 수 있다. |

이전 개선으로 v3의 KDF 기반 인증, 무서명 기본 거부, SQLite 검증, 소스 staging 세션 차단, 자산 사전 준비와 `partial`, 내보내기 크기 제한을 반영했다. 기존 v2 비밀번호 백업은 읽을 수 있지만 빠른 비밀번호 검증 취약성은 기존 파일에서 사라지지 않는다. 안전한 채널에서 v3로 다시 내보내야 한다.

## 실패 시나리오와 복구 방법

| 실패 | 영향을 받는 데이터 | 복구 방법 | 확인할 결과 |
| --- | --- | --- | --- |
| export 중 디스크 부족 또는 취소 | live DB는 교체하지 않는다. 준비 파일이 남을 수 있다. | 불완전 다운로드를 사용하지 말고 여유 공간을 확보한 뒤 새로 export한다. | 새 bundle의 checksum, signature 및 전체 압축 stream 검증 |
| DB snapshot 뒤 runtime 파일이 변경 또는 삭제됨 | DB와 staging 또는 job 파일이 다른 시점을 나타낼 수 있다. | 쓰기를 멈추고 jobs를 drain한 뒤 다시 export한다. 이미 만든 online bundle만으로 일치 여부를 단정하지 않는다. | pending job와 staging 파일 목록, source 볼륨 보존 |
| 전송 도중 끊김 또는 GZIP trailer 손상 | 적용 전에는 대상 데이터가 그대로다. | 원본에서 다시 전송하고 preview를 반복한다. TAR EOF만으로 GZIP 검증이 끝나지 않는다. | `400`, live DB와 썸네일 유지, 실패 staging 정리 |
| TAR 종료 뒤 암호화 frame 손상 또는 비정상 tail | 파일 checksum이 정상이어도 읽지 않은 tail이 존재할 수 있다. | 전체 encrypted reader의 EOF와 frame 인증까지 검사하고 거부한다. | clear/encrypted, snapshot/portable 모두 적용 전 거부 |
| 비밀번호 오류, signature 불일치, signed bundle에서 signature 제거 | 대상 데이터에 적용하지 않는다. | 올바른 원본과 password 또는 source key를 확보한다. `allowUnsigned`로 잘못된 signature를 우회하지 않는다. | signature 검증 또는 명시적 unsigned 경고 |
| 비밀번호 또는 ENCRYPTION_KEY 분실 | bundle 복호화와 provider credential 해독은 각각 실패할 수 있다. | 독립 보관한 해당 비밀번호와 source ENCRYPTION_KEY를 복구한다. 둘은 서로 대체하지 않는다. | provider 연결 확인. 키가 없으면 복원 불가능할 수 있음 |
| Portable bundle을 snapshot restore로 제출 | staged DATA_DIR에 사용할 SQLite가 없다. | Portable preview/import로 처리한다. | snapshot 경로에서 거부, live DB 유지 |
| SQLite 손상 또는 현재 column 누락 | staging의 startup이 실패할 수 있다. | 손상 전 백업을 사용하거나 source를 지원 버전으로 업그레이드한 뒤 재export한다. | read-only integrity, foreign key, 모델 column 검사 |
| source에 local staging 업로드가 남음 | Portable에는 업로드 파일이 없다. | source에서 업로드를 완료 또는 취소한 뒤 다시 export한다. | preview blocker 해소. direct/presigned metadata와 구분 |
| destination에 local staging 업로드가 남음 | replace가 metadata만 지우면 로컬 파일과 업로드 관계를 잃는다. | 대상 staging 작업을 완료 또는 취소한 뒤 import한다. 강제로 파일만 지우지 않는다. | DB 교체 전 차단과 대상 파일 보존 |
| 대상에 queued/running job이 존재 | job과 provider side effect가 교체와 경합할 수 있다. | 신규 job 생성을 중단하고 drain 또는 cancel한다. | store의 active-job guard. drain 뒤 export/import |
| preview 이후 대상 데이터가 바뀜 | preview는 적용을 예약하거나 대상 상태를 고정하지 않는다. | 실제 replace 직전의 DB preimage를 복구본으로 저장하고, 쓰기를 멈춘 상태에서 적용한다. | recovery bundle이 실제 replacement transaction의 이전 상태를 담음 |
| 복구본 쓰기, 압축 또는 동기화 실패 | 복구본 없이 데이터를 지우면 되돌릴 수 없다. | DB 삭제 전에 import를 중단한다. 공간과 권한을 고친 뒤 재시도한다. | 이전 rows 및 썸네일 유지 |
| DB delete 또는 insert 중 SQL 오류 또는 context 취소 | 미완료 transaction은 rollback한다. commit 응답 유실은 별도로 판단해야 한다. | 기존 rows를 확인한 뒤 재시도한다. commit 결과가 불명확하면 복구 기록을 먼저 확인한다. | 모든 entity가 이전 또는 새 상태이며 중간 삭제 상태가 아님 |
| DB commit 뒤 썸네일 rename 실패 | 새 DB와 이전 썸네일이 공존할 수 있다. | `partial` 경고를 읽고 썸네일을 재생성하거나 보존된 이전 tree를 복구한다. DB까지 되돌릴 때는 이전 logical bundle을 사용한다. | `assetRecoveryDir`, 복구본, filesystem 상태 |
| commit 전후 프로세스 강제 종료 | defer와 HTTP 응답은 실행되지 않을 수 있다. | 재시작 전에 쓰기를 멈추고 disk 기록과 DB를 확인한다. 미완료 기록은 commit 미확정으로 취급한다. 자동 replay하지 않는다. | recovery 기록, 현재 rows, 준비 tree와 previous tree |
| DB commit 성공 뒤 HTTP 응답 유실 | 클라이언트는 실패처럼 보지만 DB는 바뀌었을 수 있다. | 동일 bundle을 곧바로 재import하지 말고 보존된 완료 기록과 대상 상태를 확인한다. | disk의 `complete` 또는 `partial` 결과. DB ping 이상의 확인 |
| health ping 성공 뒤 provider 연결 또는 multipart 재개 실패 | logical metadata는 정상이어도 DNS, TLS, bucket, 권한, TTL 등이 다를 수 있다. | 새 환경의 endpoint와 권한을 수정하고 provider에서 상태를 확인한다. 만료 upload는 새로 시작하고 provider의 orphan multipart를 정리한다. | profile test, object read, multipart native 상태 |
| 서비스 시작 또는 환경 설정 오류 | 새 DATA_DIR와 DB가 있어도 서버가 시작되지 않을 수 있다. | 이전 DATA_DIR, DB 연결, image, 환경 설정으로 복귀한다. 원본 보존본은 새 binary의 migration에 직접 노출하지 않는다. | 이전 환경의 startup과 실제 object read |
| 전환 뒤 새 쓰기 발생 후 failback | 단순 이전 데이터 복귀는 새 쓰기를 잃는다. 두 서버가 쓰면 상태가 갈라진다. | 양쪽 쓰기를 멈추고 변경량을 분리 보존한다. 먼저 유지할 DB와 provider 상태를 결정하고 그 상태로 전환한다. | 한 개 writer, 새 쓰기의 보존 또는 명시적 수용된 손실 범위 |
| 디스크 또는 DB 서버 전체 상실 | 같은 DATA_DIR의 recovery bundle도 함께 사라질 수 있다. | 별도 저장소의 검증된 백업과 native PostgreSQL backup 또는 provider backup을 사용한다. | off-host 복구와 측정한 RPO 및 RTO |

## 개선 설계와 적용 순서

다음은 이 리포트를 바탕으로 구현한 범위다. 검증 결과와 환경 의존 gate는 아래 기록으로 구분한다.

1. 모든 restore/import 경로에서 GZIP EOF를 검사한다. 암호화 내부 TAR도 reader의 EOF까지 검사하여 마지막 frame 인증을 확인한다. 종료 padding은 제한된 0 byte만 허용해 tail 검사 자체가 무제한 압축 해제를 만들지 않게 한다.
2. Portable replace의 DB transaction 안에서 이전 9개 entity를 export한 뒤 기존 archive writer로 `before.tar.gz`를 저장한다. 파일과 디렉터리 동기화가 성공해야 DB 삭제를 시작한다. 추가 export 실패는 replace 실패다. destination ENCRYPTION_KEY가 있으면 복구 bundle도 v3로 암호화한다.
3. 작업별 `DATA_DIR/import-recovery/<id>`에 시작 단계와 완료 결과를 저장한다. DB commit과 파일 rename은 원자적으로 묶지 않는다. 중간 종료 기록은 `commit_unknown`처럼 미확정 상태로 해석하고, 완료된 `complete` 또는 `partial` 기록으로 응답 유실을 확인한다. 기록에는 credential이나 password를 넣지 않는다. incomingPayloadSha256으로 입력 bundle을 식별한다. 응답에 recoveryDir와 recoveryBundlePath를 제공한다. 준비한 썸네일 파일과 디렉터리도 동기화하며, 교체 후 디렉터리 동기화 오류는 partial로 반환한다.
4. 대상의 staging upload sessions를 store에서 차단하여 저장한 logical 복구 bundle에 누락된 로컬 파일 의존성이 없도록 한다. PostgreSQL에서는 이전 rows와 교체가 하나의 일관된 DB snapshot에서 처리되도록 transaction 격리를 명시한다. 일반 API와 provider의 모든 쓰기를 자동 동결한다는 보장은 하지 않는다.
5. recovery bundle은 성공 후에도 자동 삭제하지 않는다. 별도 위치에 보존한 verified backup과 cutover 결과가 확인된 뒤 운영자가 정리한다. restore cleanup API는 이 경로를 삭제하지 않는다. DB나 provider에 자동 rollback을 수행하는 background job은 추가하지 않는다.
6. 실제 import를 한 번 시도하면 UI의 이전 preview를 즉시 무효화한다. 완료, 부분 완료, 요청 오류 이후 같은 preview로 반복 replace하지 못한다. 응답을 확인하지 못하면 대상 상태와 작업 기록을 확인하라는 안내를 표시한다.

이 복구본은 Portable 범위의 논리 되돌리기다. schema migration, remote object 본문, 외부 provider side effect, 환경과 비밀 키를 되돌리지 않는다. native DB backup과 소스 보존을 계속 사용해야 한다. 복구본 작성은 DB transaction을 오래 유지할 수 있으므로 큰 DB는 사전에 같은 크기의 시험 환경에서 소요 시간과 공간을 측정한다. preview의 `spaceReady`는 incoming 썸네일 기준이며 대상 전체 복구본의 여유 공간을 보장하지 않는다. 실제 import에서 기존 대상이 크기 제한을 넘거나 복구본 저장 공간이 부족하면 DB를 교체하지 않는다. incoming entities와 대상 preimage가 메모리에 함께 존재하므로 큰 object index의 메모리 용량도 측정해야 한다.

## 복구와 서비스 전환 절차

### Snapshot restore

1. source에서 새로운 upload와 기타 변경을 중단하고 queued/running jobs를 drain한다. source ENCRYPTION_KEY와 환경 설정을 독립적으로 보관한다.
2. Full bundle을 export하여 별도 저장소에 보존한다. 대상에서 stage하고 validation과 warnings를 확인한다.
3. 이전 live DATA_DIR와 환경, binary 또는 image를 보존한다. 이전 데이터 보존본에 새 binary를 먼저 실행하지 않는다.
4. 대상을 정지한 뒤 검증된 staged DATA_DIR 또는 그 작업 복사본으로 시작한다. 같은 DATA_DIR에 두 서버를 실행하지 않는다.
5. 인증된 meta, profile 연결, 대표 object read, pending job 상태를 확인한다. 사용자 쓰기를 열기 전에 실패하면 대상을 정지하고 이전 DATA_DIR와 환경으로 복귀한다.
6. 쓰기를 연 뒤 문제가 생기면 먼저 새 데이터의 backup을 확보하고 변경량을 확인한다. 무조건 이전 DATA_DIR로 전환하지 않는다.

### Portable import

1. source와 target의 쓰기를 멈추고 jobs와 staging uploads를 완료 또는 취소한다. native PostgreSQL backup 또는 Full SQLite backup도 확보한다.
2. source bundle을 target에서 preview하고 key, version, entity checksum, 용량 blockers를 해결한다. preview는 provider 연결 성공을 증명하지 않는다.
3. import 결과의 recovery 경로를 보관한다. 요청 결과를 받지 못하면 `DATA_DIR/import-recovery`의 작업별 기록을 먼저 확인한다.
4. `complete`여도 provider 연결, 대표 object 읽기, thumbnail, upload metadata를 확인한다. `partial`이면 cutover를 진행하지 않는다.
5. DB를 되돌릴 경우 현재 상태도 별도 보존하고, 해당 작업의 `before.tar.gz`를 Portable preview/import로 적용한다. key가 없는 clear unsigned 복구본은 신뢰 경로를 확인한 뒤 명시적 trust를 선택한다. 외부 object 변경은 provider의 backup/versioning 절차로 따로 복구한다.
6. 다시 적용하는 rollback도 작업 기록과 복구본을 만든다. 기존 작업 기록을 삭제하거나 재사용하지 않는다. 정상 완료와 보존 backup을 확인한 뒤 오래된 recovery 디렉터리를 선택적으로 정리한다.

### 프로세스 종료나 응답 유실

`before.tar.gz`가 생성되지 않은 작업은 정상 DB 삭제 단계에 도달하면 안 된다. 복구본만 있고 완료 기록이 없다면 DB commit이 됐을 수도 있으므로 쓰기를 멈추고 상태를 확인한다. 완료 기록이 있어도 저장 장치 상실 또는 provider 상태까지 보장하지 않는다.

| `operation.json` 상태 | 해석 | 다음 작업 |
| --- | --- | --- |
| 없음 | 복구본 생성 또는 기록 저장 중 종료했을 수 있다. 정상 구현에서는 durable 기록 없이 DB 삭제를 시작하지 않는다. | 파일과 DB를 확인하고 불완전 bundle을 복원에 사용하지 않는다. |
| `commit_unknown` | 이전 상태는 보존했지만 DB transaction의 최종 결과는 확정하지 못했다. SQL rollback 후에도 이 기록이 남을 수 있다. | 입력 hash와 이전/현재 entity를 비교하고 commit 여부를 판단한다. |
| `database_committed` | DB commit은 성공했고 자산 교체 또는 후속 기록은 미완료다. | 준비 디렉터리, 현재 썸네일, 경고 및 DB 상태를 확인한다. |
| `complete` | 로컬 DB 교체, 자산 단계, count 비교와 health check 및 결과 기록이 완료됐다. | 실제 provider와 cutover 검증을 수행한다. |
| `partial` | DB는 교체됐고 자산, 검증 또는 기록에 문제가 있다. | 경고에 따라 복구하고 쓰기를 열지 않는다. |

이 상태는 API의 bundle checksum 검증과 로컬 적용 결과다. 모든 writer의 동결, provider side effect의 되돌리기, 저장 장치의 전원 장애 내구성을 의미하지 않는다. 호스트나 filesystem 장애가 의심되면 완료 기록도 현재 상태와 대조한다.

기록 확인은 운영자의 server filesystem에서 수행한다. 경로는 API 응답 또는 해당 DATA_DIR의 `import-recovery` 아래에서 확인한다. bundle 원문을 로그나 채팅으로 출력하지 않는다.

```bash
python3 -m json.tool /path/to/DATA_DIR/import-recovery/<id>/operation.json
```

권한과 mount 경로를 확인한 뒤 운영 환경의 인증 수단으로 `before.tar.gz`를 Portable preview/import에 제출한다. secret을 URL query나 명령줄 literal로 전달하지 않는다.

## 검증 계획과 근거 범위

로컬 회귀 검증은 실제 SQLite store와 HTTP fixture를 사용해 다음을 확인한다.

- 손상된 GZIP trailer, 비정상 tail, 암호화 마지막 frame을 snapshot과 Portable preview/import가 적용 전에 거부한다.
- 복구본은 source bundle이 아니라 교체 직전 destination rows와 썸네일을 담는다.
- 복구본 생성 실패 또는 SQL 실패 후 destination rows와 파일이 유지된다.
- 정상 import와 `partial` 결과가 disk에 남고 원래 destination의 bundle을 다시 import해 복구할 수 있다.
- destination staging uploads와 active jobs는 replace 전에 차단된다.
- context 취소와 commit 경계 오류는 완료된 것으로 잘못 기록되지 않는다.
- 기존 v2 bundle, unsigned 명시적 trust, 크기 제한과 schema 검증이 유지된다.

실제 PostgreSQL runtime, 양방향 Compose migration, proxy 요청 유실, provider multipart 재개, SIGKILL와 host 재부팅, NFS 및 전원 상실 검증은 별도의 환경 의존 gate다. 로컬 SQLite, mock browser, 또는 파일 `Sync` 호출 검증을 그 성공으로 승격하지 않는다. 전체 release audit가 다른 과거 candidate의 backup evidence를 찾아 `satisfied`로 출력하더라도 현재 dirty 작업 트리의 runtime 증거로 사용하지 않는다.

배포 환경에서 재실행할 명령은 [Portable Backup](PORTABLE_BACKUP.md)의 양방향 및 failure smoke를 따른다. 새 failure cases는 격리된 target과 검증된 독립 backup을 준비한 뒤 실행한다. candidate를 커밋한 이후에는 `scripts/check_release_evidence.py --strict --require-candidate-id --candidate-id <candidate>`로 같은 candidate의 evidence만 확인한다.

## 외부 기술 근거

- Go의 [gzip reader](https://pkg.go.dev/compress/gzip#Reader.Close)는 checksum 검증을 위해 EOF까지 읽어야 한다고 명시한다. TAR EOF와 reader Close만으로 검증이 끝났다는 가정은 사용하지 않는다.
- [PostgreSQL 15 transaction isolation](https://www.postgresql.org/docs/15/transaction-iso.html)은 Read Committed의 문장별 snapshot 차이와 Repeatable Read 및 Serializable의 재시도 가능성을 설명한다. 배포 smoke의 PostgreSQL image 기본값과 맞춘 문서이며 DB와 filesystem의 원자성은 제공하지 않는다.
- [SQLite atomic commit](https://sqlite.org/atomiccommit.html)은 DB commit의 저장 장치 가정과 실패 복구를 설명한다. 임의의 runtime 파일 rename까지 같은 transaction에 포함한다는 보장은 없다.
- Linux [fsync](https://man7.org/linux/man-pages/man2/fsync.2.html)은 파일 동기화 외에 parent directory의 동기화도 필요하다고 설명한다. 실제 filesystem과 저장 장치의 영속성은 runtime 및 장애 시험으로 확인한다.

## 검증 기록

추가 구현은 작업 트리에 반영했다. 다음 결과는 로컬 검증이며 배포나 release 승인 결과가 아니다.

| 실행한 검증 | 결과와 범위 |
| --- | --- |
| `rtk go test ./internal/api ./internal/store -run 'PortableRecovery\|BackupRejectsCorruptionAfterTarEOF\|BackupArchiveTail' -count=1` | 21개 테스트 통과. clear/encrypted 복구본으로 실제 SQLite 대상의 이전 profile과 썸네일을 다시 import해 복구했다. SQL insert 실패와 context 취소 후 원래 DB 유지도 확인했다. |
| `rtk go test ./...` (`backend`) | 최종 추가 backend 수정 후 44개 패키지, 2344개 테스트 통과. PostgreSQL 환경 의존 테스트의 실제 실행을 의미하지 않는다. |
| `rtk proxy npm run test:unit -- src/components/__tests__/SidebarBackupAction.test.tsx` (`frontend`) | 19개 통과. 적용 시 preview 무효화, 응답 유실 안내, recovery 경로와 partial 표시를 확인했다. |
| `rtk proxy npx playwright test tests/backup-trust.spec.ts --project=chromium --workers=1` (`frontend`) | 1280px와 390px의 2개 mock 브라우저 시나리오 통과. 복구 경로 표시, 좁은 화면 overflow 및 반복 import 차단 확인. |
| `rtk proxy npm run gen:openapi`, `rtk proxy npm run check:openapi` (`frontend`) | 생성 및 drift 검사 통과. recoveryDir/recoveryBundlePath가 OpenAPI와 generated types에 반영됐다. |
| `rtk proxy env GOTOOLCHAIN=go1.25.13 /home/server/go/bin/staticcheck ./...` (`backend`) | 통과. 설치된 도구의 Go 버전에 맞춰 실행했다. |
| `rtk proxy /home/server/go/bin/gosec -quiet -exclude=G117,G702,G703,G704,G705 ./...` (`backend`) | 통과. 저장소 gate와 같은 제외 규칙을 사용했다. |
| `rtk proxy env GOTOOLCHAIN=go1.25.13 /home/server/go/bin/govulncheck ./...` (`backend`) | exit 0, 호출되는 취약점 0. import된 package의 취약점 3건은 현재 코드에서 호출하지 않는다는 결과다. |
| 변경한 3개 Portable Python 스크립트의 `ast.parse`, `rtk git diff --check` | 문법 및 whitespace 검사 통과. Compose 실행 증거는 아니다. |
| `rtk proxy python3 scripts/check_release_evidence.py --format checklist` | exit 0이나 전체 상태 blocked. provider/proxy evidence가 없고 backup 항목은 과거 rc4 문서에 의존한다. 현재 candidate 증거로 취급하지 않았다. |
| `rtk proxy python3 scripts/check_live_evidence_env.py --scope reverse-proxy` | exit 1, blocked. 배포 URL, API token, profile 및 smoke bucket/object 설정이 없다. 값은 출력하지 않았다. |

첫 frontend 회귀 실행에서 기존 lazy drawer 로딩을 기다리지 않던 helper와 여러 단계의 기본 5초 timeout 문제가 드러났다. drawer 내용 로딩을 기다리고 해당 복합 시나리오들의 timeout을 기존 첫 drawer 테스트와 같은 15초로 조정했다. 브라우저에서는 Ant Design loading icon이 버튼 accessible name에 포함되는 상태를 허용하도록 locator를 수정했다. geometry 검사에 실제 mobile overflow 검증 목적을 명시한 뒤 다시 실행했다. 동작 assertion을 제거하지 않았다.

최종 `rtk proxy env CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=2 ./scripts/check.sh fast`는 exit 0으로 통과했다. frontend 270개 파일의 1399개 unit test, OpenAPI와 generated drift, workflow, Helm render, lint, build 및 notice 재현성 검사가 포함된다. 최종 암호화 tail 회귀 보강 후에도 backend 전체 2344개 테스트를 다시 실행해 통과했다. 전체 `./scripts/check.sh full`과 전체 browser smoke suite는 실행하지 않았다. 브라우저 검증은 위의 두 backup 시나리오이며 보안 도구는 별도로 실행했다.

로그는 `/tmp/s3desk-recovery-final-fast-20261002.log`, `/tmp/s3desk-recovery-gosec-20261002.log`, `/tmp/s3desk-recovery-govulncheck-20261002.log`, `/tmp/s3desk-recovery-evidence-checklist-20261002.txt`에 남겼다. 임시 로그는 재부팅 또는 정리 시 삭제될 수 있으므로 이 문서의 기록과 candidate-bound runtime evidence를 구분한다.

환경 의존 검증은 미실행 상태다. 격리된 PostgreSQL과 source/target 볼륨, 지원하는 Compose runtime을 준비한 뒤 양방향 clear/encrypted/failure smoke를 실행해야 한다. 유지보수 proxy에서 업로드 응답을 끊는 시험, commit/rename 사이 SIGKILL, 재부팅 및 실제 filesystem의 동기화 실패 시험은 독립 backup과 테스트 전용 대상에서 수행한다. 실제 provider의 profile test, object read와 native multipart 상태도 확인해야 한다. 요청하지 않은 배포, 외부 provider 변경, commit/push 또는 release evidence 발행은 수행하지 않았다.
