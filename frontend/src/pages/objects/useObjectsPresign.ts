import { useCallback, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { message } from 'antd'

import type { APIClient } from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

type Presign = { key: string; url: string; expiresAt: string }
type PresignRequest = { key: string; size?: number; lastModified?: string }

type UseObjectsPresignArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	downloadLinkProxyEnabled: boolean
	presignedDownloadSupported: boolean
}

export function useObjectsPresign({ api, profileId, bucket, downloadLinkProxyEnabled, presignedDownloadSupported }: UseObjectsPresignArgs) {
	const [presignOpen, setPresignOpen] = useState(false)
	const [presign, setPresign] = useState<Presign | null>(null)
	const [presignKey, setPresignKey] = useState<string | null>(null)

	const presignMutation = useMutation({
		mutationFn: (req: PresignRequest) =>
			api.getObjectDownloadURL({
				profileId: profileId!,
				bucket,
				key: req.key,
				proxy: downloadLinkProxyEnabled || !presignedDownloadSupported,
				size: req.size,
				lastModified: req.lastModified,
			}),
		onMutate: (req) => setPresignKey(req.key),
		onSuccess: (resp, req) => {
			setPresign({ key: req.key, url: resp.url, expiresAt: resp.expiresAt })
			setPresignOpen(true)
		},
		onSettled: (_, __, req) => setPresignKey((prev) => (prev === req.key ? null : prev)),
		onError: (err) => message.error(formatErr(err)),
	})

	const closePresign = useCallback(() => {
		setPresignOpen(false)
		setPresign(null)
	}, [])

	return {
		presignOpen,
		presign,
		presignKey,
		presignMutation,
		closePresign,
	}
}
