import { useCallback, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { message } from 'antd'

import type { APIClient } from '../../api/client'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

type Presign = { key: string; url: string; expiresAt: string }

type UseObjectsPresignArgs = {
	api: APIClient
	profileId: string | null
	bucket: string
	downloadLinkProxyEnabled: boolean
}

export function useObjectsPresign({ api, profileId, bucket, downloadLinkProxyEnabled }: UseObjectsPresignArgs) {
	const [presignOpen, setPresignOpen] = useState(false)
	const [presign, setPresign] = useState<Presign | null>(null)
	const [presignKey, setPresignKey] = useState<string | null>(null)

	const presignMutation = useMutation({
		mutationFn: (key: string) => api.getObjectDownloadURL({ profileId: profileId!, bucket, key, proxy: downloadLinkProxyEnabled }),
		onMutate: (key) => setPresignKey(key),
		onSuccess: (resp, key) => {
			setPresign({ key, url: resp.url, expiresAt: resp.expiresAt })
			setPresignOpen(true)
		},
		onSettled: (_, __, key) => setPresignKey((prev) => (prev === key ? null : prev)),
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
