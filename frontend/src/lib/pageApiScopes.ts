import type { APIClientShape } from '../api/client'

type ServerMetaAPI = {
	server: Pick<APIClientShape['server'], 'getMeta'>
}

type ProfilesListAPI = {
	profiles: Pick<APIClientShape['profiles'], 'listProfiles'>
}

type BucketsListAPI = {
	buckets: Pick<APIClientShape['buckets'], 'listBuckets'>
}

export type ProfileCapabilityQueriesAPI = ServerMetaAPI & ProfilesListAPI

export type BucketListQueriesAPI = ProfileCapabilityQueriesAPI & BucketsListAPI

export type ObjectsFavoritesAPI = {
	objects: Pick<
		APIClientShape['objects'],
		'listObjectFavorites' | 'createObjectFavorite' | 'deleteObjectFavorite'
	>
}

export type ObjectsPageQueriesAPI = BucketListQueriesAPI &
	{
		objects: Pick<
			APIClientShape['objects'],
			| 'listObjects'
			| 'listObjectFavorites'
			| 'createObjectFavorite'
			| 'deleteObjectFavorite'
		>
	}

export type JobsPageQueriesAPI = BucketListQueriesAPI & {
	jobs: Pick<APIClientShape['jobs'], 'listJobs'>
}
