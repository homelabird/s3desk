import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Input, Typography, message } from "antd";
import { useMemo, useState } from "react";

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
import {
  AdvancedPolicySection,
  BucketGovernanceDialogShell,
  GovernanceSummaryCard,
  extractWarningList,
  renderWarningStack,
} from "./shell";
import { azureStoredAccessPermissionOptions } from "./types";
import type {
  AzureImmutabilityView,
  AzureStoredAccessPolicyDraft,
  BucketProtectionPutRequestWithAzureImmutability,
  GovernanceControlsCommonProps,
} from "./types";
import {
  buildAzureDraft,
  createEmptyAzureStoredAccessPolicyDraft,
  extractAdvancedPolicy,
  normalizeAzureImmutabilityMode,
  parsePositiveDays,
  serializeAzureStoredAccessPolicies,
  toggleAzureStoredAccessPermission,
} from "./utils";

export function BucketGovernanceAzureControls(props: GovernanceControlsCommonProps) {
  const draft = buildAzureDraft(props.governance);
  const [publicMode, setPublicMode] = useState<
    Extract<BucketPublicExposureMode, "private" | "blob" | "container">
  >(draft.publicMode);
  const [storedAccessPolicies, setStoredAccessPolicies] = useState<
    AzureStoredAccessPolicyDraft[]
  >(draft.storedAccessPolicies);
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

  const refreshState = async () =>
    invalidateLinkedBucketState(
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
      await refreshState();
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
      await refreshState();
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
      await refreshState();
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
      await refreshState();
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
      items.push(
        `Immutability: ${normalizeAzureImmutabilityMode(immutability.mode)}`,
      );
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
