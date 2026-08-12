import type { InputRef } from 'antd'
import { Input } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef, useId, useMemo } from 'react'

const MAX_DATALIST_OPTIONS = 100

export type DatalistOption = {
	value: string
	label?: string
}

type DatalistInputProps = {
	id?: string
	listId?: string
	value: string
	onChange: (value: string) => void
	options: DatalistOption[]
	placeholder?: string
	disabled?: boolean
	ariaLabel?: string
	allowClear?: boolean
	className?: string
	style?: CSSProperties
	prefix?: ReactNode
	suffix?: ReactNode
	onFocus?: () => void
	onBlur?: () => void
	onPressEnter?: () => void
}

export const DatalistInput = forwardRef<InputRef, DatalistInputProps>(function DatalistInput(props, ref) {
	const autoId = useId()
	const listId = props.listId ?? `datalist-${autoId}`
	const visibleOptions = useMemo(() => {
		const query = props.value.trim().toLowerCase()
		const matches = query
			? props.options.filter((option) =>
					`${option.value}\n${option.label ?? ''}`.toLowerCase().includes(query),
				)
			: props.options
		// ponytail: native datalists cannot virtualize; raise this cap only if measured discovery needs it.
		return matches.slice(0, MAX_DATALIST_OPTIONS)
	}, [props.options, props.value])
	return (
		<>
			<Input
				id={props.id}
				ref={ref}
				value={props.value}
				onChange={(e) => props.onChange(e.target.value)}
				placeholder={props.placeholder}
				disabled={props.disabled}
				aria-label={props.ariaLabel}
				list={listId}
				autoComplete="off"
				allowClear={props.allowClear}
				className={props.className}
				style={props.style}
				prefix={props.prefix}
				suffix={props.suffix}
				onFocus={props.onFocus}
				onBlur={props.onBlur}
				onPressEnter={props.onPressEnter}
			/>
			<datalist id={listId}>
				{visibleOptions.map((opt) => (
					<option key={opt.value} value={opt.value} label={opt.label}>
						{opt.label}
					</option>
				))}
			</datalist>
		</>
	)
})
