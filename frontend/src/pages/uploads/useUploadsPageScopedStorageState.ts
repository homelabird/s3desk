import { useMemo, useState } from 'react'

import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { legacyProfileScopedStorageKey, profileScopedStorageKey } from '../../lib/profileScopedStorage'

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
		legacyLocalStorageKeys: [legacyProfileScopedStorageKey('uploads', props.profileId, 'bucket')],
	})
	const [prefix, setPrefix] = useLocalStorageState<string>(prefixStorageKey, '', {
		legacyLocalStorageKey: 'uploadPrefix',
		legacyLocalStorageKeys: [legacyProfileScopedStorageKey('uploads', props.profileId, 'prefix')],
	})
	const [selectedFiles, setSelectedFiles] = useState<File[]>([])
	const [selectedFolderLabel, setSelectedFolderLabel] = useState('')
	const [selectedDirectorySelectionMode, setSelectedDirectorySelectionMode] = useState<'picker' | 'input' | undefined>(undefined)
	const [uploadSourceOpen, setUploadSourceOpen] = useState(false)
	const [uploadSourceBusy, setUploadSourceBusy] = useState(false)

	return {
		bucket,
		setBucket,
		prefix,
		setPrefix,
		selectedFiles,
		setSelectedFiles,
		selectedFolderLabel,
		setSelectedFolderLabel,
		selectedDirectorySelectionMode,
		setSelectedDirectorySelectionMode,
		uploadSourceOpen,
		setUploadSourceOpen,
		uploadSourceBusy,
		setUploadSourceBusy,
	}
}

export type UploadsPageScopedStorageState = ReturnType<typeof useUploadsPageScopedStorageState>
