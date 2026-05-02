import { describe, expectTypeOf, it } from 'vitest'

import type {
	BucketListQueriesAPI,
	JobsPageQueriesAPI,
	ObjectsFavoritesAPI,
	ObjectsPageQueriesAPI,
	ProfileCapabilityQueriesAPI,
} from '../pageApiScopes'

describe('pageApiScopes', () => {
	it('keeps profile capability queries limited to server meta and profile list reads', () => {
		expectTypeOf<keyof ProfileCapabilityQueriesAPI>().toEqualTypeOf<'server' | 'profiles'>()
		expectTypeOf<keyof ProfileCapabilityQueriesAPI['server']>().toEqualTypeOf<'getMeta'>()
		expectTypeOf<keyof ProfileCapabilityQueriesAPI['profiles']>().toEqualTypeOf<'listProfiles'>()
	})

	it('keeps shared bucket list queries limited to bucket listing plus capability reads', () => {
		expectTypeOf<keyof BucketListQueriesAPI>().toEqualTypeOf<'server' | 'profiles' | 'buckets'>()
		expectTypeOf<keyof BucketListQueriesAPI['buckets']>().toEqualTypeOf<'listBuckets'>()
	})

	it('keeps object favorites scoped to favorite list and mutation methods', () => {
		expectTypeOf<keyof ObjectsFavoritesAPI>().toEqualTypeOf<'objects'>()
		expectTypeOf<keyof ObjectsFavoritesAPI['objects']>().toEqualTypeOf<
			'listObjectFavorites' | 'createObjectFavorite' | 'deleteObjectFavorite'
		>()
	})

	it('keeps object page queries from pulling broad object, job, or upload APIs', () => {
		expectTypeOf<keyof ObjectsPageQueriesAPI>().toEqualTypeOf<'server' | 'profiles' | 'buckets' | 'objects'>()
		expectTypeOf<keyof ObjectsPageQueriesAPI['objects']>().toEqualTypeOf<
			'listObjects' | 'listObjectFavorites' | 'createObjectFavorite' | 'deleteObjectFavorite'
		>()
	})

	it('keeps jobs page queries limited to list jobs plus shared bucket and capability reads', () => {
		expectTypeOf<keyof JobsPageQueriesAPI>().toEqualTypeOf<'server' | 'profiles' | 'buckets' | 'jobs'>()
		expectTypeOf<keyof JobsPageQueriesAPI['jobs']>().toEqualTypeOf<'listJobs'>()
	})
})
