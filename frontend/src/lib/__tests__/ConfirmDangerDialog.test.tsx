import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { message } from 'antd'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { isDialogDismissed } from '../dialogPreferences'
import { ConfirmDangerDialog } from '../ConfirmDangerDialog'
import { ensureDomShims } from '../../test/domShims'

beforeAll(() => {
	ensureDomShims()
})

describe('ConfirmDangerDialog', () => {
	afterEach(() => {
		window.localStorage.clear()
		window.sessionStorage.clear()
		vi.restoreAllMocks()
	})

	it('focuses the required confirmation input when opened', async () => {
		render(<ConfirmDangerDialog title="Delete bucket" onConfirm={vi.fn()} onClose={vi.fn()} />)

		await waitFor(() => {
			expect(screen.getByRole('textbox', { name: 'Type "DELETE" to confirm' })).toHaveFocus()
		})
	})

	it('stores the dismissal preference in the dialog scope token even if the current token changes before submit', async () => {
		vi.spyOn(message, 'error').mockImplementation(() => undefined as never)

		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		const onConfirm = vi.fn(async () => undefined)
		const onClose = vi.fn()

		render(
			<ConfirmDangerDialog
				title="Delete bucket"
				dialogPreferenceKey="confirm:Delete bucket|DELETE"
				scopeApiToken="token-a"
				onConfirm={onConfirm}
				onClose={onClose}
			/>,
		)

		fireEvent.click(screen.getByRole('checkbox', { name: /Do not show this confirmation again/i }))
		fireEvent.change(screen.getByRole('textbox', { name: 'Type "DELETE" to confirm' }), { target: { value: 'DELETE' } })
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-b'))
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

		await waitFor(() => {
			expect(onConfirm).toHaveBeenCalledTimes(1)
			expect(onClose).toHaveBeenCalledTimes(1)
		})
		expect(isDialogDismissed('confirm:Delete bucket|DELETE', 'token-a')).toBe(true)
		expect(isDialogDismissed('confirm:Delete bucket|DELETE', 'token-b')).toBe(false)
	})

	it('keeps the dialog open while the destructive action is submitting', async () => {
		let resolveConfirm: () => void = () => {}
		const onConfirm = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveConfirm = resolve
				}),
		)
		const onClose = vi.fn()

		render(<ConfirmDangerDialog title="Delete bucket" onConfirm={onConfirm} onClose={onClose} />)

		fireEvent.change(screen.getByRole('textbox', { name: 'Type "DELETE" to confirm' }), { target: { value: 'DELETE' } })
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

		await waitFor(() => {
			expect(onConfirm).toHaveBeenCalledTimes(1)
		})
		expect(screen.getByRole('button', { name: 'Close disabled while busy' })).toBeDisabled()
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

		fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true })
		fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement)

		expect(screen.getByRole('dialog', { name: 'Delete bucket' })).toBeInTheDocument()
		expect(onClose).not.toHaveBeenCalled()

		await act(async () => {
			resolveConfirm()
		})

		await waitFor(() => {
			expect(onClose).toHaveBeenCalledTimes(1)
		})
	})
})
