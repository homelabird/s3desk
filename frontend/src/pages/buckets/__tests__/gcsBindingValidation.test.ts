import { describe, expect, it } from 'vitest'
import { buildGCSConditionDraft, createEmptyGCSBindingDraft, serializeGCSBindings } from '../governance/utils'

describe('GCS typed binding validation', () => {
 it('does not silently drop an empty condition object', () => {
  const binding = {
   ...createEmptyGCSBindingDraft(), role: 'roles/storage.objectViewer', membersText: 'allUsers',
   ...buildGCSConditionDraft({}),
  }
  expect(binding.conditionEnabled).toBe(true)
  expect(() => serializeGCSBindings([binding])).toThrow('condition title is required')
  expect(serializeGCSBindings([{ ...binding, conditionEnabled: false }])[0]).not.toHaveProperty('condition')
 })
 it('rejects empty members while permitting explicit removal of all bindings', () => {
  const binding = { ...createEmptyGCSBindingDraft(), role: 'roles/storage.objectViewer', membersText: ' , \n ' }
  expect(() => serializeGCSBindings([binding])).toThrow('at least one member')
  expect(serializeGCSBindings([])).toEqual([])
 })
})
