import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { APIError, type APIClient } from "../../api/client";
import type {
  BucketPolicyPutRequest,
  BucketPolicyValidateResponse,
  Profile,
} from "../../api/types";
import { formatErrorWithHint as formatErr } from "../../lib/errors";
import {
  formatUnavailableOperationMessage,
  formatValidationOperationMessage,
} from "../../lib/providerOperationFeedback";
import { message } from "antd";

export function useBucketPolicyMutations(props: {
  api: APIClient;
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
      queryKey: ["bucketPolicy", props.profileId, props.bucket, props.apiToken],
      exact: true,
    });
    if (props.provider === "gcp_gcs" || props.provider === "azure_blob") {
      await queryClient.invalidateQueries({
        queryKey: ["bucketGovernance", props.profileId, props.bucket, props.apiToken],
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
      message.success("Policy saved");
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
      message.error(formatErr(err));
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
      message.success("Policy deleted");
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
      message.error(formatErr(err));
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
      const { content, duration } = formatValidationOperationMessage({
        successMessage: "Validation OK",
        failureMessage: "Validation found issues",
        ok: resp.ok,
        errors: resp.errors,
        warnings: resp.warnings,
      });
      if (resp.ok) message.success(content, duration);
      else message.warning(content, duration);
    },
    onError: (err, _vars, context) => {
      if (
        !isActiveRef.current ||
        context?.requestToken !== validateRequestTokenRef.current
      ) {
        return;
      }
      props.setServerValidation(null);
      const { content, duration } = formatUnavailableOperationMessage(
        "Policy validation unavailable",
        err,
      );
      props.setServerValidationError(content);
      message.error(content, duration);
    },
  });

  return { putMutation, deleteMutation, validateMutation };
}
