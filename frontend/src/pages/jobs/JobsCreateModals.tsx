import { lazy, Suspense } from 'react'

type BucketOption = {
	label: string
	value: string
}

type DeletePrefill = {
	prefix: string
	deleteAll: boolean
}

type Props = {
	profileId: string
	createOpen: boolean
	createDownloadOpen: boolean
	createDeleteOpen: boolean
	onCloseCreate: () => void
	onCloseDownload: () => void
	onCloseDelete: () => void
	onSubmitCreate: (values: {
		bucket: string
		prefix: string
		dirHandle: FileSystemDirectoryHandle
		label?: string
		moveAfterUpload?: boolean
		cleanupEmptyDirs?: boolean
	}) => void
	onSubmitDownload: (values: { bucket: string; prefix: string; dirHandle: FileSystemDirectoryHandle; label?: string }) => void
	onSubmitDelete: (values: {
		bucket: string
		prefix: string
		deleteAll: boolean
		allowUnsafePrefix: boolean
		include: string[]
		exclude: string[]
		dryRun: boolean
	}) => void
	uploadLoading: boolean
	downloadLoading: boolean
	deleteLoading: boolean
	isOffline: boolean
	uploadSupported: boolean
	uploadUnsupportedReason: string | null
	bucket: string
	onBucketChange: (next: string) => void
	bucketOptions: BucketOption[]
	defaultMoveAfterUpload: boolean
	defaultCleanupEmptyDirs: boolean
	onUploadDefaultsChange: (values: { moveAfterUpload: boolean; cleanupEmptyDirs: boolean }) => void
	deleteBucket: string
	deletePrefill: DeletePrefill | null
}

const CreateJobModal = lazy(async () => {
	const m = await import('./CreateJobModal')
	return { default: m.CreateJobModal }
})
const DownloadJobModal = lazy(async () => {
	const m = await import('./DownloadJobModal')
	return { default: m.DownloadJobModal }
})
const DeletePrefixJobModal = lazy(async () => {
	const m = await import('./DeletePrefixJobModal')
	return { default: m.DeletePrefixJobModal }
})

export function JobsCreateModals(props: Props) {
	if (!props.createOpen && !props.createDownloadOpen && !props.createDeleteOpen) return null

	return (
		<Suspense fallback={null}>
			{props.createOpen ? (
				<CreateJobModal
					profileId={props.profileId}
					open={props.createOpen}
					onCancel={props.onCloseCreate}
					onSubmit={props.onSubmitCreate}
					loading={props.uploadLoading}
					isOffline={props.isOffline}
					uploadSupported={props.uploadSupported}
					uploadUnsupportedReason={props.uploadUnsupportedReason}
					bucket={props.bucket}
					setBucket={props.onBucketChange}
					bucketOptions={props.bucketOptions}
					defaultMoveAfterUpload={props.defaultMoveAfterUpload}
					defaultCleanupEmptyDirs={props.defaultCleanupEmptyDirs}
					onDefaultsChange={props.onUploadDefaultsChange}
				/>
			) : null}

			{props.createDownloadOpen ? (
				<DownloadJobModal
					profileId={props.profileId}
					open={props.createDownloadOpen}
					onCancel={props.onCloseDownload}
					onSubmit={props.onSubmitDownload}
					loading={props.downloadLoading}
					isOffline={props.isOffline}
					bucket={props.bucket}
					setBucket={props.onBucketChange}
					bucketOptions={props.bucketOptions}
				/>
			) : null}

			{props.createDeleteOpen ? (
				<DeletePrefixJobModal
					open={props.createDeleteOpen}
					onCancel={props.onCloseDelete}
					onSubmit={props.onSubmitDelete}
					loading={props.deleteLoading}
					isOffline={props.isOffline}
					bucket={props.deleteBucket}
					setBucket={props.onBucketChange}
					bucketOptions={props.bucketOptions}
					prefill={props.deletePrefill}
				/>
			) : null}
		</Suspense>
	)
}
