import { useMemo, useState } from "react";

import type {
  BucketPublicExposureMode,
} from "../../../api/types";
import {
  GCSIAMBindingsActions,
  GCSIAMBindingsControlBody,
  GCSPublicExposureControlBody,
  GCSProtectionControlBody,
  GCSRetentionControlBody,
  GCSVersioningControlBody,
} from "./GCSControlBodies";
import { useGovernanceControlMutation, useLinkedGovernanceMutationState } from "./useScopedGovernanceMutation";
import {
  GovernanceControlSections,
  GovernanceControlsLayout,
  extractWarningList,
  renderWarningStack,
} from "./shell";
import {
  buildGCSAccessRequest,
  buildGCSPublicExposureRequest,
  buildGCSRetentionRequest,
  buildGCSUniformAccessRequest,
  buildVersioningRequest,
} from "./requestBuilders";
import { buildGCSSummaryTags } from "./summaryTags";
import type { GCSBindingDraft, GovernanceControlsCommonProps } from "./types";
import {
  buildGCSDraft,
  extractAdvancedPolicy,
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
  const mutationRunner = useLinkedGovernanceMutationState(props);

  const publicExposureMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Public exposure updated",
    mutationFn: () =>
      props.api.buckets.putBucketPublicExposure(
        props.profileId,
        props.bucket,
        buildGCSPublicExposureRequest(publicMode, publicAccessPrevention),
      ),
  });

  const accessMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "IAM bindings updated",
    mutationFn: () =>
      props.api.buckets.putBucketAccess(
        props.profileId,
        props.bucket,
        buildGCSAccessRequest(bindings, etag),
      ),
  });

  const protectionMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Uniform access updated",
    mutationFn: () =>
      props.api.buckets.putBucketProtection(
        props.profileId,
        props.bucket,
        buildGCSUniformAccessRequest(uniformAccess),
      ),
  });

  const retentionMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Retention updated",
    mutationFn: () =>
      props.api.buckets.putBucketProtection(
        props.profileId,
        props.bucket,
        buildGCSRetentionRequest(retentionEnabled, retentionDays),
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

  const headerTags = useMemo(
    () =>
      buildGCSSummaryTags(props.governance, {
        publicMode,
        publicAccessPrevention,
        versioningStatus,
      }),
    [props.governance, publicAccessPrevention, publicMode, versioningStatus],
  );
  const anyMutationPending =
    publicExposureMutation.isPending ||
    accessMutation.isPending ||
    protectionMutation.isPending ||
    retentionMutation.isPending ||
    versioningMutation.isPending;

  return (
    <GovernanceControlsLayout
      mobile={props.isMobile}
      bucket={props.bucket}
      onClose={props.onClose}
      closeDisabled={anyMutationPending}
      summaryTitle="GCS Controls"
      summaryDescription="Manage IAM exposure, uniform bucket-level access, versioning, and retention from the typed GCS controls surface."
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
            title: "Public Exposure",
            description:
              "Toggle whether public IAM members are present on the bucket.",
            saveLoading: publicExposureMutation.isPending,
            onSave: () => publicExposureMutation.mutate(),
            content: (
              <GCSPublicExposureControlBody
                publicMode={publicMode}
                setPublicMode={setPublicMode}
                publicAccessPrevention={publicAccessPrevention}
                setPublicAccessPrevention={setPublicAccessPrevention}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.publicExposure),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-protection",
            title: "Protection",
            description:
              "Uniform bucket-level access disables object ACLs and keeps all authorization on IAM bindings.",
            saveLoading: protectionMutation.isPending,
            onSave: () => protectionMutation.mutate(),
            content: (
              <GCSProtectionControlBody
                uniformAccess={uniformAccess}
                setUniformAccess={setUniformAccess}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.protection),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-versioning",
            title: "Versioning",
            description:
              "Enable version history for overwritten or deleted objects.",
            saveLoading: versioningMutation.isPending,
            onSave: () => versioningMutation.mutate(),
            content: (
              <GCSVersioningControlBody
                versioningStatus={versioningStatus}
                setVersioningStatus={setVersioningStatus}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.versioning),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-retention",
            title: "Retention",
            description:
              "Apply a bucket retention period in days. Locked retention is displayed read-only here.",
            saveLoading: retentionMutation.isPending,
            saveDisabled: retentionLocked,
            onSave: () => retentionMutation.mutate(),
            content: (
              <GCSRetentionControlBody
                retentionEnabled={retentionEnabled}
                setRetentionEnabled={setRetentionEnabled}
                retentionDays={retentionDays}
                setRetentionDays={setRetentionDays}
                retentionLocked={retentionLocked}
                retainUntil={props.governance.protection?.retention?.retainUntil}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.protection),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-access",
            title: "IAM Bindings",
            description:
              "Edit bindings one entry at a time. Members are one per line, while conditional expressions stay as optional JSON fragments.",
            wide: true,
            saveLoading: accessMutation.isPending,
            onSave: () => accessMutation.mutate(),
            actions: (
              <GCSIAMBindingsActions setBindings={setBindings} />
            ),
            content: (
              <GCSIAMBindingsControlBody
                etag={etag}
                setETag={setETag}
                bindings={bindings}
                setBindings={setBindings}
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
