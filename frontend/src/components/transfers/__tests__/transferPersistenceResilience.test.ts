// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { persistTransfers, selectPersistedTasks } from '../useTransfersPersistence'
afterEach(() => vi.unstubAllGlobals())
describe('bounded terminal history, unbounded active descriptors', () => {
 it('retains active jobs older than 200 completed entries', () => {
  const old = { id: 'old', status: 'waiting_job' as const }
  const completed = Array.from({ length: 250 }, (_, i) => ({ id: String(i), status: 'succeeded' as const }))
  expect(selectPersistedTasks([...completed, old])).toHaveLength(201)
  expect(selectPersistedTasks([...completed, old])).toContain(old)
 })
 it('falls back to active-only on quota pressure and never persists signed links', () => {
  let saved = ''
  vi.stubGlobal('window', { sessionStorage: { setItem: vi.fn((_key, value: string) => {
   const payload = JSON.parse(value)
   if (payload.downloads.some((d: { status: string }) => d.status === 'handed_off')) throw new Error('quota')
   saved = value
  }) } })
  expect(persistTransfers([
   { id: 'done', kind: 'object', status: 'handed_off' },
   { id: 'active', kind: 'object', status: 'ready', nativeDownloadUrl: 'SECRET', nativeDownloadExpiresAtMs: 1 },
  ] as never, [])).toBe('active_only')
  expect(JSON.parse(saved).downloads.map((d: { id: string }) => d.id)).toEqual(['active'])
  expect(saved).not.toContain('SECRET')
 })
 it('reports inability to persist even active descriptors', () => {
  vi.stubGlobal('window', { sessionStorage: { setItem: () => { throw new Error('denied') } } })
  expect(persistTransfers([], [])).toBe('failed')
 })
})
