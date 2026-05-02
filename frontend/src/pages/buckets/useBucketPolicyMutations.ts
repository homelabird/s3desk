import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { APIError, type APIClientShape } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import type {
  BucketPolicyPutRequest,
  BucketPolicyValidateResponse,
  Profile,
} from "../../api/types";
import { bucketsFeedback } from "./bucketsFeedback";

export function useBucketPolicyMutations(props: {
  api: APIClientShape;
  apiToken: string;
  profileId: string;
  bucket: string;
  provider?: Profile["provider"];
  onClose: () => void;
  setActiveTab: (tab: "validate" | "preview" | "diff") => void;
  setLastProviderError: (error: APIError | null) => void;
  setServerValidation: (value: BucketPolicyValidateResponse | null) => void;
  setServerValidationError: (value: string | null) => void;
  buildValidationRequest: () => BucketPolicyPutRequest;
}) {
  const queryClient = useQueryClient();
  const isActiveRef = useRef(true);
  const putRequestTokenRef = useRef(0);
  const deleteRequestTokenRef = useRef(0);
  const validateRequestTokenRef = useRef(0);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
    };
  }, []);

  const invalidatePolicyQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.buckets.policy(props.profileId, props.bucket, props.apiToken),
      exact: true,
    });
    if (props.provider === "gcp_gcs" || props.provider === "azure_blob") {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.buckets.governance(props.profileId, props.bucket, props.apiToken),
        exact: true,
      });
    }
  };

  const putMutation = useMutation({
    mutationFn: (req: BucketPolicyPutRequest) =>
      props.api.buckets.putBucketPolicy(props.profileId, props.bucket, req),
    onMutate: () => {
      putRequestTokenRef.current += 1;
      return { requestToken: putRequestTokenRef.current };
    },
    onSuccess: async (_, __, context) => {
      await invalidatePolicyQueries();
      if (
        !isActiveRef.current ||
        context?.requestToken !== putRequestTokenRef.current
      ) {
        return;
      }
      bucketsFeedback.policySaved();
      props.setLastProviderError(null);
      props.onClose();
    },
    onError: (err, _vars, context) => {
      if (
        !isActiveRef.current ||
        context?.requestToken !== putRequestTokenRef.current
      ) {
        return;
      }
      props.setActiveTab("validate");
      props.setLastProviderError(err instanceof APIError ? err : null);
      bucketsFeedback.error(err);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      props.api.buckets.deleteBucketPolicy(props.profileId, props.bucket),
    onMutate: () => {
      deleteRequestTokenRef.current += 1;
      return { requestToken: deleteRequestTokenRef.current };
    },
    onSuccess: async (_, __, context) => {
      await invalidatePolicyQueries();
      if (
        !isActiveRef.current ||
        context?.requestToken !== deleteRequestTokenRef.current
      ) {
        return;
      }
      bucketsFeedback.policyDeleted();
      props.setLastProviderError(null);
      props.onClose();
    },
    onError: (err, _vars, context) => {
      if (
        !isActiveRef.current ||
        context?.requestToken !== deleteRequestTokenRef.current
      ) {
        return;
      }
      props.setActiveTab("validate");
      props.setLastProviderError(err instanceof APIError ? err : null);
      bucketsFeedback.error(err);
    },
  });

  const validateMutation = useMutation({
    mutationFn: () =>
      props.api.buckets.validateBucketPolicy(
        props.profileId,
        props.bucket,
        props.buildValidationRequest(),
      ),
    onMutate: () => {
      validateRequestTokenRef.current += 1;
      return { requestToken: validateRequestTokenRef.current };
    },
    onSuccess: (resp, _vars, context) => {
      if (
        !isActiveRef.current ||
        context?.requestToken !== validateRequestTokenRef.current
      ) {
        return;
      }
      props.setServerValidation(resp);
      props.setServerValidationError(null);
      bucketsFeedback.policyValidationResult(resp);
    },
    onError: (err, _vars, context) => {
      if (
        !isActiveRef.current ||
        context?.requestToken !== validateRequestTokenRef.current
      ) {
        return;
      }
      props.setServerValidation(null);
      const content = bucketsFeedback.policyValidationUnavailable(err);
      props.setServerValidationError(content);
    },
  });

  return { putMutation, deleteMutation, validateMutation };
}
