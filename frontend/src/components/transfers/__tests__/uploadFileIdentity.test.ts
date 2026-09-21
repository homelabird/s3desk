// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fingerprintUploadFile, isUploadFingerprint } from '../uploadFileIdentity'
import { resolveExistingResumeChunks } from '../uploadRuntimeResume'

afterEach(() => vi.unstubAllGlobals())
describe('verified upload identity', () => {
 it('covers every byte, including beyond the first block, without relying on a filename/date', async () => {
  const bytes = new Uint8Array(8 * 1024 * 1024 + 1)
  const original = new File([bytes], 'same.bin', { lastModified: 1 })
  const same = new File([bytes], 'renamed.bin', { lastModified: 2 })
  bytes[bytes.length - 1] = 1
  const changed = new File([bytes], 'same.bin', { lastModified: 1 })
  const identity = await fingerprintUploadFile(original)
  expect(isUploadFingerprint(identity)).toBe(true)
  expect(await fingerprintUploadFile(same)).toBe(identity)
  expect(await fingerprintUploadFile(changed)).not.toBe(identity)
 })
 it('rejects a same-name/same-size replacement before any status call', async () => {
  const original = new File(['AAAAAAAA'], 'video.bin')
  const replacement = new File(['BBBBBBBB'], 'video.bin')
  const getUploadChunksBatch = vi.fn()
  const result = await resolveExistingResumeChunks({
   api: { uploads: { getUploadChunksBatch } } as never, profileId: 'p', uploadId: 'u',
   items: [{ file: replacement }], resumeFilesByPath: new Map([['video.bin', {
    size: 8, chunkSizeBytes: 4, fingerprint: await fingerprintUploadFile(original),
   }]]),
  })
  expect(result.ok).toBe(false)
  expect(getUploadChunksBatch).not.toHaveBeenCalled()
 })
 it('does not reuse legacy descriptors with no content identity', async () => {
  const result = await resolveExistingResumeChunks({ api: { uploads: {} } as never,
   profileId: 'p', uploadId: 'u', items: [{ file: new File(['AAAA'], 'f') }],
   resumeFilesByPath: new Map([['f', { size: 4, chunkSizeBytes: 2 }]]),
  })
  expect(result).toEqual({ ok: true, available: false })
 })
 it('safely disables reuse without Web Crypto, but supports cancellation', async () => {
  vi.stubGlobal('crypto', undefined)
  expect(await fingerprintUploadFile(new Blob(['hello']))).toBeUndefined()
  const controller = new AbortController(); controller.abort()
  await expect(fingerprintUploadFile(new Blob(['hello']), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
 })
})
