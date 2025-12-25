import { useEffect, useMemo, useState } from 'react'

import type { APIClient } from '../../api/client'
import { RequestAbortedError } from '../../api/client'

type Props = {
	api: APIClient
	profileId: string
	bucket: string
	objectKey: string
	size: number
	cache: Map<string, string>
}

export function ObjectThumbnail(props: Props) {
	const cacheKey = useMemo(() => `${props.bucket}:${props.objectKey}:${props.size}`, [props.bucket, props.objectKey, props.size])
	const [url, setUrl] = useState<string | null>(() => props.cache.get(cacheKey) ?? null)
	const [failed, setFailed] = useState(false)

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
				setUrl(objectURL)
			})
			.catch((err) => {
				if (!active) return
				if (err instanceof RequestAbortedError) return
				setFailed(true)
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
		objectFit: 'cover' as const,
		background: '#f5f5f5',
		border: '1px solid #f0f0f0',
		flex: '0 0 auto',
	}

	if (!url) {
		return <span style={style} aria-hidden />
	}

	return <img src={url} style={style} loading="lazy" alt="" />
}
