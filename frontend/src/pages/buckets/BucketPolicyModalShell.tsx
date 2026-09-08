import { Alert, Button, Typography } from "antd";
import type { ReactNode } from "react";

import type { BucketPolicyResponse } from "../../api/types";
import { formatErrorWithHint as formatErr } from "../../lib/errors";
import { BucketPolicyDialogShell } from "./policy/DialogShell";

export function BucketPolicyModalShell(props: {
  bucket: string;
  mobile: boolean;
  onClose: () => void;
  isError: boolean;
  error: unknown;
  policyData: BucketPolicyResponse | undefined;
  isFetching: boolean;
  onRetry: () => void;
  children: (policyData: BucketPolicyResponse, loadErrorAlert: ReactNode) => ReactNode;
}) {
  const loadErrorAlert = props.isError ? (
    <Alert
      type={props.policyData ? "warning" : "error"}
      showIcon
      title={props.policyData ? "Could not refresh policy" : "Failed to load policy"}
      description={formatErr(props.error)}
      action={
        <Button
          onClick={props.onRetry}
          loading={props.isFetching}
          disabled={props.isFetching}
          aria-label="Retry loading policy"
        >
          Retry
        </Button>
      }
    />
  ) : null;

  if (props.isError && !props.policyData) {
    return (
      <BucketPolicyDialogShell
        mobile={props.mobile}
        title={`Policy: ${props.bucket}`}
        onClose={props.onClose}
      >
        {loadErrorAlert}
      </BucketPolicyDialogShell>
    );
  }

  if (!props.policyData) {
    return (
      <BucketPolicyDialogShell
        mobile={props.mobile}
        title={`Policy: ${props.bucket}`}
        onClose={props.onClose}
      >
        <Typography.Text type="secondary">Loading…</Typography.Text>
      </BucketPolicyDialogShell>
    );
  }

  return <>{props.children(props.policyData, loadErrorAlert)}</>;
}
