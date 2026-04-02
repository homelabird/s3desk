import type { QueryClient } from "@tanstack/react-query";

import type { Profile } from "../../../api/types";

export async function invalidateGovernance(
  queryClient: QueryClient,
  profileId: string,
  bucket: string,
  apiToken: string,
) {
  await queryClient.invalidateQueries({
    queryKey: ["bucketGovernance", profileId, bucket, apiToken],
    exact: true,
  });
}

export async function invalidateLinkedBucketState(
  queryClient: QueryClient,
  profileId: string,
  bucket: string,
  provider: Profile["provider"],
  apiToken: string,
) {
  await invalidateGovernance(queryClient, profileId, bucket, apiToken);
  if (provider === "gcp_gcs" || provider === "azure_blob") {
    await queryClient.invalidateQueries({
      queryKey: ["bucketPolicy", profileId, bucket, apiToken],
      exact: true,
    });
  }
}
