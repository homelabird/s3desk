import type { APIClientShape } from '../../api/client'
import type { Job, JobCreateRequest } from '../../api/types'
import type { TransfersContextValue } from '../../components/transfersTypes'
import type { ObjectsCostMode } from '../../lib/objectsCostMode'
import { AUTO_INDEX_COOLDOWN_MS } from './objectsPageConstants'
import { useObjectsIndexing } from './useObjectsIndexing'
import { useObjectsZipJobs } from './useObjectsZipJobs'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type UseObjectsPageJobsArgs = {
	api: APIClientShape
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	transfers: TransfersContextValue
	createJobWithRetry: CreateJobWithRetry
	globalSearchOpen: boolean
	globalSearchQueryText: string
	globalSearchPrefixNormalized: string
	objectsCostMode: ObjectsCostMode
	autoIndexEnabled: boolean
	autoIndexTtlMs: number
	setIndexPrefix: (value: string) => void
}

export function useObjectsPageJobs(args: UseObjectsPageJobsArgs) {
	const zipJobs = useObjectsZipJobs({
		profileId: args.profileId,
		apiToken: args.apiToken,
		bucket: args.bucket,
		prefix: args.prefix,
		transfers: args.transfers,
		createJobWithRetry: args.createJobWithRetry,
	})

	const indexingJobs = useObjectsIndexing({
		api: args.api,
		profileId: args.profileId,
		apiToken: args.apiToken,
		bucket: args.bucket,
		prefix: args.prefix,
		globalSearchOpen: args.globalSearchOpen,
		globalSearchQueryText: args.globalSearchQueryText,
		globalSearchPrefixNormalized: args.globalSearchPrefixNormalized,
		objectsCostMode: args.objectsCostMode,
		autoIndexEnabled: args.autoIndexEnabled,
		autoIndexTtlMs: args.autoIndexTtlMs,
		autoIndexCooldownMs: AUTO_INDEX_COOLDOWN_MS,
		setIndexPrefix: args.setIndexPrefix,
		createJobWithRetry: args.createJobWithRetry,
	})

	return { ...zipJobs, ...indexingJobs }
}
