import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { localDeviceAccessBrowserHint, localFolderAccessUnavailableTitle } from '../../../lib/secureContext'
import { ensureDomShims } from '../../../test/domShims'
import { ObjectsDownloadPrefixModal } from '../ObjectsDownloadPrefixModal'

const getDevicePickerSupportMock = vi.fn()

vi.mock('../../../lib/deviceFs', async () => {
	const actual = await vi.importActual<typeof import('../../../lib/deviceFs')>('../../../lib/deviceFs')
	return {
		...actual,
		getDevicePickerSupport: (...args: unknown[]) => getDevicePickerSupportMock(...args),
	}
})

vi.mock('../../../components/LocalDevicePathInput', () => ({
	LocalDevicePathInput: (props: { id?: string; placeholder?: string; disabled?: boolean; value?: string }) => (
		<input
			id={props.id}
			readOnly
			placeholder={props.placeholder}
			disabled={props.disabled}
			value={props.value ?? ''}
		/>
	),
}))

beforeAll(() => {
	ensureDomShims()
})

describe('objects local-device modals', () => {
	it('names download-prefix local path input from its visible label', () => {
		getDevicePickerSupportMock.mockReturnValue({ ok: true })

		render(
			<ObjectsDownloadPrefixModal
				open
				sourceLabel="bucket-a/images/"
				values={{ localFolder: '' }}
				onValuesChange={vi.fn()}
				isSubmitting={false}
				onCancel={vi.fn()}
				onFinish={vi.fn()}
				onPickFolder={vi.fn()}
				canSubmit={false}
			/>,
		)

		expect(screen.getByRole('textbox', { name: 'Local destination folder' })).toBeInTheDocument()
	})

	it('keeps prefix enumeration cancelable while it is running', () => {
		getDevicePickerSupportMock.mockReturnValue({ ok: true })

		render(
			<ObjectsDownloadPrefixModal
				open
				sourceLabel="bucket-a/images/"
				values={{ localFolder: 'Downloads' }}
				onValuesChange={vi.fn()}
				isSubmitting
				onCancel={vi.fn()}
				onFinish={vi.fn()}
				onPickFolder={vi.fn()}
				canSubmit
			/>,
		)

		expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
		expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
	})

	it('uses the shared local-device browser hint for download-prefix fallback messaging', async () => {
		getDevicePickerSupportMock.mockReturnValue({ ok: false })

		render(
			<ObjectsDownloadPrefixModal
				open
				sourceLabel="bucket-a/images/"
				values={{ localFolder: '' }}
				onValuesChange={vi.fn()}
				isSubmitting={false}
				onCancel={vi.fn()}
				onFinish={vi.fn()}
				onPickFolder={vi.fn()}
				canSubmit={false}
			/>,
		)

		expect(await screen.findByText(localFolderAccessUnavailableTitle())).toBeInTheDocument()
		expect(screen.getByText(localDeviceAccessBrowserHint())).toBeInTheDocument()
	})
})
