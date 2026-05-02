import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { selectLocalFolderFirstHint } from '../../../lib/secureContext'
import { CreateJobModal } from '../CreateJobModal'
import { DeletePrefixJobModal } from '../DeletePrefixJobModal'
import { DownloadJobModal } from '../DownloadJobModal'

const { messageError, messageInfo, messageWarning } = vi.hoisted(() => ({
	messageError: vi.fn(),
	messageInfo: vi.fn(),
	messageWarning: vi.fn(),
}))

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			...actual.message,
			error: (...args: unknown[]) => messageError(...args),
			info: (...args: unknown[]) => messageInfo(...args),
			warning: (...args: unknown[]) => messageWarning(...args),
		},
	}
})

const getDevicePickerSupportMock = vi.fn()

vi.mock('../../../lib/deviceFs', async () => {
	const actual = await vi.importActual<typeof import('../../../lib/deviceFs')>('../../../lib/deviceFs')
	return {
		...actual,
		getDevicePickerSupport: (...args: unknown[]) => getDevicePickerSupportMock(...args),
		getDirectorySelectionSupport: () => ({ ok: true, mode: 'input' }),
	}
})

vi.mock('../../../components/LocalDevicePathInput', () => ({
	LocalDevicePathInput: (props: { placeholder?: string; disabled?: boolean; value?: string }) => (
		<input
			readOnly
			aria-label="Local device path"
			placeholder={props.placeholder}
			disabled={props.disabled}
			value={props.value ?? ''}
		/>
	),
}))

beforeAll(() => {
	ensureDomShims()
})

beforeEach(() => {
	messageError.mockReset()
	messageInfo.mockReset()
	messageWarning.mockReset()
	getDevicePickerSupportMock.mockReturnValue({ ok: true })
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: query.includes('min-width'),
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	})
})

describe('Jobs create modal feedback', () => {
	it('routes upload validation feedback through the shared jobs catalog', () => {
		render(
			<CreateJobModal
				profileId="profile-1"
				open
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				loading={false}
				isOffline={false}
				uploadSupported={false}
				uploadUnsupportedReason="Object API is unavailable."
				bucket="bucket-a"
				setBucket={vi.fn()}
				bucketOptions={[]}
			/>,
		)

		const form = screen.getByRole('combobox', { name: 'Bucket' }).closest('form')
		if (!form) throw new Error('expected upload form')
		fireEvent.submit(form)
		expect(messageWarning).toHaveBeenCalledWith('Object API is unavailable.')
	})

	it('routes download validation feedback through the shared jobs catalog', () => {
		render(
			<DownloadJobModal
				profileId="profile-1"
				open
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				loading={false}
				isOffline={false}
				bucket="bucket-a"
				setBucket={vi.fn()}
				bucketOptions={[]}
			/>,
		)

		const form = screen.getByRole('combobox', { name: 'Bucket' }).closest('form')
		if (!form) throw new Error('expected download form')
		fireEvent.submit(form)
		expect(messageInfo).toHaveBeenCalledWith(selectLocalFolderFirstHint())
	})

	it('routes delete-prefix validation feedback through the shared jobs catalog', () => {
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
