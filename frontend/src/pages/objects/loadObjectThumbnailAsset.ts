import type { APIClient } from '../../api/client'
import {
	buildThumbnailCacheKey,
	getReusablePersistentThumbnailBlob,
	setPersistentThumbnailBlob,
	shouldPersistThumbnailLocally,
	type ThumbnailCache,
	type ThumbnailCacheRequest,
} from '../../lib/thumbnailCache'
import { scheduleThumbnailRequest } from '../../lib/thumbnailRequestQueue'

type TransferHandle<T> = {
	promise: Promise<T>
	abort: () => void
}

type LoadObjectThumbnailAssetArgs = {
	api: APIClient
	request: ThumbnailCacheRequest
	cache?: ThumbnailCache
	objectSize?: number
	etag?: string
	lastModified?: string
	contentType?: string
}

type LoadedObjectThumbnailAsset = {
	url: string
	cacheKey: string
	contentType: string | null
	owned: boolean
}

function resolvedHandle<T>(value: Promise<T> | T): TransferHandle<T> {
	return {
		promise: Promise.resolve(value),
		abort: () => {},
	}
}

export function loadObjectThumbnailAsset(args: LoadObjectThumbnailAssetArgs): TransferHandle<LoadedObjectThumbnailAsset> {
	const cacheKey = buildThumbnailCacheKey(args.request)
	const cachedMatch = args.cache?.findBestMatch(args.request) ?? null
	if (cachedMatch) {
		return resolvedHandle({
			url: cachedMatch.url,
			cacheKey: cachedMatch.cacheKey,
			contentType: args.contentType ?? null,
			owned: false,
		})
	}

	const shouldUsePersistentCache = shouldPersistThumbnailLocally(args.request.objectKey)
	let abort = () => {}
	const promise = (async () => {
		if (shouldUsePersistentCache) {
			const cachedBlob = await getReusablePersistentThumbnailBlob(args.request)
			if (cachedBlob) {
				const url = URL.createObjectURL(cachedBlob.blob)
				if (args.cache) {
					args.cache.set(cachedBlob.cacheKey, url)
					return {
						url,
						cacheKey: cachedBlob.cacheKey,
						contentType: cachedBlob.blob.type || args.contentType || null,
						owned: false,
					}
				}
				return {
					url,
					cacheKey: cachedBlob.cacheKey,
					contentType: cachedBlob.blob.type || args.contentType || null,
					owned: true,
				}
			}
		}

		const handle = scheduleThumbnailRequest(() =>
			args.api.downloadObjectThumbnail({
				profileId: args.request.profileId,
				bucket: args.request.bucket,
				key: args.request.objectKey,
				size: args.request.size,
				objectSize: args.objectSize,
				etag: args.etag,
				lastModified: args.lastModified,
				contentType: args.contentType,
			}),
		)
		abort = handle.abort
		const resp = await handle.promise
		if (shouldUsePersistentCache) {
			await setPersistentThumbnailBlob(cacheKey, resp.blob)
		}
		const url = URL.createObjectURL(resp.blob)
		if (args.cache) {
			args.cache.set(cacheKey, url)
			return {
				url,
				cacheKey,
				contentType: resp.contentType ?? resp.blob.type ?? args.contentType ?? null,
				owned: false,
			}
		}
		return {
			url,
			cacheKey,
			contentType: resp.contentType ?? resp.blob.type ?? args.contentType ?? null,
			owned: true,
		}
	})()

	return {
		promise,
		abort: () => abort(),
	}
}
