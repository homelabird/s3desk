import { useMutation } from "@tanstack/react-query";
import { Button, Input, message, Typography } from "antd";
import { useMemo, useState } from "react";

import type {
  BucketAccessPutRequest,
  BucketEncryptionMode,
  BucketEncryptionPutRequest,
  BucketLifecyclePutRequest,
  BucketObjectOwnershipMode,
  BucketVersioningPutRequest,
} from "../../../api/types";
import { FormField } from "../../../components/FormField";
import { NativeSelect } from "../../../components/NativeSelect";
import { ToggleSwitch } from "../../../components/ToggleSwitch";
import { formatErrorWithHint as formatErr } from "../../../lib/errors";
import styles from "../BucketGovernanceModal.module.css";
import { invalidateLinkedBucketState } from "./invalidation";
import { GovernanceSummaryCard, AdvancedPolicySection, BucketGovernanceDialogShell, extractWarningList, renderWarningStack } from "./shell";
import type { GovernanceControlsCommonProps } from "./types";
import { buildGovernanceDraft, extractAdvancedPolicy, parseJSONArray } from "./utils";

export function BucketGovernanceAWSControls(props: GovernanceControlsCommonProps) {
  const draft = buildGovernanceDraft(props.governance);
  const [publicAccessBlock, setPublicAccessBlock] =
    useState(draft.publicAccessBlock);
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

  const refreshState = async () =>
    invalidateLinkedBucketState(
      props.queryClient,
      props.profileId,
      props.bucket,
      props.provider,
    );

  const publicExposureMutation = useMutation({
    mutationFn: () =>
      props.api.buckets.putBucketPublicExposure(props.profileId, props.bucket, {
        blockPublicAccess: publicAccessBlock,
      }),
    onSuccess: async () => {
      message.success("Public exposure updated");
      await refreshState();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const accessMutation = useMutation({
    mutationFn: () => {
      const req: BucketAccessPutRequest = { objectOwnership };
      return props.api.buckets.putBucketAccess(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Object ownership updated");
      await refreshState();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const versioningMutation = useMutation({
    mutationFn: () => {
      const req: BucketVersioningPutRequest = { status: versioningStatus };
      return props.api.buckets.putBucketVersioning(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Versioning updated");
      await refreshState();
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
      return props.api.buckets.putBucketEncryption(props.profileId, props.bucket, req);
    },
    onSuccess: async () => {
      message.success("Default encryption updated");
      await refreshState();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const lifecycleMutation = useMutation({
    mutationFn: () => {
      const rules = parseJSONArray<BucketLifecyclePutRequest["rules"][number]>(
        lifecycleText,
        "Lifecycle rules",
      );
      return props.api.buckets.putBucketLifecycle(props.profileId, props.bucket, {
        rules,
      });
    },
    onSuccess: async () => {
      message.success("Lifecycle rules updated");
      await refreshState();
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
            {renderWarningStack(extractWarningList(props.governance.publicExposure))}
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
                    value as Extract<BucketEncryptionMode, "sse_s3" | "sse_kms">,
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
