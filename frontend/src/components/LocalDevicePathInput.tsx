import { Button, Input } from 'antd'
import { useState } from 'react'

import { appFeedback } from '../lib/appFeedback'
import { getDevicePickerSupport, pickDirectory } from '../lib/deviceFs'

type LocalDevicePathInputProps = {
	value?: string
	onChange?: (value: string) => void
	onPick?: (handle: FileSystemDirectoryHandle) => void
	placeholder?: string
	disabled?: boolean
	buttonLabel?: string
	pickerMode?: 'read' | 'readwrite'
}

export function LocalDevicePathInput(props: LocalDevicePathInputProps) {
	const [picking, setPicking] = useState(false)
	const support = getDevicePickerSupport()

	const handleBrowse = async () => {
		setPicking(true)
		try {
			const handle = await pickDirectory(props.pickerMode ?? 'read')
			props.onPick?.(handle)
			props.onChange?.(handle.name)
		} catch (err) {
			const error = err as Error
			if (error?.name === 'AbortError') return
			appFeedback.error(error?.message ?? 'Failed to open directory picker.')
		} finally {
			setPicking(false)
		}
	}

	return (
		<Input
			value={props.value}
			readOnly
			disabled={props.disabled}
			placeholder={props.placeholder}
			addonAfter={
				<Button onClick={handleBrowse} disabled={props.disabled || !support.ok || picking}>
					{props.buttonLabel ?? 'Browse…'}
				</Button>
			}
		/>
	)
}
