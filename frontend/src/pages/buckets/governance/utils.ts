import type {
  BucketAccessBinding,
  BucketAdvancedView,
  BucketBlockPublicAccess,
  BucketGovernanceView,
} from "../../../api/types";
import type {
  AzureGovernanceDraft,
  AzureImmutabilityView,
  AzureStoredAccessPermission,
  AzureStoredAccessPolicyDraft,
  AdvancedPolicyCarrier,
  BucketAccessBindingCondition,
  BucketGovernanceDraft,
  GCSBindingDraft,
  GCSConditionDraft,
  GCSGovernanceDraft,
  OCIGovernanceDraft,
  OCIPreauthenticatedRequestDraft,
  OCIRetentionView,
  OCISharingView,
} from "./types";
import { azureStoredAccessPermissionOptions } from "./types";

const fallbackPublicAccessBlock: BucketBlockPublicAccess = {
  blockPublicAcls: true,
  ignorePublicAcls: true,
  blockPublicPolicy: true,
  restrictPublicBuckets: true,
};

export function parseJSONArray<T>(value: string, label: string): T[] {
  const raw = value.trim() === "" ? "[]" : value.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `${label} JSON is invalid: ${error.message}`
        : `${label} JSON is invalid`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array. Use [] to clear entries.`);
  }
  return parsed as T[];
}

function formatOptionalJSON(value: unknown): string {
  if (value == null) return "";
  return JSON.stringify(value, null, 2);
}

function parseLineSeparatedValues(value: string): string[] {
  return value
    .split(/\r?\n|,/) 
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function createEmptyGCSBindingDraft(): GCSBindingDraft {
  return {
    role: "",
    membersText: "",
    conditionEnabled: false,
    conditionTitle: "",
    conditionDescription: "",
    conditionExpression: "",
    unsupportedConditionJSON: "",
  };
}

export function buildGCSConditionDraft(value: unknown): GCSConditionDraft {
  if (value == null) {
    return {
      conditionEnabled: false,
      conditionTitle: "",
      conditionDescription: "",
      conditionExpression: "",
      unsupportedConditionJSON: "",
    };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      conditionEnabled: true,
      conditionTitle: "",
      conditionDescription: "",
      conditionExpression: "",
      unsupportedConditionJSON: formatOptionalJSON(value),
    };
  }

  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw);
  const unsupported =
    keys.some(
      (key) =>
        key !== "title" && key !== "description" && key !== "expression",
    ) ||
    ("title" in raw && typeof raw.title !== "string") ||
    ("description" in raw && typeof raw.description !== "string") ||
    ("expression" in raw && typeof raw.expression !== "string");

  return {
    conditionEnabled: keys.length > 0,
    conditionTitle: typeof raw.title === "string" ? raw.title : "",
    conditionDescription:
      typeof raw.description === "string" ? raw.description : "",
    conditionExpression:
      typeof raw.expression === "string" ? raw.expression : "",
    unsupportedConditionJSON: unsupported ? formatOptionalJSON(value) : "",
  };
}

export function createEmptyAzureStoredAccessPolicyDraft(): AzureStoredAccessPolicyDraft {
  return {
    id: "",
    start: "",
    expiry: "",
    permission: "",
  };
}

export function normalizeAzureStoredAccessPermissions(value: string): string {
  const allowed = new Set<AzureStoredAccessPermission>(
    azureStoredAccessPermissionOptions.map((option) => option.value),
  );
  const selected = new Set<AzureStoredAccessPermission>();
  for (const char of value.toLowerCase()) {
    if (allowed.has(char as AzureStoredAccessPermission)) {
      selected.add(char as AzureStoredAccessPermission);
    }
  }
  return azureStoredAccessPermissionOptions
    .map((option) => option.value)
    .filter((item) => selected.has(item))
    .join("");
}

export function toggleAzureStoredAccessPermission(
  current: string,
  permission: AzureStoredAccessPermission,
  enabled: boolean,
): string {
  const next = new Set<AzureStoredAccessPermission>(
    normalizeAzureStoredAccessPermissions(current)
      .split("")
      .map((value) => value as AzureStoredAccessPermission),
  );
  if (enabled) {
    next.add(permission);
  } else {
    next.delete(permission);
  }
  return azureStoredAccessPermissionOptions
    .map((option) => option.value)
    .filter((value) => next.has(value))
    .join("");
}

export function serializeGCSBindings(bindings: GCSBindingDraft[]): BucketAccessBinding[] {
  return bindings.map((binding, index) => {
    const role = binding.role.trim();
    if (!role) {
      throw new Error(`Binding ${index + 1} role is required.`);
    }
    const members = parseLineSeparatedValues(binding.membersText);
    let condition: BucketAccessBindingCondition | undefined;
    if (binding.conditionEnabled) {
      if (binding.unsupportedConditionJSON.trim()) {
        throw new Error(
          `Binding ${index + 1} condition contains unsupported keys. Turn the condition off to clear it, then recreate it with title, description, and expression fields only.`,
        );
      }
      const title = binding.conditionTitle.trim();
      const description = binding.conditionDescription.trim();
      const expression = binding.conditionExpression.trim();
      if (!title) {
        throw new Error(`Binding ${index + 1} condition title is required.`);
      }
      if (!expression) {
        throw new Error(`Binding ${index + 1} condition expression is required.`);
      }
      condition = {
        title,
        expression,
        ...(description ? { description } : {}),
      } as BucketAccessBindingCondition;
    }

    return {
      role,
      ...(members.length > 0 ? { members } : {}),
      ...(condition !== undefined ? { condition } : {}),
    };
  });
}

export function serializeAzureStoredAccessPolicies(
  policies: AzureStoredAccessPolicyDraft[],
) {
  if (policies.length > 5) {
    throw new Error("Azure stored access policies are limited to five entries.");
  }
  return policies.map((policy, index) => {
    const id = policy.id.trim();
    if (!id) {
      throw new Error(`Stored access policy ${index + 1} identifier is required.`);
    }
    const start = policy.start.trim();
    const expiry = policy.expiry.trim();
    const permission = normalizeAzureStoredAccessPermissions(policy.permission);
    return {
      id,
      ...(start ? { start } : {}),
      ...(expiry ? { expiry } : {}),
      ...(permission ? { permission } : {}),
    };
  });
}

export function formatOptionalDays(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? String(value)
    : "";
}

export function normalizeAzureImmutabilityMode(
  value?: string,
): "unlocked" | "locked" {
  return value?.trim().toLowerCase() === "locked" ? "locked" : "unlocked";
}

export function parsePositiveDays(value: string, label: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a whole number greater than zero.`);
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return parsed;
}

function normalizeLifecycleText(governance: BucketGovernanceView): string {
  if (Array.isArray(governance.lifecycle?.rules)) {
    return JSON.stringify(governance.lifecycle.rules, null, 2);
  }
  return "[]";
}

export function buildGovernanceDraft(
  governance: BucketGovernanceView,
): BucketGovernanceDraft {
  return {
    publicAccessBlock:
      governance.publicExposure?.blockPublicAccess ?? fallbackPublicAccessBlock,
    objectOwnership:
      governance.access?.objectOwnership?.mode ?? "bucket_owner_enforced",
    versioningStatus:
      governance.versioning?.status === "suspended" ? "suspended" : "enabled",
    encryptionMode:
      governance.encryption?.mode === "sse_kms" ? "sse_kms" : "sse_s3",
    kmsKeyId: governance.encryption?.kmsKeyId ?? "",
    lifecycleText: normalizeLifecycleText(governance),
  };
}

export function buildGCSDraft(governance: BucketGovernanceView): GCSGovernanceDraft {
  return {
    publicMode:
      governance.publicExposure?.mode === "public" ? "public" : "private",
    publicAccessPrevention:
      governance.publicExposure?.publicAccessPrevention === true,
    etag: governance.access?.etag ?? "",
    bindings: Array.isArray(governance.access?.bindings)
      ? governance.access.bindings.map((binding) => ({
          role: binding.role ?? "",
          membersText: Array.isArray(binding.members)
            ? binding.members.join("\n")
            : "",
          ...buildGCSConditionDraft(binding.condition),
        }))
      : [],
    uniformAccess: governance.protection?.uniformAccess === true,
    versioningStatus:
      governance.versioning?.status === "enabled" ? "enabled" : "disabled",
    retentionEnabled: governance.protection?.retention?.enabled === true,
    retentionDays: formatOptionalDays(governance.protection?.retention?.days),
  };
}

export function buildAzureDraft(
  governance: BucketGovernanceView,
): AzureGovernanceDraft {
  const mode = governance.publicExposure?.visibility || governance.publicExposure?.mode;
  const immutability =
    governance.protection?.immutability as AzureImmutabilityView | undefined;
  return {
    publicMode:
      mode === "blob" || mode === "container" ? mode : "private",
    storedAccessPolicies: Array.isArray(governance.access?.storedAccessPolicies)
      ? governance.access.storedAccessPolicies.map((policy) => ({
          id: policy.id ?? "",
          start: policy.start ?? "",
          expiry: policy.expiry ?? "",
          permission: normalizeAzureStoredAccessPermissions(
            policy.permission ?? "",
          ),
        }))
      : [],
    versioningStatus:
      governance.versioning?.status === "enabled" ? "enabled" : "disabled",
    softDeleteEnabled: governance.protection?.softDelete?.enabled === true,
    softDeleteDays: formatOptionalDays(governance.protection?.softDelete?.days),
    immutabilityEnabled: immutability?.enabled === true,
    immutabilityDays: formatOptionalDays(immutability?.days),
    immutabilityMode: normalizeAzureImmutabilityMode(immutability?.mode),
    immutabilityEditable: immutability?.editable !== false,
    legalHold: immutability?.legalHold === true,
    allowProtectedAppendWrites:
      immutability?.allowProtectedAppendWrites === true,
    allowProtectedAppendWritesAll:
      immutability?.allowProtectedAppendWritesAll === true,
  };
}

export function buildOCIDraft(governance: BucketGovernanceView): OCIGovernanceDraft {
  const visibility = governance.publicExposure?.visibility;
  const retention = governance.protection?.retention as OCIRetentionView | undefined;
  const retentionRules =
    Array.isArray(retention?.rules) && retention.rules.length > 0
      ? retention.rules.map((rule, index) => ({
          id: rule.id ?? "",
          displayName: rule.displayName ?? `Retention Rule ${index + 1}`,
          days: formatOptionalDays(rule.days),
          locked: rule.locked === true,
          timeModified: rule.timeModified ?? "",
        }))
      : retention?.enabled && retention.days
        ? [
            {
              id: "",
              displayName: "Retention Rule 1",
              days: formatOptionalDays(retention.days),
              locked: retention.locked === true,
              timeModified: "",
            },
          ]
        : [];
  return {
    visibility:
      visibility === "object_read" || visibility === "object_read_without_list"
        ? visibility
        : "private",
    versioningStatus:
      governance.versioning?.status === "enabled" ? "enabled" : "disabled",
    retentionRules,
  };
}

export function buildOCISharingDraft(
  governance: BucketGovernanceView,
): OCIPreauthenticatedRequestDraft[] {
  const sharing = (governance as BucketGovernanceView & { sharing?: OCISharingView })
    .sharing;
  return Array.isArray(sharing?.preauthenticatedRequests)
    ? sharing.preauthenticatedRequests.map((item) => ({
        id: item.id ?? "",
        name: item.name ?? "",
        accessType:
          item.accessType === "AnyObjectWrite" ||
          item.accessType === "AnyObjectReadWrite"
            ? item.accessType
            : "AnyObjectRead",
        bucketListingAction:
          item.bucketListingAction === "ListObjects" ? "ListObjects" : "Deny",
        objectName: item.objectName ?? "",
        timeCreated: item.timeCreated ?? "",
        timeExpires: item.timeExpires ?? "",
        accessUri: item.accessUri ?? "",
      }))
    : [];
}

export function buildGovernanceDraftKey(
  bucket: string,
  governance: BucketGovernanceView,
): string {
  return `${bucket}:${JSON.stringify(governance)}`;
}

export function extractAdvancedPolicy(
  governance: AdvancedPolicyCarrier,
): BucketAdvancedView | undefined {
  return governance.advanced ?? governance.access?.advanced;
}
