import { describe, expect, it } from 'vitest'

import { getPolicyPresets, getPolicyTemplate } from '../policyPresets'

describe('policyPresets', () => {
	it('returns parseable default templates for each provider kind', () => {
		for (const kind of ['s3', 'gcs', 'azure'] as const) {
			const raw = getPolicyTemplate(kind)
			const parsed = JSON.parse(raw) as Record<string, unknown>
			expect(typeof parsed).toBe('object')
			expect(parsed).not.toBeNull()
		}
	})

	it('s3 public preset uses selected bucket in object ARN', () => {
		const bucket = 'demo-bucket'
		const presets = getPolicyPresets('s3', bucket)
		const preset = presets.find((item) => item.key === 's3-public-read')
		expect(preset).toBeDefined()
		const statement = (preset!.value.Statement as Array<Record<string, unknown>>)[0]
		const resources = statement.Resource as string[]
		expect(resources[0]).toContain(`arn:aws:s3:::${bucket}/*`)
	})

	it('gcs public preset adds allUsers viewer binding', () => {
		const presets = getPolicyPresets('gcs', 'unused')
		const preset = presets.find((item) => item.key === 'gcs-public-read')
		expect(preset).toBeDefined()
		const bindings = preset!.value.bindings as Array<Record<string, unknown>>
		expect(bindings[0]?.role).toBe('roles/storage.objectViewer')
		expect(bindings[0]?.members).toEqual(['allUsers'])
	})

	it('azure readonly preset includes readonly stored access policy', () => {
		const presets = getPolicyPresets('azure', 'unused')
		const preset = presets.find((item) => item.key === 'azure-readonly-policy')
		expect(preset).toBeDefined()
		const policies = preset!.value.storedAccessPolicies as Array<Record<string, unknown>>
		expect(policies[0]?.id).toBe('readonly')
		expect(policies[0]?.permission).toBe('r')
	})
})
