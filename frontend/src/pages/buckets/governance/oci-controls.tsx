import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Input, Tag, Typography, message } from "antd";
import { useState } from "react";

import type {
  BucketGovernanceView,
  BucketProtectionPutRequest,
  BucketVersioningPutRequest,
} from "../../../api/types";
import { FormField } from "../../../components/FormField";
import { NativeSelect } from "../../../components/NativeSelect";
import { formatErrorWithHint as formatErr } from "../../../lib/errors";
import styles from "../BucketGovernanceModal.module.css";
import { invalidateGovernance } from "./invalidation";
import {
  BucketGovernanceDialogShell,
  GovernanceSummaryCard,
  extractWarningList,
  renderWarningStack,
} from "./shell";
import type {
  BucketProtectionPutRequestWithOCIRetention,
  BucketSharingPutClientRequest,
  GovernanceControlsCommonProps,
  OCISharingView,
  OCIPreauthenticatedRequestDraft,
  OCIRetentionRuleDraft,
  OCIRetentionView,
} from "./types";
import {
  buildOCIDraft,
  buildOCISharingDraft,
  parsePositiveDays,
} from "./utils";

export function BucketGovernanceOCIControls(props: GovernanceControlsCommonProps) {
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

  const refreshState = async () =>
    invalidateGovernance(props.queryClient, props.profileId, props.bucket);

  const publicExposureMutation = useMutation({
    mutationFn: () =>
      props.api.putBucketPublicExposure(props.profileId, props.bucket, {
        visibility,
      }),
    onSuccess: async () => {
      message.success("Public exposure updated");
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
      await refreshState();
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
      await refreshState();
    },
    onError: (err) => message.error(formatErr(err)),
  });

  const headerTags: string[] = [];
  headerTags.push(
    `Visibility: ${props.governance.publicExposure?.visibility ?? visibility}`,
  );
  headerTags.push(
    `Versioning: ${props.governance.versioning?.status ?? versioningStatus}`,
  );
  headerTags.push(
    retentionRuleCount > 0
      ? `Retention rules: ${retentionRuleCount}`
      : "Retention rules: 0",
  );
  headerTags.push(
    `PARs: ${
      Array.isArray(sharing?.preauthenticatedRequests)
        ? sharing.preauthenticatedRequests.length
        : 0
    }`,
  );

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
