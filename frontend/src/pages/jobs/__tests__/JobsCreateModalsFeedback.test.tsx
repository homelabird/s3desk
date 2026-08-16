import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { DeletePrefixJobModal } from '../DeletePrefixJobModal'

const { messageError } = vi.hoisted(() => ({ messageError: vi.fn() }))

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return { ...actual, message: { ...actual.message, error: (...args: unknown[]) => messageError(...args) } }
})

beforeAll(() => ensureDomShims())
beforeEach(() => messageError.mockReset())

describe('Jobs delete modal feedback', () => {
	function renderModal() {
		render(
			<DeletePrefixJobModal
				open
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				loading={false}
				isOffline={false}
				bucket="bucket-a"
				setBucket={vi.fn()}
				bucketOptions={[]}
				prefill={null}
			/>,
		)
	}

	it('names destructive job fields from their visible labels', () => {
		renderModal()
		expect(screen.getByRole('textbox', { name: 'Prefix' })).toBeInTheDocument()
		expect(screen.getByRole('textbox', { name: 'Include patterns (one per line)' })).toBeInTheDocument()
		expect(screen.getByRole('textbox', { name: 'Exclude patterns (one per line)' })).toBeInTheDocument()
		fireEvent.click(screen.getByRole('switch', { name: 'Delete ALL objects in bucket' }))
		expect(screen.getByRole('textbox', { name: 'Type "DELETE" to confirm' })).toBeInTheDocument()
	})

	it('routes delete-prefix validation feedback through the shared jobs catalog', () => {
		renderModal()
		const form = screen.getByRole('combobox', { name: 'Bucket' }).closest('form')
		if (!form) throw new Error('expected delete form')
		fireEvent.submit(form)
		expect(messageError).toHaveBeenCalledWith('Prefix is required unless deleteAll is enabled')

		fireEvent.change(screen.getByRole('textbox', { name: 'Prefix' }), { target: { value: 'logs*' } })
		fireEvent.submit(form)
		expect(messageError).toHaveBeenCalledWith('Wildcards are not allowed in prefix')

		fireEvent.change(screen.getByRole('textbox', { name: 'Prefix' }), { target: { value: 'logs' } })
		fireEvent.submit(form)
		expect(messageError).toHaveBeenCalledWith('Acknowledge unsafe prefix to proceed')
	})
})
