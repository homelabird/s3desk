// Actual transfer source + explicitly simulated XHR/API responses. No network,
// SeaweedFS, React rendering, or mobile-device certification is implied.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createLoader } = require('../test-support/load_typescript.cjs');
const root = process.env.TRANSFER_TEST_ROOT || path.resolve(__dirname, '../..');
const load = createLoader(root);
const { uploadPresignedFilesWithProgress } = load('frontend/src/components/transfers/presignedUpload.ts');
const { fingerprintUploadFile } = load('frontend/src/components/transfers/uploadFileIdentity.ts');
const { RequestAbortedError } = load('frontend/src/api/errors.ts');
const originalXHR = global.XMLHttpRequest;
afterEach(() => { global.XMLHttpRequest = originalXHR; });
const partSize = 5 * 1024 * 1024;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function simulatedXHR(send) {
  const all = [];
  global.XMLHttpRequest = class {
    constructor() { this.upload = {}; this.status = 0; this.responseText = ''; this.headers = {}; this.abortCount = 0; all.push(this); }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader() {}
    getResponseHeader(key) { return this.headers[key.toLowerCase()] ?? (key.toLowerCase() === 'etag' ? '"etag"' : null); }
    send(body) { send(this, body, all.length); }
    abort() { this.abortCount++; this.onabort?.(); }
    ok() { this.status = 200; this.onload?.(); }
    fail(status) { this.status = status; this.onload?.(); }
  };
  return all;
}
function single(extra = {}) {
  return {
    api: { uploads: { presignUpload: async () => ({ mode: 'single', url: '/put' }) } },
    profileId: 'p', uploadId: 'u', items: [{ file: new File(['NEWBYTES'], 'same.bin') }],
    singleConcurrency: 1, multipartFileConcurrency: 1, partConcurrency: 2,
    chunkThresholdBytes: 1024, chunkSizeBytes: 512, ...extra,
  };
}
function multipart(extra = {}) {
  const calls = { completes: 0, aborts: 0 };
  const args = single({
    items: [{ file: new File([new Uint8Array(3 * partSize)], 'large.bin') }],
    chunkThresholdBytes: 1, chunkSizeBytes: partSize, preserveSessionOnFailure: true,
    api: { uploads: {
      presignUpload: async () => ({ mode: 'multipart', multipart: { partSizeBytes: partSize, partCount: 3,
        parts: [1, 2, 3].map(number => ({ number, url: '/part-' + number })) } }),
      completeMultipartUpload: async () => { calls.completes++; },
      abortMultipartUpload: async () => { calls.aborts++; },
    } }, ...extra,
  });
  return { args, calls };
}
async function bounded(handle, milliseconds = 2500) {
  let timer;
  try { return await Promise.race([handle.promise, new Promise((_, reject) => {
    timer = setTimeout(() => { handle.abort(); reject(new Error('TEST_DEADLINE: operation did not settle')); }, milliseconds);
  })]); } finally { clearTimeout(timer); }
}

test('ambiguous single PUT failure is never converted to a successful upload', async () => {
  const all = simulatedXHR(xhr => queueMicrotask(() => xhr.onerror?.()));
  const handle = uploadPresignedFilesWithProgress(single());
  await assert.rejects(bounded(handle), { name: 'PresignedUploadNetworkError' });
  assert.equal(all.length, 2);
  assert(all.every(xhr => xhr.onload === null && xhr.upload.onprogress === null));
});
test('a lost response followed by a confirmed successful retry is accepted', async () => {
  const all = simulatedXHR((xhr, _body, n) => queueMicrotask(() => n === 1 ? xhr.onerror?.() : xhr.ok()));
  assert.deepEqual(await bounded(uploadPresignedFilesWithProgress(single())), { skipped: 0 });
  assert.equal(all.length, 2);
});
test('transient HTTP 503 retries once, then returns a safe error without provider body', async () => {
  const all = simulatedXHR(xhr => { xhr.responseText = '<xml>SECRET_SIGNED_URL</xml>'; queueMicrotask(() => xhr.fail(503)); });
  await assert.rejects(bounded(uploadPresignedFilesWithProgress(single())), error => /503/.test(error.message) && !error.message.includes('SECRET'));
  assert.equal(all.length, 2);
});
test('403 is not retried automatically', async () => {
  const all = simulatedXHR(xhr => queueMicrotask(() => xhr.fail(403)));
  await assert.rejects(bounded(uploadPresignedFilesWithProgress(single())), /403/);
  assert.equal(all.length, 1);
});
test('fatal part aborts a hung sibling immediately and preserves the primary error', async () => {
  const all = simulatedXHR(xhr => { if (xhr.url === '/part-2') queueMicrotask(() => xhr.fail(403)); });
  const { args, calls } = multipart();
  await assert.rejects(bounded(uploadPresignedFilesWithProgress(args), 200), /403/);
  assert.deepEqual(all.map(x => x.url), ['/part-1', '/part-2']);
  assert.equal(all[0].abortCount, 1);
  assert.equal(calls.completes, 0);
  assert.equal(calls.aborts, 0); // verified session preserved for explicit retry
});
test('completed XHRs are not retained in the cancellation set', async () => {
  const all = simulatedXHR((xhr, _body, n) => queueMicrotask(() => n === 1 ? xhr.ok() : xhr.fail(403)));
  await assert.rejects(bounded(uploadPresignedFilesWithProgress(single({ items: [
    { file: new File(['one'], 'one') }, { file: new File(['two'], 'two') },
  ] }))), /403/);
  assert.equal(all[0].abortCount, 0);
});
test('cancel interrupts pending presign API request through its AbortSignal', async () => {
  let signal;
  const args = single({ api: { uploads: { presignUpload: (_p, _u, _request, s) => new Promise((_, reject) => {
    signal = s; s?.addEventListener('abort', () => reject(new RequestAbortedError()), { once: true });
  }) } } });
  const handle = uploadPresignedFilesWithProgress(args); handle.abort();
  await assert.rejects(bounded(handle, 200), { name: 'RequestAbortedError' });
  assert.equal(signal.aborted, true);
});
test('cancel during backoff prevents a late retry', async () => {
  const all = simulatedXHR(xhr => queueMicrotask(() => xhr.onerror?.()));
  const handle = uploadPresignedFilesWithProgress(single());
  await sleep(5); handle.abort();
  await assert.rejects(bounded(handle, 200), { name: 'RequestAbortedError' });
  await sleep(520);
  assert.equal(all.length, 1);
});
test('no-progress connections time out and are aborted, instead of occupying a slot forever', async () => {
  const all = simulatedXHR(() => {});
  await assert.rejects(bounded(uploadPresignedFilesWithProgress(single({ stallTimeoutMs: 15 })), 1200), /stalled/);
  assert.equal(all.length, 2);
  assert(all.every(xhr => xhr.abortCount === 1));
});
test('progress renews the idle deadline without imposing a whole-file deadline', async () => {
  simulatedXHR((xhr, body) => {
    for (let n = 1; n <= 4; n++) setTimeout(() => xhr.upload.onprogress?.({ loaded: Math.min(n, body.size) }), n * 20);
    setTimeout(() => xhr.ok(), 90);
  });
  assert.deepEqual(await bounded(uploadPresignedFilesWithProgress(single({ stallTimeoutMs: 40 })), 500), { skipped: 0 });
});
test('verified existing parts still skip PUTs and complete with server inventory', async () => {
  const all = simulatedXHR(xhr => queueMicrotask(() => xhr.ok()));
  const { args, calls } = multipart({ existingChunksByPath: { 'large.bin': [0, 1] } });
  assert.deepEqual(await bounded(uploadPresignedFilesWithProgress(args)), { skipped: 0 });
  assert.deepEqual(all.map(xhr => xhr.url), ['/part-3']);
  assert.equal(calls.completes, 1);
});

test('fingerprint progress covers all bytes, including after the first block', async () => {
  const file = new File([new Uint8Array(8 * 1024 * 1024 + 3)], 'f'); const progress = [];
  const hash = await fingerprintUploadFile(file, undefined, p => progress.push(p));
  assert.match(hash, /^s3desk-sha256-chain-v1:[a-f0-9]{64}$/);
  assert.equal(progress[0].loadedBytes, 0);
  assert.equal(progress.at(-1).loadedBytes, file.size);
  assert(progress.every((p, i) => p.totalBytes === file.size && (i === 0 || p.loadedBytes >= progress[i - 1].loadedBytes)));
  const cacheProgress = []; assert.equal(await fingerprintUploadFile(file, undefined, p => cacheProgress.push(p)), hash);
  assert.deepEqual(cacheProgress, [{ loadedBytes: file.size, totalBytes: file.size }]);
});
test('same bytes preserve the v1 identity independently of filename or modification time', async () => {
  const a = new File(['AAAAAAAA'], 'one', { lastModified: 1 });
  assert.equal(await fingerprintUploadFile(a), await fingerprintUploadFile(new File(['AAAAAAAA'], 'two', { lastModified: 2 })));
  assert.notEqual(await fingerprintUploadFile(a), await fingerprintUploadFile(new File(['BBBBBBBB'], 'one')));
});
test('cancel does not wait for a pending Blob read or cache its late result', async () => {
  let release, markStarted; let reads = 0;
  const started = new Promise(resolve => { markStarted = resolve; });
  class SlowBlob extends Blob {
    slice(...args) {
      const block = super.slice(...args);
      return { arrayBuffer: () => { reads++; if (reads > 1) return block.arrayBuffer(); markStarted(); return new Promise(resolve => { release = () => block.arrayBuffer().then(resolve); }); } };
    }
  }
  const blob = new SlowBlob(['original']); const controller = new AbortController();
  const pending = fingerprintUploadFile(blob, controller.signal); await started; controller.abort();
  await assert.rejects(bounded({ promise: pending, abort: () => {} }, 100), { name: 'AbortError' });
  release(); await sleep(10);
  assert.match(await fingerprintUploadFile(blob), /^s3desk-sha256-chain-v1:/);
  assert.equal(reads, 2);
});
test('local preparation is throttled, never counted as uploaded bytes, and isolates stale callbacks', () => {
  const { createUploadPreparationReporter } = load('frontend/src/components/transfers/uploadPreparation.ts');
  let task = { loadedBytes: 0 }; let updates = 0; let current = true;
  const controller = new AbortController();
  const reporter = createUploadPreparationReporter({ taskId: 'u', phase: 'verifying', signal: controller.signal,
    isCurrent: () => current, updateTask: (_id, fn) => { updates++; task = fn(task); } });
  const p = { fileName: 'long-file.bin', fileIndex: 1, fileCount: 2, loadedBytes: 0, totalBytes: 100 };
  reporter.report(p); for (let i = 1; i < 100; i++) reporter.report({ ...p, loadedBytes: i });
  reporter.report({ ...p, loadedBytes: 100 });
  assert.equal(updates, 2); assert.equal(task.loadedBytes, 0); assert.equal(task.preparation.loadedBytes, 100);
  current = false; reporter.report({ ...p, fileIndex: 2 }); reporter.clear(); assert.equal(updates, 2);
  current = true; controller.abort(); reporter.report({ ...p, fileIndex: 2 }); assert.equal(updates, 2);
  reporter.clear(); assert.equal(task.preparation, undefined);
});
