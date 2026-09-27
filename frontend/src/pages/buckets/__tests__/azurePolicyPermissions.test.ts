import { buildAzureProtectionRequest } from '../governance/requestBuilders'
import { describe, expect, it } from 'vitest'
import { serializeAzureStoredAccessPolicies, normalizeAzureStoredAccessPermissions, toggleAzureStoredAccessPermission } from '../governance/utils'

describe('Azure stored policy permissions', () => {
 it('preserves existing and unknown permissions rather than silently dropping them', () => {
  for (const value of ['rxtfi', 'u', 'R', 'rr', 'future']) {
   expect(normalizeAzureStoredAccessPermissions(value)).toBe(value)
  }
  expect(toggleAzureStoredAccessPermission('rz', 'w', true)).toBe('rwz')
  expect(toggleAzureStoredAccessPermission('rz', 'r', false)).toBe('z')
 })
})

it('validates identifiers consistently without case folding or byte counting', () => {
 const policies = (ids: string[]) => ids.map(id => ({ id, start: '', expiry: '', permission: '' }))
 expect(serializeAzureStoredAccessPolicies(policies(['read', 'Read', '한'.repeat(64)]))).toHaveLength(3)
 expect(() => serializeAzureStoredAccessPolicies(policies(['read', ' read ']))).toThrow('unique')
 expect(() => serializeAzureStoredAccessPolicies(policies(['한'.repeat(65)]))).toThrow('64')
})

it('does not send an immutability update when its current policy cannot be edited', () => {
 for (const enabled of [false, true]) {
  const request = buildAzureProtectionRequest({
   softDeleteEnabled: true, softDeleteDays: '14', immutabilityEnabled: enabled,
   immutabilityDays: '', immutabilityMode: 'unlocked', immutabilityEditable: false,
   allowProtectedAppendWrites: false, allowProtectedAppendWritesAll: false,
  })
  expect(request).toEqual({ softDelete: { enabled: true, days: 14 } })
 }
})

 it('accepts Azure date-only and minute-precision policy times', async () => {
  const { normalizeAzureStoredPolicies } = await import('../create/types')
  for (const value of ['2026-09-27', '2026-09-27T12:30Z', '2026-09-27T12:30:45.1234567Z']) {
   expect(normalizeAzureStoredPolicies([{ key: 'one', id: 'reader', start: value, expiry: '', permission: 'r' }])[0].start).toBe(value)
  }
 })

it('rejects invalid Azure calendar dates and time components', async () => {
 const { isAzurePolicyTime } = await import('../create/types')
 for (const value of ['2026-02-30', '2025-02-29T12:30Z', '2026-13-01', '2026-09-27T24:00Z', '2026-09-27T12:60Z', '2026-09-27T12:30']) {
  expect(isAzurePolicyTime(value), value).toBe(false)
 }
 expect(isAzurePolicyTime('2024-02-29T12:30Z')).toBe(true)
})

it('validates dates when serializing existing Azure policies', () => {
 for (const field of ['start', 'expiry']) {
  const policy = { id: 'reader', start: '', expiry: '', permission: 'r', [field]: '2026-02-30' }
  expect(() => serializeAzureStoredAccessPolicies([policy])).toThrow(`${field} must be an ISO 8601`)
 }
 expect(serializeAzureStoredAccessPolicies([{ id: 'reader', start: '2026-09-27', expiry: '2026-09-28T12:30Z', permission: 'r' }])[0])
  .toEqual({ id: 'reader', start: '2026-09-27', expiry: '2026-09-28T12:30Z', permission: 'r' })
})
