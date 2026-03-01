import type { CSSProperties, ReactNode } from 'react'
import { useState } from 'react'

type Props = {
	text: ReactNode
	style?: CSSProperties
}

const iconStyle: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	width: 16,
	height: 16,
	borderRadius: '50%',
	border: '1px solid #94a3b8',
	fontSize: 10,
	fontWeight: 700,
	color: '#475569',
	cursor: 'help',
	userSelect: 'none',
	verticalAlign: 'middle',
	marginLeft: 4,
}

const popoverStyle: CSSProperties = {
	position: 'absolute',
	bottom: 'calc(100% + 6px)',
	left: '50%',
	transform: 'translateX(-50%)',
	background: '#1e293b',
	color: '#f1f5f9',
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

	return (
		<span
			style={{ position: 'relative', display: 'inline-block', ...props.style }}
			onMouseEnter={() => setVisible(true)}
			onMouseLeave={() => setVisible(false)}
			onFocus={() => setVisible(true)}
			onBlur={() => setVisible(false)}
		>
			<span
				role="img"
				aria-label="Help"
				tabIndex={0}
				style={iconStyle}
				data-testid="help-tooltip-trigger"
			>
				?
			</span>
			{visible ? (
				<span role="tooltip" style={popoverStyle} data-testid="help-tooltip-content">
					{props.text}
				</span>
			) : null}
		</span>
	)
}
