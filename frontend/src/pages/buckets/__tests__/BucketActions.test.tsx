import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BucketActions } from '../BucketActions'

describe('BucketActions', () => {
	it('labels repeated bucket actions with the bucket name while keeping visible text unchanged', () => {
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
		expect(screen.getByRole('button', { name: 'Controls for bucket primary-bucket' })).toHaveTextContent('Controls')
		expect(screen.getByRole('button', { name: 'Policy for bucket primary-bucket' })).toHaveTextContent('Policy')
		expect(screen.getByRole('button', { name: 'Delete bucket primary-bucket' })).toHaveTextContent('Delete')
	})

	it('keeps contextual labels on disabled unsupported actions', () => {
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

		expect(screen.getByRole('button', { name: 'Controls for bucket archive-bucket' })).toBeDisabled()
		expect(screen.getByRole('button', { name: 'Policy for bucket archive-bucket' })).toBeDisabled()
	})
})
