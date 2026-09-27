import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef } from "react";

import { APIError, type APIClientShape } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import type {
  BucketPolicyPutRequest,
  BucketPolicyResponse,
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
  validationKey: string;
  baseline: BucketPolicyResponse;
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
  const { validationKey, setServerValidation, setServerValidationError } = props;

  useLayoutEffect(() => {
    validateRequestTokenRef.current += 1;
    setServerValidation(null);
    setServerValidationError(null);
  }, [validationKey, setServerValidation, setServerValidationError]);

  useEffect(() => {
    isActiveRef.current = true;
    return () => {
      isActiveRef.current = false;
    };
  }, []);

  const invalidatePolicyQueries = async (throwOnError = false) => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.buckets.policy(props.profileId, props.bucket, props.apiToken),
      exact: true,
    }, { throwOnError });
    if (props.provider === "gcp_gcs" || props.provider === "azure_blob") {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.buckets.governance(props.profileId, props.bucket, props.apiToken),
        exact: true,
      }, { throwOnError });
    }
  };

  const verifyCurrentPolicy = async () => {
    const revision = validateRequestTokenRef.current;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const current = await props.api.buckets.getBucketPolicy(props.profileId, props.bucket, controller.signal);
      if (!isActiveRef.current || revision !== validateRequestTokenRef.current) {
        throw new Error("Policy editor changed. Review the current draft before saving.");
      }
      if (current.bucket !== props.bucket || current.exists !== props.baseline.exists || JSON.stringify(current.policy) !== JSON.stringify(props.baseline.policy)) {
        throw new Error("Stored policy changed since editing began. Nothing was saved. Reopen the editor and review the latest policy.");
      }
    } catch (error) {
      throw new PolicyPreflightError(error instanceof Error ? error.message : "Could not verify the current policy. Nothing was saved.");
    } finally {
      clearTimeout(timer);
    }
  };

  const putMutation = useMutation({
    retry: false,
    mutationFn: async (req: BucketPolicyPutRequest) => {
      await verifyCurrentPolicy();
      return props.api.buckets.putBucketPolicy(props.profileId, props.bucket, req);
    },
    onMutate: () => {
      putRequestTokenRef.current += 1;
      return { requestToken: putRequestTokenRef.current };
    },
    onSuccess: async (_, __, context) => {
      const refreshed = await invalidatePolicyQueries(true).then(() => true, () => false);
      if (
        !isActiveRef.current ||
        context?.requestToken !== putRequestTokenRef.current
      ) {
        return;
      }
      if (!refreshed) {
        bucketsFeedback.error(new Error("Change request accepted, but current policy could not be read. Reload to verify before retrying."));
        return;
      }
      bucketsFeedback.policySaved();
      props.setLastProviderError(null);
      props.onClose();
    },
    onError: async (err, _vars, context) => {
      // A lost response does not prove that the provider rejected the write.
      if (!(err instanceof PolicyPreflightError)) await invalidatePolicyQueries();
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
    retry: false,
    mutationFn: async () => {
      await verifyCurrentPolicy();
      return props.api.buckets.deleteBucketPolicy(props.profileId, props.bucket);
    },
    onMutate: () => {
      deleteRequestTokenRef.current += 1;
      return { requestToken: deleteRequestTokenRef.current };
    },
    onSuccess: async (_, __, context) => {
      const refreshed = await invalidatePolicyQueries(true).then(() => true, () => false);
      if (
        !isActiveRef.current ||
        context?.requestToken !== deleteRequestTokenRef.current
      ) {
        return;
      }
      if (!refreshed) {
        bucketsFeedback.error(new Error("Change request accepted, but current policy could not be read. Reload to verify before retrying."));
        return;
      }
      bucketsFeedback.policyDeleted();
      props.setLastProviderError(null);
      props.onClose();
    },
    onError: async (err, _vars, context) => {
      // A lost response does not prove that the provider rejected the write.
      if (!(err instanceof PolicyPreflightError)) await invalidatePolicyQueries();
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

class PolicyPreflightError extends Error {}
