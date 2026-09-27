import { describe, expect, it } from 'vitest'

import { buildStructuredPolicyText, getInitialStructuredState, parseStructuredStateFromText } from '../bucketPolicyStructuredState'

describe('structured policy preservation', () => {
	it('preserves IAM conditions and unedited fields on initial form load and JSON/form conversion', () => {
		const policy = {
			version: 3,
			etag: 'revision-1',
			resourceId: 'projects/_/buckets/demo',
			bindings: [{ role: 'roles/storage.objectViewer', members: ['user:reader@example.test'],
				condition: { title: 'limited', expression: 'request.time < timestamp("2030-01-01T00:00:00Z")' } }],
		}
		const text = JSON.stringify(policy)
		const initial = getInitialStructuredState('gcs', text).initialGcsState
		const converted = parseStructuredStateFromText('gcs', text, () => 'row-1')!.gcsState!
		for (const state of [initial, converted]) {
			const build = (members: string[]) => JSON.parse(buildStructuredPolicyText({
				policyKind: 'gcs', policyText: text, gcsVersion: state.version, gcsEtag: state.etag,
				gcsBindings: state.bindings.map((row) => ({ ...row, members })),
				azurePublicAccess: 'private', azureStoredPolicies: [],
			}))
			expect(build(policy.bindings[0].members)).toEqual(policy)
			const edited = build(['user:replacement@example.test'])
			expect(edited.bindings[0].condition).toEqual(policy.bindings[0].condition)
			expect(edited.resourceId).toBe(policy.resourceId)
			expect(edited.bindings[0].members).toEqual(['user:replacement@example.test'])
		}
	})
	it('preserves Azure extension fields through form conversion', () => {
		const policy = { publicAccess: 'private', extension: 'keep', storedAccessPolicies: [
			{ id: 'reader', permission: 'r', extension: { value: 'keep' } },
		] }
		const text = JSON.stringify(policy)
		const initial = getInitialStructuredState('azure', text).initialAzureState
		const converted = parseStructuredStateFromText('azure', text, () => 'row-1')!.azureState!
		for (const state of [initial, converted]) {
			const result = JSON.parse(buildStructuredPolicyText({
				policyKind: 'azure', policyText: text, gcsVersion: 1, gcsEtag: '', gcsBindings: [],
				azurePublicAccess: state.publicAccess, azureStoredPolicies: state.policies,
			}))
			expect(result).toEqual(policy)
		}
	})

})

 it('rejects form conversion that would discard malformed entries', () => {
   for (const policy of [
     { bindings: [null] },
     { bindings: [{ role: 'roles/storage.objectViewer', members: ['allUsers', 42] }] },
     { bindings: [], etag: 42 },
   ]) {
     expect(parseStructuredStateFromText('gcs', JSON.stringify(policy), () => 'row')).toBeNull()
   }
   expect(parseStructuredStateFromText('azure', JSON.stringify({ publicAccess: 'unknown', storedAccessPolicies: [] }), () => 'row')).toBeNull()
 })

 it('preserves every supported explicit IAM version through form conversion', () => {
   for (const version of [0, 1, 3]) {
     const policy = { version, etag: 'revision', bindings: [] }
     const text = JSON.stringify(policy)
     const state = parseStructuredStateFromText('gcs', text, () => 'row')!.gcsState!
     const result = JSON.parse(buildStructuredPolicyText({
       policyKind: 'gcs', policyText: text, gcsVersion: state.version, gcsEtag: state.etag,
       gcsBindings: state.bindings, azurePublicAccess: 'private', azureStoredPolicies: [],
     }))
     expect(result).toEqual(policy)
   }
   for (const version of [-1, 2, 4, 1.5, '3', null]) {
     expect(parseStructuredStateFromText('gcs', JSON.stringify({ version, bindings: [] }), () => 'row')).toBeNull()
   }
 })
