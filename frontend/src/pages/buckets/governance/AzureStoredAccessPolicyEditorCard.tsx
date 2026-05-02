import { Button, Input } from "antd";
import type { Dispatch, SetStateAction } from "react";

import { FormField } from "../../../components/FormField";
import styles from "../BucketGovernanceModal.module.css";
import { GovernanceEditorCard } from "./shell";
import {
  azureStoredAccessPermissionOptions,
  type AzureStoredAccessPolicyDraft,
} from "./types";
import { toggleAzureStoredAccessPermission } from "./utils";

type AzureStoredAccessPolicyEditorCardProps = {
  policy: AzureStoredAccessPolicyDraft;
  index: number;
  setStoredAccessPolicies: Dispatch<
    SetStateAction<AzureStoredAccessPolicyDraft[]>
  >;
};

export function AzureStoredAccessPolicyEditorCard({
  policy,
  index,
  setStoredAccessPolicies,
}: AzureStoredAccessPolicyEditorCardProps) {
  const updatePolicy = (patch: Partial<AzureStoredAccessPolicyDraft>) => {
    setStoredAccessPolicies((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const removePolicy = () => {
    setStoredAccessPolicies((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  return (
    <GovernanceEditorCard
      testId="bucket-governance-azure-stored-access-policy-card"
      title={`Policy ${index + 1}`}
      description="SAS tokens can target this identifier. Editing the policy changes future SAS validation, but does not mint or revoke tokens by itself."
      actions={
        <Button danger onClick={removePolicy}>
          Remove
        </Button>
      }
    >
      <div className={styles.editorCardGrid}>
        <FormField
          label="Identifier"
          htmlFor={`bucket-governance-azure-policy-id-${index}`}
        >
          <Input
            id={`bucket-governance-azure-policy-id-${index}`}
            value={policy.id}
            onChange={(e) => updatePolicy({ id: e.target.value })}
            autoComplete="off"
          />
        </FormField>
        <FormField
          label="Start (RFC3339)"
          htmlFor={`bucket-governance-azure-policy-start-${index}`}
        >
          <Input
            id={`bucket-governance-azure-policy-start-${index}`}
            value={policy.start}
            onChange={(e) => updatePolicy({ start: e.target.value })}
            autoComplete="off"
          />
        </FormField>
        <FormField
          label="Expiry (RFC3339)"
          htmlFor={`bucket-governance-azure-policy-expiry-${index}`}
        >
          <Input
            id={`bucket-governance-azure-policy-expiry-${index}`}
            value={policy.expiry}
            onChange={(e) => updatePolicy({ expiry: e.target.value })}
            autoComplete="off"
          />
        </FormField>
      </div>
      <FormField
        label="Permissions"
        htmlFor={`bucket-governance-azure-policy-permissions-${index}`}
        extra="Permission order is normalized to rwdlacup on save."
      >
        <div
          id={`bucket-governance-azure-policy-permissions-${index}`}
          className={styles.permissionGrid}
        >
          {azureStoredAccessPermissionOptions.map((option) => (
            <label
              key={`${index}-${option.value}`}
              className={styles.permissionItem}
            >
              <input
                type="checkbox"
                checked={policy.permission.includes(option.value)}
                onChange={(e) =>
                  updatePolicy({
                    permission: toggleAzureStoredAccessPermission(
                      policy.permission,
                      option.value,
                      e.target.checked,
                    ),
                  })
                }
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </FormField>
    </GovernanceEditorCard>
  );
}
