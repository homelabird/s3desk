import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UploadTask } from '../transferTypes'
import { useTransfersUploadRuntime } from '../useTransfersUploadRuntime'
const { select } = vi.hoisted(() => ({ select: vi.fn() }))
vi.mock('../uploadRuntimeRetry', () => ({ resolveRetryUploadItems: select }))
vi.mock('../useTransfersUploadJobEvents', () => ({ useTransfersUploadJobEvents: () => {} }))
vi.mock('../uploadRuntimeTask', () => ({ runUploadTask: vi.fn() }))
vi.mock('../uploadRuntimePreview', () => ({ queueLocalUploadPreview: vi.fn() }))
vi.mock('../transfersQueuedUpload', () => ({ buildQueuedUpload: vi.fn() }))

describe('file identity failure recovery', () => {
 it('opens the selector again instead of retrying a remembered wrong file', async () => {
  const correct = { file: new File(['AAAA'], 'f') }
  const itemsRef = { current: { u: [{ file: new File(['BBBB'], 'f') }] } }
  const tasksRef = { current: [{ id: 'u', status: 'failed', retryFileHandleState: 'selection_required' } as UploadTask] }
  select.mockResolvedValue({ ok: true, selection: { items: [correct], totalBytes: 4, filePaths: ['f'], resumeFileSize: 4 } })
  const { result } = renderHook(() => useTransfersUploadRuntime({
   api: {} as never, apiToken: 'test', queryClient: {} as never,
   notifications: { error: vi.fn(), info: vi.fn(), warning: vi.fn(), uploadCommitted: vi.fn() },
   uploadTasks: tasksRef.current, uploadTasksRef: tasksRef, uploadTaskConcurrency: 0, uploadChunkFileConcurrency: 1,
   uploadResumeConversionEnabled: false, pickUploadTuning: vi.fn() as never,
   setUploadTasks: vi.fn(), updateUploadTask: (_id, update) => { tasksRef.current[0] = update(tasksRef.current[0]) },
   handleUploadJobUpdate: vi.fn(), uploadAbortByTaskIdRef: { current: {} },
   uploadEstimatorByTaskIdRef: { current: {} }, uploadItemsByTaskIdRef: itemsRef,
   uploadPreviewUrlByTaskIdRef: { current: {} }, openTransfers: vi.fn(),
  }))
  await act(async () => { await result.current.retryUploadTask('u') })
  expect(select).toHaveBeenCalledTimes(1)
  expect(itemsRef.current.u).toEqual([correct])
  expect(tasksRef.current[0].status).toBe('queued')
 })
})
