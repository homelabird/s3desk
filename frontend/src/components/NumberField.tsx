import type { CSSProperties } from 'react'

import styles from './NumberField.module.css'

type Props = {
	value: number
	onChange: (value: number | null) => void
	min?: number
	max?: number
	step?: number
	disabled?: boolean
	id?: string
	ariaLabel?: string
	className?: string
	style?: CSSProperties
}

export function NumberField(props: Props) {
	return (
		<input
			id={props.id}
			type="number"
			min={props.min}
			max={props.max}
			step={props.step}
			value={Number.isFinite(props.value) ? props.value : ''}
			disabled={props.disabled}
			aria-label={props.ariaLabel}
			className={[styles.input, props.className ?? ''].filter(Boolean).join(' ')}
			style={props.style}
			onChange={(event) => {
				const next = event.target.value
				if (next === '') {
					props.onChange(null)
					return
				}
				const parsed = Number(next)
				props.onChange(Number.isFinite(parsed) ? parsed : null)
			}}
		/>
	)
}
