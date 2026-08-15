import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { uploadsUnsupportedHint } from '../../../lib/actionHints'
import type { ObjectsToolbarProps } from '../ObjectsToolbar'
import { ObjectsPageHeader } from '../ObjectsPageHeader'

vi.mock('../../../components/UploadSourceSheet', () => ({
	UploadSourceSheet: ({ open }: { open: boolean }) => <div data-testid="upload-source-sheet" data-open={String(open)} />,
}))

vi.mock('../objectsToolbarLazy', () => ({
	ObjectsToolbarSection: ({ toolbarProps }: { toolbarProps: unknown }) => (
		<div data-testid="objects-toolbar-section">{JSON.stringify(toolbarProps)}</div>
	),
}))

function buildProps(overrides: Partial<Parameters<typeof ObjectsPageHeader>[0]> = {}): Parameters<typeof ObjectsPageHeader>[0] {
	return {
		uploadSupported: true,
		uploadDisabledReason: null,
		uploadSourceOpen: false,
		uploadSourceBusy: false,
		folderSelectionSupported: true,
		folderSelectionReason: null,
		onCloseUploadSource: vi.fn(),
		onSelectUploadFiles: vi.fn(),
		onSelectUploadFolder: vi.fn(),
		toolbarSectionProps: {
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucketsErrorMessage: null,
			isAdvanced: true,
			tabs: [{ id: 'tab-1', bucket: 'bucket-a', prefix: '' }],
			activeTabId: 'tab-1',
			onTabChange: vi.fn(),
			onTabAdd: vi.fn(),
			onTabClose: vi.fn(),
			tabLabelMaxWidth: 320,
			toolbarProps: { marker: 'toolbar' } as unknown as ObjectsToolbarProps,
		},
		...overrides,
	}
}

describe('ObjectsPageHeader', () => {
	it('uses the shared uploads-unsupported hint when no object-specific reason is supplied', () => {
		render(<ObjectsPageHeader {...buildProps({ uploadSupported: false })} />)

		expect(screen.getByText('Uploads are disabled for this provider')).toBeInTheDocument()
		expect(screen.getByText(uploadsUnsupportedHint())).toBeInTheDocument()
	})

	it('renders the lazy toolbar section and upload source sheet shell', () => {
		render(<ObjectsPageHeader {...buildProps({ uploadSourceOpen: true })} />)

		expect(screen.getByRole('heading', { level: 1, name: 'Objects' })).toBeInTheDocument()
		expect(screen.getByTestId('objects-toolbar-section')).toBeInTheDocument()
		expect(screen.getByTestId('upload-source-sheet')).toHaveAttribute('data-open', 'true')
	})
})
