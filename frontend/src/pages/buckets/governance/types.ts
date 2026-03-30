import type { QueryClient } from "@tanstack/react-query";

import type { APIClient } from "../../../api/client";
import type {
  BucketAccessBinding,
  BucketAdvancedView,
  BucketBlockPublicAccess,
  BucketGovernanceView,
  BucketObjectOwnershipMode,
  BucketProtectionPutRequest,
  BucketPublicExposureMode,
  Profile,
} from "../../../api/types";

export type GovernanceControlsCommonProps = {
  api: APIClient;
  apiToken: string;
  profileId: string;
  provider: Profile["provider"];
  bucket: string;
  governance: BucketGovernanceView;
  isFetching: boolean;
  isMobile: boolean;
  queryClient: QueryClient;
  onClose: () => void;
  onOpenAdvancedPolicy?: (bucket: string) => void;
};

export type GCSBindingDraft = {
  role: string;
  membersText: string;
  conditionEnabled: boolean;
  conditionTitle: string;
  conditionDescription: string;
  conditionExpression: string;
  unsupportedConditionJSON: string;
};

export type AzureStoredAccessPolicyDraft = {
  id: string;
  start: string;
  expiry: string;
  permission: string;
};

export type BucketGovernanceDraft = {
  publicAccessBlock: BucketBlockPublicAccess;
  objectOwnership: BucketObjectOwnershipMode;
  versioningStatus: "enabled" | "suspended";
  encryptionMode: "sse_s3" | "sse_kms";
  kmsKeyId: string;
  lifecycleText: string;
};

export type GCSGovernanceDraft = {
  publicMode: Extract<BucketPublicExposureMode, "private" | "public">;
  publicAccessPrevention: boolean;
  etag: string;
  bindings: GCSBindingDraft[];
  uniformAccess: boolean;
  versioningStatus: "enabled" | "disabled";
  retentionEnabled: boolean;
  retentionDays: string;
};

export type AzureGovernanceDraft = {
  publicMode: Extract<BucketPublicExposureMode, "private" | "blob" | "container">;
  storedAccessPolicies: AzureStoredAccessPolicyDraft[];
  versioningStatus: "enabled" | "disabled";
  softDeleteEnabled: boolean;
  softDeleteDays: string;
  immutabilityEnabled: boolean;
  immutabilityDays: string;
  immutabilityMode: "unlocked" | "locked";
  immutabilityEditable: boolean;
  legalHold: boolean;
  allowProtectedAppendWrites: boolean;
  allowProtectedAppendWritesAll: boolean;
};

export type OCIGovernanceDraft = {
  visibility: "private" | "object_read" | "object_read_without_list";
  versioningStatus: "enabled" | "disabled";
  retentionRules: OCIRetentionRuleDraft[];
};

export type AzureImmutabilityView = {
  enabled: boolean;
  mode?: string;
  until?: string;
  days?: number;
  etag?: string;
  editable?: boolean;
  legalHold?: boolean;
  allowProtectedAppendWrites?: boolean;
  allowProtectedAppendWritesAll?: boolean;
};

export type BucketProtectionPutRequestWithAzureImmutability =
  BucketProtectionPutRequest & {
    immutability?: AzureImmutabilityView;
  };

export type OCIRetentionRuleView = {
  id?: string;
  displayName?: string;
  days?: number;
  locked?: boolean;
  timeModified?: string;
};

export type OCIRetentionView = {
  enabled: boolean;
  days?: number;
  locked?: boolean;
  rules?: OCIRetentionRuleView[];
};

export type OCIRetentionRuleDraft = {
  id: string;
  displayName: string;
  days: string;
  locked: boolean;
  timeModified: string;
};

export type BucketProtectionPutRequestWithOCIRetention = BucketProtectionPutRequest & {
  retention?: OCIRetentionView;
};

export type OCISharingView = {
  provider?: string;
  bucket?: string;
  preauthenticatedSupport?: boolean;
  preauthenticatedRequests?: OCIPreauthenticatedRequestDraft[];
  warnings?: string[];
};

export type OCIPreauthenticatedRequestDraft = {
  id: string;
  name: string;
  accessType: "AnyObjectRead" | "AnyObjectWrite" | "AnyObjectReadWrite";
  bucketListingAction: "Deny" | "ListObjects";
  objectName: string;
  timeCreated: string;
  timeExpires: string;
  accessUri: string;
};

export type BucketSharingPutClientRequest = {
  preauthenticatedRequests?: Array<{
    id?: string;
    name?: string;
    accessType?: string;
    bucketListingAction?: string;
    objectName?: string;
    timeCreated?: string;
    timeExpires?: string;
    accessUri?: string;
  }>;
};

export const azureStoredAccessPermissionOptions = [
  { value: "r", label: "Read" },
  { value: "w", label: "Write" },
  { value: "d", label: "Delete" },
  { value: "l", label: "List" },
  { value: "a", label: "Add" },
  { value: "c", label: "Create" },
  { value: "u", label: "Update" },
  { value: "p", label: "Process" },
] as const;

export type AzureStoredAccessPermission =
  (typeof azureStoredAccessPermissionOptions)[number]["value"];

export type WarningCarrier = {
  warnings?: string[];
};

export type AdvancedPolicyCarrier = {
  advanced?: BucketAdvancedView;
  access?: {
    advanced?: BucketAdvancedView;
  };
};

export type GCSConditionDraft = Pick<
  GCSBindingDraft,
  | "conditionEnabled"
  | "conditionTitle"
  | "conditionDescription"
  | "conditionExpression"
  | "unsupportedConditionJSON"
>;

export type BucketAccessBindingCondition = BucketAccessBinding["condition"];
