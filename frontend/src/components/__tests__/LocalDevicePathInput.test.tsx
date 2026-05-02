import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { directoryPickerInsecureOriginReason } from '../../lib/secureContext'
import { LocalDevicePathInput } from '../LocalDevicePathInput'

const messageErrorMock = vi.fn()
const getDevicePickerSupportMock = vi.fn()
const pickDirectoryMock = vi.fn()

vi.mock('antd', () => ({
	Button: (props: {
		children?: ReactNode
		disabled?: boolean
		onClick?: () => void
	}) => (
		<button type="button" disabled={props.disabled} onClick={props.onClick}>
			{props.children}
		</button>
	),
	Input: (props: {
		value?: string
		disabled?: boolean
		placeholder?: string
		addonAfter?: ReactNode
	}) => (
		<div>
			<input readOnly value={props.value ?? ''} disabled={props.disabled} placeholder={props.placeholder} aria-label="Local device path" />
			{props.addonAfter}
		</div>
	),
	message: {
		error: (...args: unknown[]) => messageErrorMock(...args),
	},
}))

vi.mock('../../lib/deviceFs', async () => {
	const actual = await vi.importActual<typeof import('../../lib/deviceFs')>('../../lib/deviceFs')
	return {
		...actual,
		getDevicePickerSupport: (...args: unknown[]) => getDevicePickerSupportMock(...args),
		pickDirectory: (...args: unknown[]) => pickDirectoryMock(...args),
	}
})

describe('LocalDevicePathInput', () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it('disables browse when directory picker support is unavailable', () => {
		getDevicePickerSupportMock.mockReturnValue({ ok: false, reason: directoryPickerInsecureOriginReason() })

		render(<LocalDevicePathInput value="" onChange={vi.fn()} onPick={vi.fn()} placeholder="Select a folder…" />)

		expect(screen.getByRole('button', { name: 'Browse…' })).toBeDisabled()
		expect(pickDirectoryMock).not.toHaveBeenCalled()
	})

	it('picks a directory and forwards the selected handle name', async () => {
		const handle = { name: 'downloads' } as FileSystemDirectoryHandle
		const onChange = vi.fn()
		const onPick = vi.fn()
		getDevicePickerSupportMock.mockReturnValue({ ok: true })
		pickDirectoryMock.mockResolvedValue(handle)

		render(<LocalDevicePathInput value="" onChange={onChange} onPick={onPick} pickerMode="readwrite" />)

		fireEvent.click(screen.getByRole('button', { name: 'Browse…' }))

		await waitFor(() => {
			expect(pickDirectoryMock).toHaveBeenCalledWith('readwrite')
		})
		expect(onPick).toHaveBeenCalledWith(handle)
		expect(onChange).toHaveBeenCalledWith('downloads')
	})

	it('ignores AbortError from the picker without surfacing an error toast', async () => {
		getDevicePickerSupportMock.mockReturnValue({ ok: true })
		pickDirectoryMock.mockRejectedValue({ name: 'AbortError' })

		render(<LocalDevicePathInput value="" onChange={vi.fn()} onPick={vi.fn()} />)

		fireEvent.click(screen.getByRole('button', { name: 'Browse…' }))

		await waitFor(() => {
			expect(pickDirectoryMock).toHaveBeenCalled()
		})
		expect(messageErrorMock).not.toHaveBeenCalled()
	})

	it('surfaces picker failures through the shared error path', async () => {
		getDevicePickerSupportMock.mockReturnValue({ ok: true })
		pickDirectoryMock.mockRejectedValue(new Error('Filesystem blocked'))

		render(<LocalDevicePathInput value="" onChange={vi.fn()} onPick={vi.fn()} />)

		fireEvent.click(screen.getByRole('button', { name: 'Browse…' }))

		await waitFor(() => {
			expect(messageErrorMock).toHaveBeenCalledWith('Filesystem blocked')
		})
	})
})
