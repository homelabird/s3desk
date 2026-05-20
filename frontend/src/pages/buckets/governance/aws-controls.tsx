import { useMemo, useState } from "react";

import type {
  BucketObjectOwnershipMode,
} from "../../../api/types";
import {
  AWSEncryptionControlBody,
  AWSLifecycleControlBody,
  AWSObjectOwnershipControlBody,
  AWSPublicExposureControlBody,
  AWSVersioningControlBody,
} from "./AWSControlBodies";
import {
  useGovernanceControlMutation,
  useLinkedGovernanceMutationState,
} from "./useScopedGovernanceMutation";
import {
  GovernanceControlSections,
  GovernanceControlsLayout,
  extractWarningList,
  renderWarningStack,
} from "./shell";
import {
  buildAWSAccessRequest,
  buildAWSEncryptionRequest,
  buildAWSLifecycleRequest,
  buildAWSPublicExposureRequest,
  buildVersioningRequest,
} from "./requestBuilders";
import { buildAWSSummaryTags } from "./summaryTags";
import type { GovernanceControlsCommonProps } from "./types";
import { buildGovernanceDraft, extractAdvancedPolicy } from "./utils";

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
  const mutationRunner = useLinkedGovernanceMutationState(props);

  const publicExposureMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Public exposure updated",
    mutationFn: () =>
      props.api.buckets.putBucketPublicExposure(
        props.profileId,
        props.bucket,
        buildAWSPublicExposureRequest(publicAccessBlock),
      ),
  });

  const accessMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Object ownership updated",
    mutationFn: () =>
      props.api.buckets.putBucketAccess(
        props.profileId,
        props.bucket,
        buildAWSAccessRequest(objectOwnership),
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

  const encryptionMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Default encryption updated",
    mutationFn: () =>
      props.api.buckets.putBucketEncryption(
        props.profileId,
        props.bucket,
        buildAWSEncryptionRequest(encryptionMode, kmsKeyId),
      ),
  });

  const lifecycleMutation = useGovernanceControlMutation(mutationRunner, {
    successMessage: "Lifecycle rules updated",
    mutationFn: () =>
      props.api.buckets.putBucketLifecycle(
        props.profileId,
        props.bucket,
        buildAWSLifecycleRequest(lifecycleText),
      ),
  });

  const anyMutationPending =
    publicExposureMutation.isPending ||
    accessMutation.isPending ||
    versioningMutation.isPending ||
    encryptionMutation.isPending ||
    lifecycleMutation.isPending;

  const advancedPolicy = extractAdvancedPolicy(props.governance);
  const headerTags = useMemo(
    () => buildAWSSummaryTags(props.governance),
    [props.governance],
  );

  return (
    <GovernanceControlsLayout
      provider={props.provider}
      mobile={props.isMobile}
      bucket={props.bucket}
      onClose={props.onClose}
      closeDisabled={anyMutationPending}
      summaryTitle="AWS Controls"
      summaryDescription="Manage the recommended S3 control surface directly. Advanced raw policy editing remains available under Policy."
      summaryTags={headerTags}
      isRefreshing={props.isFetching || anyMutationPending}
      warnings={props.governance}
      advancedPolicy={advancedPolicy}
      onOpenAdvancedPolicy={props.onOpenAdvancedPolicy}
    >
      <GovernanceControlSections
        sections={[
          {
            testId: "bucket-governance-public-exposure",
            title: "Public Exposure",
            description: "Control the four Block Public Access flags directly.",
            saveLoading: publicExposureMutation.isPending,
            onSave: () => publicExposureMutation.mutate(),
            content: (
              <AWSPublicExposureControlBody
                publicAccessBlock={publicAccessBlock}
                setPublicAccessBlock={setPublicAccessBlock}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.publicExposure),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-access",
            title: "Object Ownership",
            description:
              "Prefer bucket-owner-enforced ownership unless ACL interoperability is required.",
            saveLoading: accessMutation.isPending,
            onSave: () => accessMutation.mutate(),
            content: (
              <AWSObjectOwnershipControlBody
                objectOwnership={objectOwnership}
                setObjectOwnership={setObjectOwnership}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.access),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-versioning",
            title: "Versioning",
            description: "Choose whether new object versions are retained.",
            saveLoading: versioningMutation.isPending,
            onSave: () => versioningMutation.mutate(),
            content: (
              <AWSVersioningControlBody
                versioningStatus={versioningStatus}
                setVersioningStatus={setVersioningStatus}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.versioning),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-encryption",
            title: "Default Encryption",
            description:
              "Use SSE-S3 as a baseline or promote to SSE-KMS for managed key controls.",
            saveLoading: encryptionMutation.isPending,
            onSave: () => encryptionMutation.mutate(),
            content: (
              <AWSEncryptionControlBody
                encryptionMode={encryptionMode}
                setEncryptionMode={setEncryptionMode}
                kmsKeyId={kmsKeyId}
                setKmsKeyId={setKmsKeyId}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.encryption),
                )}
              />
            ),
          },
          {
            testId: "bucket-governance-lifecycle",
            title: "Lifecycle",
            description:
              "Edit AWS lifecycle rules as JSON. Use an empty array to clear rules.",
            wide: true,
            saveLoading: lifecycleMutation.isPending,
            onSave: () => lifecycleMutation.mutate(),
            content: (
              <AWSLifecycleControlBody
                lifecycleText={lifecycleText}
                setLifecycleText={setLifecycleText}
                warnings={renderWarningStack(
                  extractWarningList(props.governance.lifecycle),
                )}
              />
            ),
          },
        ]}
      />
    </GovernanceControlsLayout>
  );
}
