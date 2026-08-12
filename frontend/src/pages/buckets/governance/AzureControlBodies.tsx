import { Alert, Button, Input } from "antd";
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

export function AzureLegalHoldControlBody({
  legalHold,
  legalHoldTagsText,
  setLegalHoldTagsText,
  legalHoldEditable,
  warnings,
}: {
  legalHold: boolean;
  legalHoldTagsText: string;
  setLegalHoldTagsText: (value: string) => void;
  legalHoldEditable: boolean;
  warnings: ReactNode;
}) {
  return (
    <>
      {!legalHoldEditable ? (
        <Alert
          type="info"
          showIcon
          title="Azure ARM credentials required for legal hold editing"
          description="Legal hold tags are read-only until the Azure profile has subscription, resource group, tenant, client ID, and client secret configured."
        />
      ) : (
        <Alert
          type={legalHold ? "warning" : "info"}
          showIcon
          title={legalHold ? "Legal hold is active" : "No legal hold is active"}
          description="Enter comma-separated 3–23 character alphanumeric tags. Saving an empty value clears all current legal hold tags."
        />
      )}
      <FormField
        label="Legal hold tags"
        htmlFor="bucket-governance-azure-legal-hold-tags"
        extra="Azure keeps each tag as a separate legal hold marker."
      >
        <Input
          id="bucket-governance-azure-legal-hold-tags"
          aria-label="Azure legal hold tags"
          value={legalHoldTagsText}
          onChange={(event) => setLegalHoldTagsText(event.target.value)}
          disabled={!legalHoldEditable}
          placeholder="case123, retention9"
          autoComplete="off"
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
