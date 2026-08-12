import type {
  BucketAccessPutRequest,
  BucketBlockPublicAccess,
  BucketEncryptionPutRequest,
  BucketLifecyclePutRequest,
  BucketObjectOwnershipMode,
  BucketProtectionPutRequest,
  BucketPublicExposurePutRequest,
  BucketSharingPutClientRequest,
  BucketVersioningPutRequest,
} from "../../../api/types";
import type {
  AzureGovernanceDraft,
  AzureImmutabilityView,
  AzureStoredAccessPolicyDraft,
  BucketProtectionPutRequestWithAzureImmutability,
  BucketProtectionPutRequestWithOCIRetention,
  GCSBindingDraft,
  GCSGovernanceDraft,
  OCIGovernanceDraft,
  OCIPreauthenticatedRequestDraft,
  OCIRetentionRuleDraft,
  OCISharingView,
} from "./types";
import {
	parseAzureLegalHoldTags,
	parseJSONArray,
  parsePositiveDays,
  serializeAzureStoredAccessPolicies,
  serializeGCSBindings,
} from "./utils";

export function buildAWSPublicExposureRequest(
  publicAccessBlock: BucketBlockPublicAccess,
): BucketPublicExposurePutRequest {
  return { blockPublicAccess: publicAccessBlock };
}

export function buildAWSAccessRequest(
  objectOwnership: BucketObjectOwnershipMode,
): BucketAccessPutRequest {
  return { objectOwnership };
}

export function buildVersioningRequest(
  status: NonNullable<BucketVersioningPutRequest["status"]>,
): BucketVersioningPutRequest {
  return { status };
}

export function buildAWSEncryptionRequest(
  encryptionMode: "sse_s3" | "sse_kms",
  kmsKeyId: string,
): BucketEncryptionPutRequest {
  return {
    mode: encryptionMode,
    kmsKeyId:
      encryptionMode === "sse_kms" && kmsKeyId.trim()
        ? kmsKeyId.trim()
        : undefined,
  };
}

export function buildAWSLifecycleRequest(
  lifecycleText: string,
): BucketLifecyclePutRequest {
  return {
    rules: parseJSONArray<BucketLifecyclePutRequest["rules"][number]>(
      lifecycleText,
      "Lifecycle rules",
    ),
  };
}

export function buildGCSPublicExposureRequest(
  publicMode: GCSGovernanceDraft["publicMode"],
  publicAccessPrevention: boolean,
): BucketPublicExposurePutRequest {
  return {
    mode: publicMode,
    publicAccessPrevention,
  };
}

export function buildGCSAccessRequest(
  bindings: GCSBindingDraft[],
  etag: string,
): BucketAccessPutRequest {
  return {
    bindings: serializeGCSBindings(bindings),
    etag: etag.trim() || undefined,
  };
}

export function buildGCSUniformAccessRequest(
  uniformAccess: boolean,
): BucketProtectionPutRequest {
  return { uniformAccess };
}

export function buildGCSRetentionRequest(
  retentionEnabled: boolean,
  retentionDays: string,
): BucketProtectionPutRequest {
  return {
    retention: retentionEnabled
      ? {
          enabled: true,
          days: parsePositiveDays(retentionDays, "Retention days"),
        }
      : {
          enabled: false,
        },
  };
}

export function buildAzurePublicExposureRequest(
  publicMode: AzureGovernanceDraft["publicMode"],
): BucketPublicExposurePutRequest {
  return {
    mode: publicMode,
    visibility: publicMode,
  };
}

export function buildAzureAccessRequest(
  storedAccessPolicies: AzureStoredAccessPolicyDraft[],
): BucketAccessPutRequest {
  return {
    storedAccessPolicies:
      serializeAzureStoredAccessPolicies(storedAccessPolicies),
  };
}

export function buildAzureProtectionRequest(options: {
  softDeleteEnabled: boolean;
  softDeleteDays: string;
  immutabilityEnabled: boolean;
  immutabilityDays: string;
  immutabilityMode: AzureGovernanceDraft["immutabilityMode"];
  immutabilityEditable: boolean;
  allowProtectedAppendWrites: boolean;
  allowProtectedAppendWritesAll: boolean;
  immutability?: AzureImmutabilityView;
}): BucketProtectionPutRequest {
  const req: BucketProtectionPutRequestWithAzureImmutability = {
    softDelete: options.softDeleteEnabled
      ? {
          enabled: true,
          days: parsePositiveDays(options.softDeleteDays, "Soft delete days"),
        }
      : {
          enabled: false,
        },
  };
  if (options.immutabilityEditable) {
    req.immutability = options.immutabilityEnabled
      ? {
          enabled: true,
          days: parsePositiveDays(
            options.immutabilityDays,
            "Container immutability days",
          ),
          mode: options.immutabilityMode,
          etag: options.immutability?.etag,
          allowProtectedAppendWrites:
            options.immutabilityMode === "unlocked" &&
            options.allowProtectedAppendWrites,
          allowProtectedAppendWritesAll:
            options.immutabilityMode === "unlocked" &&
            options.allowProtectedAppendWritesAll,
        }
      : {
          enabled: false,
          etag: options.immutability?.etag,
        };
  }
	return req as BucketProtectionPutRequest;
}

export function buildAzureLegalHoldRequest(tagsText: string): BucketProtectionPutRequest {
	return { legalHoldTags: parseAzureLegalHoldTags(tagsText) };
}

export function buildOCIPublicExposureRequest(
  visibility: OCIGovernanceDraft["visibility"],
): BucketPublicExposurePutRequest {
  return { visibility };
}

export function buildOCIProtectionRequest(
  retentionRules: OCIRetentionRuleDraft[],
): BucketProtectionPutRequest {
  const req: BucketProtectionPutRequestWithOCIRetention = {
    retention: {
      enabled: retentionRules.length > 0,
      rules: retentionRules.map((rule, index) => ({
        id: rule.id.trim() || undefined,
        displayName: rule.displayName.trim() || `Retention Rule ${index + 1}`,
        days: parsePositiveDays(
          rule.days,
          `Retention rule ${index + 1} days`,
        ),
        locked: rule.locked,
        timeModified: rule.timeModified || undefined,
      })),
    },
  };
  return req as BucketProtectionPutRequest;
}

export function buildOCISharingRequest(
  preauthenticatedRequests: OCIPreauthenticatedRequestDraft[],
): BucketSharingPutClientRequest {
  return {
    preauthenticatedRequests: preauthenticatedRequests.map((item) => ({
      id: item.id.trim() || undefined,
      name: item.name.trim() || undefined,
      accessType: item.accessType,
      bucketListingAction: item.bucketListingAction,
      objectName: item.objectName.trim() || undefined,
      timeExpires: item.timeExpires.trim() || undefined,
    })),
  };
}

export function buildCreatedOCIPreauthenticatedRequests(
  view: OCISharingView | undefined,
): OCIPreauthenticatedRequestDraft[] {
  const nextRequests = Array.isArray(view?.preauthenticatedRequests)
    ? view.preauthenticatedRequests
    : [];
  return nextRequests
    .filter(
      (item): item is OCIPreauthenticatedRequestDraft =>
        typeof item.accessUri === "string" && item.accessUri.trim().length > 0,
    )
    .map((item) => ({
      id: item.id ?? "",
      name: item.name ?? "",
      accessType:
        item.accessType === "AnyObjectWrite" ||
        item.accessType === "AnyObjectReadWrite"
          ? item.accessType
          : "AnyObjectRead",
      bucketListingAction:
        item.bucketListingAction === "ListObjects" ? "ListObjects" : "Deny",
      objectName: item.objectName ?? "",
      timeCreated: item.timeCreated ?? "",
      timeExpires: item.timeExpires ?? "",
      accessUri: item.accessUri ?? "",
    }));
}
