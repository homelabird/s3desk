const BUCKETS_QUERY_STALE_TIME_DEFAULT_MS = 5 * 60_000
const BUCKETS_QUERY_STALE_TIME_GCS_MS = 10 * 60_000
const BUCKETS_QUERY_STALE_TIME_OCI_MS = 15 * 60_000

export const BUCKETS_QUERY_STALE_TIME_MS = BUCKETS_QUERY_STALE_TIME_DEFAULT_MS

export function getBucketsQueryStaleTimeMs(provider?: string | null): number {
	switch (provider) {
		case 'gcp_gcs':
			return BUCKETS_QUERY_STALE_TIME_GCS_MS
		case 'oci_object_storage':
			return BUCKETS_QUERY_STALE_TIME_OCI_MS
		default:
			return BUCKETS_QUERY_STALE_TIME_DEFAULT_MS
	}
}
