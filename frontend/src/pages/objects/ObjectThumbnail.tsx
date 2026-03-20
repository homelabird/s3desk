import { useEffect, useMemo, useState } from 'react'

import type { APIClient } from '../../api/client'
import { RequestAbortedError } from '../../api/client'
import {
	buildThumbnailCacheKey,
	type ThumbnailCache,
} from '../../lib/thumbnailCache'
import styles from './ObjectsThumbnailPrimitives.module.css'
import { buildObjectThumbnailRequest, getThumbnailFailureTtlMs, shouldCacheThumbnailFailure } from './objectPreviewPolicy'
import { loadObjectThumbnailAsset } from './loadObjectThumbnailAsset'

type Props = {
	api: APIClient
	profileId: string
	bucket: string
	objectKey: string
	size: number
	cache: ThumbnailCache
	cacheKeySuffix?: string
	objectSize?: number
	etag?: string
	lastModified?: string
	contentType?: string
	fit?: 'cover' | 'contain'
	altText?: string
}

export function ObjectThumbnail(props: Props) {
	const thumbnailRequest = useMemo(
		() => buildObjectThumbnailRequest({
			profileId: props.profileId,
			bucket: props.bucket,
			objectKey: props.objectKey,
			size: props.size,
			cacheKeySuffix: props.cacheKeySuffix,
			etag: props.etag,
			lastModified: props.lastModified,
		}),
		[props.bucket, props.cacheKeySuffix, props.etag, props.lastModified, props.objectKey, props.profileId, props.size],
	)
	const cacheKey = useMemo(() => buildThumbnailCacheKey(thumbnailRequest), [thumbnailRequest])
	const [, bumpCacheVersion] = useState(0)
	const url = props.cache.findBestMatch(thumbnailRequest)?.url ?? null
	const failed = !url && props.cache.isFailed(cacheKey)
	const fileName = props.objectKey.split('/').pop() ?? props.objectKey

	useEffect(() => {
		if (url || failed) return
		let active = true
		let abort = () => {}

		const load = async () => {
			const handle = loadObjectThumbnailAsset({
				api: props.api,
				request: thumbnailRequest,
				cache: props.cache,
				objectSize: props.objectSize,
				etag: props.etag,
				lastModified: props.lastModified,
				contentType: props.contentType,
			})
			abort = handle.abort

			handle.promise
				.then(() => {
					if (!active) return
					bumpCacheVersion((version) => version + 1)
				})
				.catch((err) => {
					if (!active) return
					if (err instanceof RequestAbortedError) return
					if (shouldCacheThumbnailFailure(err)) {
						props.cache.markFailed(cacheKey, getThumbnailFailureTtlMs(err))
						bumpCacheVersion((version) => version + 1)
					}
				})
		}

		void load()

		return () => {
			active = false
			abort()
		}
	}, [
		cacheKey,
		failed,
		props.api,
		props.bucket,
		props.cache,
		props.contentType,
		props.etag,
		props.lastModified,
		props.objectKey,
		props.objectSize,
		props.profileId,
		props.size,
		thumbnailRequest,
		url,
	])

	const style = {
		width: props.size,
		height: props.size,
		borderRadius: 4,
		objectFit: props.fit ?? 'cover',
		background: 'var(--s3d-color-bg-disabled)',
		border: '1px solid var(--s3d-color-border)',
		flex: '0 0 auto',
	}

	if (!url) {
		const statusLabel = failed ? 'Preview unavailable' : 'Loading preview'
		const detailLabel = failed ? 'Open large preview or retry later.' : 'Fetching thumbnail…'
		return (
			<span
				className={`${styles.objectThumbnailPlaceholder} ${failed ? styles.objectThumbnailPlaceholderFailed : styles.objectThumbnailPlaceholderLoading}`}
				style={style}
				role="img"
				aria-label={`${statusLabel} for ${fileName}`}
				title={`${statusLabel}: ${fileName}`}
			>
				<span className={styles.objectThumbnailPlaceholderBadge}>{failed ? 'Unavailable' : 'Loading'}</span>
				<span className={styles.objectThumbnailPlaceholderLabel}>{detailLabel}</span>
			</span>
		)
	}

	return <img src={url} style={style} loading="lazy" alt={props.altText ?? `Thumbnail of ${fileName}`} width={props.size} height={props.size} />
}
