import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { ProfileModal } from '../ProfileModal'
import type { ProfileFormValues } from '../profileTypes'

beforeAll(() => {
	ensureDomShims()
})

function renderProfileModal(props: Partial<ComponentProps<typeof ProfileModal>> = {}) {
	return render(
		<ProfileModal
			open
			title="Create Profile"
			okText="Create"
			onCancel={vi.fn()}
			onSubmit={vi.fn()}
			loading={false}
			{...props}
		/>,
	)
}

function getEndpointInput() {
	const input = document.getElementById('profile-endpoint') as HTMLInputElement | null
	expect(input).not.toBeNull()
	return input!
}

function getPublicEndpointInput() {
	const input = document.getElementById('profile-public-endpoint') as HTMLInputElement | null
	expect(input).not.toBeNull()
	return input!
}

describe('ProfileModal', () => {
	it('starts create mode with an empty S3 endpoint', () => {
		renderProfileModal()

		expect(getEndpointInput()).toHaveValue('')
		expect(getPublicEndpointInput()).toHaveAttribute('placeholder', 'https://storage.example.com')
	})

	it('keeps the existing endpoint in edit mode', () => {
		const initialValues: Partial<ProfileFormValues> = {
			provider: 's3_compatible',
			name: 'Existing Profile',
			endpoint: 'https://example.com',
			region: 'us-east-1',
		}

		renderProfileModal({
			title: 'Edit Profile',
			okText: 'Save',
			editMode: true,
			initialValues,
		})

		expect(getEndpointInput()).toHaveValue('https://example.com')
	})

	it('shows provider as a read-only text field in edit mode', () => {
		renderProfileModal({
			title: 'Edit Profile',
			okText: 'Save',
			editMode: true,
			initialValues: {
				provider: 's3_compatible',
				name: 'Existing Profile',
				endpoint: 'https://example.com',
				region: 'us-east-1',
			},
		})

		const field = document.getElementById('profile-provider')
		expect(field?.tagName).toBe('INPUT')
		expect(field).toHaveValue('S3 Compatible')
		expect(screen.queryByRole('combobox', { name: /provider/i })).toBeNull()
	})

	it('shows Off badges for collapsed optional sections in create mode', () => {
		renderProfileModal()

		for (const label of ['Browser endpoint', 'Session token', 'Options', 'TLS']) {
			const summary = screen.getByText(label).closest('summary')
			expect(summary).not.toBeNull()
			expect(summary).toHaveTextContent('Off')
		}
	})

	it('shows configured counts for collapsed optional sections', () => {
		const initialValues: Partial<ProfileFormValues> = {
			provider: 's3_compatible',
			name: 'Existing Profile',
			endpoint: 'https://example.com',
			region: 'us-east-1',
			publicEndpoint: 'https://storage.example.com',
			sessionToken: 'temporary-token',
			forcePathStyle: true,
			tlsInsecureSkipVerify: true,
		}

		renderProfileModal({
			title: 'Edit Profile',
			okText: 'Save',
			editMode: true,
			initialValues,
		})

		for (const label of ['Browser endpoint', 'Session token', 'Options', 'TLS']) {
			const summary = screen.getByText(label).closest('summary')
			expect(summary).not.toBeNull()
			expect(summary).toHaveTextContent('1 configured')
		}
	})
})
