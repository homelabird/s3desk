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
  bindingsText: string;
  uniformAccess: boolean;
  versioningStatus: "enabled" | "disabled";
  retentionEnabled: boolean;
  retentionDays: string;
};

type AzureGovernanceDraft = {
  publicMode: Extract<BucketPublicExposureMode, "private" | "blob" | "container">;
  storedAccessPoliciesText: string;
  versioningStatus: "enabled" | "disabled";
  softDeleteEnabled: boolean;
  softDeleteDays: string;
};

type OCIGovernanceDraft = {
  visibility: "private" | "object_read" | "object_read_without_list";
  versioningStatus: "enabled" | "disabled";
  retentionEnabled: boolean;
  retentionDays: string;
};

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

function formatOptionalDays(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? String(value)
    : "";
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
    bindingsText: JSON.stringify(governance.access?.bindings ?? [], null, 2),
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
  return {
    publicMode:
      mode === "blob" || mode === "container" ? mode : "private",
    storedAccessPoliciesText: JSON.stringify(
      governance.access?.storedAccessPolicies ?? [],
      null,
      2,
    ),
    versioningStatus:
      governance.versioning?.status === "enabled" ? "enabled" : "disabled",
    softDeleteEnabled: governance.protection?.softDelete?.enabled === true,
    softDeleteDays: formatOptionalDays(governance.protection?.softDelete?.days),
  };
}

function buildOCIDraft(governance: BucketGovernanceView): OCIGovernanceDraft {
  const visibility = governance.publicExposure?.visibility;
  return {
    visibility:
      visibility === "object_read" || visibility === "object_read_without_list"
        ? visibility
        : "private",
    versioningStatus:
      governance.versioning?.status === "enabled" ? "enabled" : "disabled",
    retentionEnabled: governance.protection?.retention?.enabled === true,
    retentionDays: formatOptionalDays(governance.protection?.retention?.days),
  };
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
  const [bindingsText, setBindingsText] = useState(draft.bindingsText);
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
      const bindings = parseJSONArray<BucketAccessBinding>(
        bindingsText,
        "Bindings",
      );
      const req: BucketAccessPutRequest = {
        bindings,
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
                Edit the full bindings array as JSON. Preserve conditional
                bindings and keep the current etag when saving.
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
            <FormField
              label="Bindings JSON"
              htmlFor="bucket-governance-gcs-bindings"
            >
              <Input.TextArea
                id="bucket-governance-gcs-bindings"
                className={styles.jsonArea}
                value={bindingsText}
                onChange={(e) => setBindingsText(e.target.value)}
                rows={12}
              />
            </FormField>
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
  const [storedAccessPoliciesText, setStoredAccessPoliciesText] = useState(
    draft.storedAccessPoliciesText,
  );
  const [versioningStatus, setVersioningStatus] = useState<
    "enabled" | "disabled"
  >(draft.versioningStatus);
  const [softDeleteEnabled, setSoftDeleteEnabled] = useState(
    draft.softDeleteEnabled,
  );
  const [softDeleteDays, setSoftDeleteDays] = useState(draft.softDeleteDays);
  const immutability = props.governance.protection?.immutability;

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
      const storedAccessPolicies = parseJSONArray<BucketStoredAccessPolicy>(
        storedAccessPoliciesText,
        "Stored access policies",
      );
      const req: BucketAccessPutRequest = {
        storedAccessPolicies,
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
      const req: BucketProtectionPutRequest = {
        softDelete: softDeleteEnabled
          ? {
              enabled: true,
              days: parsePositiveDays(softDeleteDays, "Soft delete days"),
            }
          : {
              enabled: false,
            },
      };
      return props.api.putBucketProtection(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Soft delete updated");
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
      items.push("Immutability detected");
    }
    return items;
  }, [props.governance, publicMode, versioningStatus, immutability?.enabled]);

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
        description="Manage anonymous access, stored access policies, account-level versioning, and soft delete from one Azure controls surface."
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
                Soft delete is editable here. Immutability is surfaced as
                read-only status until container immutability policy editing is
                added.
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
            {immutability?.enabled ? (
              <Alert
                type="info"
                showIcon
                title="Container immutability detected"
                description={
                  immutability.until
                    ? `Immutable until ${immutability.until}. Editing immutability from this client is not implemented yet.`
                    : "Editing container immutability from this client is not implemented yet."
                }
              />
            ) : (
              <Alert
                type="info"
                showIcon
                title="No container immutability detected"
                description="If a legal hold or immutability policy is applied later, this surface will show it as read-only state."
              />
            )}
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
                Edit the full stored access policy array as JSON. Azure allows
                up to five entries, and start or expiry should use RFC3339
                timestamps.
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
              label="Stored access policies JSON"
              htmlFor="bucket-governance-azure-stored-access-policies"
              extra="Permission letters follow Azure order: rwdlacup."
            >
              <Input.TextArea
                id="bucket-governance-azure-stored-access-policies"
                className={styles.jsonArea}
                value={storedAccessPoliciesText}
                onChange={(e) => setStoredAccessPoliciesText(e.target.value)}
                rows={12}
              />
            </FormField>
            {renderWarningStack(extractWarningList(props.governance.access))}
          </div>
        </section>
      </div>
    </BucketGovernanceDialogShell>
  );
}

function BucketGovernanceOCIControls(props: GovernanceControlsCommonProps) {
  const draft = buildOCIDraft(props.governance);
  const [visibility, setVisibility] = useState<
    "private" | "object_read" | "object_read_without_list"
  >(draft.visibility);
  const [versioningStatus, setVersioningStatus] = useState<
    "enabled" | "disabled"
  >(draft.versioningStatus);
  const [retentionEnabled, setRetentionEnabled] = useState(
    draft.retentionEnabled,
  );
  const [retentionDays, setRetentionDays] = useState(draft.retentionDays);
  const retentionLocked = props.governance.protection?.retention?.locked === true;

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

  const headerTags = useMemo(() => {
    const items: string[] = [];
    items.push(
      `Visibility: ${props.governance.publicExposure?.visibility ?? visibility}`,
    );
    items.push(
      `Versioning: ${props.governance.versioning?.status ?? versioningStatus}`,
    );
    items.push(
      props.governance.protection?.retention?.enabled
        ? `Retention: ${
            props.governance.protection.retention.days
              ? `${props.governance.protection.retention.days}d`
              : "enabled"
          }`
        : "Retention: off",
    );
    return items;
  }, [props.governance, versioningStatus, visibility]);

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
        description="Manage OCI bucket visibility, versioning, and retention from the typed controls surface. Retention editing targets the first rule returned by the backend."
        tags={headerTags}
        isRefreshing={
          props.isFetching ||
          publicExposureMutation.isPending ||
          versioningMutation.isPending ||
          protectionMutation.isPending
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
              <Typography.Text strong>Retention</Typography.Text>
              <Typography.Text type="secondary">
                Edit the first OCI retention rule surfaced by the backend.
                Locked rules are shown read-only.
              </Typography.Text>
            </div>
            <Button
              type="primary"
              loading={protectionMutation.isPending}
              onClick={() => protectionMutation.mutate()}
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
                  Disable to remove the editable retention rule when it is not
                  locked.
                </Typography.Text>
              </div>
              <ToggleSwitch
                checked={retentionEnabled}
                onChange={setRetentionEnabled}
                disabled={retentionLocked}
                ariaLabel="OCI retention enabled"
              />
            </div>
            <FormField
              label="Retention days"
              htmlFor="bucket-governance-oci-retention-days"
              extra="Required when retention is enabled."
            >
              <Input
                id="bucket-governance-oci-retention-days"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                disabled={!retentionEnabled || retentionLocked}
                inputMode="numeric"
                autoComplete="off"
              />
            </FormField>
            {retentionLocked ? <Tag color="warning">Locked retention</Tag> : null}
            {renderWarningStack(extractWarningList(props.governance.protection))}
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
