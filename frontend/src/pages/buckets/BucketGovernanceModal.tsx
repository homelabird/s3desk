import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Grid, Typography } from "antd";

import { APIClient } from "../../api/client";
import type { Profile } from "../../api/types";
import { formatErrorWithHint as formatErr } from "../../lib/errors";
import { BucketGovernanceAWSControls } from "./governance/aws-controls";
import { BucketGovernanceAzureControls } from "./governance/azure-controls";
import { BucketGovernanceGCSControls } from "./governance/gcs-controls";
import { BucketGovernanceOCIControls } from "./governance/oci-controls";
import { BucketGovernanceDialogShell, UnsupportedProviderNotice } from "./governance/shell";
import type { GovernanceControlsCommonProps } from "./governance/types";
import { buildGovernanceDraftKey } from "./governance/utils";

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
