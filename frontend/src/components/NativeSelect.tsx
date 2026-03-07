import type { CSSProperties } from 'react'

import styles from './NativeSelect.module.css'

export type NativeSelectOption = {
	label: string
	value: string
	disabled?: boolean
}

type NativeSelectProps = {
	value: string
	onChange: (value: string) => void
	options: NativeSelectOption[]
	placeholder?: string
	disabled?: boolean
	ariaLabel?: string
	className?: string
	style?: CSSProperties
}

export function NativeSelect(props: NativeSelectProps) {
	const className = [styles.select, props.disabled ? styles.disabled : '', props.className ?? ''].filter(Boolean).join(' ')

	return (
		<select
			value={props.value}
			onChange={(e) => props.onChange(e.target.value)}
			disabled={props.disabled}
			aria-label={props.ariaLabel}
			className={className}
			style={props.style as CSSProperties | undefined}
		>
			{props.placeholder ? (
				<option value="" disabled={false}>
					{props.placeholder}
				</option>
			) : null}
			{props.options.map((opt) => (
				<option key={opt.value} value={opt.value} disabled={opt.disabled}>
					{opt.label}
				</option>
			))}
		</select>
	)
}
