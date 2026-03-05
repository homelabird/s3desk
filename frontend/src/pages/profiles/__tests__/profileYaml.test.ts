import { describe, expect, it } from 'vitest'

import type { Profile } from '../../../api/types'
import { buildProfileExportFilename, parseProfileYaml, sanitizeExportFilename } from '../profileYaml'

describe('profileYaml', () => {
	it('infers azure provider when account credentials exist', async () => {
		const yamlText = `
profile:
  name: az-profile
  accountName: account-a
  accountKey: key-a
`
		const { request } = await parseProfileYaml(yamlText)
		expect(request.provider).toBe('azure_blob')
		if (request.provider !== 'azure_blob') {
			throw new Error('unexpected provider')
		}
		expect(request.accountName).toBe('account-a')
		expect(request.accountKey).toBe('key-a')
	})

	it('supports gcp anonymous mode without serviceAccountJson', async () => {
		const yamlText = `
name: gcp-anon
provider: gcp_gcs
anonymous: true
`
		const { request } = await parseProfileYaml(yamlText)
		expect(request.provider).toBe('gcp_gcs')
		if (request.provider !== 'gcp_gcs') {
			throw new Error('unexpected provider')
		}
		expect(request.anonymous).toBe(true)
		expect(request.serviceAccountJson).toBe('')
	})

	it('throws when tls mtls is missing client key', async () => {
		const yamlText = `
profile:
  name: aws-mtls
  provider: aws_s3
  region: ap-northeast-2
  accessKeyId: AKIA...
  secretAccessKey: secret
tls:
  mode: mtls
  clientCertPem: cert-only
`
		await expect(parseProfileYaml(yamlText)).rejects.toThrow('tls.mode=mtls requires clientCertPem and clientKeyPem')
	})

	it('sanitizes export file names', () => {
		expect(sanitizeExportFilename('  prod/profile:main  ')).toBe('prod-profile-main')
		expect(buildProfileExportFilename({ id: 'p-1', name: 'my profile' } as unknown as Profile)).toBe('my_profile.yaml')
		expect(buildProfileExportFilename(null)).toBe('profile.yaml')
	})
})
