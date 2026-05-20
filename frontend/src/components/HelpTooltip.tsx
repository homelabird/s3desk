import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { useId, useState } from 'react'

import styles from './HelpTooltip.module.css'

type Props = {
	text: ReactNode
	ariaLabel?: string
	id?: string
	style?: CSSProperties
}

const popoverStyle: CSSProperties = {
	position: 'absolute',
	bottom: 'calc(100% + 6px)',
	left: '50%',
	transform: 'translateX(-50%)',
	background: 'var(--s3d-color-tooltip-bg)',
	color: 'var(--s3d-color-tooltip-text)',
	borderRadius: 'var(--s3d-radius-sm)',
	padding: '8px 12px',
	fontSize: 12,
	lineHeight: 1.45,
	maxWidth: 280,
	width: 'max-content',
	zIndex: 100,
	boxShadow: 'var(--s3d-shadow-sm)',
	whiteSpace: 'normal',
}

/**
 * Small (?) icon that reveals a help popover on hover/focus.
 */
export function HelpTooltip(props: Props) {
	const [visible, setVisible] = useState(false)
	const generatedId = useId()
	const tooltipId = props.id ?? `help-tooltip-${generatedId}`
	const ariaLabel = props.ariaLabel ?? 'Help'
	const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key !== 'Escape') return
		event.preventDefault()
		event.stopPropagation()
		setVisible(false)
	}

	return (
		<span
			className={styles.host}
			style={props.style}
			onMouseEnter={() => setVisible(true)}
			onMouseLeave={() => setVisible(false)}
		>
			<button
				type="button"
				aria-label={ariaLabel}
				aria-describedby={visible ? tooltipId : undefined}
				className={styles.trigger}
				data-testid="help-tooltip-trigger"
				onFocus={() => setVisible(true)}
				onBlur={() => setVisible(false)}
				onKeyDown={handleTriggerKeyDown}
			>
				<span className={styles.glyph} aria-hidden="true">
					?
				</span>
			</button>
			{visible ? (
				<span id={tooltipId} role="tooltip" style={popoverStyle} data-testid="help-tooltip-content">
					{props.text}
				</span>
			) : null}
		</span>
	)
}
