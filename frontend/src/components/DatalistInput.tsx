import type { InputRef } from 'antd'
import { Input } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef, useId } from 'react'

export type DatalistOption = {
	value: string
	label?: string
}

type DatalistInputProps = {
	listId?: string
	value: string
	onChange: (value: string) => void
	options: DatalistOption[]
	placeholder?: string
	disabled?: boolean
	ariaLabel?: string
	allowClear?: boolean
	style?: CSSProperties
	prefix?: ReactNode
	suffix?: ReactNode
	addonAfter?: ReactNode
	onFocus?: () => void
	onBlur?: () => void
	onPressEnter?: () => void
}

export const DatalistInput = forwardRef<InputRef, DatalistInputProps>(function DatalistInput(props, ref) {
	const autoId = useId()
	const listId = props.listId ?? `datalist-${autoId}`
	return (
		<>
			<Input
				ref={ref}
				value={props.value}
				onChange={(e) => props.onChange(e.target.value)}
				placeholder={props.placeholder}
				disabled={props.disabled}
				aria-label={props.ariaLabel}
				list={listId}
				autoComplete="off"
				allowClear={props.allowClear}
				style={props.style}
				prefix={props.prefix}
				suffix={props.suffix}
				addonAfter={props.addonAfter}
				onFocus={props.onFocus}
				onBlur={props.onBlur}
				onPressEnter={props.onPressEnter}
			/>
			<datalist id={listId}>
				{props.options.map((opt) => (
					<option key={opt.value} value={opt.value} label={opt.label}>
						{opt.label}
					</option>
				))}
			</datalist>
		</>
	)
})
