import { useEffect, useMemo, useState } from 'react'

import type { APIClient } from '../../api/client'
import { RequestAbortedError } from '../../api/client'
import type { ThumbnailCache } from '../../lib/thumbnailCache'

type Props = {
	api: APIClient
	profileId: string
	bucket: string
	objectKey: string
	size: number
	cache: ThumbnailCache
	cacheKeySuffix?: string
	fit?: 'cover' | 'contain'
}

export function ObjectThumbnail(props: Props) {
	const cacheKey = useMemo(() => {
		const suffix = props.cacheKeySuffix ? `:${props.cacheKeySuffix}` : ''
		return `${props.profileId}:${props.bucket}:${props.objectKey}:${props.size}${suffix}`
	}, [props.bucket, props.cacheKeySuffix, props.objectKey, props.profileId, props.size])
	const [failedKey, setFailedKey] = useState<string | null>(null)
	const [, bumpCacheVersion] = useState(0)
	const url = props.cache.get(cacheKey) ?? null
	const failed = failedKey === cacheKey

	useEffect(() => {
		if (url || failed) return
		const handle = props.api.downloadObjectThumbnail({
			profileId: props.profileId,
			bucket: props.bucket,
			key: props.objectKey,
			size: props.size,
		})
		let active = true

		handle.promise
			.then(({ blob }) => {
				if (!active) return
				const objectURL = URL.createObjectURL(blob)
				props.cache.set(cacheKey, objectURL)
				bumpCacheVersion((version) => version + 1)
			})
			.catch((err) => {
				if (!active) return
				if (err instanceof RequestAbortedError) return
				setFailedKey(cacheKey)
			})

		return () => {
			active = false
			handle.abort()
		}
	}, [
		cacheKey,
		failed,
		props.api,
		props.bucket,
		props.cache,
		props.objectKey,
		props.profileId,
		props.size,
		url,
	])

	const style = {
		width: props.size,
		height: props.size,
		borderRadius: 4,
		objectFit: props.fit ?? 'cover',
		background: '#f5f5f5',
		border: '1px solid #f0f0f0',
		flex: '0 0 auto',
	}

	if (!url) {
		return <span style={style} aria-hidden />
	}

	return <img src={url} style={style} loading="lazy" alt="" width={props.size} height={props.size} />
}
