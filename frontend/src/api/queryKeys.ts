export type ObjectsIndexSearchQueryKeyArgs = {
	profileId: string | null | undefined
	bucket: string
	query: string
	prefix: string
	limit: number
	ext: string
	minSize: number | null
	maxSize: number | null
	modifiedAfter: string | undefined
	modifiedBefore: string | undefined
	apiToken: string
}

export const queryKeys = {
	server: {
		meta: (apiToken: string) => ['server', 'meta', apiToken] as const,
	},
	profiles: {
		list: (apiToken: string) => ['profiles', 'list', apiToken] as const,
		tls: (profileId: string | null | undefined, apiToken: string) => ['profiles', 'tls', profileId ?? 'none', apiToken] as const,
	},
	buckets: {
		list: (profileId: string | null, apiToken: string) => ['buckets', profileId, apiToken] as const,
		policy: (profileId: string | null | undefined, bucket: string, apiToken: string) =>
			['bucketPolicy', profileId ?? null, bucket, apiToken] as const,
		governance: (profileId: string | null | undefined, bucket: string, apiToken: string) =>
			['bucketGovernance', profileId ?? null, bucket, apiToken] as const,
	},
	jobs: {
		scope: (profileId: string | null, apiToken: string) => ['jobs', profileId, apiToken] as const,
		list: (profileId: string | null, apiToken: string, status: string, type: string, errorCode: string) =>
			['jobs', profileId, apiToken, status, type, errorCode] as const,
		detail: (profileId: string | null | undefined, jobId: string | null | undefined, apiToken: string) =>
			['job', profileId ?? null, jobId ?? null, apiToken] as const,
		uploadEtags: (
			profileId: string | null | undefined,
			bucket: string,
			uploadItemsKey: string,
			apiToken: string,
		) => ['upload-etags', profileId ?? null, bucket, uploadItemsKey, apiToken] as const,
	},
	objects: {
		list: (profileId: string | null | undefined, bucket: string, prefix: string, apiToken: string) =>
			['objects', 'list', profileId ?? null, bucket, prefix, apiToken] as const,
		favoritesSummary: (profileId: string | null | undefined, bucket: string, apiToken: string) =>
			['objects', 'favorites', profileId ?? null, bucket, 'summary', apiToken] as const,
		favoritesItems: (profileId: string | null | undefined, bucket: string, apiToken: string) =>
			['objects', 'favorites', profileId ?? null, bucket, 'items', apiToken] as const,
		indexSearch: ({
			profileId,
			bucket,
			query,
			prefix,
			limit,
			ext,
			minSize,
			maxSize,
			modifiedAfter,
			modifiedBefore,
			apiToken,
		}: ObjectsIndexSearchQueryKeyArgs) =>
			[
				'objects',
				'indexSearch',
				profileId ?? null,
				bucket,
				query,
				prefix,
				limit,
				ext,
				minSize,
				maxSize,
				modifiedAfter ?? null,
				modifiedBefore ?? null,
				apiToken,
			] as const,
		indexSummary: (profileId: string | null | undefined, bucket: string, prefix: string, apiToken: string) =>
			['objects', 'indexSummary', profileId ?? null, bucket, prefix, apiToken] as const,
		meta: (profileId: string | null | undefined, bucket: string, key: string | null | undefined, apiToken: string) =>
			['objects', 'meta', profileId ?? null, bucket, key ?? null, apiToken] as const,
	},
}

export type ObjectsListQueryLocation = {
	profileId: string
	bucket: string
	prefix: string
	apiToken: string
}

function readString(value: unknown): string | null {
	return typeof value === 'string' ? value : null
}

export function parseObjectsListQueryKey(queryKey: readonly unknown[]): ObjectsListQueryLocation | null {
	if (queryKey[0] === 'objects' && queryKey[1] === 'list') {
		const profileId = readString(queryKey[2])
		const bucket = readString(queryKey[3])
		const prefix = readString(queryKey[4])
		const apiToken = readString(queryKey[5])
		if (!profileId || !bucket || prefix == null || !apiToken) return null
		return { profileId, bucket, prefix, apiToken }
	}

	if (queryKey[0] === 'objects' && queryKey.length === 5 && queryKey[1] !== 'list') {
		const profileId = readString(queryKey[1])
		const bucket = readString(queryKey[2])
		const prefix = readString(queryKey[3])
		const apiToken = readString(queryKey[4])
		if (!profileId || !bucket || prefix == null || !apiToken) return null
		return { profileId, bucket, prefix, apiToken }
	}

	return null
}
