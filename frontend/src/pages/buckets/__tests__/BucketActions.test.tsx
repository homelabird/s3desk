import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BucketActions } from '../BucketActions'

describe('BucketActions', () => {
	it('keeps bucket opening primary and moves management actions into a scoped menu', async () => {
		render(
			<BucketActions
				bucketName="primary-bucket"
				controlsSupported
				controlsUnsupportedReason="unsupported"
				policySupported
				policyUnsupportedReason="unsupported"
				deleteLoading={false}
				onOpenObjects={vi.fn()}
				onOpenControls={vi.fn()}
				onOpenPolicy={vi.fn()}
				onDelete={vi.fn()}
			/>,
		)

		expect(screen.getByRole('button', { name: 'Open objects for bucket primary-bucket' })).toHaveTextContent('Open')
		expect(screen.queryByRole('button', { name: 'Controls for bucket primary-bucket' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Policy for bucket primary-bucket' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Delete bucket primary-bucket' })).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Manage bucket primary-bucket' }))

		expect(await screen.findByRole('menuitem', { name: /Controls/ })).toBeEnabled()
		expect(screen.getByRole('menuitem', { name: /Advanced policy/ })).toBeEnabled()
		expect(screen.getByRole('menuitem', { name: /Delete bucket/ })).toBeEnabled()
	})

	it('keeps unsupported management actions disabled inside the menu', async () => {
		render(
			<BucketActions
				bucketName="archive-bucket"
				controlsSupported={false}
				controlsUnsupportedReason="Controls unsupported"
				policySupported={false}
				policyUnsupportedReason="Policy unsupported"
				deleteLoading={false}
				onOpenObjects={vi.fn()}
				onOpenControls={vi.fn()}
				onOpenPolicy={vi.fn()}
				onDelete={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Manage bucket archive-bucket' }))

		expect(await screen.findByRole('menuitem', { name: /Controls unavailable/ })).toBeDisabled()
		expect(screen.getByRole('menuitem', { name: /Policy unavailable/ })).toBeDisabled()
	})
})
