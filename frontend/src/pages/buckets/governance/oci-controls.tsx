import { useState, type Dispatch, type SetStateAction } from "react";

import {
  OCIPreauthenticatedRequestsActions,
  OCIPreauthenticatedRequestsControlBody,
  OCIPublicExposureControlBody,
  OCIRetentionRulesActions,
  OCIRetentionRulesControlBody,
  OCIVersioningControlBody,
} from "./OCIControlBodies";
import { useGovernanceControlMutation, useGovernanceMutationState } from "./useScopedGovernanceMutation";
import {
  GovernanceControlSections,
  GovernanceControlsLayout,
  extractWarningList,
  renderWarningStack,
} from "./shell";
import {
  buildCreatedOCIPreauthenticatedRequests,
  buildOCIPublicExposureRequest,
  buildOCIProtectionRequest,
  buildOCISharingRequest,
  buildVersioningRequest,
} from "./requestBuilders";
import { buildOCISummaryTags } from "./summaryTags";
import type {
  GovernanceControlsCommonProps,
  OCISharingView,
  OCIPreauthenticatedRequestDraft,
  OCIRetentionRuleDraft,
} from "./types";
import {
  buildOCIDraft,
  buildOCISharingDraft,
  buildGovernanceDraftKey,
  getOCISharingView,
} from "./utils";

export function BucketGovernanceOCIControls(props: GovernanceControlsCommonProps) {
  // Creation URLs survive inventory refreshes, but remain local to this open bucket.
  const [createdPARs, setCreatedPARs] = useState<OCIPreauthenticatedRequestDraft[]>([]);

  return (
    <OCIControlsDraft
      key={buildGovernanceDraftKey(props.bucket, props.governance)}
      {...props}
      createdPARs={createdPARs}
      setCreatedPARs={setCreatedPARs}
    />
  );
}

function OCIControlsDraft(props: GovernanceControlsCommonProps & {
  createdPARs: OCIPreauthenticatedRequestDraft[];
  setCreatedPARs: Dispatch<SetStateAction<OCIPreauthenticatedRequestDraft[]>>;
}) {
  const draft = buildOCIDraft(props.governance);
  const sharingDraft = buildOCISharingDraft(props.governance);
  const [visibility, setVisibility] = useState<
    "private" | "object_read" | "object_read_without_list"
  >(draft.visibility);
  const [versioningStatus, setVersioningStatus] = useState<
    "enabled" | "suspended"
  >(draft.versioningStatus);
  const [retentionRules, setRetentionRules] = useState<OCIRetentionRuleDraft[]>(
    draft.retentionRules,
  );
  const [preauthenticatedRequests, setPreauthenticatedRequests] = useState<
    OCIPreauthenticatedRequestDraft[]
  >(sharingDraft);
  const { createdPARs, setCreatedPARs } = props;
  const sharing = getOCISharingView(props.governance);
  const mutationRunner = useGovernanceMutationState(props);

  const publicExposureMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Public exposure updated",
    section: "publicExposure",
    buildRequest: () => buildOCIPublicExposureRequest(visibility),
    mutationFn: (request) => props.api.buckets.putBucketPublicExposure(props.profileId, props.bucket, request),
  });

  const versioningMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Versioning updated",
    section: "versioning",
    buildRequest: () => buildVersioningRequest(versioningStatus),
    mutationFn: (request) => props.api.buckets.putBucketVersioning(props.profileId, props.bucket, request),
  });

  const protectionMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Retention rules updated",
    section: "protection",
    buildRequest: () => buildOCIProtectionRequest(retentionRules),
    mutationFn: (request) => props.api.buckets.putBucketProtection(props.profileId, props.bucket, request),
  });

  const sharingMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Sharing updated",
    section: "sharing",
    buildRequest: () => buildOCISharingRequest(preauthenticatedRequests),
    mutationFn: (request) => props.api.buckets.putBucketSharing(props.profileId, props.bucket, request),
    onSuccess: (view) => {
      setCreatedPARs((previous) =>
        buildCreatedOCIPreauthenticatedRequests(
          view as OCISharingView | undefined,
          previous,
        ),
      );
    },
  });

  const headerTags = buildOCISummaryTags(props.governance, {
    visibility,
    versioningStatus,
  });
  const anyMutationPending =
    publicExposureMutation.isPending ||
    versioningMutation.isPending ||
    protectionMutation.isPending ||
    sharingMutation.isPending;

  return (
    <GovernanceControlsLayout
      provider={props.provider}
      mobile={props.isMobile}
      bucket={props.bucket}
      onClose={props.onClose}
      closeDisabled={anyMutationPending}
      summaryTitle="OCI Controls"
      summaryDescription="Manage OCI bucket visibility, versioning, and retention rules from the typed controls surface."
      summaryTags={headerTags}
      isRefreshing={props.isFetching || anyMutationPending}
      warnings={props.governance}
      loadErrorAlert={props.loadErrorAlert}
    >
      {mutationRunner.approvalDialog}
      <GovernanceControlSections
        sections={[
          {
            testId: "bucket-governance-public-exposure",
            title: "Public Exposure",
            description:
              "Choose whether objects are private, publicly readable, or readable without bucket listing.",
            saveLoading: publicExposureMutation.isPending,
            onSave: () => publicExposureMutation.mutate(),
            content: (
              <OCIPublicExposureControlBody
                visibility={visibility}
                setVisibility={setVisibility}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.publicExposure),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-versioning",
            title: "Versioning",
            description: "Enable or suspend OCI bucket versioning. Once enabled, versioning cannot be disabled.",
            saveLoading: versioningMutation.isPending,
            onSave: () => versioningMutation.mutate(),
            content: (
              <OCIVersioningControlBody
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
            title: "Retention Rules",
            description:
              "Create, extend, edit, or remove OCI retention rules. Locked rules can only increase in duration and cannot be removed.",
            saveLoading: protectionMutation.isPending,
            onSave: () => protectionMutation.mutate(),
            actions: (
              <OCIRetentionRulesActions
                retentionRules={retentionRules}
                setRetentionRules={setRetentionRules}
              />
            ),
            content: (
              <OCIRetentionRulesControlBody
                retentionRules={retentionRules}
                setRetentionRules={setRetentionRules}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.protection),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-sharing",
            title: "Pre-Authenticated Requests",
            description:
              "Existing OCI PARs are preserved or deleted here. To change an existing PAR, remove it and create a replacement.",
            wide: true,
            saveLoading: sharingMutation.isPending,
            onSave: () => sharingMutation.mutate(),
            actions: (
              <OCIPreauthenticatedRequestsActions
                preauthenticatedRequests={preauthenticatedRequests}
                setPreauthenticatedRequests={setPreauthenticatedRequests}
              />
            ),
            content: (
              <OCIPreauthenticatedRequestsControlBody
                createdPARs={createdPARs}
                preauthenticatedRequests={preauthenticatedRequests}
                setPreauthenticatedRequests={setPreauthenticatedRequests}
                warnings={renderWarningStack(extractWarningList(sharing))}
              />
            ),
          },
        ]}
      />
    </GovernanceControlsLayout>
  );
}
