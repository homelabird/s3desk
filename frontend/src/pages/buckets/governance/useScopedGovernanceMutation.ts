import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { buildGovernanceDraftKey } from "./utils";
import { useGovernanceApproval, type GovernanceSection } from "./useGovernanceApproval";

import { appFeedback } from "../../../lib/appFeedback";
import { formatErrorWithHint as formatErr } from "../../../lib/errors";
import { invalidateGovernance, invalidateLinkedBucketState } from "./invalidation";
import type { GovernanceMutationContext } from "./mutationScope";
import { useGovernanceMutationScope } from "./mutationScope";
import type { GovernanceControlsCommonProps } from "./types";

type GovernanceMutationScope = ReturnType<typeof useGovernanceMutationScope>;
type GovernanceMutationStateArgs = Pick<
  GovernanceControlsCommonProps,
  "apiToken" | "profileId" | "provider" | "bucket" | "queryClient" | "api" | "governance"
>;

type UseScopedGovernanceMutationArgs<TData, TVariables> = {
  mutationScope: GovernanceMutationScope;
  mutationFn: (variables: TVariables) => Promise<TData>;
  beforeMutation?: () => Promise<void>;
  successMessage: string;
  refreshState: (apiToken: string, throwOnError?: boolean) => Promise<void>;
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: GovernanceMutationContext,
  ) => void | Promise<void>;
};

export function useScopedGovernanceMutation<TData = unknown, TVariables = void>(
  args: UseScopedGovernanceMutationArgs<TData, TVariables>,
) {
  const requestTokenRef = useRef(0);

  return useMutation<TData, unknown, TVariables, GovernanceMutationContext>({
    retry: false,
    mutationFn: async (variables) => {
      const scope = args.mutationScope.createContext(requestTokenRef.current);
      try {
        await args.beforeMutation?.();
        if (!args.mutationScope.isCurrentScope(scope)) {
          throw new Error("The selected bucket or session changed. Reopen controls before saving.");
        }
      } catch (error) {
        throw new GovernancePreflightError(error instanceof Error ? error.message : "Could not verify current settings. Reload before saving.");
      }
      return args.mutationFn(variables);
    },
    onMutate: () => {
      requestTokenRef.current += 1;
      return args.mutationScope.createContext(requestTokenRef.current);
    },
    onSuccess: async (data, variables, context) => {
      if (args.mutationScope.isCurrentRequest(context, requestTokenRef.current)) {
        await args.onSuccess?.(data, variables, context);
      }
      const refreshed = await args.refreshState(context.apiToken, true).then(() => true, () => false);
      if (!args.mutationScope.isCurrentRequest(context, requestTokenRef.current)) return;
      if (!refreshed) {
        appFeedback.error("Change request accepted, but current settings could not be read. Reload to verify before retrying.");
        return;
      }
      appFeedback.success(args.successMessage);
    },
    onError: (err, _variables, context) => {
      if (!args.mutationScope.isCurrentRequest(context, requestTokenRef.current)) return;
      if (!(err instanceof GovernanceApprovalCanceled)) appFeedback.error(formatErr(err));
    },
    onSettled: async (_data, _error, _variables, context) => {
      // Provider errors can follow partial writes; refresh even after navigation.
      if (context && _error && !(_error instanceof GovernancePreflightError)) await args.refreshState(context.apiToken);
    },
  });
}

class GovernancePreflightError extends Error {}
class GovernanceApprovalCanceled extends GovernancePreflightError {}

type GovernanceMutationRunner = {
  requestApproval: (section: GovernanceSection, request: object) => Promise<boolean>;
  beforeMutation: () => Promise<void>;
  mutationScope: GovernanceMutationScope;
  refreshState: (apiToken: string, throwOnError?: boolean) => Promise<void>;
};

export function useGovernanceControlMutation<TData, TRequest extends object>(
  runner: GovernanceMutationRunner,
  args: {
    section: GovernanceSection;
    buildRequest: () => TRequest;
    mutationFn: (request: TRequest) => Promise<TData>;
    successMessage: string;
    onSuccess?: (data: TData, variables: void, context: GovernanceMutationContext) => void | Promise<void>;
  },
) {
  return useScopedGovernanceMutation<TData, void>({
    ...args,
    mutationScope: runner.mutationScope,
    refreshState: runner.refreshState,
    mutationFn: async () => {
      let request: TRequest;
      const scope = runner.mutationScope.createContext(0);
      try {
        // Freeze the reviewed payload; later draft edits cannot change this request.
        request = structuredClone(args.buildRequest());
        if (!await runner.requestApproval(args.section, request)) throw new GovernanceApprovalCanceled();
        if (!runner.mutationScope.isCurrentScope(scope)) throw new GovernanceApprovalCanceled();
        await runner.beforeMutation();
        if (!runner.mutationScope.isCurrentScope(scope)) throw new GovernanceApprovalCanceled();
      } catch (error) {
        if (error instanceof GovernancePreflightError) throw error;
        throw new GovernancePreflightError(error instanceof Error ? error.message : "Could not check current settings.");
      }
      return args.mutationFn(request);
    },
  });
}

export function useLinkedGovernanceMutationState(args: GovernanceMutationStateArgs) {
  const approval = useGovernanceApproval(args);
  const mutationScope = useGovernanceMutationScope({
    apiToken: args.apiToken,
    profileId: args.profileId,
    provider: args.provider,
    bucket: args.bucket,
  });
  const refreshState = (apiToken: string, throwOnError = false) =>
    invalidateLinkedBucketState(
      args.queryClient,
      args.profileId,
      args.bucket,
      args.provider,
      apiToken,
      throwOnError,
    );

  return { ...approval, mutationScope, refreshState, beforeMutation: () => verifyGovernanceBaseline(args) };
}

export function useGovernanceMutationState(args: GovernanceMutationStateArgs) {
  const approval = useGovernanceApproval(args);
  const mutationScope = useGovernanceMutationScope({
    apiToken: args.apiToken,
    profileId: args.profileId,
    provider: args.provider,
    bucket: args.bucket,
  });
  const refreshState = (apiToken: string, throwOnError = false) =>
    invalidateGovernance(args.queryClient, args.profileId, args.bucket, apiToken, throwOnError);

  return { ...approval, mutationScope, refreshState, beforeMutation: () => verifyGovernanceBaseline(args) };
}

async function verifyGovernanceBaseline(args: GovernanceMutationStateArgs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let current;
  try {
    current = await args.api.buckets.getBucketGovernance(args.profileId, args.bucket, controller.signal);
  } catch (error) {
    throw new Error(`Current settings could not be checked. Nothing was saved. ${formatErr(error)}`);
  } finally {
    clearTimeout(timer);
  }
  if (buildGovernanceDraftKey(args.bucket, current) !== buildGovernanceDraftKey(args.bucket, args.governance)) {
    throw new Error("Bucket settings changed since you opened these controls. Your draft has not been saved. Reopen controls and review the latest settings before applying it.");
  }
}
