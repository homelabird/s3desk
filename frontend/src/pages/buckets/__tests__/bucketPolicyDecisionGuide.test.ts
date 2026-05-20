import { describe, expect, it } from "vitest";

import {
  getBucketGovernanceDecisionGuide,
  getBucketPolicyDecisionGuide,
} from "../bucketPolicyDecisionGuide";

describe("bucketPolicyDecisionGuide", () => {
  it("separates routine controls from advanced S3 policy editing", () => {
    const guide = getBucketPolicyDecisionGuide("s3");

    expect(guide.workspaceTitle).toBe("Advanced S3 bucket policy workspace");
    expect(guide.recommendedTitle).toBe("Recommended: Controls first");
    expect(guide.recommendedItems).toContain(
      "Versioning, default encryption, and lifecycle rules",
    );
    expect(guide.advancedItems).toContain(
      "Cross-account principals and IAM conditions",
    );
    expect(guide.riskBadges).toContainEqual({
      label: "Delete policy",
      tone: "danger",
    });
  });

  it("calls out etag-sensitive GCS IAM editing", () => {
    const guide = getBucketPolicyDecisionGuide("gcs");

    expect(guide.advancedTitle).toBe("Advanced: IAM policy");
    expect(guide.advancedItems).toContain("ETag-sensitive IAM edits");
    expect(guide.riskBadges).toContainEqual({
      label: "ETag-sensitive",
      tone: "info",
    });
  });

  it("models OCI governance as typed controls with provider-native risks", () => {
    const guide = getBucketGovernanceDecisionGuide("oci_object_storage");

    expect(guide.recommendedTitle).toBe("Recommended: Typed controls");
    expect(guide.advancedTitle).toBe("Advanced: Provider effects");
    expect(guide.riskBadges).toContainEqual({
      label: "PAR URLs",
      tone: "warning",
    });
  });
});
