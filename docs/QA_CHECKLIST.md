# QA Checklist (Final)

> 마지막 검증 기준 체크리스트. 실환경 재검증 기록을 이 문서에 남기세요.

## 0) 환경 정보

- 날짜: 2026-02-13
- 환경: local
- UI URL: `http://127.0.0.1:8080`
- API Token: `change-me`
- 스토리지 종류/엔드포인트: MinIO (`http://127.0.0.1:9000`)
- presigned 미지원 프로필: `azure_blob` (dummy credential, live API 검증용)
- CORS 제한 환경(Origin/설정): 브라우저 기본 보안 모드에서 direct URL 요청을 `failed`로 중단해 CORS-like 실패를 재현

## 1) 기본 연결

- [ ] `/api/v1/meta` 응답 정상 (토큰 필요 시 `X-Api-Token` 포함)
- [ ] 프로필 생성/연결 테스트 성공
- [ ] 네트워크 오프라인 배너/상태 표시 정상

## 2) 모바일/반응형 (iPhone/Pixel 기준)

- [ ] 모바일 내비게이션 Drawer 열림/닫힘 정상
- [ ] Profiles/Buckets/Objects/Uploads/Jobs 페이지 레이아웃 깨짐 없음
- [ ] 주요 CTA 버튼(생성/업로드/다운로드/잡 생성) 접근 가능
- [ ] 테이블/리스트 가로 스크롤/줄바꿈 동작 정상

## 3) 업로드 (Presigned/Direct)

- [ ] Presigned 지원 프로필: 파일 업로드 성공
- [ ] Presigned 지원 프로필: 폴더 업로드 성공
- [ ] 업로드 진행률/ETA/취소/재시도 정상
- [x] Presigned 미지원 프로필: **staging fallback** 동작 확인
- [ ] CORS 제한 환경: 업로드 실패 시 에러 메시지 확인

## 4) 다운로드 (Direct → Proxy fallback)

- [ ] Direct download URL 성공
- [x] CORS 제한 환경: direct 실패 후 **proxy fallback** 확인
- [ ] Settings의 “Downloads: Use server proxy” 강제 사용 동작 확인
- [ ] presigned URL 복사/오픈 동작 확인

## 5) Jobs

- [ ] 업로드/다운로드 Job 생성
- [ ] delete/copy/move Job 생성 및 진행률 확인
- [ ] Job 로그/이벤트 스트림 표시 정상
- [ ] 실패/재시도/취소 플로우 정상

## 6) Profiles

- [ ] 프로필 생성/수정/삭제
- [ ] 프로필 YAML export/import
- [ ] provider별 endpoint/region validation 확인

## 7) 자동화 테스트 결과

- [x] `frontend` lint
- [x] `frontend` build
- [x] Playwright mobile smoke (`tests/mobile-smoke.spec.ts`, iPhone/Pixel 프로젝트)
- [x] Playwright docs smoke live (`E2E_LIVE=1`, `tests/docs-smoke.spec.ts`)
- [x] Playwright presigned fallback/CORS mock (`tests/transfers-presigned.spec.ts`)
- [x] Live E2E core (`tests/api-crud.spec.ts`, `tests/jobs-live-flow.spec.ts`, `tests/objects-live-flow.spec.ts`, `tests/docs-smoke.spec.ts`)
- [x] Live E2E 확장 (`tests/transfers-live-fallback.spec.ts`: presigned 미지원 + CORS 제한 fallback)

## 8) 재현 커맨드 (참고)

```bash
# Live E2E (실환경)
cd frontend
E2E_LIVE=1 E2E_BASE_URL=http://<HOST>:8080 E2E_API_TOKEN=<TOKEN> \
E2E_S3_ENDPOINT=http://<S3-ENDPOINT> E2E_S3_ACCESS_KEY=<KEY> E2E_S3_SECRET_KEY=<SECRET> \
E2E_S3_REGION=us-east-1 npx playwright test \
  tests/api-crud.spec.ts tests/jobs-live-flow.spec.ts tests/objects-live-flow.spec.ts tests/transfers-live-fallback.spec.ts tests/docs-smoke.spec.ts

# Live E2E 로컬 원샷 (MinIO + backend 자동 기동/정리)
bash scripts/run_live_e2e_local.sh

# 모바일 스모크
cd frontend
npx playwright test tests/mobile-smoke.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7

# Presigned fallback/CORS 모의 시나리오
cd frontend
npx playwright test tests/transfers-presigned.spec.ts --project=chromium
```
