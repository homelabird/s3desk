import type { ComponentProps } from 'react'

import type { APIClientShape } from '../../api/client'
import type { BucketCreateRequest, Profile } from '../../api/types'
import type { BucketsDialogsPanel } from './BucketsDialogsPanel'
import type { BucketsListProps } from './BucketsList'

type BucketsDialogsPanelProps = ComponentProps<typeof BucketsDialogsPanel>

export type BucketsPageShellViewProps = {
	api: APIClientShape
	selectedProfile: Profile | null
	bucketCrudSupported: boolean
	bucketCrudUnsupportedReason: string
	bucketsQueryError: unknown | null
	bucketsLoading: boolean
	buckets: BucketsListProps['buckets']
	showBucketsEmpty: boolean
	openCreateModal: () => void
	createOpen: boolean
	closeCreateModal: () => void
	submitCreateBucket: (req: BucketCreateRequest) => void
	createLoading: boolean
	selectedProfileProvider?: Profile['provider']
	list: BucketsListProps
	dialogs: Omit<
		BucketsDialogsPanelProps,
		'api' | 'apiToken' | 'profileId' | 'selectedProfileProvider' | 'createOpen' | 'closeCreateModal' | 'submitCreateBucket' | 'createLoading'
	>
}

export type BucketsPageShellProps = BucketsPageShellViewProps & {
	apiToken: string
	profileId: string
}

export type BucketsPageRouteShellProps = {
	apiToken: string
	profileId: string | null
	shell: BucketsPageShellViewProps
}
