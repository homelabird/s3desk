import { Alert, Typography } from "antd";
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
  children: (policyData: BucketPolicyResponse) => ReactNode;
}) {
  if (props.isError) {
    return (
      <BucketPolicyDialogShell
        mobile={props.mobile}
        title={`Policy: ${props.bucket}`}
        onClose={props.onClose}
      >
        <Alert
          type="error"
          showIcon
          title="Failed to load policy"
          description={formatErr(props.error)}
        />
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

  return <>{props.children(props.policyData)}</>;
}
