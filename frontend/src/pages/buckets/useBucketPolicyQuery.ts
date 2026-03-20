import { useQuery } from "@tanstack/react-query";

import type { APIClient } from "../../api/client";

export function useBucketPolicyQuery(
  api: APIClient,
  profileId: string,
  bucket: string,
  apiToken: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["bucketPolicy", profileId, bucket, apiToken],
    queryFn: () => api.buckets.getBucketPolicy(profileId, bucket),
    enabled,
  });
}
