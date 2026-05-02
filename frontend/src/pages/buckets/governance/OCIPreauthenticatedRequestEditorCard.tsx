import { Button, Input, Tag } from "antd";
import type { Dispatch, SetStateAction } from "react";

import { FormField } from "../../../components/FormField";
import { NativeSelect } from "../../../components/NativeSelect";
import styles from "../BucketGovernanceModal.module.css";
import { GovernanceNestedSectionCard } from "./shell";
import type { OCIPreauthenticatedRequestDraft } from "./types";

type OCIPreauthenticatedRequestEditorCardProps = {
  request: OCIPreauthenticatedRequestDraft;
  index: number;
  setPreauthenticatedRequests: Dispatch<
    SetStateAction<OCIPreauthenticatedRequestDraft[]>
  >;
};

export function OCIPreauthenticatedRequestEditorCard({
  request,
  index,
  setPreauthenticatedRequests,
}: OCIPreauthenticatedRequestEditorCardProps) {
  const existing = request.id.trim().length > 0;

  const updateRequest = (patch: Partial<OCIPreauthenticatedRequestDraft>) => {
    setPreauthenticatedRequests((current) =>
      current.map((entry, currentIndex) =>
        currentIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const removeRequest = () => {
    setPreauthenticatedRequests((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  return (
    <GovernanceNestedSectionCard
      title={`PAR ${index + 1}`}
      description={
        existing
          ? "Existing PARs are immutable here. Delete and recreate to change them."
          : "Configure a new OCI pre-authenticated request."
      }
      actions={
        <div className={styles.footerActions}>
          {existing ? <Tag>Existing</Tag> : <Tag color="blue">New</Tag>}
          <Button danger onClick={removeRequest}>
            Remove
          </Button>
        </div>
      }
    >
      <FormField
        label="Name"
        htmlFor={`bucket-governance-oci-par-name-${index}`}
      >
        <Input
          id={`bucket-governance-oci-par-name-${index}`}
          value={request.name}
          onChange={(e) => updateRequest({ name: e.target.value })}
          disabled={existing}
          autoComplete="off"
        />
      </FormField>
      <FormField
        label="Access type"
        htmlFor={`bucket-governance-oci-par-access-type-${index}`}
      >
        <NativeSelect
          id={`bucket-governance-oci-par-access-type-${index}`}
          value={request.accessType}
          onChange={(value) =>
            updateRequest({
              accessType:
                value === "AnyObjectWrite" || value === "AnyObjectReadWrite"
                  ? value
                  : "AnyObjectRead",
            })
          }
          disabled={existing}
          options={[
            { value: "AnyObjectRead", label: "Any object read" },
            { value: "AnyObjectWrite", label: "Any object write" },
            { value: "AnyObjectReadWrite", label: "Any object read/write" },
          ]}
          ariaLabel={`OCI PAR access type ${index + 1}`}
        />
      </FormField>
      <FormField
        label="Object name or prefix (optional)"
        htmlFor={`bucket-governance-oci-par-object-name-${index}`}
        extra="Leave blank for bucket-wide access. Provide an object name or prefix to scope the PAR."
      >
        <Input
          id={`bucket-governance-oci-par-object-name-${index}`}
          value={request.objectName}
          onChange={(e) => updateRequest({ objectName: e.target.value })}
          disabled={existing}
          autoComplete="off"
        />
      </FormField>
      <FormField
        label="Bucket listing"
        htmlFor={`bucket-governance-oci-par-listing-${index}`}
      >
        <NativeSelect
          id={`bucket-governance-oci-par-listing-${index}`}
          value={request.bucketListingAction}
          onChange={(value) =>
            updateRequest({
              bucketListingAction: value === "ListObjects" ? "ListObjects" : "Deny",
            })
          }
          disabled={existing}
          options={[
            { value: "Deny", label: "Deny" },
            { value: "ListObjects", label: "List objects" },
          ]}
          ariaLabel={`OCI PAR bucket listing ${index + 1}`}
        />
      </FormField>
      <FormField
        label="Expires at (RFC3339)"
        htmlFor={`bucket-governance-oci-par-expires-${index}`}
      >
        <Input
          id={`bucket-governance-oci-par-expires-${index}`}
          value={request.timeExpires}
          onChange={(e) => updateRequest({ timeExpires: e.target.value })}
          disabled={existing}
          autoComplete="off"
        />
      </FormField>
      <div className={styles.tagRow}>
        {request.id ? <Tag>ID {request.id}</Tag> : null}
        {request.timeCreated ? <Tag>Created {request.timeCreated}</Tag> : null}
        {request.accessUri ? <Tag color="success">URL captured</Tag> : null}
      </div>
    </GovernanceNestedSectionCard>
  );
}
