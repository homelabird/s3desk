import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { BucketModal } from '../BucketModal'

beforeAll(() => {
	ensureDomShims()
})

describe('BucketModal', () => {
	it('submits recommended AWS secure defaults when enabled', () => {
		const onSubmit = vi.fn()

		render(<BucketModal open onCancel={vi.fn()} onSubmit={onSubmit} loading={false} provider="aws_s3" />)

		fireEvent.change(screen.getByRole('textbox', { name: /bucket name/i }), { target: { value: 'media-prod' } })
		fireEvent.click(screen.getByRole('switch', { name: 'Apply recommended AWS secure defaults' }))
		fireEvent.click(screen.getByRole('button', { name: 'Create' }))

		expect(onSubmit).toHaveBeenCalledWith({
			name: 'media-prod',
			region: undefined,
			defaults: {
				publicExposure: {
					blockPublicAccess: {
						blockPublicAcls: true,
						ignorePublicAcls: true,
						blockPublicPolicy: true,
						restrictPublicBuckets: true,
					},
				},
				access: { objectOwnership: 'bucket_owner_enforced' },
				versioning: { status: 'enabled' },
				encryption: { mode: 'sse_s3', kmsKeyId: undefined },
			},
		})
	})

	it('allows overriding encryption mode to sse_kms', () => {
		const onSubmit = vi.fn()

		render(<BucketModal open onCancel={vi.fn()} onSubmit={onSubmit} loading={false} provider="aws_s3" />)

		fireEvent.change(screen.getByRole('textbox', { name: /bucket name/i }), { target: { value: 'media-prod' } })
		fireEvent.click(screen.getByRole('switch', { name: 'Apply recommended AWS secure defaults' }))
		fireEvent.change(screen.getByRole('combobox', { name: 'Encryption mode' }), { target: { value: 'sse_kms' } })
		fireEvent.change(screen.getByRole('textbox', { name: /kms key id/i }), { target: { value: 'alias/media-prod' } })
		fireEvent.click(screen.getByRole('button', { name: 'Create' }))

		expect(onSubmit).toHaveBeenCalledWith({
			name: 'media-prod',
			region: undefined,
			defaults: expect.objectContaining({
				encryption: {
					mode: 'sse_kms',
					kmsKeyId: 'alias/media-prod',
				},
			}),
		})
	})

	it('submits GCS secure defaults with public mode and initial bindings', () => {
		const onSubmit = vi.fn()

		render(<BucketModal open onCancel={vi.fn()} onSubmit={onSubmit} loading={false} provider="gcp_gcs" />)

		fireEvent.change(screen.getByRole('textbox', { name: /bucket name/i }), { target: { value: 'analytics' } })
		fireEvent.change(screen.getByRole('textbox', { name: /location \(optional\)/i }), { target: { value: 'asia-northeast3' } })
		fireEvent.click(screen.getByRole('switch', { name: 'Apply recommended GCS secure defaults' }))
		fireEvent.change(screen.getByRole('combobox', { name: 'GCS access mode' }), { target: { value: 'public' } })
		fireEvent.click(screen.getByRole('switch', { name: 'Seed GCS IAM bindings during creation' }))
		fireEvent.click(screen.getByRole('button', { name: /add binding/i }))
		fireEvent.change(screen.getByRole('textbox', { name: 'GCS binding 1 role' }), {
			target: { value: 'roles/storage.objectViewer' },
		})
		fireEvent.change(screen.getByRole('textbox', { name: 'GCS binding 1 members' }), {
			target: { value: 'user:ops@example.com' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Create' }))

		expect(onSubmit).toHaveBeenCalledWith({
			name: 'analytics',
			region: 'asia-northeast3',
			defaults: {
				publicExposure: {
					mode: 'public',
				},
				access: {
					bindings: [
						{
							role: 'roles/storage.objectViewer',
							members: ['user:ops@example.com'],
						},
					],
				},
			},
		})
	})

	it('submits Azure secure defaults with visibility and stored access policies', () => {
		const onSubmit = vi.fn()

		render(<BucketModal open onCancel={vi.fn()} onSubmit={onSubmit} loading={false} provider="azure_blob" />)

		fireEvent.change(screen.getByRole('textbox', { name: /bucket name/i }), { target: { value: 'archive' } })
		fireEvent.click(screen.getByRole('switch', { name: 'Apply recommended Azure secure defaults' }))
		fireEvent.change(screen.getByRole('combobox', { name: 'Azure visibility' }), { target: { value: 'blob' } })
		fireEvent.click(screen.getByRole('switch', { name: 'Seed Azure stored access policies during creation' }))
		fireEvent.click(screen.getByRole('button', { name: /add stored access policy/i }))
		fireEvent.change(screen.getByRole('textbox', { name: 'Azure stored access policy 1 id' }), {
			target: { value: 'readonly' },
		})
		fireEvent.change(screen.getByRole('textbox', { name: 'Azure stored access policy 1 start' }), {
			target: { value: '2026-03-10T00:00:00Z' },
		})
		fireEvent.change(screen.getByRole('textbox', { name: 'Azure stored access policy 1 expiry' }), {
			target: { value: '2026-03-31T00:00:00Z' },
		})
		fireEvent.change(screen.getByRole('textbox', { name: 'Azure stored access policy 1 permission' }), {
			target: { value: 'rl' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Create' }))

		expect(onSubmit).toHaveBeenCalledWith({
			name: 'archive',
			region: undefined,
			defaults: {
				publicExposure: {
					mode: 'blob',
					visibility: 'blob',
				},
				access: {
					storedAccessPolicies: [
						{
							id: 'readonly',
							start: '2026-03-10T00:00:00Z',
							expiry: '2026-03-31T00:00:00Z',
							permission: 'rl',
						},
					],
				},
			},
		})
	})

	it('shows a local validation error when a GCS binding is incomplete', () => {
		const onSubmit = vi.fn()

		render(<BucketModal open onCancel={vi.fn()} onSubmit={onSubmit} loading={false} provider="gcp_gcs" />)

		fireEvent.change(screen.getByRole('textbox', { name: /bucket name/i }), { target: { value: 'analytics' } })
		fireEvent.click(screen.getByRole('switch', { name: 'Apply recommended GCS secure defaults' }))
		fireEvent.click(screen.getByRole('switch', { name: 'Seed GCS IAM bindings during creation' }))
		fireEvent.click(screen.getByRole('button', { name: /add binding/i }))
		fireEvent.change(screen.getByRole('textbox', { name: 'GCS binding 1 role' }), {
			target: { value: 'roles/storage.objectViewer' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Create' }))

		expect(onSubmit).not.toHaveBeenCalled()
		expect(screen.getByText('Secure defaults are invalid')).toBeInTheDocument()
		expect(screen.getByText(/at least one member is required/i)).toBeInTheDocument()
	})

	it('shows provider hint for unsupported providers', () => {
		const onSubmit = vi.fn()

		render(<BucketModal open onCancel={vi.fn()} onSubmit={onSubmit} loading={false} provider="oci_object_storage" />)

		expect(screen.getByText('Create-time secure defaults are not available for this provider yet.')).toBeInTheDocument()
		expect(screen.queryByTestId('bucket-modal-secure-defaults')).not.toBeInTheDocument()

		fireEvent.change(screen.getByRole('textbox', { name: /bucket name/i }), { target: { value: 'archive' } })
		fireEvent.click(screen.getByRole('button', { name: 'Create' }))

		expect(onSubmit).toHaveBeenCalledWith({
			name: 'archive',
			region: undefined,
			defaults: undefined,
		})
	})
})
