import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { ProfilesDialogs } from '../ProfilesDialogs'

const profileModalGate = vi.hoisted(() => {
	let resolved = false
	let renderCount = 0
	let release = () => {}
	const promise = new Promise<void>((resolve) => {
		release = resolve
	})
	return {
		promise,
		isResolved: () => resolved,
		renderCount: () => renderCount,
		markRendered: () => {
			renderCount += 1
		},
		resolve: () => {
			resolved = true
			release()
		},
	}
})

vi.mock('../ProfileModal', () => ({
	ProfileModal: () => {
		profileModalGate.markRendered()
		if (!profileModalGate.isResolved()) throw profileModalGate.promise
		return <div data-testid="resolved-profile-modal" />
	},
}))

beforeAll(() => {
	ensureDomShims()
})

describe('ProfilesDialogs', () => {
	it('keeps an accessible closeable shell visible across both lazy profile modal boundaries', async () => {
		const closeCreateModal = vi.fn()
		const props = {
			createOpen: true,
			closeCreateModal,
			onCreateSubmit: vi.fn(),
			createLoading: false,
			editProfile: null,
			closeEditModal: vi.fn(),
			onEditSubmit: vi.fn(),
			editLoading: false,
			editInitialValues: undefined,
			tlsCapability: null,
			tlsStatus: null,
			tlsStatusLoading: false,
			tlsStatusError: null,
			yamlOpen: false,
			closeYamlModal: vi.fn(),
			yamlProfile: null,
			yamlError: null,
			yamlContent: '',
			yamlDraft: '',
			yamlFilename: 'profile.yaml',
			yamlIncludesSecrets: false,
			exportYamlLoading: false,
			saveYamlLoading: false,
			onYamlCopy: vi.fn(),
			onYamlDownload: vi.fn(),
			onYamlLoadSecrets: vi.fn(),
			onYamlDraftChange: vi.fn(),
			onYamlSave: vi.fn(),
			importOpen: false,
			closeImportModal: vi.fn(),
			importSessionToken: 0,
			importText: '',
			importError: null,
			importLoading: false,
			onImportSubmit: vi.fn(),
			onImportFileTextLoad: vi.fn(),
			onImportTextChange: vi.fn(),
			onImportErrorClear: vi.fn(),
		} satisfies ComponentProps<typeof ProfilesDialogs>

		render(<ProfilesDialogs {...props} />)

		expect(screen.getByRole('dialog', { name: 'Create Profile' })).toBeInTheDocument()
		expect(screen.getByRole('status', { name: 'Loading create profile' })).toBeInTheDocument()
		await waitFor(() => expect(profileModalGate.renderCount()).toBeGreaterThan(0))
		expect(screen.getByRole('status', { name: 'Loading create profile' })).toBeInTheDocument()
		fireEvent.click(screen.getByRole('button', { name: 'Close' }))
		expect(closeCreateModal).toHaveBeenCalledOnce()

		await act(async () => {
			profileModalGate.resolve()
			await profileModalGate.promise
		})
		expect(await screen.findByTestId('resolved-profile-modal')).toBeInTheDocument()
	})
})
