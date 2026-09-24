# 객체 스토리지 비용 폭증 방어 점검

2026-09-24 기준 코드 경로 분석 및 로컬 수정 내역이다. 공급자 계정에 실제 요청을 보내거나 청구액을 측정하지 않았다.

## 결론

S3Desk는 공급자 청구 금액을 직접 제한하지 않는다. 앱이 보장할 수 있는 것은 요청량·동시성·작업 시간의 상한과 중복 작업 억제이며, 최종 비용 제한은 공급자 계정의 권한·쿼터·예산 자동화와 함께 구성해야 한다. 기존 오브젝트 인덱싱은 rclone 재귀 목록에 객체 수와 전체 실행 시간 상한이 없었고, 클라이언트 재연결은 같은 스캔을 여러 번 요청할 수 있었다.

## 위험 및 조치

| 우선순위 | 경로 | 위험 | 조치 및 남은 한계 |
|---|---|---|---|
| P0 | 전체 객체 인덱스 (`s3_index_objects`) | 재귀 목록은 선택한 prefix를 훑으므로 공급자 LIST 요청과 메모리를 사용함 | 기본 100,000 객체 또는 15분에서 중단. `OBJECT_INDEX_MAX_OBJECTS`, `OBJECT_INDEX_MAX_DURATION`로 조정 가능. 결과는 staging에 쌓고 성공 시에만 반영한다. 전체 재구축은 범위 교체, 증분 갱신은 찾은 키 upsert이므로 상한·취소·provider 오류가 기존 인덱스를 부분 변경하지 않는다. 재귀 `lsjson -R`는 ListR callback을 쓰고 `--fast-list`는 이 경로의 동작을 바꾸지 않아 제거했다. `--use-server-modtime`와 해시 생략으로 목록별 metadata HEAD를 피한다. 인덱스 ETag는 비어 있을 수 있고 UI 캐시 키는 LastModified로 fallback한다. |
| P0 | 같은 버킷/프리픽스 인덱스 재요청 | 화면 재진입·동시 제출로 중복 스캔 가능 | queued/running 인덱스 작업을 서버에서 찾아 같은 작업을 반환하도록 함. 프로필·버킷·프리픽스·재인덱스 종류가 같은 요청에 적용. |
| P1 | 오브젝트 목록 페이지 | AWS 및 S3 호환 엔드포인트(Ceph/MinIO 포함)는 S3 native 목록을 사용하고 호출당 페이지를 제한. 각 native list flag를 끄거나 미지원 목록 모드는 rclone 방식으로 이전 항목을 재검색하므로 페이지가 깊을수록 비용이 커질 수 있음. | rclone 경로의 커서 재검색을 요청당 100,000개 항목으로 제한. 초과 시 `listing_cursor_too_deep`를 반환해 더 좁은 프리픽스를 요구. `storage_rclone_list_entries_scanned_total` 지표로 공급자/작업별 열거량을 집계. 반복 재검색의 상한은 생겼지만 100,000개 이전 페이지도 매 요청 재검색한다. S3/GCS/Azure/OCI native cursor는 로컬 구현됐으나 실계정 확인은 남음. |
| P1 | 다운로드 및 전송 | 동시성·재시도는 요청 증폭을 제한하지만, 사용량/바이트 자체를 계정별 금액으로 변환해 중단하지는 않음 | 공급자 쿼터, IAM deny/자동화, 앱의 사용자별 사용량 제한을 별도 설계해야 함. 실패 재시도까지 포함해 운영 비용을 관측할 지표도 필요. |
| P2 | 청구 예산 경보 | 예산 경보만으로는 서비스 사용 중단을 보장하지 않음 | AWS Budgets는 임계치 작업을 설정할 수 있지만 권한 및 작업 범위를 검증해야 함. GCP 일반 예산은 알림 전용이며 현재 spend cap은 일부 서비스에만 제공. OCI 예산은 soft limit이고 알림 평가는 24시간 주기. Ceph/MinIO는 자체 사용량·요청량 계측과 운영 경보가 필요. |

## 배포 설정

```dotenv
OBJECT_INDEX_MAX_OBJECTS=100000
OBJECT_INDEX_MAX_DURATION=15m
```

Compose와 Helm은 객체/시간 상한을 백엔드 작업자에 전달한다. `lsjson -R`의 `--fast-list`는 이 경로에서 동작 선택에 영향을 주지 않아 제거했다. 상한은 작업량을 제한하며 실제 청구 hard cap으로 간주하지 않는다.

## 클라우드별 청구 안전장치

- **AWS S3**: CloudWatch/S3 요청 지표와 Cost Anomaly Detection/예산 경보를 켜고, 필요한 API 권한을 최소화한다. AWS Budgets action은 IAM 정책 적용 등 동작을 수행할 수 있으므로 권한 및 실패 시 동작을 시험한다. [AWS Budgets actions](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-controls.html)
- **GCS**: 일반 budget alert는 사용량을 차단하지 않는다. 일부 API 기반 서비스에만 제공되는 spend cap 적용 가능 여부를 서비스별로 확인한다. [Budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets), [Spend caps](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)
- **Azure Blob**: 예산 임계치 알림을 만들고 Action Group을 통한 운영 자동화를 검토한다. 기본 예산 알림 자체는 리소스나 소비를 중단하지 않는다. [Azure budget alerts](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets)
- **OCI Object Storage**: Budget은 soft limit이며 알림은 24시간마다 평가된다. 빠른 차단 수단으로 간주하지 말고 요청/저장 사용량 모니터링과 별도 운영 자동화를 둔다. [OCI Budgets](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm)
- **Ceph / MinIO / 기타 온프렘 S3 호환**: 요청·전송 바이트·저장량을 사용자/버킷 단위로 계측하고, 과다 사용 시 rate limit 또는 자격증명 차단이 가능한 운영 경보를 연결한다. 클라우드 egress 청구는 없더라도 디스크·네트워크·운영 용량 한도는 둔다.

## 해야 할 작업

완료 체크는 코드가 아니라 아래에 적은 운영 증거를 남겼을 때만 한다. 현재 실계정 자격증명은 설정되지 않았고 실제 Prometheus/Grafana 연결도 확인되지 않았다.

- [ ] **P0 — 운영 모니터링 연결**
  - 선행 조건: Prometheus와 Grafana 접근, Helm 배포 권한.
  - 실행: chart의 opt-in 대시보드와 PrometheusRule을 활성화하고 실제 모니터링에 연결한다. `storage_list_page_requests_total{provider,status}`, `storage_rclone_list_entries_scanned_total`, 오류/지연 패널을 확인한다.
  - 완료 증거: 실제 scrape target 및 쿼리 결과, 대시보드 로드, 경보 발생과 해제 확인을 배포 환경·시각과 함께 기록한다. 경보는 사용량 신호이지 작업 중단이나 청구 hard cap이 아니다. SDK 내부 재시도는 page-request 지표에 포함되지 않는다.
- [ ] **P0 — 공급자별 운영 canary**
  - 선행 조건: `docs/ci/provider_live_validation.env.example`에 맞춘 일회용 비운영 계정/버킷과 운영 버전의 MinIO/Ceph endpoint. 비밀 값은 로그나 증거에 남기지 않는다.
  - 실행: AWS S3, GCS, Azure Blob, OCI Object Storage, MinIO, Ceph RGW 각각에서 native list 설정을 provider별로 켜고 2페이지 이상 cursor 왕복, delimiter/재귀 목록, 권한 오류, 취소를 확인한다. S3 호환 제품은 path-style, URL 인코딩, continuation token도 확인한다.
  - 완료 증거: 제품/버전, 설정 flag, 테스트 범위, 요청 결과와 실패/롤백 여부를 기록한다. 로컬 fake API나 임시 MinIO 결과를 운영 호환성 증거로 대체하지 않는다.
- [ ] **P1 — 실제 사용량 및 청구 비교**
  - 선행 조건: 위 canary와 공급자 요청/사용량 리포트 또는 온프렘 서버 지표 접근.
  - 실행: 재현 가능한 같은 목록·인덱스 작업량으로 S3Desk 지표와 AWS/GCS/Azure/OCI의 요청·청구 자료, MinIO/Ceph의 API·바이트·용량 지표를 같은 기간에 비교한다. 계정 청구 집계 지연을 고려해 관찰 기간을 기록한다.
  - 완료 증거: 기준선과 변경 후 수치, 표본 범위, 공급자 리포트 출처를 기록한다. 논리 작업 수나 SDK 재시도 예약 수만으로 실제 wire 요청 수·달러 절감률을 주장하지 않는다.
- [ ] **P1 — 계정 지출 경보와 차단 절차 검증**
  - 선행 조건: 공급자 테스트 계정의 예산/권한 설정 권한 및 복구 절차.
  - 실행: AWS Budgets action, GCP 서비스별 spend cap 가능 여부, Azure Budget/Action Group, OCI soft-limit 알림을 계정별로 시험한다. Ceph/MinIO는 사용자·버킷별 요청/전송/용량 경보와 rate limit 또는 자격증명 차단 절차를 시험한다.
  - 완료 증거: 임계치 알림, 차단 동작, 평가 지연, 권한 실패 및 복구가 확인된 기록. 알림만 제공하거나 지연 집계되는 기능은 hard cap으로 표시하지 않는다.
- [ ] **P1 — 다중 공급자 로컬 E2E 재실행**
  - 선행 조건: `s3desk:dev` 이미지를 로컬에 준비하거나 Containerfile의 Go base 및 내부 Harbor 레지스트리 접근을 복구한다. 이전 시도는 Docker Hub unauthorized와 `192.168.2.2:443` route 실패로 앱 이미지 준비 단계에서 중단됐다.
  - 실행: `scripts/run_live_e2e_local.sh`의 격리된 Compose 검증을 재실행하고 종료 후 컨테이너/볼륨 정리를 확인한다.
  - 완료 증거: 실제 사용한 이미지 digest와 E2E 결과, 정리 확인을 남긴다. 에뮬레이터 결과는 공급자 실계정 검증과 구분한다.
- [ ] **P2 — 운영 한도 조정**
  - 선행 조건: canary 및 사용량 비교 자료.
  - 실행: `OBJECT_INDEX_MAX_OBJECTS`, `OBJECT_INDEX_MAX_DURATION` 및 사용자별 작업 제한을 실제 RAM·시간·요청량에 맞춰 조정한다. fallback 재검색이 많으면 상한을 올리지 말고 native cursor 호환성부터 개선한다.
  - 완료 증거: 변경 전후 작업량과 실패/취소 영향이 확인된 설정 및 운영 기준을 기록한다. 공급자 청구 hard cap으로 설명하지 않는다.
- [ ] **P2 — 기존 인벤토리 내보내기 활용성 판단**
  - 선행 조건: 이미 활성화된 공급자 inventory/export 자료와 예상 생성·조회 비용 확인.
  - 실행: 신규 전수 LIST/HEAD를 추가하지 않고, 기존 내보내기의 신선도·필드·비용·접근 권한이 사용자가 선택한 버킷 분석에 충분한지 평가한다.
  - 완료 증거: 비용 및 데이터 범위를 비교해 도입/보류 결정을 기록한다. 기본 자동 스캔은 켜지 않는다.

이 수정은 로컬 로직 및 설정에 대한 방어이며, 공급자 청구 상한·실계정 호환성·배포 상태를 입증하지 않는다.

## 로컬 재검증

- `go test ./internal/api -run 'TestHandleListObjectsBoundsLegacyCursorRescan|TestHandleListObjectsPrefixesOnlyPaginatesPrefixesWithoutCountingObjects|TestNativeS3ListUsesProviderCursorAndNoRclone' -count=1`: 통과
- `go test ./internal/api ./internal/jobs ./internal/store ./internal/metrics`: 통과
- 증분 인덱스 상한 실패 시 기존 인덱스 보존과 staging 정리를 추가 검증했다: `go test ./internal/store ./internal/jobs -run '^(TestMergeObjectIndexReplacementPreservesExistingRows|TestRunS3IndexObjectsStopsAtConfiguredObjectLimit|TestRunS3IndexObjectsFullReindexFailurePreservesExistingIndex)$' -count=1` 통과.
- 강제 종료/고아 staging 회수도 시작 복구 및 주기 유지보수에 연결했다. queued/running 작업 staging은 유지하고 terminal/missing job staging은 삭제한다. `go test ./internal/store ./internal/jobs -count=1` (256 tests) 통과.
- provider smoke fixture가 native-list 경로를 켜도록 수정했고, 첫 페이지가 truncated이면 continuation 요청도 검증한다. 임시 MinIO `RELEASE.2025-09-07T16-13-09Z`에 두 객체를 둔 상태에서 `TestLiveValidationMinioS3Compatible`가 profile connectivity, native S3 listing, 다음 cursor 페이지까지 통과했다. 이는 local MinIO runtime 증거이며 운영 MinIO나 AWS/Ceph 호환성·청구 증거는 아니다.
- object-index 경보를 포함한 Helm PrometheusRule 6개를 렌더 후 `promtool check rules`로 파싱 확인했다. `./scripts/check_helm_chart.sh`와 저장소 `./scripts/check.sh fast`도 통과했다.
- 재귀 목록에서 효과 없는 `--fast-list` 제거와 API fallback 인자 회귀도 확인했다. 전체 관련 backend 회귀 `go test ./internal/api ./internal/jobs ./internal/store ./internal/metrics -count=1` (1428 tests 통과), provider/cursor package `go test ./internal/objectlisting ./internal/s3client ./internal/gcsbucket ./internal/azureblob ./internal/ocicli -count=1` (38 tests 통과), `./scripts/check_helm_chart.sh` 모두 통과.
- 저장소 fast gate `./scripts/check.sh fast` 통과. Go 전체 package, frontend lint·1,329 unit tests·build, Compose 계약, OpenAPI, Helm을 포함한다. 이 모드는 Playwright 및 실 provider 검증은 포함하지 않는다.
- 상한 테스트는 fallback 공급자 목록에 커서가 없을 때 100,000개까지 읽은 뒤 `listing_cursor_too_deep` 오류로 작업을 멈추는 것을 확인한다. 공급자 실계정 호출이나 비용 청구 확인은 포함하지 않는다.
- `storage_rclone_list_entries_scanned_total`은 rclone fallback 목록과 전체 인덱싱을 `operation`별로 세며, `storage_list_page_requests_total{provider,status}`는 native page fetch 호출을 센다(SDK 내부 재시도 제외). `storage_operations_total`도 논리 작업 수라서 실제 provider wire request 합계로 읽지 않는다. 이들 지표는 Prometheus `/metrics`에 노출되며 프로필이나 버킷 식별자는 포함하지 않는다.
