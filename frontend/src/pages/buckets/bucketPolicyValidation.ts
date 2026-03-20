import type { APIError } from "../../api/client";
import type {
  BucketPolicyValidateResponse,
} from "../../api/types";
import type { PolicyKind } from "./policyPresets";
import type { ParsedPolicy } from "./policy/types";
import { isRecord } from "./policy/types";

export function getProviderWarnings(
  parsed: ParsedPolicy,
  policyKind: PolicyKind,
) {
  if (!parsed.ok) return [] as string[];
  const value = parsed.value;
  const warnings: string[] = [];
  if (policyKind === "gcs") {
    if (typeof value.etag !== "string" || value.etag.trim() === "") {
      warnings.push(
        "GCS IAM policies usually include an 'etag'. Keep it (reload the policy if needed) to avoid update conflicts.",
      );
    }
  }
  return warnings;
}

export function getLocalValidationErrors(
  parsed: ParsedPolicy,
  policyKind: PolicyKind,
) {
  if (!parsed.ok) return [] as string[];
  const errors: string[] = [];
  const value = parsed.value;

  if (policyKind === "gcs") {
    const bindings = Array.isArray(value.bindings)
      ? value.bindings.filter(isRecord)
      : [];
    bindings.forEach((binding, index) => {
      const role = typeof binding.role === "string" ? binding.role.trim() : "";
      const members = Array.isArray(binding.members)
        ? binding.members.filter(
            (member): member is string =>
              typeof member === "string" && member.trim() !== "",
          )
        : [];
      if (!role) errors.push(`GCS binding #${index + 1}: role is required.`);
      if (members.length === 0) {
        errors.push(`GCS binding #${index + 1}: at least one member is required.`);
      }
    });
  }

  if (policyKind === "azure") {
    const policies = Array.isArray(value.storedAccessPolicies)
      ? value.storedAccessPolicies.filter(isRecord)
      : [];
    if (policies.length > 5) {
      errors.push(
        "Azure allows a maximum of 5 stored access policies on a container.",
      );
    }
    const seenIDs = new Set<string>();
    policies.forEach((policy, index) => {
      const id = typeof policy.id === "string" ? policy.id.trim() : "";
      const label = id || `#${index + 1}`;
      if (!id) {
        errors.push(`Azure stored access policy #${index + 1}: id is required.`);
      }
      if (id) {
        const idKey = id.toLowerCase();
        if (seenIDs.has(idKey)) {
          errors.push(`Azure stored access policy id "${id}" is duplicated.`);
        }
        seenIDs.add(idKey);
      }
      const permission =
        typeof policy.permission === "string" ? policy.permission.trim() : "";
      if (permission !== "" && !/^[rwdlacup]+$/i.test(permission)) {
        errors.push(
          `Azure stored access policy ${label}: permission must use only r/w/d/l/a/c/u/p.`,
        );
      }
    });
  }

  return errors;
}

export function getServerValidationMessages(
  serverValidation: BucketPolicyValidateResponse | null,
) {
  if (
    !serverValidation ||
    (!serverValidation.errors?.length && !serverValidation.warnings?.length)
  ) {
    return [] as string[];
  }
  return [
    ...(serverValidation.errors ?? []).map((row) => `Error: ${row}`),
    ...(serverValidation.warnings ?? []).map((row) => `Warning: ${row}`),
  ];
}

export function getProviderErrorDetails(lastProviderError: APIError | null) {
  const details = lastProviderError?.details;
  return {
    cause: typeof details?.cause === "string" ? details.cause : null,
    providerError:
      typeof details?.providerError === "string" ? details.providerError : null,
  };
}
