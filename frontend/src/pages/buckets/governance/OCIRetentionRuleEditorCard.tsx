import { Button, Input, Tag } from "antd";
import type { Dispatch, SetStateAction } from "react";

import { NativeSelect } from "../../../components/NativeSelect";
import { FormField } from "../../../components/FormField";
import styles from "../BucketGovernanceModal.module.css";
import { GovernanceNestedSectionCard } from "./shell";
import type { OCIRetentionRuleDraft } from "./types";

type OCIRetentionRuleEditorCardProps = {
  rule: OCIRetentionRuleDraft;
  index: number;
  setRetentionRules: Dispatch<SetStateAction<OCIRetentionRuleDraft[]>>;
};

export function OCIRetentionRuleEditorCard({
  rule,
  index,
  setRetentionRules,
}: OCIRetentionRuleEditorCardProps) {
  const updateRule = (patch: Partial<OCIRetentionRuleDraft>) => {
    setRetentionRules((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const removeRule = () => {
    setRetentionRules((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  return (
    <GovernanceNestedSectionCard
      title={`Rule ${index + 1}`}
      description={
        rule.locked
          ? "Locked rules can only be extended."
          : "Unlocked rules can be edited or removed."
      }
      actions={
        <div className={styles.footerActions}>
          {rule.locked ? <Tag color="warning">Locked</Tag> : null}
          <Button danger onClick={removeRule} disabled={rule.locked}>
            Remove
          </Button>
        </div>
      }
    >
      <FormField
        label="Display name"
        htmlFor={`bucket-governance-oci-retention-name-${index}`}
      >
        <Input
          id={`bucket-governance-oci-retention-name-${index}`}
          value={rule.displayName}
          onChange={(e) => updateRule({ displayName: e.target.value })}
          disabled={rule.locked}
          autoComplete="off"
        />
      </FormField>
      <FormField label="Duration unit" htmlFor={`bucket-governance-oci-retention-unit-${index}`}>
        <NativeSelect id={`bucket-governance-oci-retention-unit-${index}`} value={rule.unit ?? "DAYS"}
          disabled={rule.locked}
          ariaLabel={`Retention duration unit for rule ${index + 1}`}
          options={[{ value: "DAYS", label: "Days" }, { value: "YEARS", label: "Years" }, { value: "INDEFINITE", label: "Indefinite" }]}
          onChange={(value) => updateRule({ unit: value === "YEARS" || value === "INDEFINITE" ? value : "DAYS" })} />
      </FormField>
      {rule.unit !== "INDEFINITE" ? <FormField
        label={rule.unit === "YEARS" ? "Retention years" : "Retention days"}
        htmlFor={`bucket-governance-oci-retention-days-${index}`}
        extra={
          rule.locked
            ? "Locked rules can only increase this value."
            : "Required."
        }
      >
        <Input
          id={`bucket-governance-oci-retention-days-${index}`}
          value={rule.days}
          onChange={(e) => updateRule({ days: e.target.value })}
          inputMode="numeric"
          autoComplete="off"
        />
      </FormField> : <p>No expiration. Objects remain protected until this rule is removed.</p>}
      <div className={styles.tagRow}>
        {rule.id ? <Tag>ID {rule.id}</Tag> : <Tag>New rule</Tag>}
        {rule.timeModified ? <Tag>Modified {rule.timeModified}</Tag> : null}
      </div>
    </GovernanceNestedSectionCard>
  );
}
