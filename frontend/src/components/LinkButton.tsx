import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'

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
		onKeyDown,
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
			<Link
				{...linkProps}
				className={classes}
				style={style}
				aria-disabled="true"
				tabIndex={-1}
				onClick={(event: MouseEvent<HTMLAnchorElement>) => {
					event.preventDefault()
					event.stopPropagation()
				}}
				onKeyDown={(event: KeyboardEvent<HTMLAnchorElement>) => {
					if (event.key !== 'Enter' && event.key !== ' ') return
					event.preventDefault()
					event.stopPropagation()
				}}
			>
				{children}
			</Link>
		)
	}

	return (
		<Link
			{...linkProps}
			className={classes}
			style={style}
			onKeyDown={onKeyDown}
			onClick={(e) => {
				onClick?.(e)
			}}
		>
			{children}
		</Link>
	)
}
