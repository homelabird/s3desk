import type { CSSProperties, ReactNode } from 'react'

import styles from './FormField.module.css'

type Props = {
	label: ReactNode
	htmlFor?: string
	required?: boolean
	extra?: ReactNode
	error?: ReactNode
	errorId?: string
	className?: string
	style?: CSSProperties
	children: ReactNode
}

export function FormField(props: Props) {
	const errorId = props.errorId ?? (props.htmlFor ? `${props.htmlFor}-error` : undefined)
	const rootClassName = [styles.root, props.className].filter(Boolean).join(' ')

	const label =
		typeof props.label === 'string' ? (
			<span>
				{props.label}
				{props.required ? (
					<span aria-hidden="true" className={styles.requiredMark}>
						*
					</span>
				) : null}
			</span>
		) : (
			props.label
		)

	const hasError = Boolean(props.error && errorId)

	return (
		<div
			className={rootClassName}
			style={props.style}
			role={hasError ? 'group' : undefined}
			aria-describedby={hasError ? errorId : undefined}
		>
			{props.htmlFor ? (
				<label htmlFor={props.htmlFor} className={styles.label}>
					{label}
				</label>
			) : (
				<div className={styles.labelText}>{label}</div>
			)}

			{props.children}

			{props.extra ? <div className={styles.extra}>{props.extra}</div> : null}

			{props.error ? (
				<div id={errorId} role="alert" className={styles.error}>
					{props.error}
				</div>
			) : null}
		</div>
	)
}
