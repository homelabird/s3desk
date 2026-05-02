import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { localDeviceAccessBrowserHint, localFolderAccessUnavailableTitle } from '../../../lib/secureContext'
import { ensureDomShims } from '../../../test/domShims'
import { ObjectsDownloadPrefixModal } from '../ObjectsDownloadPrefixModal'
import { ObjectsUploadFolderModal } from '../ObjectsUploadFolderModal'

const getDevicePickerSupportMock = vi.fn()

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

describe('objects local-device modals', () => {
	it('uses the shared local-device browser hint for upload-folder fallback messaging', async () => {
		getDevicePickerSupportMock.mockReturnValue({ ok: false })

		render(
			<ObjectsUploadFolderModal
				open
				destinationLabel="bucket-a/images/"
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
