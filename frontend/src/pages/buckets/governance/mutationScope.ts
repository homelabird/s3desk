import { useEffect, useLayoutEffect, useRef } from "react";

import type { Profile } from "../../../api/types";

export type GovernanceMutationContext = {
  apiToken: string;
  scopeKey: string;
  scopeVersion: number;
  requestToken: number;
};

export function useGovernanceMutationScope(args: {
  apiToken: string;
  profileId: string;
  provider: Profile["provider"];
  bucket: string;
}) {
  const currentScopeKey = `${args.apiToken}:${args.profileId}:${args.provider}:${args.bucket}`;
  const scopeVersionRef = useRef(0);
  const isActiveRef = useRef(true);

  useLayoutEffect(() => {
    scopeVersionRef.current += 1;
  }, [args.apiToken, args.profileId, args.provider, args.bucket]);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
    };
  }, []);

  const createContext = (requestToken: number): GovernanceMutationContext => ({
    apiToken: args.apiToken,
    scopeKey: currentScopeKey,
    scopeVersion: scopeVersionRef.current,
    requestToken,
  });

  const isCurrentScope = (context: GovernanceMutationContext | undefined) =>
    !!context &&
    isActiveRef.current &&
    context.scopeKey === currentScopeKey &&
    context.scopeVersion === scopeVersionRef.current;

  const isCurrentRequest = (
    context: GovernanceMutationContext | undefined,
    requestToken: number,
  ) => !!context && isCurrentScope(context) && context.requestToken === requestToken;

  return {
    createContext,
    isCurrentScope,
    isCurrentRequest,
  };
}
