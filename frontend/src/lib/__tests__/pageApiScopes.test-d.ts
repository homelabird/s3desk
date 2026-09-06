// Checked by TypeScript during npm run build; no runtime tests are needed.
import { expectTypeOf } from 'vitest'

import type {
	BucketListQueriesAPI,
	JobsPageQueriesAPI,
	ObjectsFavoritesAPI,
	ObjectsPageQueriesAPI,
	ProfileCapabilityQueriesAPI,
} from '../pageApiScopes'

expectTypeOf<keyof ProfileCapabilityQueriesAPI>().toEqualTypeOf<'server' | 'profiles'>()
expectTypeOf<keyof ProfileCapabilityQueriesAPI['server']>().toEqualTypeOf<'getMeta'>()
expectTypeOf<keyof ProfileCapabilityQueriesAPI['profiles']>().toEqualTypeOf<'listProfiles'>()

expectTypeOf<keyof BucketListQueriesAPI>().toEqualTypeOf<'server' | 'profiles' | 'buckets'>()
expectTypeOf<keyof BucketListQueriesAPI['buckets']>().toEqualTypeOf<'listBuckets'>()

expectTypeOf<keyof ObjectsFavoritesAPI>().toEqualTypeOf<'objects'>()
expectTypeOf<keyof ObjectsFavoritesAPI['objects']>().toEqualTypeOf<
	'listObjectFavorites' | 'createObjectFavorite' | 'deleteObjectFavorite'
>()

expectTypeOf<keyof ObjectsPageQueriesAPI>().toEqualTypeOf<'server' | 'profiles' | 'buckets' | 'objects'>()
expectTypeOf<keyof ObjectsPageQueriesAPI['objects']>().toEqualTypeOf<
	'listObjects' | 'listObjectFavorites' | 'createObjectFavorite' | 'deleteObjectFavorite'
>()

expectTypeOf<keyof JobsPageQueriesAPI>().toEqualTypeOf<'server' | 'profiles' | 'buckets' | 'jobs'>()
expectTypeOf<keyof JobsPageQueriesAPI['jobs']>().toEqualTypeOf<'listJobs'>()
