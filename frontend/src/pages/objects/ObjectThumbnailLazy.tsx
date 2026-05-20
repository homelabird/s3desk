import { lazy, Suspense, type CSSProperties } from 'react'

import type { ObjectThumbnailProps } from './ObjectThumbnail'
import styles from './ObjectsThumbnailPrimitives.module.css'
import { getObjectMediaStateDescriptor } from './objectsMediaState'

const ObjectThumbnailImpl = lazy(async () => {
	const m = await import('./ObjectThumbnail')
	return { default: m.ObjectThumbnail }
})

function buildFallbackStyle(props: Pick<ObjectThumbnailProps, 'fit' | 'size'>): CSSProperties {
	return {
		width: props.size,
		height: props.size,
		borderRadius: 4,
		objectFit: props.fit ?? 'cover',
		background: 'var(--s3d-color-bg-disabled)',
		border: '1px solid var(--s3d-color-border)',
		flex: '0 0 auto',
	}
}

function ObjectThumbnailFallback(props: Pick<ObjectThumbnailProps, 'altText' | 'fit' | 'objectKey' | 'size'>) {
	const fileName = props.objectKey.split('/').pop() ?? props.objectKey
	const descriptor = getObjectMediaStateDescriptor('thumbnail-loading')
	return (
		<span
			className={`${styles.objectThumbnailPlaceholder} ${styles.objectThumbnailPlaceholderLoading}`}
			style={buildFallbackStyle(props)}
			role="img"
			aria-label={props.altText ?? `${descriptor.title} for ${fileName}`}
			title={`${descriptor.title}: ${fileName}`}
		>
			<span className={styles.objectThumbnailPlaceholderBadge}>{descriptor.shortLabel}</span>
			<span className={styles.objectThumbnailPlaceholderLabel}>{descriptor.recoveryHint}</span>
		</span>
	)
}

export function LazyObjectThumbnail(props: ObjectThumbnailProps) {
	return (
		<Suspense
			fallback={
				<ObjectThumbnailFallback
					altText={props.altText}
					fit={props.fit}
					objectKey={props.objectKey}
					size={props.size}
				/>
			}
		>
			<ObjectThumbnailImpl {...props} />
		</Suspense>
	)
}
