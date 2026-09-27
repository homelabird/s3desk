import { useEffect, useState } from "react";
import { Button, Typography } from "antd";
import { DialogModal } from "../../../components/DialogModal";
import type { GovernanceControlsCommonProps } from "./types";

export type GovernanceSection = "access" | "publicExposure" | "protection" | "versioning" | "encryption" | "lifecycle" | "sharing";
const fieldLabels: Record<string, string> = {
  blockPublicAccess: "Block Public Access", objectOwnership: "Object ownership",
  publicAccessPrevention: "Public access prevention", storedAccessPolicies: "Stored access policies",
  preauthenticatedRequests: "Preauthenticated requests", uniformAccess: "Uniform access",
  softDelete: "Soft delete", legalHoldTags: "Legal hold tags", kmsKeyId: "KMS key",
  bindings: "IAM bindings", etag: "Policy revision", status: "Versioning status",
  mode: "Mode", visibility: "Visibility", retention: "Retention", immutability: "Immutability", rules: "Rules",
};
type Approval = { section: GovernanceSection; request: Record<string, unknown>; resolve: (approved: boolean) => void };

function preview(value: unknown): string {
  if (value === undefined) return "Not reported";
  return JSON.stringify(value, (key, item) => key === "accessUri" ? "[link omitted]" : item, 2);
}

export function useGovernanceApproval(args: Pick<GovernanceControlsCommonProps, "profileId" | "provider" | "bucket" | "governance">) {
  const [approval, setApproval] = useState<Approval | null>(null);
  useEffect(() => () => { approval?.resolve(false); }, [approval]);
  const finish = (approved: boolean) => {
    approval?.resolve(approved);
    setApproval(null);
  };
  const requestApproval = (section: GovernanceSection, request: object) => new Promise<boolean>((resolve) => {
    setApproval((previous) => {
      previous?.resolve(false);
      return { section, request: request as Record<string, unknown>, resolve };
    });
  });
  const current = approval ? args.governance[approval.section] as Record<string, unknown> | undefined : undefined;
  return {
    requestApproval,
    approvalDialog: approval ? (
      <DialogModal open title="Review bucket changes" onClose={() => finish(false)} width="min(96vw, 760px)"
        initialFocusSelector='[data-governance-cancel]'
        footer={<><Button data-governance-cancel onClick={() => finish(false)}>Cancel</Button><Button type="primary" onClick={() => finish(true)}>Apply changes</Button></>}>
        <p><strong>{args.bucket}</strong> · {args.provider} · Profile: {args.profileId}</p>
        {args.provider === "azure_blob" && (approval.section === "versioning" || (approval.section === "protection" && "softDelete" in approval.request)) ?
          <p><Typography.Text type="warning">Account scope: versioning and soft delete affect the storage account in this profile, including other containers.</Typography.Text></p> : null}
        <p>Review the submitted fields below. Fields omitted from the request are not listed. Current settings will be checked again before saving.</p>
        {approval.section === "protection" ? <p><Typography.Text type="warning">Locked retention can be irreversible. Review the retention period and lock mode before applying.</Typography.Text></p> : null}
        {args.provider === "gcp_gcs" && approval.section === "protection" && "uniformAccess" in approval.request ?
          <p><Typography.Text type="warning">{approval.request.uniformAccess
            ? "Enabling uniform access revokes access granted only by object ACLs. After 90 consecutive days it cannot be disabled."
            : "Disabling uniform access restores saved object ACLs and can restore earlier access grants. Bucket IAM conditions must be removed first."}</Typography.Text></p> : null}
        <Typography.Text type="secondary">Configuration confirmation does not verify effective access permissions.</Typography.Text>
        {Object.entries(approval.request).map(([field, value]) => {
          const before = field === "legalHoldTags" ? (current?.immutability as Record<string, unknown> | undefined)?.legalHoldTags
            : field === "objectOwnership" ? (current?.objectOwnership as Record<string, unknown> | undefined)?.mode
            : current?.[field];
          return <section key={field}>
            <h3>{fieldLabels[field] ?? field}</h3>
            <strong>Current</strong><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{preview(before)}</pre>
            <strong>Proposed</strong><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{preview(value)}</pre>
          </section>;
        })}
      </DialogModal>
    ) : null,
  };
}
