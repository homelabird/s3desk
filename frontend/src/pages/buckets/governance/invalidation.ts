import type { QueryClient } from "@tanstack/react-query";

import type { Profile } from "../../../api/types";

export async function invalidateGovernance(
  queryClient: QueryClient,
  profileId: string,
  bucket: string,
) {
  await queryClient.invalidateQueries({
    queryKey: ["bucketGovernance", profileId, bucket],
  });
}

export async function invalidateLinkedBucketState(
  queryClient: QueryClient,
  profileId: string,
  bucket: string,
  provider: Profile["provider"],
) {
  await invalidateGovernance(queryClient, profileId, bucket);
  if (provider === "gcp_gcs" || provider === "azure_blob") {
    await queryClient.invalidateQueries({
      queryKey: ["bucketPolicy", profileId, bucket],
    });
  }
}
