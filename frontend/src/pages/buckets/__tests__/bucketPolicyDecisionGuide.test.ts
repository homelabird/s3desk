import { describe, expect, it } from "vitest";

import {
  getBucketGovernanceDecisionGuide,
  getBucketPolicyDecisionGuide,
} from "../bucketPolicyDecisionGuide";

describe("bucketPolicyDecisionGuide", () => {
  it("separates routine controls from S3 policy editing", () => {
    const guide = getBucketPolicyDecisionGuide("s3");

    expect(guide.workspaceTitle).toBe("S3 policy editor workspace");
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

    expect(guide.advancedTitle).toBe("Policy editor: IAM document");
    expect(guide.advancedItems).toContain("ETag-sensitive IAM edits");
    expect(guide.riskBadges).toContainEqual({
      label: "ETag-sensitive",
      tone: "info",
    });
  });

  it("models OCI governance as typed controls with provider-native risks", () => {
    const guide = getBucketGovernanceDecisionGuide("oci_object_storage");

    expect(guide.recommendedTitle).toBe("Recommended: Typed controls");
    expect(guide.advancedTitle).toBe("Provider effects to review");
    expect(guide.riskBadges).toContainEqual({
      label: "PAR URLs",
      tone: "warning",
    });
  });
});
