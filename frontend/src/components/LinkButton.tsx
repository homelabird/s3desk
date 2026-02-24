import type { CSSProperties, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type LinkButtonType = 'default' | 'primary' | 'dashed' | 'text' | 'link'
type LinkButtonSize = 'small' | 'middle' | 'large'

type LinkButtonProps = LinkProps & {
	children: ReactNode
	type?: LinkButtonType
	size?: LinkButtonSize
	danger?: boolean
	disabled?: boolean
	className?: string
	style?: CSSProperties
}

function classForType(type: LinkButtonType): string {
	switch (type) {
		case 'primary':
			return 'ant-btn-primary'
		case 'dashed':
			return 'ant-btn-dashed'
		case 'text':
			return 'ant-btn-text'
		case 'link':
			return 'ant-btn-link'
		case 'default':
		default:
			return 'ant-btn-default'
	}
}

function classForSize(size: LinkButtonSize): string {
	if (size === 'small') return 'ant-btn-sm'
	if (size === 'large') return 'ant-btn-lg'
	return ''
}

export function LinkButton(props: LinkButtonProps) {
	const {
		type = 'default',
		size = 'middle',
		danger = false,
		disabled = false,
		className,
		style,
		children,
		onClick,
		...linkProps
	} = props

	const classes = [
		'ant-btn',
		classForType(type),
		classForSize(size),
		danger ? 'ant-btn-dangerous' : null,
		disabled ? 'ant-btn-disabled' : null,
		className ?? null,
	]
		.filter(Boolean)
		.join(' ')

	if (disabled) {
		return (
			<span className={classes} style={style} role="link" aria-disabled="true">
				{children}
			</span>
		)
	}

	return (
		<Link
			{...linkProps}
			className={classes}
			style={style}
			onClick={(e) => {
				onClick?.(e)
			}}
		>
			{children}
		</Link>
	)
}

