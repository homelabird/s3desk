import { lazy, Suspense } from 'react'

import type { BucketOption, DeleteJobModalPrefill } from './jobsPageTypes'

type Props = {
	apiToken: string
	profileId: string
	createDeleteOpen: boolean
	onCloseDelete: () => void
	onSubmitDelete: (values: {
		bucket: string
		prefix: string
		deleteAll: boolean
		allowUnsafePrefix: boolean
		include: string[]
		exclude: string[]
		dryRun: boolean
	}) => void
	deleteLoading: boolean
	isOffline: boolean
	bucketLookupErrorDescription?: string | null
	bucket: string
	onBucketChange: (next: string) => void
	bucketOptions: BucketOption[]
	deleteBucket: string
	deletePrefill: DeleteJobModalPrefill | null
}

const DeletePrefixJobModal = lazy(async () => {
	const m = await import('./DeletePrefixJobModal')
	return { default: m.DeletePrefixJobModal }
})

export function JobsCreateModals(props: Props) {
	if (!props.createDeleteOpen) return null

	return (
		<Suspense fallback={null}>
			<DeletePrefixJobModal
					key={`delete:${props.apiToken}:${props.profileId}:${props.deleteBucket}:${props.deletePrefill?.prefix ?? ''}:${props.deletePrefill?.deleteAll ? 'all' : 'prefix'}`}
					open={props.createDeleteOpen}
					onCancel={props.onCloseDelete}
					onSubmit={props.onSubmitDelete}
					loading={props.deleteLoading}
					isOffline={props.isOffline}
					bucketLookupErrorDescription={props.bucketLookupErrorDescription}
					bucket={props.deleteBucket}
					setBucket={props.onBucketChange}
					bucketOptions={props.bucketOptions}
					prefill={props.deletePrefill}
				/>
		</Suspense>
	)
}
