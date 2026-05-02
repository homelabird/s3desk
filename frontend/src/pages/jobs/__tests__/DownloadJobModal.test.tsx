import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import {
	localDeviceAccessBrowserHint,
	localFolderAccessUnavailableTitle,
	selectLocalFolderFirstHint,
} from '../../../lib/secureContext'
import { DownloadJobModal } from '../DownloadJobModal'

const getDevicePickerSupportMock = vi.fn()
const messageInfoMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			...actual.message,
			info: (...args: unknown[]) => messageInfoMock(...args),
		},
	}
})

vi.mock('../../../lib/deviceFs', async () => {
	const actual = await vi.importActual<typeof import('../../../lib/deviceFs')>('../../../lib/deviceFs')
	return {
		...actual,
		getDevicePickerSupport: (...args: unknown[]) => getDevicePickerSupportMock(...args),
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
	messageInfoMock.mockClear()
})

describe('DownloadJobModal', () => {
	it('uses the shared local-device browser hint when support has no explicit reason', async () => {
		getDevicePickerSupportMock.mockReturnValue({ ok: false })

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

		expect(await screen.findByText(localFolderAccessUnavailableTitle())).toBeInTheDocument()
		expect(screen.getByText(localDeviceAccessBrowserHint())).toBeInTheDocument()
	})

	it('uses the shared local-folder required hint when submit runs without a picked folder', () => {
		getDevicePickerSupportMock.mockReturnValue({ ok: true })

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
		if (!form) {
			throw new Error('expected download job form')
		}
		fireEvent.submit(form)

		expect(messageInfoMock).toHaveBeenCalledWith(selectLocalFolderFirstHint())
	})
})
