import { useState } from "react";

import type { BucketPublicExposureMode } from "../../../api/types";
import {
  AzurePublicExposureControlBody,
  AzureLegalHoldControlBody,
  AzureStoredAccessPoliciesActions,
  AzureStoredAccessPoliciesControlBody,
  AzureVersioningControlBody,
} from "./AzureControlBodies";
import { AzureProtectionControlsBody } from "./AzureProtectionControlsBody";
import { useGovernanceControlMutation, useLinkedGovernanceMutationState } from "./useScopedGovernanceMutation";
import {
  GovernanceControlSections,
  GovernanceControlsLayout,
  extractWarningList,
  renderWarningStack,
} from "./shell";
import {
  buildAzureAccessRequest,
  buildAzureLegalHoldRequest,
  buildAzureProtectionRequest,
  buildAzurePublicExposureRequest,
  buildVersioningRequest,
} from "./requestBuilders";
import { buildAzureSummaryTags } from "./summaryTags";
import type {
  AzureImmutabilityView,
  AzureStoredAccessPolicyDraft,
  GovernanceControlsCommonProps,
} from "./types";
import {
  buildAzureDraft,
  extractAdvancedPolicy,
  normalizeAzureImmutabilityMode,
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
  const [legalHoldTagsText, setLegalHoldTagsText] = useState(
    draft.legalHoldTags.join(", "),
  );
  const immutability = props.governance.protection?.immutability as
    | AzureImmutabilityView
    | undefined;
  const immutabilityEditable = immutability?.editable !== false;
  const immutabilityLocked =
    normalizeAzureImmutabilityMode(immutability?.mode) === "locked";
  const legalHoldEditable = draft.legalHoldEditable;
  const mutationRunner = useLinkedGovernanceMutationState(props);

  const publicExposureMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Anonymous access updated",
    mutationFn: () =>
      props.api.buckets.putBucketPublicExposure(
        props.profileId,
        props.bucket,
        buildAzurePublicExposureRequest(publicMode),
      ),
  });

  const accessMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Stored access policies updated",
    mutationFn: () =>
      props.api.buckets.putBucketAccess(
        props.profileId,
        props.bucket,
        buildAzureAccessRequest(storedAccessPolicies),
      ),
  });

  const protectionMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Protection updated",
    mutationFn: () =>
      props.api.buckets.putBucketProtection(
        props.profileId,
        props.bucket,
        buildAzureProtectionRequest({
          softDeleteEnabled,
          softDeleteDays,
          immutabilityEnabled,
          immutabilityDays,
          immutabilityMode,
          immutabilityEditable,
          allowProtectedAppendWrites,
          allowProtectedAppendWritesAll,
          immutability,
        }),
      ),
  });

  const versioningMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Versioning updated",
    mutationFn: () =>
      props.api.buckets.putBucketVersioning(
        props.profileId,
        props.bucket,
        buildVersioningRequest(versioningStatus),
      ),
  });

  const legalHoldMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Legal hold updated",
    mutationFn: () =>
      props.api.buckets.putBucketProtection(
        props.profileId,
        props.bucket,
        buildAzureLegalHoldRequest(legalHoldTagsText),
      ),
  });

  const headerTags = buildAzureSummaryTags(props.governance, {
    publicMode,
    versioningStatus,
  });
  const anyMutationPending =
    publicExposureMutation.isPending ||
    accessMutation.isPending ||
    protectionMutation.isPending ||
    versioningMutation.isPending ||
    legalHoldMutation.isPending;

  return (
    <GovernanceControlsLayout
      provider={props.provider}
      mobile={props.isMobile}
      bucket={props.bucket}
      onClose={props.onClose}
      closeDisabled={anyMutationPending}
      summaryTitle="Azure Controls"
      summaryDescription="Manage anonymous access, stored access policies, account-level versioning, soft delete, container immutability, and legal-hold tags from one controls surface."
      summaryTags={headerTags}
      isRefreshing={props.isFetching || anyMutationPending}
      warnings={props.governance}
      advancedPolicy={extractAdvancedPolicy(props.governance)}
      onOpenAdvancedPolicy={props.onOpenAdvancedPolicy}
    >
      <GovernanceControlSections
        sections={[
          {
            testId: "bucket-governance-public-exposure",
            title: "Anonymous Access",
            description:
              "Choose whether blobs or the full container can be listed publicly.",
            saveLoading: publicExposureMutation.isPending,
            onSave: () => publicExposureMutation.mutate(),
            content: (
              <AzurePublicExposureControlBody
                publicMode={publicMode}
                setPublicMode={setPublicMode}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.publicExposure),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-versioning",
            title: "Versioning",
            description:
              "Azure Blob versioning is configured at the storage-account level and affects every container in the account.",
            saveLoading: versioningMutation.isPending,
            onSave: () => versioningMutation.mutate(),
            content: (
              <AzureVersioningControlBody
                versioningStatus={versioningStatus}
                setVersioningStatus={setVersioningStatus}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.versioning),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-protection",
            title: "Protection",
            description:
              "Soft delete stays account-scoped. Container immutability can be created as unlocked, then optionally locked for extend-only management.",
            saveLoading: protectionMutation.isPending,
            onSave: () => protectionMutation.mutate(),
            content: (
              <AzureProtectionControlsBody
                softDeleteEnabled={softDeleteEnabled}
                setSoftDeleteEnabled={setSoftDeleteEnabled}
                softDeleteDays={softDeleteDays}
                setSoftDeleteDays={setSoftDeleteDays}
                immutabilityEditable={immutabilityEditable}
                immutabilityLocked={immutabilityLocked}
                immutabilityEnabled={immutabilityEnabled}
                setImmutabilityEnabled={setImmutabilityEnabled}
                immutabilityDays={immutabilityDays}
                setImmutabilityDays={setImmutabilityDays}
                immutabilityMode={immutabilityMode}
                setImmutabilityMode={setImmutabilityMode}
                allowProtectedAppendWrites={allowProtectedAppendWrites}
                setAllowProtectedAppendWrites={setAllowProtectedAppendWrites}
                allowProtectedAppendWritesAll={allowProtectedAppendWritesAll}
                setAllowProtectedAppendWritesAll={
                  setAllowProtectedAppendWritesAll
                }
                warnings={renderWarningStack(
                  extractWarningList(props.governance.protection),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-legal-hold",
            title: "Legal hold",
            description:
              "Manage Azure container legal hold tags explicitly. Clearing the field releases every tag currently listed on the container.",
            saveLoading: legalHoldMutation.isPending,
            saveDisabled: !legalHoldEditable,
            onSave: () => legalHoldMutation.mutate(),
            content: (
              <AzureLegalHoldControlBody
                legalHold={draft.legalHold}
                legalHoldTagsText={legalHoldTagsText}
                setLegalHoldTagsText={setLegalHoldTagsText}
                legalHoldEditable={legalHoldEditable}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.protection),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-access",
            title: "Stored Access Policies",
            description:
              "Edit stored access policies as named entries instead of raw JSON. Azure allows up to five policies per container.",
            wide: true,
            saveLoading: accessMutation.isPending,
            onSave: () => accessMutation.mutate(),
            actions: (
              <AzureStoredAccessPoliciesActions
                storedAccessPolicies={storedAccessPolicies}
                setStoredAccessPolicies={setStoredAccessPolicies}
              />
            ),
            content: (
              <AzureStoredAccessPoliciesControlBody
                storedAccessPolicies={storedAccessPolicies}
                setStoredAccessPolicies={setStoredAccessPolicies}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.access),
                )}
              />
            ),
          },
        ]}
      />
    </GovernanceControlsLayout>
  );
}
