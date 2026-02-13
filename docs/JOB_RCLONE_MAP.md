# Job → rclone 매핑

이 문서는 Job 타입이 어떤 rclone 명령으로 실행되는지 요약합니다.

공통 rclone 실행 구성

- 설정 파일: <dataDir>/logs/jobs/<jobId>.rclone.conf (Job별 생성)
- 원격 이름: remote
- 기본 인자:
  - --config <path>
  - --stats <interval> (기본 2s, 최소 500ms)
  - --stats-log-level NOTICE
  - --use-json-log
- 옵션 인자:
  - --dry-run (payload.dryRun=true)
  - --no-check-certificate (tlsInsecureSkipVerify=true)
  - --transfers / --checkers / --s3-upload-concurrency (튜닝 활성화 시)
  - --s3-chunk-size <MiB> (RCLONE_S3_CHUNK_SIZE_MIB)

진행률 집계

- rclone JSON 로그의 stats를 파싱해 job.progress에 기록하고 job.progress 이벤트로 발행합니다.
- transfer 모드는 transfers/totalTransfers를 objectsDone/objectsTotal로 사용합니다.
- delete 모드는 deletes를 objectsDone으로 사용합니다.
- batch copy/move는 항목별 rclone 실행 후 objectsDone을 증가시키며, 바이트/ETA 스트림은 없습니다.

Job 타입 매핑

| Job 타입 | 명령 | 비고 |
| --- | --- | --- |
| transfer_sync_local_to_s3 | rclone copy|sync <localPath> remote:<bucket>/<prefix> | deleteExtraneous=true면 sync, include/exclude 지원 |
| transfer_sync_staging_to_s3 | rclone copy <stagingDir> remote:<bucket>/<prefix> | 업로드 세션 staging dir 사용 |
| transfer_sync_s3_to_local | rclone copy|sync remote:<bucket>/<prefix> <localPath> | localPath 검증/생성, include/exclude 지원 |
| transfer_delete_prefix | rclone delete remote:<bucket>/<prefix> | deleteAll=true면 purge remote:<bucket> |
| transfer_copy_object | rclone copyto remote:<srcBucket>/<srcKey> remote:<dstBucket>/<dstKey> | 단일 객체 |
| transfer_move_object | rclone moveto remote:<srcBucket>/<srcKey> remote:<dstBucket>/<dstKey> | 단일 객체 |
| transfer_copy_batch | 항목별 rclone copyto 반복 | 순차 실행 |
| transfer_move_batch | 항목별 rclone moveto 반복 | 순차 실행 |
| transfer_copy_prefix | rclone copy remote:<srcBucket>/<srcPrefix> remote:<dstBucket>/<dstPrefix> | include/exclude 지원 |
| transfer_move_prefix | rclone move remote:<srcBucket>/<srcPrefix> remote:<dstBucket>/<dstPrefix> | include/exclude 지원 |
| s3_delete_objects | rclone delete --files-from-raw <list> remote:<bucket> | 키 목록을 temp 파일로 전달 |
| s3_zip_prefix | rclone lsjson -R + rclone cat (per object) + zip artifact | prefix listing 후 개별 다운로드 |
| s3_zip_objects | rclone lsjson --files-from-raw + rclone cat + zip artifact | 선택 키 메타 조회 후 다운로드 |
| s3_index_objects | rclone lsjson -R + 인덱스 upsert | rclone 목록 기반 색인 |

튜닝 관련 환경 변수

- JOB_QUEUE_CAPACITY: 큐 최대 대기 수
- JOB_CONCURRENCY: 동시 실행 job 수
- RCLONE_TUNE: 동적 transfers/checkers 활성화
- RCLONE_MAX_TRANSFERS: 전체 transfers 상한
- RCLONE_MAX_CHECKERS: 전체 checkers 상한
- RCLONE_S3_CHUNK_SIZE_MIB: multipart chunk size
- RCLONE_S3_UPLOAD_CONCURRENCY: multipart upload 동시성
- RCLONE_STATS_INTERVAL: stats 갱신 주기 (기본 2s, 최소 500ms)
- RCLONE_RETRY_ATTEMPTS: retryable 오류 재시도 최대 횟수 (기본 3)
- RCLONE_RETRY_BASE_DELAY: retry backoff 기본 지연 (기본 800ms)
- RCLONE_RETRY_MAX_DELAY: retry backoff 최대 지연 (기본 8s)
- RCLONE_RETRY_JITTER_RATIO: retry 지연 지터 비율 (기본 0.2, 0..1)
