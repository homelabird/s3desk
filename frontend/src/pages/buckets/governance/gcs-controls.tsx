import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Input, Tag, Typography, message } from "antd";
import { useMemo, useRef, useState } from "react";

import type {
  BucketAccessPutRequest,
  BucketProtectionPutRequest,
  BucketPublicExposureMode,
  BucketVersioningPutRequest,
} from "../../../api/types";
import { FormField } from "../../../components/FormField";
import { NativeSelect } from "../../../components/NativeSelect";
import { ToggleSwitch } from "../../../components/ToggleSwitch";
import { formatErrorWithHint as formatErr } from "../../../lib/errors";
import styles from "../BucketGovernanceModal.module.css";
import { invalidateLinkedBucketState } from "./invalidation";
import { useGovernanceMutationScope } from "./mutationScope";
import {
  AdvancedPolicySection,
  BucketGovernanceDialogShell,
  GovernanceSummaryCard,
  extractWarningList,
  renderWarningStack,
} from "./shell";
import type { GCSBindingDraft, GovernanceControlsCommonProps } from "./types";
import {
  buildGCSDraft,
  createEmptyGCSBindingDraft,
  extractAdvancedPolicy,
  parsePositiveDays,
  serializeGCSBindings,
} from "./utils";

export function BucketGovernanceGCSControls(props: GovernanceControlsCommonProps) {
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
  const publicExposureRequestTokenRef = useRef(0);
  const accessRequestTokenRef = useRef(0);
  const protectionRequestTokenRef = useRef(0);
  const retentionRequestTokenRef = useRef(0);
  const versioningRequestTokenRef = useRef(0);
  const mutationScope = useGovernanceMutationScope({
    apiToken: props.apiToken,
    profileId: props.profileId,
    provider: props.provider,
    bucket: props.bucket,
  });

  const refreshState = async (apiToken: string) =>
    invalidateLinkedBucketState(
      props.queryClient,
      props.profileId,
      props.bucket,
      props.provider,
      apiToken,
    );

  const publicExposureMutation = useMutation({
    mutationFn: () =>
      props.api.buckets.putBucketPublicExposure(props.profileId, props.bucket, {
        mode: publicMode,
        publicAccessPrevention,
      }),
    onMutate: () => {
      publicExposureRequestTokenRef.current += 1;
      return mutationScope.createContext(publicExposureRequestTokenRef.current);
    },
    onSuccess: async (_, __, context) => {
      if (!mutationScope.isCurrentRequest(context, publicExposureRequestTokenRef.current)) return;
      message.success("Public exposure updated");
      await refreshState(context.apiToken);
    },
    onError: (err, _vars, context) => {
      if (!mutationScope.isCurrentRequest(context, publicExposureRequestTokenRef.current)) return;
      message.error(formatErr(err));
    },
  });

  const accessMutation = useMutation({
    mutationFn: () => {
      const req: BucketAccessPutRequest = {
        bindings: serializeGCSBindings(bindings),
        etag: etag.trim() || undefined,
      };
      return props.api.buckets.putBucketAccess(props.profileId, props.bucket, req);
    },
    onMutate: () => {
      accessRequestTokenRef.current += 1;
      return mutationScope.createContext(accessRequestTokenRef.current);
    },
    onSuccess: async (_, __, context) => {
      if (!mutationScope.isCurrentRequest(context, accessRequestTokenRef.current)) return;
      message.success("IAM bindings updated");
      await refreshState(context.apiToken);
    },
    onError: (err, _vars, context) => {
      if (!mutationScope.isCurrentRequest(context, accessRequestTokenRef.current)) return;
      message.error(formatErr(err));
    },
  });

  const protectionMutation = useMutation({
    mutationFn: () => {
      const req: BucketProtectionPutRequest = {
        uniformAccess,
      };
      return props.api.buckets.putBucketProtection(props.profileId, props.bucket, req);
    },
    onMutate: () => {
      protectionRequestTokenRef.current += 1;
      return mutationScope.createContext(protectionRequestTokenRef.current);
    },
    onSuccess: async (_, __, context) => {
      if (!mutationScope.isCurrentRequest(context, protectionRequestTokenRef.current)) return;
      message.success("Uniform access updated");
      await refreshState(context.apiToken);
    },
    onError: (err, _vars, context) => {
      if (!mutationScope.isCurrentRequest(context, protectionRequestTokenRef.current)) return;
      message.error(formatErr(err));
    },
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
      return props.api.buckets.putBucketProtection(props.profileId, props.bucket, req);
    },
    onMutate: () => {
      retentionRequestTokenRef.current += 1;
      return mutationScope.createContext(retentionRequestTokenRef.current);
    },
    onSuccess: async (_, __, context) => {
      if (!mutationScope.isCurrentRequest(context, retentionRequestTokenRef.current)) return;
      message.success("Retention updated");
      await refreshState(context.apiToken);
    },
    onError: (err, _vars, context) => {
      if (!mutationScope.isCurrentRequest(context, retentionRequestTokenRef.current)) return;
      message.error(formatErr(err));
    },
  });

  const versioningMutation = useMutation({
    mutationFn: () => {
      const req: BucketVersioningPutRequest = { status: versioningStatus };
      return props.api.buckets.putBucketVersioning(props.profileId, props.bucket, req);
    },
    onMutate: () => {
      versioningRequestTokenRef.current += 1;
      return mutationScope.createContext(versioningRequestTokenRef.current);
    },
    onSuccess: async (_, __, context) => {
      if (!mutationScope.isCurrentRequest(context, versioningRequestTokenRef.current)) return;
      message.success("Versioning updated");
      await refreshState(context.apiToken);
    },
    onError: (err, _vars, context) => {
      if (!mutationScope.isCurrentRequest(context, versioningRequestTokenRef.current)) return;
      message.error(formatErr(err));
    },
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
  const anyMutationPending =
    publicExposureMutation.isPending ||
    accessMutation.isPending ||
    protectionMutation.isPending ||
    retentionMutation.isPending ||
    versioningMutation.isPending;
  const handleClose = () => {
    if (anyMutationPending) return;
    props.onClose();
  };

  return (
    <BucketGovernanceDialogShell
      mobile={props.isMobile}
      title={`Controls: ${props.bucket}`}
      onClose={handleClose}
      footer={
        <div className={styles.footerActions}>
          <Button onClick={handleClose} disabled={anyMutationPending}>Close</Button>
        </div>
      }
    >
      <GovernanceSummaryCard
        title="GCS Controls"
        description="Manage IAM exposure, uniform bucket-level access, versioning, and retention from the typed GCS controls surface."
        tags={headerTags}
        isRefreshing={props.isFetching || anyMutationPending}
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
