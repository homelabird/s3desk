import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { message } from 'antd'

import type { APIClient } from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

type Presign = { key: string; url: string; expiresAt: string }
type PresignRequest = { key: string; size?: number; lastModified?: string }

type UseObjectsPresignArgs = {
	api: APIClient
	apiToken: string
	profileId: string | null
	bucket: string
	downloadLinkProxyEnabled: boolean
	presignedDownloadSupported: boolean
}

export function useObjectsPresign({
	api,
	apiToken,
	profileId,
	bucket,
	downloadLinkProxyEnabled,
	presignedDownloadSupported,
}: UseObjectsPresignArgs) {
	const [presignState, setPresignState] = useState<{
		scopeKey: string
		open: boolean
		presign: Presign | null
		key: string | null
	}>({
		scopeKey: '',
		open: false,
		presign: null,
		key: null,
	})
	const requestTokenRef = useRef(0)
	const scopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${downloadLinkProxyEnabled ? 'proxy' : 'direct'}:${presignedDownloadSupported ? 'presign' : 'proxy-only'}`

	useEffect(() => {
		requestTokenRef.current += 1
	}, [scopeKey])

	const presignMutation = useMutation({
		mutationFn: (req: PresignRequest) =>
			api.objects.getObjectDownloadURL({
				profileId: profileId!,
				bucket,
				key: req.key,
				proxy: downloadLinkProxyEnabled || !presignedDownloadSupported,
				size: req.size,
				lastModified: req.lastModified,
			}),
		onMutate: (req) => {
			const requestToken = requestTokenRef.current + 1
			requestTokenRef.current = requestToken
			setPresignState((prev) => ({
				...prev,
				scopeKey,
				key: req.key,
			}))
			return { requestToken }
		},
		onSuccess: (resp, req, context) => {
			if (context?.requestToken && requestTokenRef.current !== context.requestToken) return
			setPresignState((prev) => ({
				...prev,
				scopeKey,
				open: true,
				presign: { key: req.key, url: resp.url, expiresAt: resp.expiresAt },
			}))
		},
		onSettled: (_, __, req, context) => {
			if (context?.requestToken && requestTokenRef.current !== context.requestToken) return
			setPresignState((prev) =>
				prev.key === req.key
					? {
							...prev,
							scopeKey,
							key: null,
						}
					: prev,
			)
		},
		onError: (err, _req, context) => {
			if (context?.requestToken && requestTokenRef.current !== context.requestToken) return
			message.error(formatErr(err))
		},
	})

	const closePresign = useCallback(() => {
		requestTokenRef.current += 1
		setPresignState({
			scopeKey,
			open: false,
			presign: null,
			key: null,
		})
	}, [scopeKey])

	const visiblePresignOpen = presignState.scopeKey === scopeKey ? presignState.open : false
	const visiblePresign = presignState.scopeKey === scopeKey ? presignState.presign : null
	const visiblePresignKey = presignState.scopeKey === scopeKey ? presignState.key : null

	return {
		presignOpen: visiblePresignOpen,
		presign: visiblePresign,
		presignKey: visiblePresignKey,
		presignMutation,
		closePresign,
	}
}
