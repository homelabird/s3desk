import { Alert, Button } from "antd";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import type { BucketPublicExposureMode } from "../../../api/types";
import { FormField } from "../../../components/FormField";
import { NativeSelect } from "../../../components/NativeSelect";
import { AzureStoredAccessPolicyEditorCard } from "./AzureStoredAccessPolicyEditorCard";
import { GovernanceEditorList } from "./shell";
import type { AzureStoredAccessPolicyDraft } from "./types";
import { createEmptyAzureStoredAccessPolicyDraft } from "./utils";

export function AzurePublicExposureControlBody({
  publicMode,
  setPublicMode,
  warnings,
}: {
  publicMode: Extract<BucketPublicExposureMode, "private" | "blob" | "container">;
  setPublicMode: (
    mode: Extract<BucketPublicExposureMode, "private" | "blob" | "container">,
  ) => void;
  warnings: ReactNode;
}) {
  return (
    <>
      <FormField
        label="Visibility"
        htmlFor="bucket-governance-azure-visibility"
        extra="Use Private unless you explicitly need anonymous blob reads or anonymous container listing."
      >
        <NativeSelect
          id="bucket-governance-azure-visibility"
          value={publicMode}
          onChange={(value) =>
            setPublicMode(
              (value === "blob" || value === "container"
                ? value
                : "private") as Extract<
                BucketPublicExposureMode,
                "private" | "blob" | "container"
              >,
            )
          }
          options={[
            { value: "private", label: "Private" },
            { value: "blob", label: "Blob" },
            { value: "container", label: "Container" },
          ]}
          ariaLabel="Azure anonymous access visibility"
        />
      </FormField>
      {warnings}
    </>
  );
}

export function AzureVersioningControlBody({
  versioningStatus,
  setVersioningStatus,
  warnings,
}: {
  versioningStatus: "enabled" | "disabled";
  setVersioningStatus: (status: "enabled" | "disabled") => void;
  warnings: ReactNode;
}) {
  return (
    <>
      <FormField
        label="Status"
        htmlFor="bucket-governance-azure-versioning-status"
      >
        <NativeSelect
          id="bucket-governance-azure-versioning-status"
          value={versioningStatus}
          onChange={(value) =>
            setVersioningStatus(value === "enabled" ? "enabled" : "disabled")
          }
          options={[
            { value: "enabled", label: "Enabled" },
            { value: "disabled", label: "Disabled" },
          ]}
          ariaLabel="Azure versioning status"
        />
      </FormField>
      {warnings}
    </>
  );
}

export function AzureStoredAccessPoliciesActions({
  storedAccessPolicies,
  setStoredAccessPolicies,
}: {
  storedAccessPolicies: AzureStoredAccessPolicyDraft[];
  setStoredAccessPolicies: Dispatch<
    SetStateAction<AzureStoredAccessPolicyDraft[]>
  >;
}) {
  return (
    <Button
      onClick={() =>
        setStoredAccessPolicies((current) =>
          current.length >= 5
            ? current
            : [...current, createEmptyAzureStoredAccessPolicyDraft()],
        )
      }
      disabled={storedAccessPolicies.length >= 5}
    >
      Add policy
    </Button>
  );
}

export function AzureStoredAccessPoliciesControlBody({
  storedAccessPolicies,
  setStoredAccessPolicies,
  warnings,
}: {
  storedAccessPolicies: AzureStoredAccessPolicyDraft[];
  setStoredAccessPolicies: Dispatch<
    SetStateAction<AzureStoredAccessPolicyDraft[]>
  >;
  warnings: ReactNode;
}) {
  return (
    <>
      {storedAccessPolicies.length === 0 ? (
        <Alert
          type="info"
          showIcon
          title="No stored access policies configured"
          description="Add a policy when you need a reusable signed identifier for SAS generation, or leave the list empty and save to clear all entries."
        />
      ) : null}
      <GovernanceEditorList>
        {storedAccessPolicies.map((policy, index) => (
          <AzureStoredAccessPolicyEditorCard
            key={`azure-stored-policy-${index}`}
            policy={policy}
            index={index}
            setStoredAccessPolicies={setStoredAccessPolicies}
          />
        ))}
      </GovernanceEditorList>
      {warnings}
    </>
  );
}
