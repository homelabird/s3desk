import { useMemo, useState } from 'react'

import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { legacyProfileScopedStorageKeys, profileScopedStorageKey } from '../../lib/profileScopedStorage'
import { useUploadsDraft } from './UploadsDraftContext'

type UseUploadsPageScopedStorageStateArgs = {
	apiToken: string
	profileId: string | null
}

export function useUploadsPageScopedStorageState(props: UseUploadsPageScopedStorageStateArgs) {
	const bucketStorageKey = useMemo(
		() => profileScopedStorageKey('uploads', props.apiToken, props.profileId, 'bucket'),
		[props.apiToken, props.profileId],
	)
	const prefixStorageKey = useMemo(
		() => profileScopedStorageKey('uploads', props.apiToken, props.profileId, 'prefix'),
		[props.apiToken, props.profileId],
	)

	const [bucket, setBucket] = useLocalStorageState<string>(bucketStorageKey, '', {
		legacyLocalStorageKey: 'bucket',
		legacyLocalStorageKeys: legacyProfileScopedStorageKeys('uploads', props.apiToken, props.profileId, 'bucket'),
	})
	const [prefix, setPrefix] = useLocalStorageState<string>(prefixStorageKey, '', {
		legacyLocalStorageKey: 'uploadPrefix',
		legacyLocalStorageKeys: legacyProfileScopedStorageKeys('uploads', props.apiToken, props.profileId, 'prefix'),
	})
	const draft = useUploadsDraft()
	const [uploadSourceOpen, setUploadSourceOpen] = useState(false)
	const [uploadSourceBusy, setUploadSourceBusy] = useState(false)

	return {
		bucket,
		setBucket,
		prefix,
		setPrefix,
		...draft,
		uploadSourceOpen,
		setUploadSourceOpen,
		uploadSourceBusy,
		setUploadSourceBusy,
	}
}

export type UploadsPageScopedStorageState = ReturnType<typeof useUploadsPageScopedStorageState>
