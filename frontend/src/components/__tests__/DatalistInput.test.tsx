import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { DatalistInput } from '../DatalistInput'

describe('DatalistInput', () => {
	it('renders the input, wires a datalist, and forwards focus/blur/enter events', () => {
		const onFocus = vi.fn()
		const onBlur = vi.fn()
		const onPressEnter = vi.fn()

		function Example() {
			const [value, setValue] = useState('')
			return (
				<DatalistInput
					value={value}
					onChange={setValue}
					options={[
						{ value: 'primary-bucket', label: 'Primary Bucket' },
						{ value: 'archive-bucket', label: 'Archive Bucket' },
					]}
					placeholder="Bucket…"
					ariaLabel="Bucket"
					onFocus={onFocus}
					onBlur={onBlur}
					onPressEnter={onPressEnter}
				/>
			)
		}

		render(<Example />)

		const input = screen.getByRole('combobox', { name: 'Bucket' })
		expect(input).toHaveAttribute('placeholder', 'Bucket…')
		expect(input).toHaveValue('')

		const listId = input.getAttribute('list')
		expect(listId).toMatch(/^datalist-/)

		const datalist = document.getElementById(listId!)
		expect(datalist?.tagName).toBe('DATALIST')
		const options = datalist?.querySelectorAll('option') ?? []
		expect(options).toHaveLength(2)
		expect(options[0]).toHaveAttribute('value', 'primary-bucket')
		expect(options[0]).toHaveAttribute('label', 'Primary Bucket')
		expect(options[1]).toHaveAttribute('value', 'archive-bucket')

		fireEvent.focus(input)
		fireEvent.change(input, { target: { value: 'primary-bucket' } })
		fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
		fireEvent.blur(input)

		expect(input).toHaveValue('primary-bucket')
		expect(onFocus).toHaveBeenCalledTimes(1)
		expect(onBlur).toHaveBeenCalledTimes(1)
		expect(onPressEnter).toHaveBeenCalledTimes(1)
	})

	it('supports allowClear and forwards prefix and suffix content', () => {
		function Example() {
			const [value, setValue] = useState('alpha')
			return (
				<DatalistInput
					value={value}
					onChange={setValue}
					options={[{ value: 'alpha' }]}
					ariaLabel="Scoped input"
					allowClear
					prefix={<span>prefix</span>}
					suffix={<span>suffix</span>}
				/>
			)
		}

		const { container } = render(<Example />)

		const input = screen.getByRole('combobox', { name: 'Scoped input' })
		expect(input).toHaveValue('alpha')
		expect(screen.getByText('prefix')).toBeInTheDocument()
		expect(screen.getByText('suffix')).toBeInTheDocument()

		const clearButton = container.querySelector('.ant-input-clear-icon')
		expect(clearButton).not.toBeNull()
		fireEvent.click(clearButton!)

		expect(input).toHaveValue('')
	})

	it('respects a custom list id and disabled state', () => {
		render(
			<DatalistInput
				listId="bucket-options"
				value="locked"
				onChange={vi.fn()}
				options={[{ value: 'locked', label: 'Locked Option' }]}
				ariaLabel="Disabled bucket"
				disabled
			/>,
		)

		const input = screen.getByRole('combobox', { name: 'Disabled bucket' })
		expect(input).toBeDisabled()
		expect(input).toHaveAttribute('list', 'bucket-options')
		expect(document.getElementById('bucket-options')).not.toBeNull()
	})
})
