import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { NumberField } from '../NumberField'

function renderClampedField({ initialValue = 128, min = 16, max = 512 } = {}) {
	const onChange = vi.fn()
	function Example() {
		const [value, setValue] = useState(initialValue)
		return <NumberField
			ariaLabel="Upload chunk size"
			min={min}
			max={max}
			step={16}
			value={value}
			onChange={(next) => {
				onChange(next)
				setValue(next === null ? initialValue : Math.min(max, Math.max(min, next)))
			}}
		/>
	}
	render(<Example />)
	return { input: screen.getByRole('spinbutton', { name: 'Upload chunk size' }), onChange }
}

describe('NumberField', () => {
	it('allows a below-minimum first digit to become a valid multi-digit value', () => {
		const { input, onChange } = renderClampedField()
		fireEvent.focus(input)
		fireEvent.change(input, { target: { value: '6' } })
		expect(input).toHaveValue(6)
		expect(onChange).not.toHaveBeenCalled()
		fireEvent.change(input, { target: { value: `${(input as HTMLInputElement).value}4` } })
		expect(input).toHaveValue(64)
		expect(onChange).toHaveBeenCalledExactlyOnceWith(64)
	})

	it('applies valid edits and valid spinner values immediately without committing again on blur', () => {
		const { input, onChange } = renderClampedField()
		fireEvent.focus(input)
		fireEvent.change(input, { target: { value: '256' } })
		fireEvent.change(input, { target: { value: '272' } })
		expect(input).toHaveValue(272)
		expect(onChange.mock.calls).toEqual([[256], [272]])
		fireEvent.blur(input)
		expect(onChange).toHaveBeenCalledTimes(2)
	})

	it('applies zero immediately when the caller permits zero retry attempts', () => {
		const { input, onChange } = renderClampedField({ initialValue: 2, min: 0, max: 5 })
		fireEvent.change(input, { target: { value: '0' } })
		expect(onChange).toHaveBeenCalledExactlyOnceWith(0)
		expect(input).toHaveValue(0)
	})

	for (const commit of ['blur', 'Enter'] as const) {
		for (const { draft, clamped } of [{ draft: 6, clamped: 16 }, { draft: 999, clamped: 512 }]) {
			it(`keeps an out-of-range draft ${draft} until ${commit} applies the caller's clamp`, () => {
				const { input, onChange } = renderClampedField()
				fireEvent.focus(input)
				fireEvent.change(input, { target: { value: String(draft) } })
				expect(input).toHaveValue(draft)
				expect(onChange).not.toHaveBeenCalled()
				if (commit === 'blur') fireEvent.blur(input)
				else fireEvent.keyDown(input, { key: 'Enter' })
				expect(onChange).toHaveBeenCalledExactlyOnceWith(draft)
				expect(input).toHaveValue(clamped)
			})
		}
	}

	it('allows clearing the input until blur applies the existing caller fallback', () => {
		const { input, onChange } = renderClampedField()
		fireEvent.focus(input)
		fireEvent.change(input, { target: { value: '' } })
		expect(input).toHaveValue(null)
		expect(onChange).not.toHaveBeenCalled()
		fireEvent.blur(input)
		expect(onChange).toHaveBeenCalledExactlyOnceWith(null)
		expect(input).toHaveValue(128)
	})
})
