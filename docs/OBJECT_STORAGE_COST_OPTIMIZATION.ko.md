# 객체 스토리지 비용 최적화 권고

2026-09-24 코드 경로와 기존 비용 방어 점검을 바탕으로 한 실행 권고다. 실제 클라우드 청구액이나 공급자별 실계정 동작은 측정하지 않았다.

## 권고

비용 최적화의 우선순위는 **불필요한 원격 호출을 줄이고, 대량 작업을 사용자가 명시적으로 시작하게 하며, 공급자 계정의 예산·권한으로 앱 바깥의 지출을 감시하는 것**이다. 공급자별 요금표가 다르므로 S3Desk가 요청 수만으로 달러 비용을 정확히 보장한다고 표시하면 안 된다.

### 의사결정 요약

| 순서 | 권고 | 이유 | 완료 판단 기준 |
|---|---|---|---|
| 1 | 방문하지 않은 버킷은 자동으로 열거하거나 인덱싱하지 않는다. | 객체 수와 단가를 모르는 상태에서 전체 `LIST`/`HEAD`를 시작하면 분석이 비용을 먼저 발생시킨다. | 버킷 연결·첫 화면·검색 동작만으로 전수 작업이 enqueue되지 않음. |
| 2 | 일반 탐색은 provider-native 페이지 커서와 작은 응답으로 유지한다. | 페이지 이동 때 앞 페이지 재열거와 불필요한 metadata 요청을 줄인다. | native-list 지원 환경의 다음 페이지가 이전 키 재검색 없이 cursor로 요청됨. fallback은 현재 상한에서 중단됨. |
| 3 | 전체 분석은 사용자가 시작하는 상한형 작업으로 제공한다. | 비용을 사전에 보장할 수 없어도 작업량과 중단 범위는 제한할 수 있다. | 객체 수·시간 제한, 취소, 중복 작업 억제, 제한 도달 시 기존 인덱스 보존이 동작함. |
| 4 | 요청 지표를 실제 청구·스토리지 서버 지표와 대조한 뒤 조정한다. | API 호출 수만으로 저장·검색·egress 비용 또는 절감액을 환산할 수 없다. | 같은 기간·비슷한 작업량의 provider 청구/요청 지표와 S3Desk 지표를 함께 확보함. |

따라서 **지금 우선할 일은 새로운 자동 분석이나 캐시를 더 만드는 것이 아니라, 현재 native-list·작업 상한·중복 억제 경계를 유지하고 실제 모니터링에 연결하는 것**이다. provider별 live 검증과 요금 자료가 없으면 절감률이나 안전한 상한을 숫자로 약속하지 않는다.

### 1. 목록 화면은 페이지 단위로 읽는다

- AWS S3 및 S3 호환(Ceph/MinIO)은 기존 `ListObjectsV2` continuation token을 이어 쓴다. 페이지 이동 때 첫 페이지부터 다시 훑는 rclone fallback은 깊이 제한을 유지한다.
- S3, GCS, Azure Blob, OCI는 native cursor를 전달한다. provider별 canary/rollback 설정으로 문제가 난 공급자만 fallback으로 되돌린다.
- rclone 목록 fallback도 `--use-server-modtime`을 사용해 provider LastModified를 쓰고 목록 객체마다 metadata HEAD를 하지 않는다. 이 fallback은 해시를 요청하지 않아 ETag가 비어 있을 수 있고, 브라우저 thumbnail cache key는 LastModified를 사용한다.
- 즐겨찾기 메타데이터 hydration과 rclone 업로드 일괄 검증도 `--use-server-modtime`을 사용한다. 두 흐름은 응답 ETag/무결성 검증을 위해 `--hash`를 유지하므로, hash 해석에 필요한 provider metadata 요청까지 없어진다고 가정하지 않는다.
- 즐겨찾기 패널을 여는 것만으로 원격 metadata를 hydrate하지 않는다. 패널은 DB에서 읽은 favorite key로 렌더링하고, 즐겨찾기만 보기 모드를 켰을 때 객체 목록용 metadata를 한 페이지씩 요청한다. 다음 페이지는 객체 목록 아래의 `Load more favorites`를 눌렀을 때만 조회한다.
- 사용하지 않는 태그, ACL, 버전, metadata, 별도 HEAD/GET 호출은 기본 목록 요청에 추가하지 않는다. 짧은 페이지라도 공급자가 다음 cursor를 주면 재조회 대신 다음 페이지 링크를 반환한다.
- 브라우저의 반복 탐색에서 원격 호출을 줄이기 위해 전체 목록을 첫 요청 때 스냅샷으로 만들지는 않는다. 큰 버킷에서 첫 화면이 늦어지고, 전체 스캔·임시 저장·만료 처리가 추가된다.

### 2. 방문한 적 없는 버킷의 데이터는 자동 전수 분석하지 않는다

버킷을 처음 열거나 검색한다는 이유로 전체 인덱싱을 시작하지 않는다. 객체 수를 모르면 전수 목록 비용을 사전에 정확히 계산할 수 없고, 저장 클래스·리전·요청 단가도 계정마다 다르다.

- 일반 목록은 사용자가 연 버킷과 현재 prefix만 페이지 단위로 읽는다.
- 검색·통계 목적의 전체 분석은 별도 명시 작업으로 유지한다. UI에 기본 상한(100,000 객체 또는 15분)을 안내하고, 사용자는 범위를 좁힐 수 있다. 실제 상한 변경은 서버 운영자가 환경변수로 설정한다.
- 인덱스 수집은 `rclone lsjson --use-server-modtime`으로 provider 목록의 LastModified를 사용해 개별 메타데이터 HEAD를 피한다. 해시는 요청하지 않는다. rclone은 목록에 필요한 해시가 없으면 객체 메타데이터를 읽을 수 있고, 공식 문서도 hash 조회가 더 오래 걸릴 수 있다고 설명한다. 검색 인덱스 결과의 ETag는 비어 있을 수 있지만 UI는 LastModified를 캐시 키 fallback으로 사용한다. [rclone lsjson](https://rclone.org/commands/rclone_lsjson/)
- 인덱스·통계·압축의 재귀 `rclone lsjson -R`는 rclone `ListR` callback을 직접 호출한다. 이 경로에서는 `--fast-list`가 전략을 바꾸지 않으므로 해당 플래그와 `OBJECT_INDEX_FAST_LIST` 설정을 제거했다. `ListR`는 항목 묶음을 callback에 전달하며 callback 오류로 멈출 수 있다. 인덱싱은 객체/시간 한도로 작업량을 끊지만 provider 청구액을 보장하지 않는다. [rclone v1.75.1 lsjson](https://github.com/rclone/rclone/blob/v1.75.1/fs/operations/lsjson.go#L1420), [rclone v1.75.1 ListR](https://github.com/rclone/rclone/blob/v1.75.1/fs/walk/walk.go#L1759)
- 기존 인덱스가 있으면 UI에서 재사용 여부와 마지막 갱신 시각을 알린다. 전체 재인덱스가 제한에 걸리면 기존 인덱스를 보존한다.
- 전체 및 증분 인덱스 작업은 결과를 DB staging에 쌓고 목록이 성공한 뒤 반영한다. 전체 재구축은 범위를 교체하고, 증분 갱신은 찾은 키만 upsert한다. 시간/객체 상한, 취소, provider 오류로 실패하면 staging을 버려 기존 인덱스를 부분 변경하지 않는다.
- **강제 종료 회수:** 시작 복구는 running job을 실패 처리한 뒤 queued/running 인덱스 job이 소유하지 않는 staging을 삭제한다. 30분 유지보수도 같은 정리를 반복하므로 terminal job 행이 보존기간 만료로 삭제된 뒤 남은 staging도 회수한다. 테스트에서 queued/running staging 보존, terminal/missing job staging 삭제, 재시작으로 중단된 running job staging 삭제를 확인했다. 기존 인덱스와 staging은 분리되어 있어 잔여 staging 자체가 기존 검색 결과를 부분 교체하지는 않는다.
- 정확한 비용 견적을 약속하지 않는다. 표시 가능한 것은 상한과 진행량이며, 실제 비용은 공급자 청구 데이터로 확인한다.

### 3. 실패와 재시도도 호출량으로 센다

요청당 객체 수·스캔 항목 수·재시도·전송 바이트·작업 소요시간을 provider 및 작업 유형 기준으로 관측한다. 지표 라벨에 프로필명·버킷명·키를 넣지 않아 카디널리티와 민감정보 노출을 피한다. `storage_operations_total`은 S3Desk의 논리 작업 수이며 실제 provider API wire request 수가 아니다. `storage_list_page_requests_total`도 페이지 fetch 호출 수로 SDK 내부 재시도는 제외한다. Grafana 대시보드는 목록 fetch·fallback 스캔·명시적 인덱싱 양·목록 오류율을 나눠 보여주고, 재시도 패널은 AWS S3 SDK의 재시도 지연 예약만 표시한다(`storage_api_retries_scheduled_total`). Helm의 `monitoring.grafanaDashboard.enabled`를 켜면 표준 sidecar label ConfigMap을 배포할 수 있다. 실제 Grafana/Prometheus 연결은 설치 환경의 sidecar selector와 scrape 설정까지 별도 확인해야 하며, 인덱스 한도 초과는 운영자가 공급자 청구 자료와 함께 확인한다.

### 4. 실제 지출 안전장치는 공급자 계정에 둔다

| 환경 | 권고 |
|---|---|
| AWS S3 | 요청·저장량 지표와 비용 이상/예산 경보를 켠다. 필요한 범위만 IAM에 허용하고, Budgets action을 쓸 때는 동작 권한과 실패 처리를 테스트한다. |
| GCS | Billing budget 알림을 설정하되 일반 예산이 자동 차단이라고 가정하지 않는다. 서비스별 spend cap 적용 여부와 권한을 확인한다. |
| Azure Blob | 예산 경보와 Action Group을 연결할 수 있는지 검토한다. 기본 예산 알림은 소비 중단 장치가 아니다. |
| OCI Object Storage | 예산은 soft limit이고 평가 주기가 빠른 차단을 보장하지 않는다. 요청/저장량 감시와 별도 운영 대응을 둔다. |
| Ceph / MinIO / 온프렘 | 클라우드 청구 대신 용량·IOPS·네트워크 포화 위험을 본다. 버킷/사용자별 계측, quota, rate limit, 디스크 여유 경보를 운영한다. |

공급자별 제한은 [비용 폭증 방어 점검](COST_SPIKE_DEFENSE_AUDIT.ko.md)의 링크된 공식 문서를 기준으로 계정마다 검증한다. 예산 알림은 실시간 hard cap으로 취급하지 않는다.

## 다른 클라이언트의 패턴과 S3Desk 적용 판단

공식 문서에서 반복되는 핵심은 **페이지 단위 진행, 전체 열거는 명시적으로 선택, 메모리와 요청 수의 교환관계를 노출, 재시도와 진행 상황을 관측**하는 것이다. 기능을 그대로 복제하기보다 현재 S3Desk의 경계와 비교해 필요한 것만 적용한다.

| 제품/기반 | 문서화된 패턴 | S3Desk에 적용할 판단 |
|---|---|---|
| AWS CLI / SDK paginator | 서비스의 continuation token으로 페이지를 따라가며, CLI는 기본적으로 결과가 끝날 때까지 여러 요청을 보낸다. `--no-paginate`는 첫 페이지만 읽고, `--page-size`는 타임아웃 가능성을 낮추지만 총 페이지가 늘어 요청 수도 늘릴 수 있다. | UI/API는 한 번에 한 페이지씩 반환하고 다음 페이지를 사용자가 요청하도록 한다. 전체 검색은 별도 명시 작업으로 남긴다. [AWS pagination](https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-pagination.html), [S3 ListObjectsV2 paginator](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/s3_example_s3_ListObjectsV2_section.html) |
| rclone | `lsjson -R`는 callback 기반 `ListR`를 직접 사용하고 `--fast-list`와 무관하게 처리한다. callback이 오류를 반환하면 listing을 중단할 수 있다. | 효과 없는 fast-list 플래그와 환경변수를 제거했다. 객체/시간 상한은 작업량 제한이며 청구 hard cap이 아니다. 실제 요청 수는 provider metrics·청구 자료와 비교한다. [rclone v1.75.1 lsjson](https://github.com/rclone/rclone/blob/v1.75.1/fs/operations/lsjson.go#L1420), [rclone v1.75.1 ListR](https://github.com/rclone/rclone/blob/v1.75.1/fs/walk/walk.go#L1759) |
| Ceph RGW | S3 목록 결과는 bucket index에서 읽는다. 순서가 필요한 분산 shard 목록은 여러 shard를 읽고 정렬해야 하므로, 클라우드식 요청 단가가 없어도 서버 I/O와 지연 비용이 존재한다. | ListObjectsV2 cursor 사용은 유지한다. 온프렘에서도 전체 재열거와 불필요한 정렬/metadata 요청을 줄이는 것이 타당하다. [Ceph bucket index](https://docs.ceph.com/en/latest/dev/radosgw/bucket_index/) |
| MinIO AIStor | Prometheus로 클러스터 및 버킷 단위 API 요청, 오류, 바이트, 사용량을 관측할 수 있다. | S3Desk 자체 지표와 서버 측 지표를 함께 비교할 수 있다. MinIO 지표를 읽으려고 모든 버킷을 주기적으로 순회하는 새 작업은 추가하지 않는다. AIStor 지표의 제품/버전별 제공 범위는 배포판에서 확인한다. [MinIO metrics](https://docs.min.io/aistor/operations/monitoring/metrics-and-alerts/), [bucket API metrics](https://docs.min.io/aistor/operations/monitoring/metrics-and-alerts/metrics-v3/) |

### 도입 우선순위

1. **계속 유지:** native cursor, 페이지 크기 상한, fallback 재검색 상한, 중복 인덱스 작업 억제, 인덱스 객체/시간 제한. 이는 공급자 비용과 온프렘 자원 사용을 직접 제한하거나 예측 가능하게 만든다.
2. **다음:** S3Desk Prometheus 지표와 대시보드를 운영 모니터링에 연결한다. Helm 차트는 대시보드 ConfigMap과 경보를 opt-in으로 제공한다. 기본 100,000건/15분 object-index 경보는 provider별 누적 스캔량을 알리지만 작업을 중단하거나 청구를 제한하지 않는다. 연결 후 provider·작업별 요청량, fallback 스캔, 실패/재시도를 같은 기간으로 비교하고, 클라우드 청구 보고서 또는 MinIO/Ceph 서버 지표와 대조한다.
3. **보류:** 자동 전수 인벤토리, 첫 화면용 전체 스냅샷, 기본 자동 lifecycle 변경, 요청량만으로 달러 비용을 환산하는 UI. 현재 근거로는 실제 절감 또는 안전성을 보장하지 않으며, 추가 스캔/저장/삭제 위험을 만든다.

**결론:** S3Desk가 우선 도입할 만한 것은 더 똑똑한 자동 스캔이 아니라 native pagination을 기본으로 두고, 전수 분석을 명시적·상한형 작업으로 격리하며, 실제 사용량을 계측하는 조합이다. AWS/GCS/Azure/OCI/Ceph/MinIO의 운영 호환성 및 절감액은 로컬 계약 테스트만으로 확정하지 않는다.

## 권고 실행 순서

### 단계 1: 비용 발생 전 기본 동작을 고정한다

1. 첫 방문·버킷 목록·일반 검색에서 자동 전수 분석을 시작하지 않는다.
2. 목록은 native continuation token을 우선 사용하고, 지원하지 않거나 롤백한 경로에는 현행 재검색 상한을 적용한다.
3. 인덱스는 사용자가 범위와 한도를 알고 시작하게 하고, 객체/시간 제한·취소·동일 작업 중복 억제를 계속 적용한다.

### 단계 2: 실제 호출량 기준선을 확보한다

1. `*_NATIVE_LIST`를 provider별 canary로 켜고 문제가 난 provider만 롤백한다. 현재 구현은 로컬 계약 테스트까지 완료됐지만 실계정 적합성은 미확인이다.
2. Grafana 대시보드와 PrometheusRule을 실제 모니터링에 연결한다. 배포 전후 native page 요청, fallback 재열거, 오류·재시도를 같은 기간과 비슷한 사용자 작업량으로 비교한다.
3. 클라우드는 청구/요청 보고서를, Ceph·MinIO는 서버 측 API/바이트/용량 지표를 함께 수집한다. 데이터가 없으면 비용 절감 주장을 보류한다.

### 단계 3: 측정 결과가 있는 변경만 조정한다

1. fallback 재검색이 지속적으로 발생하면 해당 provider의 native cursor 호환성을 먼저 수정한다. 재검색 상한을 올리는 방식은 사용하지 않는다.
2. 인덱스가 요청 비용을 줄였는지는 인덱스 갱신비용과 인덱스 저장/DB 비용을 함께 비교한다. 반복 조회가 적으면 인덱스를 자동 확대하지 않는다.
3. 인덱스 객체/시간 상한은 실제 RAM·처리시간·요청량 관찰 뒤에만 바꾼다. 온프렘은 API 과금 대신 RAM/IOPS/네트워크 영향을 기준으로 결정한다.

### 완료: 강제 종료 staging 회수

`DiscardOrphanObjectIndexReplacements`가 queued/running `s3_index_objects` job ID를 보존 집합으로 삼는다. 시작 복구와 30분 maintenance cycle에서 호출하며, 회수 작업은 DB staging만 변경하고 provider API를 호출하지 않는다. store/recovery 테스트에서 상태별 보존 및 삭제를 검증했다.

### 방문하지 않은 버킷: 기본은 건드리지 않는다

버킷 이름 목록만으로 각 버킷의 객체 수·용량·클래스를 알 수 없다. 그 정보를 얻으려고 전체 `LIST`나 객체별 `HEAD`를 실행하면, 사용자가 걱정한 초기 분석 비용을 그대로 만든다.

- 자동 분석·인덱싱은 끈 상태로 둔다. 버킷 목록 조회도 provider API 호출이므로 필요한 시점에만 가져오고, 주기적 전수 순회는 피한다.
- 사용자가 분석을 선택하면 범위(prefix)를 확인하고 실행한다. UI는 기본 상한(100,000 객체 또는 15분)과 Jobs에서 취소하는 방법을 안내한다. 서버 운영자는 객체/시간 상한을 환경변수로 조정할 수 있다.
- 실행 전에는 정확한 비용을 제시하지 않는다. 공급자 단가와 객체 수를 모르면 산정 불가라고 안내하고, 실행 중에는 처리량·경과 시간·중단 여부를 보여준다.
- 공급자가 제공하는 기존 사용량/인벤토리 내보내기가 이미 있는 계정은 그 데이터를 우선 활용하는 방안을 후속 검토한다. 이를 위해 S3Desk가 새 전수 스캔을 자동 시작하지 않는다.
- 부분 실패나 상한 도달 시 기존 인덱스를 유지한다. 사용자가 재실행을 누르기 전에는 자동 재시도하지 않는다.

### 다음: 테스트 계정에서 단계적으로 확인한다

1. AWS, GCS, Azure, OCI 테스트 버킷에서 2페이지 이상 목록, 권한 오류, 취소 및 cursor 재개를 검증한다. MinIO와 Ceph는 별도 endpoint로 path-style, URL 인코딩, continuation token 왕복을 확인한다.
2. 각 provider의 canary 전후 요청/청구 자료를 비교하고, 오류가 생기면 해당 provider flag만 끈다.
3. 공급자 예산 알림과 차단 자동화는 테스트 계정에서 별도로 검증한다. 알림만 있는 설정은 hard cap으로 간주하지 않는다.
4. 운영 연결과 실제 수치가 확보된 뒤에만 provider별 비용 절감 성과 및 권장 임계치를 문서화한다.

### 도입하지 않을 항목

- **첫 접속 시 전체 버킷 분석:** 버킷이 큰지 모르는 상태에서 비용이 먼저 발생하므로 기본 기능으로 두지 않는다.
- **모든 객체의 사전 `HEAD`/해시 수집:** 목록·인덱스의 메타데이터 요청이 늘 수 있다. 기능상 ETag가 필요한 별도 흐름에서만 요청한다.
- **전체 목록 snapshot을 일반 목록의 기본 경로로 채택:** 첫 응답 지연과 임시 저장/정리 비용이 새로 생긴다. 반복 조회 이득을 측정한 뒤에만 특정 시나리오에서 검토한다.
- **요청 수를 달러로 직접 변환:** 저장 클래스, 리전, 최소 보관 기간, retrieval, egress, 무료 구간 등 공급자별 비용 요소를 놓친다.
- **예산 알림을 즉시 차단으로 취급:** 알림 주기와 실제 차단 기능이 provider마다 다르므로 계정별 시험 없이 보호 장치로 간주하지 않는다.

## 현재 확인 상태

Helm 로컬 렌더에서 대시보드 ConfigMap은 기본 비활성이고 opt-in 시 대시보드 JSON과 sidecar label이 포함되는 것을 확인했다. provider live preflight의 필수 설정은 AWS, GCS, Azure, OCI, MinIO, Ceph 모두 비어 있었다. 별도로 임시 MinIO `RELEASE.2025-09-07T16-13-09Z`와 두 테스트 객체로 native listing continuation smoke를 통과시켰다. 이는 local runtime 증거이며 실제 배포 MinIO/실계정 canary, 청구 변화, 실제 Prometheus/Grafana 연결은 확인하지 않았다. staging 회수도 로컬 store/recovery 테스트까지 검증했으며 provider 청구 및 운영 DB 정리 효과와는 별개다.

상세 cursor 계약과 회귀 기준은 [객체 목록 native cursor 실행안](OBJECT_LIST_NATIVE_CURSOR_PLAN.ko.md)에 있다. 현재 S3 로컬 검증은 AWS/Ceph/MinIO 실계정 호환성이나 청구 절감률을 입증하지 않는다.
