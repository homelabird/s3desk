import type { APIClient } from '../api/client'
import type { BucketsAPI, JobsAPI, ObjectsAPI, ProfilesAPI, ServerAPI, UploadsAPI } from '../api/clientContracts'

export type MockApiClientOverrides = {
	server?: Partial<ServerAPI>
	profiles?: Partial<ProfilesAPI>
	buckets?: Partial<BucketsAPI>
	objects?: Partial<ObjectsAPI>
	uploads?: Partial<UploadsAPI>
	jobs?: Partial<JobsAPI>
}

function toDomain<T>(overrides?: Partial<T>): T {
	return { ...(overrides ?? {}) } as T
}

export function createMockApiClient(overrides: MockApiClientOverrides = {}): APIClient {
	return {
		server: toDomain<ServerAPI>(overrides.server),
		profiles: toDomain<ProfilesAPI>(overrides.profiles),
		buckets: toDomain<BucketsAPI>(overrides.buckets),
		objects: toDomain<ObjectsAPI>(overrides.objects),
		uploads: toDomain<UploadsAPI>(overrides.uploads),
		jobs: toDomain<JobsAPI>(overrides.jobs),
	} as unknown as APIClient
}
