// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadPresignedFilesWithProgress } from '../presignedUpload'

afterEach(() => vi.unstubAllGlobals())
describe('verified presigned resume', () => {
 it.each([false, true])('uploads missing parts only; failure=%s preserves a resumable session', async (fail) => {
  const bytes = 5 * 1024 * 1024
  const sent: string[] = []
  class XHR {
   upload = { onprogress: null as ((event: { loaded: number }) => void) | null }
   status = fail ? 500 : 200
   url = ''
   onload: (() => void) | null = null
   onabort: (() => void) | null = null
   open(_method: string, url: string) { this.url = url }
   setRequestHeader() {}
   getResponseHeader() { return '"etag-two"' }
   send() { sent.push(this.url); queueMicrotask(() => this.onload?.()) }
   abort() { this.onabort?.() }
  }
  vi.stubGlobal('XMLHttpRequest', XHR)
  const completeMultipartUpload = vi.fn().mockResolvedValue(undefined)
  const abortMultipartUpload = vi.fn().mockResolvedValue(undefined)
  const handle = uploadPresignedFilesWithProgress({
   api: { uploads: {
    presignUpload: vi.fn().mockResolvedValue({ mode: 'multipart', multipart: {
     partSizeBytes: bytes, partCount: 2,
     parts: [{ number: 1, url: '/part1' }, { number: 2, url: '/part2' }],
    } }), completeMultipartUpload, abortMultipartUpload,
   } } as never,
   profileId: 'p', uploadId: 'u', items: [{ file: new File([new Uint8Array(bytes * 2)], 'f') }],
   singleConcurrency: 1, multipartFileConcurrency: 1, partConcurrency: 2,
   chunkThresholdBytes: 1, chunkSizeBytes: bytes,
   existingChunksByPath: { f: [0] }, preserveSessionOnFailure: true,
  })
  if (fail) await expect(handle.promise).rejects.toThrow()
  else {
   await expect(handle.promise).resolves.toEqual({ skipped: 0 })
   expect(completeMultipartUpload).toHaveBeenCalledWith('p', 'u', { path: 'f', parts: [] }, expect.any(AbortSignal))
  }
  expect(sent).toEqual(fail ? ['/part2', '/part2'] : ['/part2'])
  expect(abortMultipartUpload).not.toHaveBeenCalled()
 })
})
