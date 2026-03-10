import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Grid, Input, Tag, Typography, message } from "antd";
import { useMemo, useState, type ReactNode } from "react";

import { APIClient } from "../../api/client";
import type {
  BucketAccessBinding,
  BucketAccessPutRequest,
  BucketAdvancedView,
  BucketBlockPublicAccess,
  BucketEncryptionMode,
  BucketEncryptionPutRequest,
  BucketGovernanceView,
  BucketLifecyclePutRequest,
  BucketObjectOwnershipMode,
  BucketProtectionPutRequest,
  BucketPublicExposureMode,
  BucketStoredAccessPolicy,
  BucketVersioningPutRequest,
  Profile,
} from "../../api/types";
import { DialogModal } from "../../components/DialogModal";
import { FormField } from "../../components/FormField";
import { NativeSelect } from "../../components/NativeSelect";
import { OverlaySheet } from "../../components/OverlaySheet";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { formatErrorWithHint as formatErr } from "../../lib/errors";
import styles from "./BucketGovernanceModal.module.css";

const fallbackPublicAccessBlock: BucketBlockPublicAccess = {
  blockPublicAcls: true,
  ignorePublicAcls: true,
  blockPublicPolicy: true,
  restrictPublicBuckets: true,
};

type GovernanceControlsCommonProps = {
  api: APIClient;
  profileId: string;
  provider: Profile["provider"];
  bucket: string;
  governance: BucketGovernanceView;
  isFetching: boolean;
  isMobile: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
  onClose: () => void;
  onOpenAdvancedPolicy?: (bucket: string) => void;
};

type GCSBindingDraft = {
  role: string;
  membersText: string;
  conditionEnabled: boolean;
  conditionTitle: string;
  conditionDescription: string;
  conditionExpression: string;
  unsupportedConditionJSON: string;
};

type AzureStoredAccessPolicyDraft = {
  id: string;
  start: string;
  expiry: string;
  permission: string;
};

type BucketGovernanceDraft = {
  publicAccessBlock: BucketBlockPublicAccess;
  objectOwnership: BucketObjectOwnershipMode;
  versioningStatus: "enabled" | "suspended";
  encryptionMode: "sse_s3" | "sse_kms";
  kmsKeyId: string;
  lifecycleText: string;
};

type GCSGovernanceDraft = {
  publicMode: Extract<BucketPublicExposureMode, "private" | "public">;
  publicAccessPrevention: boolean;
  etag: string;
  bindings: GCSBindingDraft[];
  uniformAccess: boolean;
  versioningStatus: "enabled" | "disabled";
  retentionEnabled: boolean;
  retentionDays: string;
};

type AzureGovernanceDraft = {
  publicMode: Extract<BucketPublicExposureMode, "private" | "blob" | "container">;
  storedAccessPolicies: AzureStoredAccessPolicyDraft[];
  versioningStatus: "enabled" | "disabled";
  softDeleteEnabled: boolean;
  softDeleteDays: string;
  immutabilityEnabled: boolean;
  immutabilityDays: string;
  immutabilityMode: "unlocked" | "locked";
  immutabilityEditable: boolean;
  legalHold: boolean;
  allowProtectedAppendWrites: boolean;
  allowProtectedAppendWritesAll: boolean;
};

type OCIGovernanceDraft = {
  visibility: "private" | "object_read" | "object_read_without_list";
  versioningStatus: "enabled" | "disabled";
  retentionRules: OCIRetentionRuleDraft[];
};

type AzureImmutabilityView = {
  enabled: boolean;
  mode?: string;
  until?: string;
  days?: number;
  etag?: string;
  editable?: boolean;
  legalHold?: boolean;
  allowProtectedAppendWrites?: boolean;
  allowProtectedAppendWritesAll?: boolean;
};

type BucketProtectionPutRequestWithAzureImmutability =
  BucketProtectionPutRequest & {
    immutability?: AzureImmutabilityView;
  };

type OCIRetentionRuleView = {
  id?: string;
  displayName?: string;
  days?: number;
  locked?: boolean;
  timeModified?: string;
};

type OCIRetentionView = {
  enabled: boolean;
  days?: number;
  locked?: boolean;
  rules?: OCIRetentionRuleView[];
};

type OCIRetentionRuleDraft = {
  id: string;
  displayName: string;
  days: string;
  locked: boolean;
  timeModified: string;
};

type BucketProtectionPutRequestWithOCIRetention = BucketProtectionPutRequest & {
  retention?: OCIRetentionView;
};

type OCISharingView = {
  provider?: string;
  bucket?: string;
  preauthenticatedSupport?: boolean;
  preauthenticatedRequests?: OCIPreauthenticatedRequestDraft[];
  warnings?: string[];
};

type OCIPreauthenticatedRequestDraft = {
  id: string;
  name: string;
  accessType: "AnyObjectRead" | "AnyObjectWrite" | "AnyObjectReadWrite";
  bucketListingAction: "Deny" | "ListObjects";
  objectName: string;
  timeCreated: string;
  timeExpires: string;
  accessUri: string;
};

type BucketSharingPutClientRequest = {
  preauthenticatedRequests?: Array<{
    id?: string;
    name?: string;
    accessType?: string;
    bucketListingAction?: string;
    objectName?: string;
    timeCreated?: string;
    timeExpires?: string;
    accessUri?: string;
  }>;
};

const azureStoredAccessPermissionOptions = [
  { value: "r", label: "Read" },
  { value: "w", label: "Write" },
  { value: "d", label: "Delete" },
  { value: "l", label: "List" },
  { value: "a", label: "Add" },
  { value: "c", label: "Create" },
  { value: "u", label: "Update" },
  { value: "p", label: "Process" },
] as const;

type AzureStoredAccessPermission =
  (typeof azureStoredAccessPermissionOptions)[number]["value"];

function BucketGovernanceDialogShell(props: {
  mobile: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const shellContent = (
    <div
      className={props.mobile ? styles.mobileShell : styles.desktopShell}
      data-testid={
        props.mobile
          ? "bucket-governance-mobile-shell"
          : "bucket-governance-desktop-shell"
      }
    >
      {props.children}
    </div>
  );

  if (props.mobile) {
    return (
      <OverlaySheet
        open
        onClose={props.onClose}
        title={props.title}
        placement="right"
        width="100vw"
        footer={props.footer}
      >
        {shellContent}
      </OverlaySheet>
    );
  }

  return (
    <DialogModal
      open
      title={props.title}
      onClose={props.onClose}
      footer={props.footer ?? null}
      width="min(96vw, 1080px)"
    >
      {shellContent}
    </DialogModal>
  );
}

function extractWarningList(view?: { warnings?: string[] } | null): string[] {
  return Array.isArray(view?.warnings)
    ? view.warnings.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function renderWarningStack(warnings: string[]) {
  if (warnings.length === 0) return null;
  return (
    <div className={styles.warningStack}>
      {warnings.map((warning) => (
        <Alert key={warning} type="warning" showIcon title={warning} />
      ))}
    </div>
  );
}

function parseJSONArray<T>(value: string, label: string): T[] {
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

function createEmptyGCSBindingDraft(): GCSBindingDraft {
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

function buildGCSConditionDraft(value: unknown): Pick<
  GCSBindingDraft,
  | "conditionEnabled"
  | "conditionTitle"
  | "conditionDescription"
  | "conditionExpression"
  | "unsupportedConditionJSON"
> {
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

function createEmptyAzureStoredAccessPolicyDraft(): AzureStoredAccessPolicyDraft {
  return {
    id: "",
    start: "",
    expiry: "",
    permission: "",
  };
}

function normalizeAzureStoredAccessPermissions(value: string): string {
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
    .filter((value) => selected.has(value))
    .join("");
}

function toggleAzureStoredAccessPermission(
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

function serializeGCSBindings(bindings: GCSBindingDraft[]): BucketAccessBinding[] {
  return bindings.map((binding, index) => {
    const role = binding.role.trim();
    if (!role) {
      throw new Error(`Binding ${index + 1} role is required.`);
    }
    const members = parseLineSeparatedValues(binding.membersText);
    let condition: BucketAccessBinding["condition"] | undefined;
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
        throw new Error(
          `Binding ${index + 1} condition expression is required.`,
        );
      }
      condition = {
        title,
        expression,
        ...(description ? { description } : {}),
      } as BucketAccessBinding["condition"];
    }

    return {
      role,
      ...(members.length > 0 ? { members } : {}),
      ...(condition !== undefined ? { condition } : {}),
    };
  });
}

function serializeAzureStoredAccessPolicies(
  policies: AzureStoredAccessPolicyDraft[],
): BucketStoredAccessPolicy[] {
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

function formatOptionalDays(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? String(value)
    : "";
}

function normalizeAzureImmutabilityMode(
  value?: string,
): "unlocked" | "locked" {
  return value?.trim().toLowerCase() === "locked" ? "locked" : "unlocked";
}

function parsePositiveDays(value: string, label: string): number {
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

function buildGovernanceDraft(
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

function buildGCSDraft(governance: BucketGovernanceView): GCSGovernanceDraft {
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

function buildAzureDraft(
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

function buildOCIDraft(governance: BucketGovernanceView): OCIGovernanceDraft {
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

function buildOCISharingDraft(
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

function buildGovernanceDraftKey(
  bucket: string,
  governance: BucketGovernanceView,
): string {
  return `${bucket}:${JSON.stringify(governance)}`;
}

function extractAdvancedPolicy(
  governance: BucketGovernanceView,
): BucketAdvancedView | undefined {
  return governance.advanced ?? governance.access?.advanced;
}

function GovernanceSummaryCard(props: {
  title: string;
  description: string;
  tags: string[];
  isRefreshing: boolean;
}) {
  return (
    <section className={styles.summaryCard}>
      <div className={styles.summaryHeader}>
        <div className={styles.summaryCopy}>
          <Typography.Text strong>{props.title}</Typography.Text>
          <Typography.Text type="secondary">
            {props.description}
          </Typography.Text>
        </div>
        {props.isRefreshing ? <Tag color="processing">Refreshing</Tag> : null}
      </div>
      {props.tags.length > 0 ? (
        <div className={styles.tagRow}>
          {props.tags.map((item) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AdvancedPolicySection(props: {
  bucket: string;
  advancedPolicy?: BucketAdvancedView;
  onOpenAdvancedPolicy?: (bucket: string) => void;
}) {
  if (!props.advancedPolicy?.rawPolicySupported) return null;

  return (
    <section
      className={`${styles.sectionCard} ${styles.sectionWide}`}
      data-testid="bucket-governance-advanced-policy"
    >
      <div className={styles.sectionHeader}>
        <div className={styles.sectionCopy}>
          <Typography.Text strong>Advanced Policy</Typography.Text>
          <Typography.Text type="secondary">
            Use raw policy editing for statements that do not fit the typed
            controls surface.
          </Typography.Text>
        </div>
        <Button
          onClick={() => props.onOpenAdvancedPolicy?.(props.bucket)}
          disabled={
            !props.onOpenAdvancedPolicy || !props.advancedPolicy.rawPolicyEditable
          }
        >
          Open Policy
        </Button>
      </div>
      <div className={styles.sectionBody}>
        <div className={styles.tagRow}>
          <Tag color={props.advancedPolicy.rawPolicyEditable ? "blue" : "default"}>
            {props.advancedPolicy.rawPolicyEditable
              ? "Editable raw policy"
              : "Read-only raw policy"}
          </Tag>
          <Tag>
            {props.advancedPolicy.rawPolicy
              ? "Policy document detected"
              : "No raw policy document loaded in summary"}
          </Tag>
        </div>
      </div>
    </section>
  );
}

function useInvalidateGovernance(
  queryClient: ReturnType<typeof useQueryClient>,
  profileId: string,
  bucket: string,
) {
  return async () => {
    await queryClient.invalidateQueries({
      queryKey: ["bucketGovernance", profileId, bucket],
    });
  };
}

function useInvalidateLinkedBucketState(
  queryClient: ReturnType<typeof useQueryClient>,
  profileId: string,
  bucket: string,
  provider: Profile["provider"],
) {
  const invalidateGovernance = useInvalidateGovernance(
    queryClient,
    profileId,
    bucket,
  );

  return async () => {
    await invalidateGovernance();
    if (provider === "gcp_gcs" || provider === "azure_blob") {
      await queryClient.invalidateQueries({
        queryKey: ["bucketPolicy", profileId, bucket],
      });
    }
  };
}

function BucketGovernanceAWSControls(props: GovernanceControlsCommonProps) {
  const draft = buildGovernanceDraft(props.governance);
  const [publicAccessBlock, setPublicAccessBlock] =
    useState<BucketBlockPublicAccess>(draft.publicAccessBlock);
  const [objectOwnership, setObjectOwnership] =
    useState<BucketObjectOwnershipMode>(draft.objectOwnership);
  const [versioningStatus, setVersioningStatus] = useState<
    "enabled" | "suspended"
  >(draft.versioningStatus);
  const [encryptionMode, setEncryptionMode] = useState<"sse_s3" | "sse_kms">(
    draft.encryptionMode,
  );
  const [kmsKeyId, setKmsKeyId] = useState(draft.kmsKeyId);
  const [lifecycleText, setLifecycleText] = useState(draft.lifecycleText);

  const invalidateGovernance = useInvalidateLinkedBucketState(
    props.queryClient,
    props.profileId,
    props.bucket,
    props.provider,
  );

  const publicExposureMutation = useMutation({
    mutationFn: () =>
      props.api.putBucketPublicExposure(props.profileId, props.bucket, {
        blockPublicAccess: publicAccessBlock,
      }),
    onSuccess: async () => {
      message.success("Public exposure updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const accessMutation = useMutation({
    mutationFn: () => {
      const req: BucketAccessPutRequest = { objectOwnership };
      return props.api.putBucketAccess(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Object ownership updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const versioningMutation = useMutation({
    mutationFn: () => {
      const req: BucketVersioningPutRequest = { status: versioningStatus };
      return props.api.putBucketVersioning(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Versioning updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const encryptionMutation = useMutation({
    mutationFn: () => {
      const req: BucketEncryptionPutRequest = {
        mode: encryptionMode,
        kmsKeyId:
          encryptionMode === "sse_kms" && kmsKeyId.trim()
            ? kmsKeyId.trim()
            : undefined,
      };
      return props.api.putBucketEncryption(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Default encryption updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const lifecycleMutation = useMutation({
    mutationFn: () => {
      const rules = parseJSONArray<BucketLifecyclePutRequest["rules"][number]>(
        lifecycleText,
        "Lifecycle rules",
      );
      return props.api.putBucketLifecycle(props.profileId, props.bucket, {
        rules,
      });
    },
    onSuccess: async () => {
      message.success("Lifecycle rules updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const anyMutationPending =
    publicExposureMutation.isPending ||
    accessMutation.isPending ||
    versioningMutation.isPending ||
    encryptionMutation.isPending ||
    lifecycleMutation.isPending;

  const advancedPolicy = extractAdvancedPolicy(props.governance);
  const headerTags = useMemo(() => {
    const items: string[] = [];
    if (props.governance.publicExposure?.mode) {
      items.push(`Exposure: ${props.governance.publicExposure.mode}`);
    }
    if (props.governance.versioning?.status) {
      items.push(`Versioning: ${props.governance.versioning.status}`);
    }
    if (props.governance.encryption?.mode) {
      items.push(`Encryption: ${props.governance.encryption.mode}`);
    }
    return items;
  }, [props.governance]);

  return (
    <BucketGovernanceDialogShell
      mobile={props.isMobile}
      title={`Controls: ${props.bucket}`}
      onClose={props.onClose}
      footer={
        <div className={styles.footerActions}>
          <Button onClick={props.onClose}>Close</Button>
        </div>
      }
    >
      <GovernanceSummaryCard
        title="AWS Controls"
        description="Manage the recommended S3 control surface directly. Advanced raw policy editing remains available under Policy."
        tags={headerTags}
        isRefreshing={props.isFetching || anyMutationPending}
      />

      {renderWarningStack(extractWarningList(props.governance))}

      <AdvancedPolicySection
        bucket={props.bucket}
        advancedPolicy={advancedPolicy}
        onOpenAdvancedPolicy={props.onOpenAdvancedPolicy}
      />

      <div className={styles.grid}>
        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-public-exposure"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Public Exposure</Typography.Text>
              <Typography.Text type="secondary">
                Control the four Block Public Access flags directly.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={publicExposureMutation.isPending}
              onClick={() => publicExposureMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.toggleList}>
              {(
                [
                  ["blockPublicAcls", "Block public ACLs"],
                  ["ignorePublicAcls", "Ignore public ACLs"],
                  ["blockPublicPolicy", "Block public bucket policies"],
                  ["restrictPublicBuckets", "Restrict public buckets"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className={styles.toggleRow}>
                  <div className={styles.toggleCopy}>
                    <Typography.Text>{label}</Typography.Text>
                  </div>
                  <ToggleSwitch
                    checked={publicAccessBlock[key]}
                    onChange={(checked) =>
                      setPublicAccessBlock((current) => ({
                        ...current,
                        [key]: checked,
                      }))
                    }
                    ariaLabel={label}
                  />
                </div>
              ))}
            </div>
            {renderWarningStack(
              extractWarningList(props.governance.publicExposure),
            )}
          </div>
        </section>

        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-access"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Object Ownership</Typography.Text>
              <Typography.Text type="secondary">
                Prefer bucket-owner-enforced ownership unless ACL
                interoperability is required.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={accessMutation.isPending}
              onClick={() => accessMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <FormField
              label="Ownership mode"
              htmlFor="bucket-governance-object-ownership"
            >
              <NativeSelect
                id="bucket-governance-object-ownership"
                value={objectOwnership}
                onChange={(value) =>
                  setObjectOwnership(value as BucketObjectOwnershipMode)
                }
                options={[
                  {
                    value: "bucket_owner_enforced",
                    label: "Bucket owner enforced",
                  },
                  {
                    value: "bucket_owner_preferred",
                    label: "Bucket owner preferred",
                  },
                  { value: "object_writer", label: "Object writer" },
                ]}
                ariaLabel="Ownership mode"
              />
            </FormField>
            {renderWarningStack(extractWarningList(props.governance.access))}
          </div>
        </section>

        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-versioning"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Versioning</Typography.Text>
              <Typography.Text type="secondary">
                Choose whether new object versions are retained.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={versioningMutation.isPending}
              onClick={() => versioningMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <FormField
              label="Status"
              htmlFor="bucket-governance-versioning-status"
            >
              <NativeSelect
                id="bucket-governance-versioning-status"
                value={versioningStatus}
                onChange={(value) =>
                  setVersioningStatus(value as "enabled" | "suspended")
                }
                options={[
                  { value: "enabled", label: "Enabled" },
                  { value: "suspended", label: "Suspended" },
                ]}
                ariaLabel="Versioning status"
              />
            </FormField>
            {renderWarningStack(extractWarningList(props.governance.versioning))}
          </div>
        </section>

        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-encryption"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Default Encryption</Typography.Text>
              <Typography.Text type="secondary">
                Use SSE-S3 as a baseline or promote to SSE-KMS for managed key
                controls.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={encryptionMutation.isPending}
              onClick={() => encryptionMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <FormField
              label="Encryption mode"
              htmlFor="bucket-governance-encryption-mode"
            >
              <NativeSelect
                id="bucket-governance-encryption-mode"
                value={encryptionMode}
                onChange={(value) =>
                  setEncryptionMode(
                    value as Extract<
                      BucketEncryptionMode,
                      "sse_s3" | "sse_kms"
                    >,
                  )
                }
                options={[
                  { value: "sse_s3", label: "SSE-S3" },
                  { value: "sse_kms", label: "SSE-KMS" },
                ]}
                ariaLabel="Encryption mode"
              />
            </FormField>
            {encryptionMode === "sse_kms" ? (
              <FormField
                label="KMS key ID (optional)"
                htmlFor="bucket-governance-kms-key-id"
                extra="Leave blank to use the default AWS managed KMS key."
              >
                <Input
                  id="bucket-governance-kms-key-id"
                  value={kmsKeyId}
                  onChange={(e) => setKmsKeyId(e.target.value)}
                  placeholder="alias/project-bucket-key"
                  autoComplete="off"
                />
              </FormField>
            ) : null}
            {renderWarningStack(extractWarningList(props.governance.encryption))}
          </div>
        </section>

        <section
          className={`${styles.sectionCard} ${styles.sectionWide}`}
          data-testid="bucket-governance-lifecycle"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Lifecycle</Typography.Text>
              <Typography.Text type="secondary">
                Edit AWS lifecycle rules as JSON. Use an empty array to clear
                rules.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={lifecycleMutation.isPending}
              onClick={() => lifecycleMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <FormField
              label="Lifecycle rules JSON"
              htmlFor="bucket-governance-lifecycle-json"
            >
              <Input.TextArea
                id="bucket-governance-lifecycle-json"
                className={styles.jsonArea}
                value={lifecycleText}
                onChange={(e) => setLifecycleText(e.target.value)}
                rows={10}
              />
            </FormField>
            {renderWarningStack(extractWarningList(props.governance.lifecycle))}
          </div>
        </section>
      </div>
    </BucketGovernanceDialogShell>
  );
}

function BucketGovernanceGCSControls(props: GovernanceControlsCommonProps) {
  const draft = buildGCSDraft(props.governance);
  const [publicMode, setPublicMode] = useState<
    Extract<BucketPublicExposureMode, "private" | "public">
  >(draft.publicMode);
  const [publicAccessPrevention, setPublicAccessPrevention] = useState(
    draft.publicAccessPrevention,
  );
  const [etag, setETag] = useState(draft.etag);
  const [bindings, setBindings] = useState<GCSBindingDraft[]>(draft.bindings);
  const [uniformAccess, setUniformAccess] = useState(draft.uniformAccess);
  const [versioningStatus, setVersioningStatus] = useState<
    "enabled" | "disabled"
  >(draft.versioningStatus);
  const [retentionEnabled, setRetentionEnabled] = useState(
    draft.retentionEnabled,
  );
  const [retentionDays, setRetentionDays] = useState(draft.retentionDays);
  const retentionLocked = props.governance.protection?.retention?.locked === true;

  const invalidateGovernance = useInvalidateLinkedBucketState(
    props.queryClient,
    props.profileId,
    props.bucket,
    props.provider,
  );

  const publicExposureMutation = useMutation({
    mutationFn: () =>
      props.api.putBucketPublicExposure(props.profileId, props.bucket, {
        mode: publicMode,
        publicAccessPrevention,
      }),
    onSuccess: async () => {
      message.success("Public exposure updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const accessMutation = useMutation({
    mutationFn: () => {
      const req: BucketAccessPutRequest = {
        bindings: serializeGCSBindings(bindings),
        etag: etag.trim() || undefined,
      };
      return props.api.putBucketAccess(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("IAM bindings updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const protectionMutation = useMutation({
    mutationFn: () => {
      const req: BucketProtectionPutRequest = {
        uniformAccess,
      };
      return props.api.putBucketProtection(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Uniform access updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const retentionMutation = useMutation({
    mutationFn: () => {
      const req: BucketProtectionPutRequest = {
        retention: retentionEnabled
          ? {
              enabled: true,
              days: parsePositiveDays(retentionDays, "Retention days"),
            }
          : {
              enabled: false,
            },
      };
      return props.api.putBucketProtection(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Retention updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const versioningMutation = useMutation({
    mutationFn: () => {
      const req: BucketVersioningPutRequest = { status: versioningStatus };
      return props.api.putBucketVersioning(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Versioning updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const headerTags = useMemo(() => {
    const items: string[] = [];
    items.push(`Exposure: ${props.governance.publicExposure?.mode ?? publicMode}`);
    items.push(`Bindings: ${props.governance.access?.bindings?.length ?? 0}`);
    items.push(
      `PAP: ${
        props.governance.publicExposure?.publicAccessPrevention ? "enforced" : "off"
      }`,
    );
    items.push(
      `Uniform access: ${props.governance.protection?.uniformAccess ? "on" : "off"}`,
    );
    items.push(
      `Versioning: ${props.governance.versioning?.status ?? versioningStatus}`,
    );
    if (props.governance.access?.etag) {
      items.push("ETag preserved");
    }
    return items;
  }, [props.governance, publicMode, versioningStatus]);

  return (
    <BucketGovernanceDialogShell
      mobile={props.isMobile}
      title={`Controls: ${props.bucket}`}
      onClose={props.onClose}
      footer={
        <div className={styles.footerActions}>
          <Button onClick={props.onClose}>Close</Button>
        </div>
      }
    >
      <GovernanceSummaryCard
        title="GCS Controls"
        description="Manage IAM exposure, uniform bucket-level access, versioning, and retention from the typed GCS controls surface."
        tags={headerTags}
        isRefreshing={
          props.isFetching ||
          publicExposureMutation.isPending ||
          accessMutation.isPending ||
          protectionMutation.isPending ||
          retentionMutation.isPending ||
          versioningMutation.isPending
        }
      />

      {renderWarningStack(extractWarningList(props.governance))}

      <AdvancedPolicySection
        bucket={props.bucket}
        advancedPolicy={extractAdvancedPolicy(props.governance)}
        onOpenAdvancedPolicy={props.onOpenAdvancedPolicy}
      />

      <div className={styles.grid}>
        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-public-exposure"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Public Exposure</Typography.Text>
              <Typography.Text type="secondary">
                Toggle whether public IAM members are present on the bucket.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={publicExposureMutation.isPending}
              onClick={() => publicExposureMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <FormField
              label="Access mode"
              htmlFor="bucket-governance-gcs-public-mode"
              extra="Public enables anonymous object viewer access through IAM bindings."
            >
              <NativeSelect
                id="bucket-governance-gcs-public-mode"
                value={publicMode}
                onChange={(value) =>
                  setPublicMode(
                    (value === "public" ? "public" : "private") as Extract<
                      BucketPublicExposureMode,
                      "private" | "public"
                    >,
                  )
                }
                options={[
                  { value: "private", label: "Private" },
                  { value: "public", label: "Public" },
                ]}
                ariaLabel="GCS public exposure mode"
              />
            </FormField>
            <div className={styles.toggleRow}>
              <div className={styles.toggleCopy}>
                <Typography.Text>Public Access Prevention</Typography.Text>
                <Typography.Text type="secondary">
                  Enforce PAP to block public access even if IAM grants it.
                </Typography.Text>
              </div>
              <ToggleSwitch
                checked={publicAccessPrevention}
                onChange={setPublicAccessPrevention}
                ariaLabel="GCS public access prevention"
              />
            </div>
            {renderWarningStack(
              extractWarningList(props.governance.publicExposure),
            )}
          </div>
        </section>

        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-protection"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Protection</Typography.Text>
              <Typography.Text type="secondary">
                Uniform bucket-level access disables object ACLs and keeps all
                authorization on IAM bindings.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={protectionMutation.isPending}
              onClick={() => protectionMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.toggleRow}>
              <div className={styles.toggleCopy}>
                <Typography.Text>Uniform bucket-level access</Typography.Text>
                <Typography.Text type="secondary">
                  Recommended for consistent IAM-only authorization.
                </Typography.Text>
              </div>
              <ToggleSwitch
                checked={uniformAccess}
                onChange={setUniformAccess}
                ariaLabel="GCS uniform bucket-level access"
              />
            </div>
            {renderWarningStack(extractWarningList(props.governance.protection))}
          </div>
        </section>

        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-versioning"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Versioning</Typography.Text>
              <Typography.Text type="secondary">
                Enable version history for overwritten or deleted objects.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={versioningMutation.isPending}
              onClick={() => versioningMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <FormField
              label="Status"
              htmlFor="bucket-governance-gcs-versioning-status"
            >
              <NativeSelect
                id="bucket-governance-gcs-versioning-status"
                value={versioningStatus}
                onChange={(value) =>
                  setVersioningStatus(
                    value === "enabled" ? "enabled" : "disabled",
                  )
                }
                options={[
                  { value: "enabled", label: "Enabled" },
                  { value: "disabled", label: "Disabled" },
                ]}
                ariaLabel="GCS versioning status"
              />
            </FormField>
            {renderWarningStack(extractWarningList(props.governance.versioning))}
          </div>
        </section>

        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-retention"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Retention</Typography.Text>
              <Typography.Text type="secondary">
                Apply a bucket retention period in days. Locked retention is
                displayed read-only here.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={retentionMutation.isPending}
              onClick={() => retentionMutation.mutate()}
              disabled={retentionLocked}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.toggleRow}>
              <div className={styles.toggleCopy}>
                <Typography.Text>Retention enabled</Typography.Text>
                <Typography.Text type="secondary">
                  Disable to clear retention when the policy is not locked.
                </Typography.Text>
              </div>
              <ToggleSwitch
                checked={retentionEnabled}
                onChange={setRetentionEnabled}
                disabled={retentionLocked}
                ariaLabel="GCS retention enabled"
              />
            </div>
            <FormField
              label="Retention days"
              htmlFor="bucket-governance-gcs-retention-days"
              extra="Required when retention is enabled."
            >
              <Input
                id="bucket-governance-gcs-retention-days"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                disabled={!retentionEnabled || retentionLocked}
                inputMode="numeric"
                autoComplete="off"
              />
            </FormField>
            {props.governance.protection?.retention?.retainUntil ? (
              <Tag>Retain until {props.governance.protection.retention.retainUntil}</Tag>
            ) : null}
            {retentionLocked ? <Tag color="warning">Locked retention</Tag> : null}
            {renderWarningStack(extractWarningList(props.governance.protection))}
          </div>
        </section>

        <section
          className={`${styles.sectionCard} ${styles.sectionWide}`}
          data-testid="bucket-governance-access"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>IAM Bindings</Typography.Text>
              <Typography.Text type="secondary">
                Edit bindings one entry at a time. Members are one per line,
                while conditional expressions stay as optional JSON fragments.
              </Typography.Text>
            </div>
            <div className={styles.sectionActions}>
              <Button
                onClick={() =>
                  setBindings((current) => [
                    ...current,
                    createEmptyGCSBindingDraft(),
                  ])
                }
              >
                Add binding
              </Button>
              <Button
                type="primary"
                loading={accessMutation.isPending}
                onClick={() => accessMutation.mutate()}
              >
                Save
              </Button>
            </div>
          </div>
          <div className={styles.sectionBody}>
            <FormField
              label="Policy ETag"
              htmlFor="bucket-governance-gcs-etag"
              extra="Leave the current etag in place unless you intentionally want the backend to reuse the latest server value."
            >
              <Input
                id="bucket-governance-gcs-etag"
                value={etag}
                onChange={(e) => setETag(e.target.value)}
                autoComplete="off"
              />
            </FormField>
            {bindings.length === 0 ? (
              <Alert
                type="info"
                showIcon
                title="No IAM bindings configured"
                description="Add a binding to grant access, or leave the list empty and save to clear all bindings."
              />
            ) : null}
            <div className={styles.editorList}>
              {bindings.map((binding, index) => (
                <div
                  key={`gcs-binding-${index}`}
                  className={styles.editorCard}
                  data-testid="bucket-governance-gcs-binding-card"
                >
                  <div className={styles.editorCardHeader}>
                    <div className={styles.sectionCopy}>
                      <Typography.Text strong>
                        Binding {index + 1}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        Keep role names exact. Conditional bindings are passed
                        through as JSON.
                      </Typography.Text>
                    </div>
                    <Button
                      danger
                      onClick={() =>
                        setBindings((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <div className={styles.editorCardGrid}>
                    <FormField
                      label="Role"
                      htmlFor={`bucket-governance-gcs-role-${index}`}
                    >
                      <Input
                        id={`bucket-governance-gcs-role-${index}`}
                        value={binding.role}
                        onChange={(e) =>
                          setBindings((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, role: e.target.value }
                                : item,
                            ),
                          )
                        }
                        autoComplete="off"
                      />
                    </FormField>
                    <FormField
                      label="Members"
                      htmlFor={`bucket-governance-gcs-members-${index}`}
                      extra="One member per line, for example user:dev@example.com or allUsers."
                    >
                      <Input.TextArea
                        id={`bucket-governance-gcs-members-${index}`}
                        value={binding.membersText}
                        onChange={(e) =>
                          setBindings((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, membersText: e.target.value }
                                : item,
                            ),
                          )
                        }
                        rows={4}
                      />
                    </FormField>
                  </div>
                  <div className={styles.toggleRow}>
                    <div className={styles.toggleCopy}>
                      <Typography.Text>IAM condition</Typography.Text>
                      <Typography.Text type="secondary">
                        Use a typed CEL condition instead of raw JSON.
                      </Typography.Text>
                    </div>
                    <ToggleSwitch
                      checked={binding.conditionEnabled}
                      onChange={(checked) =>
                        setBindings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? checked
                                ? { ...item, conditionEnabled: true }
                                : {
                                    ...item,
                                    conditionEnabled: false,
                                    conditionTitle: "",
                                    conditionDescription: "",
                                    conditionExpression: "",
                                    unsupportedConditionJSON: "",
                                  }
                              : item,
                          ),
                        )
                      }
                      ariaLabel={`GCS binding condition ${index + 1}`}
                    />
                  </div>
                  {binding.conditionEnabled ? (
                    <>
                      {binding.unsupportedConditionJSON ? (
                        <Alert
                          type="warning"
                          showIcon
                          title="Unsupported IAM condition shape"
                          description="This condition includes keys outside the typed title, description, and expression fields. Turn the condition off to clear it, then recreate it with the structured editor."
                        />
                      ) : null}
                      <div className={styles.editorCardGrid}>
                        <FormField
                          label="Condition title"
                          htmlFor={`bucket-governance-gcs-condition-title-${index}`}
                        >
                          <Input
                            id={`bucket-governance-gcs-condition-title-${index}`}
                            value={binding.conditionTitle}
                            onChange={(e) =>
                              setBindings((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        conditionTitle: e.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                            autoComplete="off"
                          />
                        </FormField>
                        <FormField
                          label="Condition description (optional)"
                          htmlFor={`bucket-governance-gcs-condition-description-${index}`}
                        >
                          <Input
                            id={`bucket-governance-gcs-condition-description-${index}`}
                            value={binding.conditionDescription}
                            onChange={(e) =>
                              setBindings((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        conditionDescription: e.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                            autoComplete="off"
                          />
                        </FormField>
                        <FormField
                          label="Condition expression"
                          htmlFor={`bucket-governance-gcs-condition-expression-${index}`}
                          extra='Example: request.time < timestamp("2026-12-31T00:00:00Z")'
                        >
                          <Input.TextArea
                            id={`bucket-governance-gcs-condition-expression-${index}`}
                            value={binding.conditionExpression}
                            onChange={(e) =>
                              setBindings((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        conditionExpression: e.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                            rows={4}
                          />
                        </FormField>
                      </div>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
            {renderWarningStack(extractWarningList(props.governance.access))}
          </div>
        </section>
      </div>
    </BucketGovernanceDialogShell>
  );
}

function BucketGovernanceAzureControls(props: GovernanceControlsCommonProps) {
  const draft = buildAzureDraft(props.governance);
  const [publicMode, setPublicMode] = useState<
    Extract<BucketPublicExposureMode, "private" | "blob" | "container">
  >(draft.publicMode);
  const [storedAccessPolicies, setStoredAccessPolicies] = useState<
    AzureStoredAccessPolicyDraft[]
  >(
    draft.storedAccessPolicies,
  );
  const [versioningStatus, setVersioningStatus] = useState<
    "enabled" | "disabled"
  >(draft.versioningStatus);
  const [softDeleteEnabled, setSoftDeleteEnabled] = useState(
    draft.softDeleteEnabled,
  );
  const [softDeleteDays, setSoftDeleteDays] = useState(draft.softDeleteDays);
  const [immutabilityEnabled, setImmutabilityEnabled] = useState(
    draft.immutabilityEnabled,
  );
  const [immutabilityDays, setImmutabilityDays] = useState(
    draft.immutabilityDays,
  );
  const [immutabilityMode, setImmutabilityMode] = useState<
    "unlocked" | "locked"
  >(draft.immutabilityMode);
  const [allowProtectedAppendWrites, setAllowProtectedAppendWrites] = useState(
    draft.allowProtectedAppendWrites,
  );
  const [allowProtectedAppendWritesAll, setAllowProtectedAppendWritesAll] =
    useState(draft.allowProtectedAppendWritesAll);
  const immutability = props.governance.protection?.immutability as
    | AzureImmutabilityView
    | undefined;
  const immutabilityEditable = immutability?.editable !== false;
  const immutabilityLocked =
    normalizeAzureImmutabilityMode(immutability?.mode) === "locked";

  const invalidateGovernance = useInvalidateLinkedBucketState(
    props.queryClient,
    props.profileId,
    props.bucket,
    props.provider,
  );

  const publicExposureMutation = useMutation({
    mutationFn: () =>
      props.api.putBucketPublicExposure(props.profileId, props.bucket, {
        mode: publicMode,
        visibility: publicMode,
      }),
    onSuccess: async () => {
      message.success("Anonymous access updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const accessMutation = useMutation({
    mutationFn: () => {
      const req: BucketAccessPutRequest = {
        storedAccessPolicies:
          serializeAzureStoredAccessPolicies(storedAccessPolicies),
      };
      return props.api.putBucketAccess(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Stored access policies updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const protectionMutation = useMutation({
    mutationFn: () => {
      const req: BucketProtectionPutRequestWithAzureImmutability = {
        softDelete: softDeleteEnabled
          ? {
              enabled: true,
              days: parsePositiveDays(softDeleteDays, "Soft delete days"),
            }
          : {
              enabled: false,
            },
      };
      if (immutabilityEditable) {
        req.immutability = immutabilityEnabled
          ? {
              enabled: true,
              days: parsePositiveDays(
                immutabilityDays,
                "Container immutability days",
              ),
              mode: immutabilityMode,
              etag: immutability?.etag,
              allowProtectedAppendWrites:
                immutabilityMode === "unlocked" && allowProtectedAppendWrites,
              allowProtectedAppendWritesAll:
                immutabilityMode === "unlocked" &&
                allowProtectedAppendWritesAll,
            }
          : {
              enabled: false,
              etag: immutability?.etag,
            };
      }
      return props.api.putBucketProtection(
        props.profileId,
        props.bucket,
        req as BucketProtectionPutRequest,
      );
    },
    onSuccess: async () => {
      message.success("Protection updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const versioningMutation = useMutation({
    mutationFn: () => {
      const req: BucketVersioningPutRequest = { status: versioningStatus };
      return props.api.putBucketVersioning(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Versioning updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const headerTags = useMemo(() => {
    const items: string[] = [];
    items.push(
      `Exposure: ${
        props.governance.publicExposure?.visibility ??
        props.governance.publicExposure?.mode ??
        publicMode
      }`,
    );
    items.push(
      `Policies: ${props.governance.access?.storedAccessPolicies?.length ?? 0}`,
    );
    items.push(
      `Versioning: ${props.governance.versioning?.status ?? versioningStatus}`,
    );
    items.push(
      `Soft delete: ${
        props.governance.protection?.softDelete?.enabled ? "on" : "off"
      }`,
    );
    if (immutability?.enabled) {
      items.push(`Immutability: ${normalizeAzureImmutabilityMode(immutability.mode)}`);
    }
    if (immutability?.legalHold) {
      items.push("Legal hold");
    }
    return items;
  }, [
    props.governance,
    publicMode,
    versioningStatus,
    immutability?.enabled,
    immutability?.legalHold,
    immutability?.mode,
  ]);

  return (
    <BucketGovernanceDialogShell
      mobile={props.isMobile}
      title={`Controls: ${props.bucket}`}
      onClose={props.onClose}
      footer={
        <div className={styles.footerActions}>
          <Button onClick={props.onClose}>Close</Button>
        </div>
      }
    >
      <GovernanceSummaryCard
        title="Azure Controls"
        description="Manage anonymous access, stored access policies, account-level versioning, soft delete, and Azure container immutability from one controls surface."
        tags={headerTags}
        isRefreshing={
          props.isFetching ||
          publicExposureMutation.isPending ||
          accessMutation.isPending ||
          protectionMutation.isPending ||
          versioningMutation.isPending
        }
      />

      {renderWarningStack(extractWarningList(props.governance))}

      <AdvancedPolicySection
        bucket={props.bucket}
        advancedPolicy={extractAdvancedPolicy(props.governance)}
        onOpenAdvancedPolicy={props.onOpenAdvancedPolicy}
      />

      <div className={styles.grid}>
        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-public-exposure"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Anonymous Access</Typography.Text>
              <Typography.Text type="secondary">
                Choose whether blobs or the full container can be listed
                publicly.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={publicExposureMutation.isPending}
              onClick={() => publicExposureMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <FormField
              label="Visibility"
              htmlFor="bucket-governance-azure-visibility"
              extra="Use Private unless you explicitly need anonymous blob reads or anonymous container listing."
            >
              <NativeSelect
                id="bucket-governance-azure-visibility"
                value={publicMode}
                onChange={(value) =>
                  setPublicMode(
                    (value === "blob" || value === "container"
                      ? value
                      : "private") as Extract<
                      BucketPublicExposureMode,
                      "private" | "blob" | "container"
                    >,
                  )
                }
                options={[
                  { value: "private", label: "Private" },
                  { value: "blob", label: "Blob" },
                  { value: "container", label: "Container" },
                ]}
                ariaLabel="Azure anonymous access visibility"
              />
            </FormField>
            {renderWarningStack(
              extractWarningList(props.governance.publicExposure),
            )}
          </div>
        </section>

        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-versioning"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Versioning</Typography.Text>
              <Typography.Text type="secondary">
                Azure Blob versioning is configured at the storage-account
                level and affects every container in the account.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={versioningMutation.isPending}
              onClick={() => versioningMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <FormField
              label="Status"
              htmlFor="bucket-governance-azure-versioning-status"
            >
              <NativeSelect
                id="bucket-governance-azure-versioning-status"
                value={versioningStatus}
                onChange={(value) =>
                  setVersioningStatus(
                    value === "enabled" ? "enabled" : "disabled",
                  )
                }
                options={[
                  { value: "enabled", label: "Enabled" },
                  { value: "disabled", label: "Disabled" },
                ]}
                ariaLabel="Azure versioning status"
              />
            </FormField>
            {renderWarningStack(extractWarningList(props.governance.versioning))}
          </div>
        </section>

        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-protection"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Protection</Typography.Text>
              <Typography.Text type="secondary">
                Soft delete stays account-scoped. Container immutability can be
                created as unlocked, then optionally locked for extend-only
                management.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={protectionMutation.isPending}
              onClick={() => protectionMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.toggleRow}>
              <div className={styles.toggleCopy}>
                <Typography.Text>Soft delete</Typography.Text>
                <Typography.Text type="secondary">
                  Keeps deleted blobs recoverable for a configured number of
                  days.
                </Typography.Text>
              </div>
              <ToggleSwitch
                checked={softDeleteEnabled}
                onChange={setSoftDeleteEnabled}
                ariaLabel="Azure soft delete"
              />
            </div>
            <FormField
              label="Retention days"
              htmlFor="bucket-governance-azure-soft-delete-days"
              extra="Required when soft delete is enabled."
            >
              <Input
                id="bucket-governance-azure-soft-delete-days"
                value={softDeleteDays}
                onChange={(e) => setSoftDeleteDays(e.target.value)}
                disabled={!softDeleteEnabled}
                inputMode="numeric"
                autoComplete="off"
              />
            </FormField>
            {!immutabilityEditable ? (
              <Alert
                type="info"
                showIcon
                title="Azure ARM credentials required for container immutability editing"
                description="Add subscription ID, resource group, tenant ID, client ID, and client secret to the Azure profile to create, update, lock, or delete container immutability policies."
              />
            ) : null}
            <div className={styles.toggleRow}>
              <div className={styles.toggleCopy}>
                <Typography.Text>Container immutability</Typography.Text>
                <Typography.Text type="secondary">
                  Unlocked policies can be changed or deleted. Locked policies
                  can only be extended.
                </Typography.Text>
              </div>
              <ToggleSwitch
                checked={immutabilityEnabled}
                onChange={setImmutabilityEnabled}
                disabled={!immutabilityEditable || immutabilityLocked}
                ariaLabel="Azure container immutability"
              />
            </div>
            <FormField
              label="Retention days"
              htmlFor="bucket-governance-azure-immutability-days"
              extra={
                immutabilityLocked
                  ? "Locked policies can only increase this value."
                  : "Required when container immutability is enabled."
              }
            >
              <Input
                id="bucket-governance-azure-immutability-days"
                value={immutabilityDays}
                onChange={(e) => setImmutabilityDays(e.target.value)}
                disabled={!immutabilityEditable || !immutabilityEnabled}
                inputMode="numeric"
                autoComplete="off"
              />
            </FormField>
            <FormField
              label="Policy mode"
              htmlFor="bucket-governance-azure-immutability-mode"
              extra="Switch to Locked only when you are ready to make the policy extend-only."
            >
              <NativeSelect
                id="bucket-governance-azure-immutability-mode"
                value={immutabilityMode}
                onChange={(value) =>
                  setImmutabilityMode(
                    value === "locked" ? "locked" : "unlocked",
                  )
                }
                disabled={!immutabilityEditable || !immutabilityEnabled || immutabilityLocked}
                options={[
                  { value: "unlocked", label: "Unlocked" },
                  { value: "locked", label: "Locked" },
                ]}
                ariaLabel="Azure immutability mode"
              />
            </FormField>
            <div className={styles.toggleList}>
              <div className={styles.toggleRow}>
                <div className={styles.toggleCopy}>
                  <Typography.Text>Allow protected append writes</Typography.Text>
                  <Typography.Text type="secondary">
                    Allow append-only writes to protected append blobs.
                  </Typography.Text>
                </div>
                <ToggleSwitch
                  checked={allowProtectedAppendWrites}
                  onChange={(checked) => {
                    setAllowProtectedAppendWrites(checked);
                    if (checked) {
                      setAllowProtectedAppendWritesAll(false);
                    }
                  }}
                  disabled={!immutabilityEditable || !immutabilityEnabled || immutabilityLocked}
                  ariaLabel="Allow protected append writes"
                />
              </div>
              <div className={styles.toggleRow}>
                <div className={styles.toggleCopy}>
                  <Typography.Text>
                    Allow protected append writes for all
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    Allow append-only writes across append and block blob
                    workloads while the policy is unlocked.
                  </Typography.Text>
                </div>
                <ToggleSwitch
                  checked={allowProtectedAppendWritesAll}
                  onChange={(checked) => {
                    setAllowProtectedAppendWritesAll(checked);
                    if (checked) {
                      setAllowProtectedAppendWrites(false);
                    }
                  }}
                  disabled={!immutabilityEditable || !immutabilityEnabled || immutabilityLocked}
                  ariaLabel="Allow protected append writes for all"
                />
              </div>
            </div>
            {immutability?.legalHold ? (
              <Alert
                type="warning"
                showIcon
                title="Legal hold detected"
                description="A legal hold is active on this container. This client only edits time-based immutability policy; legal hold release remains outside this surface."
              />
            ) : null}
            {immutabilityLocked ? (
              <Alert
                type="info"
                showIcon
                title="Policy is locked"
                description="This Azure immutability policy is already locked. You can only increase retention days from this point."
              />
            ) : null}
            {renderWarningStack(extractWarningList(props.governance.protection))}
          </div>
        </section>

        <section
          className={`${styles.sectionCard} ${styles.sectionWide}`}
          data-testid="bucket-governance-access"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Stored Access Policies</Typography.Text>
              <Typography.Text type="secondary">
                Edit stored access policies as named entries instead of raw
                JSON. Azure allows up to five policies per container.
              </Typography.Text>
            </div>
            <div className={styles.sectionActions}>
              <Button
                onClick={() =>
                  setStoredAccessPolicies((current) =>
                    current.length >= 5
                      ? current
                      : [...current, createEmptyAzureStoredAccessPolicyDraft()],
                  )
                }
                disabled={storedAccessPolicies.length >= 5}
              >
                Add policy
              </Button>
              <Button
                type="primary"
                loading={accessMutation.isPending}
                onClick={() => accessMutation.mutate()}
              >
                Save
              </Button>
            </div>
          </div>
          <div className={styles.sectionBody}>
            {storedAccessPolicies.length === 0 ? (
              <Alert
                type="info"
                showIcon
                title="No stored access policies configured"
                description="Add a policy when you need a reusable signed identifier for SAS generation, or leave the list empty and save to clear all entries."
              />
            ) : null}
            <div className={styles.editorList}>
              {storedAccessPolicies.map((policy, index) => (
                <div
                  key={`azure-stored-policy-${index}`}
                  className={styles.editorCard}
                  data-testid="bucket-governance-azure-stored-access-policy-card"
                >
                  <div className={styles.editorCardHeader}>
                    <div className={styles.sectionCopy}>
                      <Typography.Text strong>
                        Policy {index + 1}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        SAS tokens can target this identifier. Editing the
                        policy changes future SAS validation, but does not mint
                        or revoke tokens by itself.
                      </Typography.Text>
                    </div>
                    <Button
                      danger
                      onClick={() =>
                        setStoredAccessPolicies((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <div className={styles.editorCardGrid}>
                    <FormField
                      label="Identifier"
                      htmlFor={`bucket-governance-azure-policy-id-${index}`}
                    >
                      <Input
                        id={`bucket-governance-azure-policy-id-${index}`}
                        value={policy.id}
                        onChange={(e) =>
                          setStoredAccessPolicies((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, id: e.target.value }
                                : item,
                            ),
                          )
                        }
                        autoComplete="off"
                      />
                    </FormField>
                    <FormField
                      label="Start (RFC3339)"
                      htmlFor={`bucket-governance-azure-policy-start-${index}`}
                    >
                      <Input
                        id={`bucket-governance-azure-policy-start-${index}`}
                        value={policy.start}
                        onChange={(e) =>
                          setStoredAccessPolicies((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, start: e.target.value }
                                : item,
                            ),
                          )
                        }
                        autoComplete="off"
                      />
                    </FormField>
                    <FormField
                      label="Expiry (RFC3339)"
                      htmlFor={`bucket-governance-azure-policy-expiry-${index}`}
                    >
                      <Input
                        id={`bucket-governance-azure-policy-expiry-${index}`}
                        value={policy.expiry}
                        onChange={(e) =>
                          setStoredAccessPolicies((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, expiry: e.target.value }
                                : item,
                            ),
                          )
                        }
                        autoComplete="off"
                      />
                    </FormField>
                  </div>
                  <FormField
                    label="Permissions"
                    htmlFor={`bucket-governance-azure-policy-permissions-${index}`}
                    extra="Permission order is normalized to rwdlacup on save."
                  >
                    <div
                      id={`bucket-governance-azure-policy-permissions-${index}`}
                      className={styles.permissionGrid}
                    >
                      {azureStoredAccessPermissionOptions.map((option) => (
                        <label
                          key={`${index}-${option.value}`}
                          className={styles.permissionItem}
                        >
                          <input
                            type="checkbox"
                            checked={policy.permission.includes(option.value)}
                            onChange={(e) =>
                              setStoredAccessPolicies((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        permission:
                                          toggleAzureStoredAccessPermission(
                                            item.permission,
                                            option.value,
                                            e.target.checked,
                                          ),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </FormField>
                </div>
              ))}
            </div>
            {renderWarningStack(extractWarningList(props.governance.access))}
          </div>
        </section>
      </div>
    </BucketGovernanceDialogShell>
  );
}

function BucketGovernanceOCIControls(props: GovernanceControlsCommonProps) {
  const draft = buildOCIDraft(props.governance);
  const sharingDraft = buildOCISharingDraft(props.governance);
  const [visibility, setVisibility] = useState<
    "private" | "object_read" | "object_read_without_list"
  >(draft.visibility);
  const [versioningStatus, setVersioningStatus] = useState<
    "enabled" | "disabled"
  >(draft.versioningStatus);
  const [retentionRules, setRetentionRules] = useState<OCIRetentionRuleDraft[]>(
    draft.retentionRules,
  );
  const [preauthenticatedRequests, setPreauthenticatedRequests] = useState<
    OCIPreauthenticatedRequestDraft[]
  >(sharingDraft);
  const [createdPARs, setCreatedPARs] = useState<OCIPreauthenticatedRequestDraft[]>(
    [],
  );
  const retention = props.governance.protection?.retention as
    | OCIRetentionView
    | undefined;
  const sharing = (
    props.governance as BucketGovernanceView & { sharing?: OCISharingView }
  ).sharing;
  const retentionRuleCount =
    Array.isArray(retention?.rules) && retention.rules.length > 0
      ? retention.rules.length
      : retention?.enabled
        ? 1
        : 0;

  const invalidateGovernance = useInvalidateGovernance(
    props.queryClient,
    props.profileId,
    props.bucket,
  );

  const publicExposureMutation = useMutation({
    mutationFn: () =>
      props.api.putBucketPublicExposure(props.profileId, props.bucket, {
        visibility,
      }),
    onSuccess: async () => {
      message.success("Public exposure updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const versioningMutation = useMutation({
    mutationFn: () => {
      const req: BucketVersioningPutRequest = { status: versioningStatus };
      return props.api.putBucketVersioning(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Versioning updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const protectionMutation = useMutation({
    mutationFn: () => {
      const req: BucketProtectionPutRequestWithOCIRetention = {
        retention: {
          enabled: retentionRules.length > 0,
          rules: retentionRules.map((rule, index) => ({
            id: rule.id.trim() || undefined,
            displayName:
              rule.displayName.trim() || `Retention Rule ${index + 1}`,
            days: parsePositiveDays(
              rule.days,
              `Retention rule ${index + 1} days`,
            ),
            locked: rule.locked,
            timeModified: rule.timeModified || undefined,
          })),
        },
      };
      return props.api.putBucketProtection(
        props.profileId,
        props.bucket,
        req as BucketProtectionPutRequest,
      );
    },
    onSuccess: async () => {
      message.success("Retention rules updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const sharingMutation = useMutation({
    mutationFn: () => {
      const req: BucketSharingPutClientRequest = {
        preauthenticatedRequests: preauthenticatedRequests.map((item) => ({
          id: item.id.trim() || undefined,
          name: item.name.trim() || undefined,
          accessType: item.accessType,
          bucketListingAction: item.bucketListingAction,
          objectName: item.objectName.trim() || undefined,
          timeExpires: item.timeExpires.trim() || undefined,
        })),
      };
      return props.api.putBucketSharing(props.profileId, props.bucket, req);
    },
    onSuccess: async (view) => {
      const nextSharing = view as OCISharingView | undefined;
      const nextRequests = Array.isArray(nextSharing?.preauthenticatedRequests)
        ? nextSharing.preauthenticatedRequests
        : [];
      setCreatedPARs(
        nextRequests
          .filter(
            (item): item is OCIPreauthenticatedRequestDraft =>
              typeof item.accessUri === "string" && item.accessUri.trim().length > 0,
          )
          .map((item) => ({
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
          })),
      );
      message.success("Sharing updated");
      await invalidateGovernance();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const headerTags = useMemo(() => {
    const items: string[] = [];
    items.push(
      `Visibility: ${props.governance.publicExposure?.visibility ?? visibility}`,
    );
    items.push(
      `Versioning: ${props.governance.versioning?.status ?? versioningStatus}`,
    );
    items.push(
      retentionRuleCount > 0
        ? `Retention rules: ${retentionRuleCount}`
        : "Retention rules: 0",
    );
    items.push(
      `PARs: ${
        Array.isArray(sharing?.preauthenticatedRequests)
          ? sharing.preauthenticatedRequests.length
          : 0
      }`,
    );
    return items;
  }, [props.governance, retentionRuleCount, sharing?.preauthenticatedRequests, versioningStatus, visibility]);

  return (
    <BucketGovernanceDialogShell
      mobile={props.isMobile}
      title={`Controls: ${props.bucket}`}
      onClose={props.onClose}
      footer={
        <div className={styles.footerActions}>
          <Button onClick={props.onClose}>Close</Button>
        </div>
      }
    >
      <GovernanceSummaryCard
        title="OCI Controls"
        description="Manage OCI bucket visibility, versioning, and retention rules from the typed controls surface."
        tags={headerTags}
        isRefreshing={
          props.isFetching ||
          publicExposureMutation.isPending ||
          versioningMutation.isPending ||
          protectionMutation.isPending ||
          sharingMutation.isPending
        }
      />

      {renderWarningStack(extractWarningList(props.governance))}

      <div className={styles.grid}>
        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-public-exposure"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Public Exposure</Typography.Text>
              <Typography.Text type="secondary">
                Choose whether objects are private, publicly readable, or
                readable without bucket listing.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={publicExposureMutation.isPending}
              onClick={() => publicExposureMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <FormField
              label="Visibility"
              htmlFor="bucket-governance-oci-visibility"
            >
              <NativeSelect
                id="bucket-governance-oci-visibility"
                value={visibility}
                onChange={(value) =>
                  setVisibility(
                    value === "object_read" || value === "object_read_without_list"
                      ? value
                      : "private",
                  )
                }
                options={[
                  { value: "private", label: "Private" },
                  { value: "object_read", label: "Object read" },
                  {
                    value: "object_read_without_list",
                    label: "Object read without list",
                  },
                ]}
                ariaLabel="OCI visibility"
              />
            </FormField>
            {renderWarningStack(
              extractWarningList(props.governance.publicExposure),
            )}
          </div>
        </section>

        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-versioning"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Versioning</Typography.Text>
              <Typography.Text type="secondary">
                Toggle OCI bucket versioning directly.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={versioningMutation.isPending}
              onClick={() => versioningMutation.mutate()}
            >
              Save
            </Button>
          </div>
          <div className={styles.sectionBody}>
            <FormField
              label="Status"
              htmlFor="bucket-governance-oci-versioning-status"
            >
              <NativeSelect
                id="bucket-governance-oci-versioning-status"
                value={versioningStatus}
                onChange={(value) =>
                  setVersioningStatus(
                    value === "enabled" ? "enabled" : "disabled",
                  )
                }
                options={[
                  { value: "enabled", label: "Enabled" },
                  { value: "disabled", label: "Disabled" },
                ]}
                ariaLabel="OCI versioning status"
              />
            </FormField>
            {renderWarningStack(extractWarningList(props.governance.versioning))}
          </div>
        </section>

        <section
          className={styles.sectionCard}
          data-testid="bucket-governance-protection"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Retention Rules</Typography.Text>
              <Typography.Text type="secondary">
                Create, extend, edit, or remove OCI retention rules. Locked
                rules can only increase in duration and cannot be removed.
              </Typography.Text>
            </div>
            <div className={styles.footerActions}>
              <Button
                disabled={retentionRules.length >= 100}
                onClick={() =>
                  setRetentionRules((current) => [
                    ...current,
                    {
                      id: "",
                      displayName: `Retention Rule ${current.length + 1}`,
                      days: "30",
                      locked: false,
                      timeModified: "",
                    },
                  ])
                }
              >
                Add rule
              </Button>
              <Button
                type="primary"
                loading={protectionMutation.isPending}
                onClick={() => protectionMutation.mutate()}
              >
                Save
              </Button>
            </div>
          </div>
          <div className={styles.sectionBody}>
            {retentionRules.length === 0 ? (
              <Alert
                type="info"
                showIcon
                title="No OCI retention rules configured"
                description="Add a rule to start managing bucket retention from this controls surface."
              />
            ) : null}
            <div className={styles.warningStack}>
              {retentionRules.map((rule, index) => (
                <section
                  key={rule.id || `oci-retention-rule-${index}`}
                  className={styles.sectionCard}
                >
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionCopy}>
                      <Typography.Text strong>
                        Rule {index + 1}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {rule.locked
                          ? "Locked rules can only be extended."
                          : "Unlocked rules can be edited or removed."}
                      </Typography.Text>
                    </div>
                    <div className={styles.footerActions}>
                      {rule.locked ? <Tag color="warning">Locked</Tag> : null}
                      <Button
                        danger
                        onClick={() =>
                          setRetentionRules((current) =>
                            current.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          )
                        }
                        disabled={rule.locked}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  <div className={styles.sectionBody}>
                    <FormField
                      label="Display name"
                      htmlFor={`bucket-governance-oci-retention-name-${index}`}
                    >
                      <Input
                        id={`bucket-governance-oci-retention-name-${index}`}
                        value={rule.displayName}
                        onChange={(e) =>
                          setRetentionRules((current) =>
                            current.map((item, currentIndex) =>
                              currentIndex === index
                                ? { ...item, displayName: e.target.value }
                                : item,
                            ),
                          )
                        }
                        disabled={rule.locked}
                        autoComplete="off"
                      />
                    </FormField>
                    <FormField
                      label="Retention days"
                      htmlFor={`bucket-governance-oci-retention-days-${index}`}
                      extra={
                        rule.locked
                          ? "Locked rules can only increase this value."
                          : "Required."
                      }
                    >
                      <Input
                        id={`bucket-governance-oci-retention-days-${index}`}
                        value={rule.days}
                        onChange={(e) =>
                          setRetentionRules((current) =>
                            current.map((item, currentIndex) =>
                              currentIndex === index
                                ? { ...item, days: e.target.value }
                                : item,
                            ),
                          )
                        }
                        inputMode="numeric"
                        autoComplete="off"
                      />
                    </FormField>
                    <div className={styles.tagRow}>
                      {rule.id ? <Tag>ID {rule.id}</Tag> : <Tag>New rule</Tag>}
                      {rule.timeModified ? (
                        <Tag>Modified {rule.timeModified}</Tag>
                      ) : null}
                    </div>
                  </div>
                </section>
              ))}
            </div>
            {renderWarningStack(extractWarningList(props.governance.protection))}
          </div>
        </section>

        <section
          className={`${styles.sectionCard} ${styles.sectionWide}`}
          data-testid="bucket-governance-sharing"
        >
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text strong>Pre-Authenticated Requests</Typography.Text>
              <Typography.Text type="secondary">
                Existing OCI PARs are preserved or deleted here. To change an
                existing PAR, remove it and create a replacement.
              </Typography.Text>
            </div>
            <div className={styles.footerActions}>
              <Button
                disabled={preauthenticatedRequests.length >= 100}
                onClick={() =>
                  setPreauthenticatedRequests((current) => [
                    ...current,
                    {
                      id: "",
                      name: `PAR ${current.length + 1}`,
                      accessType: "AnyObjectRead",
                      bucketListingAction: "Deny",
                      objectName: "",
                      timeCreated: "",
                      timeExpires: "",
                      accessUri: "",
                    },
                  ])
                }
              >
                Add PAR
              </Button>
              <Button
                type="primary"
                loading={sharingMutation.isPending}
                onClick={() => sharingMutation.mutate()}
              >
                Save
              </Button>
            </div>
          </div>
          <div className={styles.sectionBody}>
            {createdPARs.length > 0 ? (
              <div className={styles.warningStack}>
                {createdPARs.map((item) => (
                  <Alert
                    key={item.id || item.name}
                    type="success"
                    showIcon
                    title={`Created PAR: ${item.name}`}
                    description={item.accessUri}
                  />
                ))}
              </div>
            ) : null}
            {preauthenticatedRequests.length === 0 ? (
              <Alert
                type="info"
                showIcon
                title="No OCI PARs configured"
                description="Add a pre-authenticated request to create a typed sharing link."
              />
            ) : null}
            <div className={styles.warningStack}>
              {preauthenticatedRequests.map((item, index) => {
                const existing = item.id.trim().length > 0;
                return (
                  <section
                    key={item.id || `oci-par-${index}`}
                    className={styles.sectionCard}
                  >
                    <div className={styles.sectionHeader}>
                      <div className={styles.sectionCopy}>
                        <Typography.Text strong>PAR {index + 1}</Typography.Text>
                        <Typography.Text type="secondary">
                          {existing
                            ? "Existing PARs are immutable here. Delete and recreate to change them."
                            : "Configure a new OCI pre-authenticated request."}
                        </Typography.Text>
                      </div>
                      <div className={styles.footerActions}>
                        {existing ? <Tag>Existing</Tag> : <Tag color="blue">New</Tag>}
                        <Button
                          danger
                          onClick={() =>
                            setPreauthenticatedRequests((current) =>
                              current.filter((_, currentIndex) => currentIndex !== index),
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <div className={styles.sectionBody}>
                      <FormField
                        label="Name"
                        htmlFor={`bucket-governance-oci-par-name-${index}`}
                      >
                        <Input
                          id={`bucket-governance-oci-par-name-${index}`}
                          value={item.name}
                          onChange={(e) =>
                            setPreauthenticatedRequests((current) =>
                              current.map((entry, currentIndex) =>
                                currentIndex === index
                                  ? { ...entry, name: e.target.value }
                                  : entry,
                              ),
                            )
                          }
                          disabled={existing}
                          autoComplete="off"
                        />
                      </FormField>
                      <FormField
                        label="Access type"
                        htmlFor={`bucket-governance-oci-par-access-type-${index}`}
                      >
                        <NativeSelect
                          id={`bucket-governance-oci-par-access-type-${index}`}
                          value={item.accessType}
                          onChange={(value) =>
                            setPreauthenticatedRequests((current) =>
                              current.map((entry, currentIndex) =>
                                currentIndex === index
                                  ? {
                                      ...entry,
                                      accessType:
                                        value === "AnyObjectWrite" ||
                                        value === "AnyObjectReadWrite"
                                          ? value
                                          : "AnyObjectRead",
                                    }
                                  : entry,
                              ),
                            )
                          }
                          disabled={existing}
                          options={[
                            { value: "AnyObjectRead", label: "Any object read" },
                            { value: "AnyObjectWrite", label: "Any object write" },
                            {
                              value: "AnyObjectReadWrite",
                              label: "Any object read/write",
                            },
                          ]}
                          ariaLabel={`OCI PAR access type ${index + 1}`}
                        />
                      </FormField>
                      <FormField
                        label="Object name or prefix (optional)"
                        htmlFor={`bucket-governance-oci-par-object-name-${index}`}
                        extra="Leave blank for bucket-wide access. Provide an object name or prefix to scope the PAR."
                      >
                        <Input
                          id={`bucket-governance-oci-par-object-name-${index}`}
                          value={item.objectName}
                          onChange={(e) =>
                            setPreauthenticatedRequests((current) =>
                              current.map((entry, currentIndex) =>
                                currentIndex === index
                                  ? { ...entry, objectName: e.target.value }
                                  : entry,
                              ),
                            )
                          }
                          disabled={existing}
                          autoComplete="off"
                        />
                      </FormField>
                      <FormField
                        label="Bucket listing"
                        htmlFor={`bucket-governance-oci-par-listing-${index}`}
                      >
                        <NativeSelect
                          id={`bucket-governance-oci-par-listing-${index}`}
                          value={item.bucketListingAction}
                          onChange={(value) =>
                            setPreauthenticatedRequests((current) =>
                              current.map((entry, currentIndex) =>
                                currentIndex === index
                                  ? {
                                      ...entry,
                                      bucketListingAction:
                                        value === "ListObjects"
                                          ? "ListObjects"
                                          : "Deny",
                                    }
                                  : entry,
                              ),
                            )
                          }
                          disabled={existing}
                          options={[
                            { value: "Deny", label: "Deny" },
                            { value: "ListObjects", label: "List objects" },
                          ]}
                          ariaLabel={`OCI PAR bucket listing ${index + 1}`}
                        />
                      </FormField>
                      <FormField
                        label="Expires at (RFC3339)"
                        htmlFor={`bucket-governance-oci-par-expires-${index}`}
                      >
                        <Input
                          id={`bucket-governance-oci-par-expires-${index}`}
                          value={item.timeExpires}
                          onChange={(e) =>
                            setPreauthenticatedRequests((current) =>
                              current.map((entry, currentIndex) =>
                                currentIndex === index
                                  ? { ...entry, timeExpires: e.target.value }
                                  : entry,
                              ),
                            )
                          }
                          disabled={existing}
                          autoComplete="off"
                        />
                      </FormField>
                      <div className={styles.tagRow}>
                        {item.id ? <Tag>ID {item.id}</Tag> : null}
                        {item.timeCreated ? <Tag>Created {item.timeCreated}</Tag> : null}
                        {item.accessUri ? <Tag color="success">URL captured</Tag> : null}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
            {renderWarningStack(extractWarningList(sharing))}
          </div>
        </section>
      </div>
    </BucketGovernanceDialogShell>
  );
}

function UnsupportedProviderNotice(props: {
  bucket: string;
  isMobile: boolean;
  onClose: () => void;
}) {
  return (
    <BucketGovernanceDialogShell
      mobile={props.isMobile}
      title={`Controls: ${props.bucket}`}
      onClose={props.onClose}
    >
      <Alert
        type="info"
        showIcon
        title="Typed controls are not available for this provider."
        description="This controls surface currently supports AWS S3, GCS, Azure Blob, and OCI Object Storage."
      />
    </BucketGovernanceDialogShell>
  );
}

export function BucketGovernanceModal(props: {
  api: APIClient;
  apiToken: string;
  profileId: string;
  provider?: Profile["provider"];
  bucket: string | null;
  onClose: () => void;
  onOpenAdvancedPolicy?: (bucket: string) => void;
}) {
  const open = !!props.bucket;
  const bucket = props.bucket ?? "";
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const queryClient = useQueryClient();

  const governanceQuery = useQuery({
    queryKey: ["bucketGovernance", props.profileId, bucket, props.apiToken],
    queryFn: () => props.api.getBucketGovernance(props.profileId, bucket),
    enabled: open && !!props.profileId && !!bucket,
  });
  const governance = governanceQuery.data;

  if (!open) return null;

  if (
    props.provider !== "aws_s3" &&
    props.provider !== "gcp_gcs" &&
    props.provider !== "azure_blob" &&
    props.provider !== "oci_object_storage"
  ) {
    return (
      <UnsupportedProviderNotice
        bucket={bucket}
        isMobile={isMobile}
        onClose={props.onClose}
      />
    );
  }

  if (governanceQuery.isError) {
    return (
      <BucketGovernanceDialogShell
        mobile={isMobile}
        title={`Controls: ${bucket}`}
        onClose={props.onClose}
      >
        <Alert
          type="error"
          showIcon
          title="Failed to load controls"
          description={formatErr(governanceQuery.error)}
        />
      </BucketGovernanceDialogShell>
    );
  }

  if (!governance) {
    return (
      <BucketGovernanceDialogShell
        mobile={isMobile}
        title={`Controls: ${bucket}`}
        onClose={props.onClose}
      >
        <Typography.Text type="secondary">Loading…</Typography.Text>
      </BucketGovernanceDialogShell>
    );
  }

  const commonProps: GovernanceControlsCommonProps = {
    api: props.api,
    profileId: props.profileId,
    provider: props.provider,
    bucket,
    governance,
    isFetching: governanceQuery.isFetching,
    isMobile,
    queryClient,
    onClose: props.onClose,
    onOpenAdvancedPolicy: props.onOpenAdvancedPolicy,
  };

  switch (props.provider) {
    case "aws_s3":
      return (
        <BucketGovernanceAWSControls
          key={buildGovernanceDraftKey(bucket, governance)}
          {...commonProps}
        />
      );
    case "gcp_gcs":
      return (
        <BucketGovernanceGCSControls
          key={buildGovernanceDraftKey(bucket, governance)}
          {...commonProps}
        />
      );
    case "azure_blob":
      return (
        <BucketGovernanceAzureControls
          key={buildGovernanceDraftKey(bucket, governance)}
          {...commonProps}
        />
      );
    case "oci_object_storage":
      return (
        <BucketGovernanceOCIControls
          key={buildGovernanceDraftKey(bucket, governance)}
          {...commonProps}
        />
      );
    default:
      return (
        <UnsupportedProviderNotice
          bucket={bucket}
          isMobile={isMobile}
          onClose={props.onClose}
        />
      );
  }
}
