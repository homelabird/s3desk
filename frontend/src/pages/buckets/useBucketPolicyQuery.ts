import { useQuery } from "@tanstack/react-query";

import type { APIClientShape } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";

export function useBucketPolicyQuery(
  api: APIClientShape,
  profileId: string,
  bucket: string,
  apiToken: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.buckets.policy(profileId, bucket, apiToken),
    queryFn: () => api.buckets.getBucketPolicy(profileId, bucket),
    enabled,
  });
}
