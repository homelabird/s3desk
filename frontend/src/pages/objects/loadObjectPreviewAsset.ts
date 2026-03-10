import type { APIClient } from '../../api/client'
import { getSafeBrowserObjectUrl } from '../../api/baseUrl'

import { getPreviewFetchPlan, shouldFallbackToProxy } from './objectPreviewPolicy'

type LoadObjectPreviewAssetArgs = {
	api: APIClient
	profileId: string
	bucket: string
	key: string
	size: number
	contentType?: string | null
	lastModified?: string | null
	maxBytes: number
	downloadLinkProxyEnabled: boolean
	presignedDownloadSupported: boolean
	signal: AbortSignal
}

export type LoadedObjectPreviewAsset = {
	blob: Blob
	contentType: string | null
}

export async function loadObjectPreviewAsset(args: LoadObjectPreviewAssetArgs): Promise<LoadedObjectPreviewAsset> {
	const fetchPreview = async (useProxy: boolean, signal: AbortSignal): Promise<LoadedObjectPreviewAsset> => {
		const presigned = await args.api.getObjectDownloadURL({
			profileId: args.profileId,
			bucket: args.bucket,
			key: args.key,
			proxy: useProxy,
			size: args.size,
			contentType: args.contentType ?? undefined,
			lastModified: args.lastModified ?? undefined,
		})
		const safeUrl = getSafeBrowserObjectUrl(presigned.url)
		const res = await fetch(safeUrl.url.toString(), { signal })
		if (!res.ok) {
			throw new Error(`Download failed (HTTP ${res.status})`)
		}
		return {
			blob: await res.blob(),
			contentType: res.headers.get('content-type'),
		}
	}

	const fetchPlan = getPreviewFetchPlan({
		size: args.size,
		maxBytes: args.maxBytes,
		downloadLinkProxyEnabled: args.downloadLinkProxyEnabled,
		presignedDownloadSupported: args.presignedDownloadSupported,
	})
	const fetchDirectWithTimeout = async (): Promise<LoadedObjectPreviewAsset | null> => {
		const directController = new AbortController()
		const onAbort = () => directController.abort()
		const timeoutId = setTimeout(() => directController.abort(), fetchPlan.directTimeoutMs)
		args.signal.addEventListener('abort', onAbort)
		try {
			return await fetchPreview(false, directController.signal)
		} catch (err) {
			if (args.signal.aborted) throw err
			if (directController.signal.aborted) return null
			if (!shouldFallbackToProxy(err, args.signal)) throw err
			return null
		} finally {
			clearTimeout(timeoutId)
			args.signal.removeEventListener('abort', onAbort)
		}
	}

	let resp: LoadedObjectPreviewAsset | null = null
	if (fetchPlan.proxyFirst) {
		try {
			resp = await fetchPreview(true, args.signal)
		} catch (err) {
			if (!shouldFallbackToProxy(err, args.signal) || !fetchPlan.allowDirect) {
				throw err
			}
		}
	}

	if (!resp && fetchPlan.allowDirect) {
		resp = await fetchDirectWithTimeout()
	}

	if (!resp) {
		resp = await fetchPreview(true, args.signal)
	}

	return resp
}
