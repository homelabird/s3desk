import { Alert, Button } from "antd";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import { FormField } from "../../../components/FormField";
import { NativeSelect } from "../../../components/NativeSelect";
import { OCIPreauthenticatedRequestEditorCard } from "./OCIPreauthenticatedRequestEditorCard";
import { OCIRetentionRuleEditorCard } from "./OCIRetentionRuleEditorCard";
import { OCISharingCreatedRequests } from "./OCISharingCreatedRequests";
import { GovernanceNestedSectionStack } from "./shell";
import type {
  OCIPreauthenticatedRequestDraft,
  OCIRetentionRuleDraft,
} from "./types";

export function OCIPublicExposureControlBody({
  visibility,
  setVisibility,
  warnings,
}: {
  visibility: "private" | "object_read" | "object_read_without_list";
  setVisibility: (
    visibility: "private" | "object_read" | "object_read_without_list",
  ) => void;
  warnings: ReactNode;
}) {
  return (
    <>
      <FormField label="Visibility" htmlFor="bucket-governance-oci-visibility">
        <NativeSelect
          id="bucket-governance-oci-visibility"
          value={visibility}
          onChange={(value) =>
            setVisibility(
              value === "object_read" || value === "object_read_without_list"
                ? value
                : "private",
            )
          }
          options={[
            { value: "private", label: "Private" },
            { value: "object_read", label: "Object read" },
            {
              value: "object_read_without_list",
              label: "Object read without list",
            },
          ]}
          ariaLabel="OCI visibility"
        />
      </FormField>
      {warnings}
    </>
  );
}

export function OCIVersioningControlBody({
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
        htmlFor="bucket-governance-oci-versioning-status"
      >
        <NativeSelect
          id="bucket-governance-oci-versioning-status"
          value={versioningStatus}
          onChange={(value) =>
            setVersioningStatus(value === "enabled" ? "enabled" : "disabled")
          }
          options={[
            { value: "enabled", label: "Enabled" },
            { value: "disabled", label: "Disabled" },
          ]}
          ariaLabel="OCI versioning status"
        />
      </FormField>
      {warnings}
    </>
  );
}

export function OCIRetentionRulesActions({
  retentionRules,
  setRetentionRules,
}: {
  retentionRules: OCIRetentionRuleDraft[];
  setRetentionRules: Dispatch<SetStateAction<OCIRetentionRuleDraft[]>>;
}) {
  return (
    <Button
      disabled={retentionRules.length >= 100}
      onClick={() =>
        setRetentionRules((current) => [
          ...current,
          {
            id: "",
            displayName: `Retention Rule ${current.length + 1}`,
            days: "30",
            locked: false,
            timeModified: "",
          },
        ])
      }
    >
      Add rule
    </Button>
  );
}

export function OCIRetentionRulesControlBody({
  retentionRules,
  setRetentionRules,
  warnings,
}: {
  retentionRules: OCIRetentionRuleDraft[];
  setRetentionRules: Dispatch<SetStateAction<OCIRetentionRuleDraft[]>>;
  warnings: ReactNode;
}) {
  return (
    <>
      {retentionRules.length === 0 ? (
        <Alert
          type="info"
          showIcon
          title="No OCI retention rules configured"
          description="Add a rule to start managing bucket retention from this controls surface."
        />
      ) : null}
      <GovernanceNestedSectionStack>
        {retentionRules.map((rule, index) => (
          <OCIRetentionRuleEditorCard
            key={rule.id || `oci-retention-rule-${index}`}
            rule={rule}
            index={index}
            setRetentionRules={setRetentionRules}
          />
        ))}
      </GovernanceNestedSectionStack>
      {warnings}
    </>
  );
}

export function OCIPreauthenticatedRequestsActions({
  preauthenticatedRequests,
  setPreauthenticatedRequests,
}: {
  preauthenticatedRequests: OCIPreauthenticatedRequestDraft[];
  setPreauthenticatedRequests: Dispatch<
    SetStateAction<OCIPreauthenticatedRequestDraft[]>
  >;
}) {
  return (
    <Button
      disabled={preauthenticatedRequests.length >= 100}
      onClick={() =>
        setPreauthenticatedRequests((current) => [
          ...current,
          {
            id: "",
            name: `PAR ${current.length + 1}`,
            accessType: "AnyObjectRead",
            bucketListingAction: "Deny",
            objectName: "",
            timeCreated: "",
            timeExpires: "",
            accessUri: "",
          },
        ])
      }
    >
      Add PAR
    </Button>
  );
}

export function OCIPreauthenticatedRequestsControlBody({
  createdPARs,
  preauthenticatedRequests,
  setPreauthenticatedRequests,
  warnings,
}: {
  createdPARs: OCIPreauthenticatedRequestDraft[];
  preauthenticatedRequests: OCIPreauthenticatedRequestDraft[];
  setPreauthenticatedRequests: Dispatch<
    SetStateAction<OCIPreauthenticatedRequestDraft[]>
  >;
  warnings: ReactNode;
}) {
  return (
    <>
      <OCISharingCreatedRequests requests={createdPARs} />
      {preauthenticatedRequests.length === 0 ? (
        <Alert
          type="info"
          showIcon
          title="No OCI PARs configured"
          description="Add a pre-authenticated request to create a typed sharing link."
        />
      ) : null}
      <GovernanceNestedSectionStack>
        {preauthenticatedRequests.map((item, index) => (
          <OCIPreauthenticatedRequestEditorCard
            key={item.id || `oci-par-${index}`}
            request={item}
            index={index}
            setPreauthenticatedRequests={setPreauthenticatedRequests}
          />
        ))}
      </GovernanceNestedSectionStack>
      {warnings}
    </>
  );
}
