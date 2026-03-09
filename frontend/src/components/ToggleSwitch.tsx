import type { ReactNode } from 'react'

import styles from './ToggleSwitch.module.css'

type Props = {
	checked: boolean
	onChange: (checked: boolean) => void
	disabled?: boolean
	ariaLabel?: string
	className?: string
	label?: ReactNode
}

export function ToggleSwitch(props: Props) {
	return (
		<span className={[styles.root, props.className ?? ''].filter(Boolean).join(' ')}>
			<button
				type="button"
				role="switch"
				aria-checked={props.checked}
				aria-label={props.ariaLabel}
				disabled={props.disabled}
				className={[
					styles.control,
					props.checked ? styles.checked : '',
					props.disabled ? styles.disabled : '',
				]
					.filter(Boolean)
					.join(' ')}
				onClick={() => props.onChange(!props.checked)}
			/>
			{props.label ? <span className={styles.label}>{props.label}</span> : null}
		</span>
	)
}
