import { useState, type CSSProperties } from 'react'

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
	const [draft, setDraft] = useState<string | null>(null)
	const commitDraft = () => {
		if (draft === null) return
		const parsed = draft === '' ? null : Number(draft)
		props.onChange(parsed !== null && Number.isFinite(parsed) ? parsed : null)
		setDraft(null)
	}

	return (
		<input
			id={props.id}
			type="number"
			min={props.min}
			max={props.max}
			step={props.step}
			value={draft ?? (Number.isFinite(props.value) ? props.value : '')}
			disabled={props.disabled}
			aria-label={props.ariaLabel}
			className={[styles.input, props.className ?? ''].filter(Boolean).join(' ')}
			style={props.style}
			onChange={(event) => {
				const next = event.target.value
				const parsed = Number(next)
				if (next === '' || !Number.isFinite(parsed) || (props.min !== undefined && parsed < props.min) || (props.max !== undefined && parsed > props.max)) {
					// Keep unfinished typing local so callers cannot clamp its first digit.
					setDraft(next)
					return
				}
				setDraft(null)
				props.onChange(parsed)
			}}
			onBlur={commitDraft}
			onKeyDown={(event) => {
				if (event.key !== 'Enter' || draft === null) return
				event.preventDefault()
				commitDraft()
			}}
		/>
	)
}
