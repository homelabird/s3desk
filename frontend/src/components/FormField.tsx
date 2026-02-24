import type { CSSProperties, ReactNode } from 'react'

type Props = {
	label: ReactNode
	htmlFor?: string
	required?: boolean
	extra?: ReactNode
	error?: ReactNode
	errorId?: string
	style?: CSSProperties
	children: ReactNode
}

export function FormField(props: Props) {
	const errorId = props.errorId ?? (props.htmlFor ? `${props.htmlFor}-error` : undefined)

	const label =
		typeof props.label === 'string' ? (
			<span>
				{props.label}
				{props.required ? (
					<span aria-hidden="true" style={{ marginLeft: 4, color: '#dc2626' }}>
						*
					</span>
				) : null}
			</span>
		) : (
			props.label
		)

	return (
		<div style={{ marginBottom: 12, ...props.style }}>
			{props.htmlFor ? (
				<label htmlFor={props.htmlFor} style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>
					{label}
				</label>
			) : (
				<div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
			)}

			{props.children}

			{props.extra ? (
				<div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, lineHeight: 1.35 }}>{props.extra}</div>
			) : null}

			{props.error ? (
				<div id={errorId} role="alert" style={{ marginTop: 6, fontSize: 12, color: '#b91c1c', lineHeight: 1.35 }}>
					{props.error}
				</div>
			) : null}
		</div>
	)
}

