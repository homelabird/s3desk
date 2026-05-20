import type { Profile } from "../../api/types";
import type { PolicyKind } from "./policyPresets";

export type BucketDecisionTone = "default" | "info" | "warning" | "danger";

export type BucketDecisionBadge = {
  label: string;
  tone: BucketDecisionTone;
};

export type BucketDecisionGuide = {
  workspaceTitle: string;
  workspaceDescription: string;
  recommendedTitle: string;
  recommendedDescription: string;
  recommendedItems: string[];
  advancedTitle: string;
  advancedDescription: string;
  advancedItems: string[];
  riskBadges: BucketDecisionBadge[];
};

const s3PolicyGuide: BucketDecisionGuide = {
  workspaceTitle: "Advanced S3 bucket policy workspace",
  workspaceDescription:
    "Choose Controls for routine bucket posture. Stay in advanced policy when you need raw bucket policy statements, cross-account principals, or condition-heavy JSON.",
  recommendedTitle: "Recommended: Controls first",
  recommendedDescription:
    "Use the typed Controls surface for daily S3 bucket posture changes.",
  recommendedItems: [
    "Block Public Access and public exposure",
    "Object Ownership and ACL posture",
    "Versioning, default encryption, and lifecycle rules",
  ],
  advancedTitle: "Advanced: Policy JSON",
  advancedDescription:
    "Use this workspace for statements that cannot be represented by typed controls.",
  advancedItems: [
    "Cross-account principals and IAM conditions",
    "Raw bucket policy JSON and provider presets",
    "Final validation, preview, and diff review",
  ],
  riskBadges: [
    { label: "Public access", tone: "warning" },
    { label: "Cross-account", tone: "warning" },
    { label: "Delete policy", tone: "danger" },
  ],
};

const gcsPolicyGuide: BucketDecisionGuide = {
  workspaceTitle: "Advanced GCS IAM policy workspace",
  workspaceDescription:
    "Choose Controls for routine exposure and protection changes. Stay in advanced IAM when you need the full policy document, etag-sensitive updates, or presets.",
  recommendedTitle: "Recommended: Controls first",
  recommendedDescription:
    "Use the typed Controls surface for common GCS bucket posture changes.",
  recommendedItems: [
    "Public/private exposure and public access prevention",
    "Uniform bucket-level access, versioning, and retention",
    "Simple IAM binding edits",
  ],
  advancedTitle: "Advanced: IAM policy",
  advancedDescription:
    "Use this workspace when you need direct IAM document control.",
  advancedItems: [
    "ETag-sensitive IAM edits",
    "Conditional bindings and full IAM JSON",
    "Provider presets, validation, preview, and diff review",
  ],
  riskBadges: [
    { label: "Public IAM", tone: "warning" },
    { label: "ETag-sensitive", tone: "info" },
    { label: "Retention", tone: "danger" },
  ],
};

const azurePolicyGuide: BucketDecisionGuide = {
  workspaceTitle: "Advanced Azure container access workspace",
  workspaceDescription:
    "Choose Controls for routine anonymous access and protection changes. Stay in advanced ACL editing when you need raw container ACL JSON or preset composition.",
  recommendedTitle: "Recommended: Controls first",
  recommendedDescription:
    "Use the typed Controls surface for common Azure container changes.",
  recommendedItems: [
    "Anonymous blob/container access",
    "Stored access policy rows",
    "Versioning, soft delete, and immutability",
  ],
  advancedTitle: "Advanced: ACL JSON",
  advancedDescription:
    "Use this workspace when the typed controls do not cover the ACL change.",
  advancedItems: [
    "Raw container ACL JSON",
    "Stored access policy presets",
    "Reset public access and stored policies after diff review",
  ],
  riskBadges: [
    { label: "Container public", tone: "warning" },
    { label: "Account-scoped", tone: "info" },
    { label: "Reset policy", tone: "danger" },
  ],
};

const awsGovernanceGuide: BucketDecisionGuide = {
  workspaceTitle: "S3 governance decision guide",
  workspaceDescription:
    "Use typed controls for routine S3 bucket posture. Open advanced policy only for raw bucket policy statements.",
  recommendedTitle: "Recommended: Typed controls",
  recommendedDescription:
    "Make routine posture changes through provider-specific controls.",
  recommendedItems: [
    "Block Public Access and Object Ownership",
    "Versioning and default encryption",
    "Lifecycle rules with one save path per section",
  ],
  advancedTitle: "Advanced: Raw policy",
  advancedDescription:
    "Use the Policy workspace for JSON statements that are outside the controls model.",
  advancedItems: [
    "Cross-account principals",
    "IAM conditions and raw policy presets",
    "Provider validation and diff review",
  ],
  riskBadges: [
    { label: "Public access", tone: "warning" },
    { label: "Ownership", tone: "info" },
    { label: "Delete policy", tone: "danger" },
  ],
};

const gcsGovernanceGuide: BucketDecisionGuide = {
  workspaceTitle: "GCS governance decision guide",
  workspaceDescription:
    "Use typed controls for routine exposure, uniform access, versioning, and retention. Open advanced IAM only for full document control.",
  recommendedTitle: "Recommended: Typed controls",
  recommendedDescription:
    "Keep common GCS bucket posture changes in structured controls.",
  recommendedItems: [
    "Public/private exposure and public access prevention",
    "Uniform bucket-level access and versioning",
    "Retention and IAM binding rows",
  ],
  advancedTitle: "Advanced: IAM policy",
  advancedDescription:
    "Use the Policy workspace for IAM cases that need exact document control.",
  advancedItems: [
    "ETag-sensitive full IAM updates",
    "Conditional IAM bindings",
    "Raw IAM JSON, presets, validation, and diff review",
  ],
  riskBadges: [
    { label: "Public IAM", tone: "warning" },
    { label: "ETag-sensitive", tone: "info" },
    { label: "Locked retention", tone: "danger" },
  ],
};

const azureGovernanceGuide: BucketDecisionGuide = {
  workspaceTitle: "Azure governance decision guide",
  workspaceDescription:
    "Use typed controls for routine anonymous access, stored policies, account-level protection, and immutability. Open advanced ACL only for raw JSON.",
  recommendedTitle: "Recommended: Typed controls",
  recommendedDescription:
    "Keep common Azure container changes in structured controls.",
  recommendedItems: [
    "Anonymous access and stored access policies",
    "Account-level versioning and soft delete",
    "Container immutability before any lock decision",
  ],
  advancedTitle: "Advanced: ACL JSON",
  advancedDescription:
    "Use the Policy workspace for ACL JSON cases outside the controls surface.",
  advancedItems: [
    "Raw container ACL JSON",
    "Preset-based stored policy composition",
    "Provider validation and diff review",
  ],
  riskBadges: [
    { label: "Container public", tone: "warning" },
    { label: "Account-scoped", tone: "info" },
    { label: "Immutability lock", tone: "danger" },
  ],
};

const ociGovernanceGuide: BucketDecisionGuide = {
  workspaceTitle: "OCI governance decision guide",
  workspaceDescription:
    "Use typed controls for OCI visibility, versioning, retention, and pre-authenticated requests. Provider-native advanced effects stay visible before editing.",
  recommendedTitle: "Recommended: Typed controls",
  recommendedDescription:
    "Keep routine OCI bucket posture and sharing changes in structured controls.",
  recommendedItems: [
    "Bucket visibility and versioning",
    "Retention rules",
    "Pre-authenticated request preservation and creation",
  ],
  advancedTitle: "Advanced: Provider effects",
  advancedDescription:
    "OCI sharing and retention changes can have provider-native constraints even without a separate raw policy editor.",
  advancedItems: [
    "Locked retention can become extend-only",
    "Existing PARs are replaced rather than edited",
    "Public object read can expose object data",
  ],
  riskBadges: [
    { label: "Public objects", tone: "warning" },
    { label: "PAR URLs", tone: "warning" },
    { label: "Locked retention", tone: "danger" },
  ],
};

export function getBucketPolicyDecisionGuide(
  policyKind: PolicyKind,
): BucketDecisionGuide {
  switch (policyKind) {
    case "gcs":
      return gcsPolicyGuide;
    case "azure":
      return azurePolicyGuide;
    case "s3":
    default:
      return s3PolicyGuide;
  }
}

export function getBucketGovernanceDecisionGuide(
  provider: Profile["provider"],
): BucketDecisionGuide {
  switch (provider) {
    case "gcp_gcs":
      return gcsGovernanceGuide;
    case "azure_blob":
      return azureGovernanceGuide;
    case "oci_object_storage":
      return ociGovernanceGuide;
    case "aws_s3":
    default:
      return awsGovernanceGuide;
  }
}
