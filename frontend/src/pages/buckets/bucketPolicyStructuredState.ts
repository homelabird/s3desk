import type { PolicyKind } from "./policyPresets";
import type { AzureStoredPolicyRow, GcsBindingRow } from "./policy/types";
import { isRecord, parsePolicyText } from "./policy/types";

type AzurePublicAccess = "private" | "blob" | "container";

export type BucketPolicyStructuredState = {
  initialGcsState: {
    version: number;
    etag: string;
    bindings: GcsBindingRow[];
  };
  initialAzureState: {
    publicAccess: AzurePublicAccess;
    policies: AzureStoredPolicyRow[];
  };
};

export type ParsedStructuredPolicyState = {
  gcsState?: {
    version: number;
    etag: string;
    bindings: GcsBindingRow[];
  };
  azureState?: {
    publicAccess: AzurePublicAccess;
    policies: AzureStoredPolicyRow[];
  };
};

export function getInitialStructuredState(
  policyKind: PolicyKind,
  initialPolicyText: string,
): BucketPolicyStructuredState {
  const initialParsed = parsePolicyText(initialPolicyText);
  const initialPolicyValue = initialParsed.ok ? initialParsed.value : null;

  const initialGcsState = (() => {
    if (policyKind !== "gcs" || !initialPolicyValue) {
      return { version: 1, etag: "", bindings: [] as GcsBindingRow[] };
    }
    const version =
      typeof initialPolicyValue.version === "number"
        ? initialPolicyValue.version
        : 1;
    const etag =
      typeof initialPolicyValue.etag === "string"
        ? initialPolicyValue.etag
        : "";
    const bindingsRaw = Array.isArray(initialPolicyValue.bindings)
      ? initialPolicyValue.bindings
      : [];
    const bindings: GcsBindingRow[] = bindingsRaw
      .filter(isRecord)
      .map((binding, index) => ({
        key: `gcs-${index}`,
        original: binding,
        role: typeof binding.role === "string" ? binding.role : "",
        members: Array.isArray(binding.members)
          ? binding.members.filter(
              (member): member is string => typeof member === "string",
            )
          : [],
      }));
    return { version, etag, bindings };
  })();

  const initialAzureState = (() => {
    if (policyKind !== "azure" || !initialPolicyValue) {
      return {
        publicAccess: "private" as const,
        policies: [] as AzureStoredPolicyRow[],
      };
    }
    const paRaw =
      typeof initialPolicyValue.publicAccess === "string"
        ? initialPolicyValue.publicAccess
        : "private";
    const pa = (String(paRaw).toLowerCase().trim() || "private") as
      | "private"
      | "blob"
      | "container";
    const listRaw = Array.isArray(initialPolicyValue.storedAccessPolicies)
      ? initialPolicyValue.storedAccessPolicies
      : [];
    const policies: AzureStoredPolicyRow[] = listRaw
      .filter(isRecord)
      .map((policy, index) => ({
        key: `azure-${index}`,
        original: policy,
        id: typeof policy.id === "string" ? policy.id : "",
        start: typeof policy.start === "string" ? policy.start : undefined,
        expiry: typeof policy.expiry === "string" ? policy.expiry : undefined,
        permission:
          typeof policy.permission === "string" ? policy.permission : undefined,
      }));
    const publicAccess: AzurePublicAccess =
      pa === "blob" || pa === "container" ? pa : "private";
    return {
      publicAccess,
      policies,
    };
  })();

  return { initialGcsState, initialAzureState };
}

export function buildStructuredPolicyText(params: {
  policyKind: PolicyKind;
  policyText: string;
  gcsVersion: number;
  gcsEtag: string;
  gcsBindings: GcsBindingRow[];
  azurePublicAccess: AzurePublicAccess;
  azureStoredPolicies: AzureStoredPolicyRow[];
}) {
  const {
    policyKind,
    policyText,
    gcsVersion,
    gcsEtag,
    gcsBindings,
    azurePublicAccess,
    azureStoredPolicies,
  } = params;

  if (policyKind === "gcs") {
    const obj: Record<string, unknown> = {
      ...parsePolicyText(policyText).value,
      version: gcsVersion,
      bindings: gcsBindings.map((binding) => ({
        ...binding.original,
        role: binding.role,
        members: binding.members,
      })),
    };
    if (gcsEtag.trim() !== "") obj.etag = gcsEtag.trim();
    else delete obj.etag;
    return JSON.stringify(obj, null, 2);
  }

  if (policyKind === "azure") {
    const obj: Record<string, unknown> = {
      ...parsePolicyText(policyText).value,
      publicAccess: azurePublicAccess,
      storedAccessPolicies: azureStoredPolicies.map((policy) => ({
        ...policy.original,
        id: policy.id,
        start: policy.start || undefined,
        expiry: policy.expiry || undefined,
        permission: policy.permission || undefined,
      })),
    };
    return JSON.stringify(obj, null, 2);
  }

  return policyText;
}

export function computeGcsPublicRead(gcsBindings: GcsBindingRow[]) {
  return gcsBindings.some(
    (binding) =>
      binding.role === "roles/storage.objectViewer" &&
      binding.members.includes("allUsers"),
  );
}

export function parseStructuredStateFromText(
  policyKind: PolicyKind,
  text: string,
  nextKey: () => string,
): ParsedStructuredPolicyState | null {
  const nextParsed = parsePolicyText(text);
  if (!nextParsed.ok || !canUseStructuredPolicy(policyKind, text)) return null;
  const value = nextParsed.value;

  if (policyKind === "gcs") {
    const version = typeof value.version === "number" ? value.version : 1;
    const etag = typeof value.etag === "string" ? value.etag : "";
    const bindingsRaw = Array.isArray(value.bindings) ? value.bindings : [];
    const bindings: GcsBindingRow[] = bindingsRaw
      .filter(isRecord)
      .map((binding) => ({
        key: nextKey(),
        original: binding,
        role: typeof binding.role === "string" ? binding.role : "",
        members: Array.isArray(binding.members)
          ? binding.members.filter(
              (member): member is string => typeof member === "string",
            )
          : [],
      }));
    return { gcsState: { version, etag, bindings } };
  }

  if (policyKind === "azure") {
    const paRaw = typeof value.publicAccess === "string" ? value.publicAccess : "private";
    const pa = (String(paRaw).toLowerCase().trim() || "private") as
      | "private"
      | "blob"
      | "container";
    const listRaw = Array.isArray(value.storedAccessPolicies)
      ? value.storedAccessPolicies
      : [];
    const policies: AzureStoredPolicyRow[] = listRaw
      .filter(isRecord)
      .map((policy) => ({
        key: nextKey(),
        original: policy,
        id: typeof policy.id === "string" ? policy.id : "",
        start: typeof policy.start === "string" ? policy.start : undefined,
        expiry: typeof policy.expiry === "string" ? policy.expiry : undefined,
        permission:
          typeof policy.permission === "string" ? policy.permission : undefined,
      }));
    return {
      azureState: {
        publicAccess: pa === "blob" || pa === "container" ? pa : "private",
        policies,
      },
    };
  }

  return null;
}

export function canUseStructuredPolicy(policyKind: PolicyKind, text: string): boolean {
  const parsed = parsePolicyText(text);
  if (!parsed.ok) return false;
  const value = parsed.value;
  if (policyKind === "gcs") {
    return (value.version === undefined || (typeof value.version === "number" && [0, 1, 3].includes(value.version))) &&
      (value.etag === undefined || typeof value.etag === "string") &&
      Array.isArray(value.bindings) && value.bindings.every((binding) =>
        isRecord(binding) && typeof binding.role === "string" &&
        Array.isArray(binding.members) && binding.members.every((member) => typeof member === "string"));
  }
  if (policyKind === "azure") {
    return ["private", "blob", "container"].includes(value.publicAccess as string) &&
      Array.isArray(value.storedAccessPolicies) && value.storedAccessPolicies.every((policy) =>
        isRecord(policy) && typeof policy.id === "string" &&
        ["start", "expiry", "permission"].every((field) => policy[field] === undefined || typeof policy[field] === "string"));
  }
  return false;
}
