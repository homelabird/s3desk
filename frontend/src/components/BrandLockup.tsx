import type { ElementType } from 'react'

import styles from './BrandLockup.module.css'

type Props = {
	title?: string
	subtitle?: string
	variant?: 'default' | 'hero' | 'compact' | 'sidebar'
	titleAs?: ElementType
	className?: string
}

const mascotSrc = '/s3desk-icon.png'

export function BrandLockup(props: Props) {
	const TitleTag = props.titleAs ?? 'div'
	const variantClassName =
		props.variant === 'hero'
			? styles.hero
			: props.variant === 'compact'
				? styles.compact
				: props.variant === 'sidebar'
					? styles.sidebar
					: ''

	return (
		<div className={[styles.root, variantClassName, props.className].filter(Boolean).join(' ')}>
			<span className={styles.mediaWrap} aria-hidden="true">
				<img src={mascotSrc} alt="" className={styles.media} />
			</span>
			<div className={styles.copy}>
				<TitleTag className={styles.title}>{props.title ?? 'S3Desk'}</TitleTag>
				{props.subtitle ? <span className={styles.subtitle}>{props.subtitle}</span> : null}
			</div>
		</div>
	)
}
