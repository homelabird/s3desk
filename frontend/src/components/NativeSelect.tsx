import type { CSSProperties } from 'react'

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
	style?: CSSProperties
}

export function NativeSelect(props: NativeSelectProps) {
	return (
		<select
			value={props.value}
			onChange={(e) => props.onChange(e.target.value)}
			disabled={props.disabled}
			aria-label={props.ariaLabel}
			style={{
				height: 32,
				padding: '4px 10px',
				borderRadius: 6,
				border: '1px solid #d9d9d9',
				background: props.disabled ? '#f5f5f5' : '#fff',
				color: 'inherit',
				fontSize: 14,
				lineHeight: 1.5715,
				...props.style,
			}}
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
