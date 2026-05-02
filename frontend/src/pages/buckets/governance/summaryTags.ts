import type { BucketGovernanceView } from "../../../api/types";
import type {
  AzureGovernanceDraft,
  AzureImmutabilityView,
  GCSGovernanceDraft,
  OCIGovernanceDraft,
} from "./types";
import { getOCISharingView, normalizeAzureImmutabilityMode } from "./utils";

export function buildAWSSummaryTags(
  governance: BucketGovernanceView,
): string[] {
  const items: string[] = [];
  if (governance.publicExposure?.mode) {
    items.push(`Exposure: ${governance.publicExposure.mode}`);
  }
  if (governance.versioning?.status) {
    items.push(`Versioning: ${governance.versioning.status}`);
  }
  if (governance.encryption?.mode) {
    items.push(`Encryption: ${governance.encryption.mode}`);
  }
  return items;
}

export function buildGCSSummaryTags(
  governance: BucketGovernanceView,
  fallback: Pick<
    GCSGovernanceDraft,
    "publicMode" | "publicAccessPrevention" | "versioningStatus"
  >,
): string[] {
  const publicAccessPrevention =
    governance.publicExposure?.publicAccessPrevention ??
    fallback.publicAccessPrevention;
  const items: string[] = [];
  items.push(`Exposure: ${governance.publicExposure?.mode ?? fallback.publicMode}`);
  items.push(`Bindings: ${governance.access?.bindings?.length ?? 0}`);
  items.push(
    `PAP: ${publicAccessPrevention ? "enforced" : "off"}`,
  );
  items.push(
    `Uniform access: ${governance.protection?.uniformAccess ? "on" : "off"}`,
  );
  items.push(
    `Versioning: ${governance.versioning?.status ?? fallback.versioningStatus}`,
  );
  if (governance.access?.etag) {
    items.push("ETag preserved");
  }
  return items;
}

export function buildAzureSummaryTags(
  governance: BucketGovernanceView,
  fallback: Pick<AzureGovernanceDraft, "publicMode" | "versioningStatus">,
): string[] {
  const immutability = governance.protection?.immutability as
    | AzureImmutabilityView
    | undefined;
  const items: string[] = [];
  items.push(
    `Exposure: ${
      governance.publicExposure?.visibility ??
      governance.publicExposure?.mode ??
      fallback.publicMode
    }`,
  );
  items.push(`Policies: ${governance.access?.storedAccessPolicies?.length ?? 0}`);
  items.push(
    `Versioning: ${governance.versioning?.status ?? fallback.versioningStatus}`,
  );
  items.push(
    `Soft delete: ${governance.protection?.softDelete?.enabled ? "on" : "off"}`,
  );
  if (immutability?.enabled) {
    items.push(
      `Immutability: ${normalizeAzureImmutabilityMode(immutability.mode)}`,
    );
  }
  if (immutability?.legalHold) {
    items.push("Legal hold");
  }
  return items;
}

export function buildOCISummaryTags(
  governance: BucketGovernanceView,
  fallback: Pick<OCIGovernanceDraft, "visibility" | "versioningStatus">,
): string[] {
  const retentionRuleCount = getOCIRetentionRuleCount(governance);
  const sharing = getOCISharingView(governance);
  return [
    `Visibility: ${governance.publicExposure?.visibility ?? fallback.visibility}`,
    `Versioning: ${governance.versioning?.status ?? fallback.versioningStatus}`,
    retentionRuleCount > 0
      ? `Retention rules: ${retentionRuleCount}`
      : "Retention rules: 0",
    `PARs: ${
      Array.isArray(sharing?.preauthenticatedRequests)
        ? sharing.preauthenticatedRequests.length
        : 0
    }`,
  ];
}

function getOCIRetentionRuleCount(governance: BucketGovernanceView): number {
  const retention = governance.protection?.retention as
    | { enabled?: boolean; rules?: unknown[] }
    | undefined;
  if (Array.isArray(retention?.rules) && retention.rules.length > 0) {
    return retention.rules.length;
  }
  return retention?.enabled ? 1 : 0;
}
