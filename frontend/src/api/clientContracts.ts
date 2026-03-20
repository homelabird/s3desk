import type {
	createBucketsSubFacade,
	createJobsSubFacade,
	createObjectsSubFacade,
	createProfilesSubFacade,
	createServerSubFacade,
	createUploadsSubFacade,
} from './clientSubFacades'

export type ServerAPI = ReturnType<typeof createServerSubFacade>
export type ProfilesAPI = ReturnType<typeof createProfilesSubFacade>
export type BucketsAPI = ReturnType<typeof createBucketsSubFacade>
export type ObjectsAPI = ReturnType<typeof createObjectsSubFacade>
export type UploadsAPI = ReturnType<typeof createUploadsSubFacade>
export type JobsAPI = ReturnType<typeof createJobsSubFacade>

export type APIClientShape = {
	server: ServerAPI
	profiles: ProfilesAPI
	buckets: BucketsAPI
	objects: ObjectsAPI
	uploads: UploadsAPI
	jobs: JobsAPI
}
