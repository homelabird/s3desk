import { Alert, Button, Typography } from "antd";

import styles from "./BucketPolicyModal.module.css";
import type { PolicyKind } from "./policyPresets";

function getPolicyWorkspaceSummary(kind: PolicyKind) {
  if (kind === "gcs") {
    return {
      title: "Advanced GCS IAM policy workspace",
      description:
        "Use this view when you need the full IAM policy document, etag-sensitive updates, presets, validation, or a diff before saving.",
    };
  }
  if (kind === "azure") {
    return {
      title: "Advanced Azure container access workspace",
      description:
        "Use this view for full ACL JSON review, stored access policy composition, provider validation, and final diff review before saving.",
    };
  }
  return {
    title: "Advanced S3 bucket policy workspace",
    description:
      "Use this view for raw bucket policy statements, cross-account access rules, provider validation, and diff review before saving.",
  };
}

export function BucketPolicyWorkspaceHeader(props: {
  policyKind: PolicyKind;
  controlsShortcut: { title: string; description: string } | null;
  bucket: string;
  onOpenControls?: (bucket: string) => void;
}) {
  const summary = getPolicyWorkspaceSummary(props.policyKind);
  return (
    <>
      <Alert
        className={styles.workspaceSummary}
        type="info"
        showIcon
        title={summary.title}
        description={summary.description}
      />
      {props.controlsShortcut ? (
        <div
          className={styles.awsShortcutBanner}
          data-testid="bucket-policy-controls-shortcut"
        >
          <div className={styles.awsShortcutCopy}>
            <Typography.Text strong>{props.controlsShortcut.title}</Typography.Text>
            <Typography.Text type="secondary">
              {props.controlsShortcut.description}
            </Typography.Text>
          </div>
          <Button onClick={() => props.onOpenControls?.(props.bucket)}>
            Open Controls
          </Button>
        </div>
      ) : null}
    </>
  );
}
