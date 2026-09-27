import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../../../api/queryKeys";
import type { Profile } from "../../../api/types";

export async function invalidateGovernance(
  queryClient: QueryClient,
  profileId: string,
  bucket: string,
  apiToken: string,
  throwOnError = false,
) {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.buckets.governance(profileId, bucket, apiToken),
    exact: true,
  }, { throwOnError });
}

export async function invalidateLinkedBucketState(
  queryClient: QueryClient,
  profileId: string,
  bucket: string,
  provider: Profile["provider"],
  apiToken: string,
  throwOnError = false,
) {
  await invalidateGovernance(queryClient, profileId, bucket, apiToken, throwOnError);
  if (provider === "gcp_gcs" || provider === "azure_blob") {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.buckets.policy(profileId, bucket, apiToken),
      exact: true,
    }, { throwOnError });
  }
}
