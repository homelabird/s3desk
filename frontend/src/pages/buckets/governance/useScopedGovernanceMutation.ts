import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";

import { appFeedback } from "../../../lib/appFeedback";
import { formatErrorWithHint as formatErr } from "../../../lib/errors";
import { invalidateGovernance, invalidateLinkedBucketState } from "./invalidation";
import type { GovernanceMutationContext } from "./mutationScope";
import { useGovernanceMutationScope } from "./mutationScope";
import type { GovernanceControlsCommonProps } from "./types";

type GovernanceMutationScope = ReturnType<typeof useGovernanceMutationScope>;
type GovernanceMutationStateArgs = Pick<
  GovernanceControlsCommonProps,
  "apiToken" | "profileId" | "provider" | "bucket" | "queryClient"
>;

type UseScopedGovernanceMutationArgs<TData, TVariables> = {
  mutationScope: GovernanceMutationScope;
  mutationFn: (variables: TVariables) => Promise<TData>;
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
    mutationFn: args.mutationFn,
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
      appFeedback.error(formatErr(err));
    },
    onSettled: async (_data, _error, _variables, context) => {
      // Provider errors can follow partial writes; refresh even after navigation.
      if (context && _error) await args.refreshState(context.apiToken);
    },
  });
}

type GovernanceMutationRunner = {
  mutationScope: GovernanceMutationScope;
  refreshState: (apiToken: string, throwOnError?: boolean) => Promise<void>;
};

export function useGovernanceControlMutation<TData = unknown, TVariables = void>(
  runner: GovernanceMutationRunner,
  args: Omit<
    UseScopedGovernanceMutationArgs<TData, TVariables>,
    "mutationScope" | "refreshState"
  >,
) {
  return useScopedGovernanceMutation<TData, TVariables>({
    ...args,
    mutationScope: runner.mutationScope,
    refreshState: runner.refreshState,
  });
}

export function useLinkedGovernanceMutationState(args: GovernanceMutationStateArgs) {
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

  return { mutationScope, refreshState };
}

export function useGovernanceMutationState(args: GovernanceMutationStateArgs) {
  const mutationScope = useGovernanceMutationScope({
    apiToken: args.apiToken,
    profileId: args.profileId,
    provider: args.provider,
    bucket: args.bucket,
  });
  const refreshState = (apiToken: string, throwOnError = false) =>
    invalidateGovernance(args.queryClient, args.profileId, args.bucket, apiToken, throwOnError);

  return { mutationScope, refreshState };
}
