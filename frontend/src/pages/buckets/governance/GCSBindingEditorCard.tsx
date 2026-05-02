import { Alert, Button, Input, Typography } from "antd";
import type { Dispatch, SetStateAction } from "react";

import { FormField } from "../../../components/FormField";
import { ToggleSwitch } from "../../../components/ToggleSwitch";
import styles from "../BucketGovernanceModal.module.css";
import { GovernanceEditorCard } from "./shell";
import type { GCSBindingDraft } from "./types";

type GCSBindingEditorCardProps = {
  binding: GCSBindingDraft;
  index: number;
  setBindings: Dispatch<SetStateAction<GCSBindingDraft[]>>;
};

export function GCSBindingEditorCard({
  binding,
  index,
  setBindings,
}: GCSBindingEditorCardProps) {
  const updateBinding = (patch: Partial<GCSBindingDraft>) => {
    setBindings((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const removeBinding = () => {
    setBindings((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const setConditionEnabled = (checked: boolean) => {
    updateBinding(
      checked
        ? { conditionEnabled: true }
        : {
            conditionEnabled: false,
            conditionTitle: "",
            conditionDescription: "",
            conditionExpression: "",
            unsupportedConditionJSON: "",
          },
    );
  };

  return (
    <GovernanceEditorCard
      testId="bucket-governance-gcs-binding-card"
      title={`Binding ${index + 1}`}
      description="Keep role names exact. Conditional bindings are passed through as JSON."
      actions={
        <Button danger onClick={removeBinding}>
          Remove
        </Button>
      }
    >
      <div className={styles.editorCardGrid}>
        <FormField
          label="Role"
          htmlFor={`bucket-governance-gcs-role-${index}`}
        >
          <Input
            id={`bucket-governance-gcs-role-${index}`}
            value={binding.role}
            onChange={(e) => updateBinding({ role: e.target.value })}
            autoComplete="off"
          />
        </FormField>
        <FormField
          label="Members"
          htmlFor={`bucket-governance-gcs-members-${index}`}
          extra="One member per line, for example user:dev@example.com or allUsers."
        >
          <Input.TextArea
            id={`bucket-governance-gcs-members-${index}`}
            value={binding.membersText}
            onChange={(e) => updateBinding({ membersText: e.target.value })}
            rows={4}
          />
        </FormField>
      </div>
      <div className={styles.toggleRow}>
        <div className={styles.toggleCopy}>
          <Typography.Text>IAM condition</Typography.Text>
          <Typography.Text type="secondary">
            Use a typed CEL condition instead of raw JSON.
          </Typography.Text>
        </div>
        <ToggleSwitch
          checked={binding.conditionEnabled}
          onChange={setConditionEnabled}
          ariaLabel={`GCS binding condition ${index + 1}`}
        />
      </div>
      {binding.conditionEnabled ? (
        <>
          {binding.unsupportedConditionJSON ? (
            <Alert
              type="warning"
              showIcon
              title="Unsupported IAM condition shape"
              description="This condition includes keys outside the typed title, description, and expression fields. Turn the condition off to clear it, then recreate it with the structured editor."
            />
          ) : null}
          <div className={styles.editorCardGrid}>
            <FormField
              label="Condition title"
              htmlFor={`bucket-governance-gcs-condition-title-${index}`}
            >
              <Input
                id={`bucket-governance-gcs-condition-title-${index}`}
                value={binding.conditionTitle}
                onChange={(e) =>
                  updateBinding({ conditionTitle: e.target.value })
                }
                autoComplete="off"
              />
            </FormField>
            <FormField
              label="Condition description (optional)"
              htmlFor={`bucket-governance-gcs-condition-description-${index}`}
            >
              <Input
                id={`bucket-governance-gcs-condition-description-${index}`}
                value={binding.conditionDescription}
                onChange={(e) =>
                  updateBinding({ conditionDescription: e.target.value })
                }
                autoComplete="off"
              />
            </FormField>
            <FormField
              label="Condition expression"
              htmlFor={`bucket-governance-gcs-condition-expression-${index}`}
              extra='Example: request.time < timestamp("2026-12-31T00:00:00Z")'
            >
              <Input.TextArea
                id={`bucket-governance-gcs-condition-expression-${index}`}
                value={binding.conditionExpression}
                onChange={(e) =>
                  updateBinding({ conditionExpression: e.target.value })
                }
                rows={4}
              />
            </FormField>
          </div>
        </>
      ) : null}
    </GovernanceEditorCard>
  );
}
