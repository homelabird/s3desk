import { Alert, Button, Input, Space, Typography, message } from "antd";
import type { ReactNode } from "react";

import type { APIError } from "../../api/client";
import type { BucketPolicyValidateResponse } from "../../api/types";
import { AppTabs } from "../../components/AppTabs";
import { NativeSelect } from "../../components/NativeSelect";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import styles from "./BucketPolicyModal.module.css";
import type { PolicyKind } from "./policyPresets";
import type { ParsedPolicy } from "./policy/types";

export function BucketPolicyContentTabs(props: {
  activeTab: "validate" | "preview" | "diff";
  setActiveTab: (tab: "validate" | "preview" | "diff") => void;
  parsed: ParsedPolicy;
  editorMode: "form" | "json";
  setEditorMode: (mode: "form" | "json") => void;
  policyKind: PolicyKind;
  selectedPresetKey?: string;
  setSelectedPresetKey: (key: string | undefined) => void;
  selectedPresetDescription: string | null;
  policyPresets: Array<{ key: string; label: string }>;
  applyPolicyPreset: (key: string) => void;
  updateStructuredStateFromText: (text: string) => void;
  resetServerValidationState: () => void;
  policyText: string;
  setPolicyText: (text: string) => void;
  formPolicyText: string;
  editorPlaceholder: string;
  structuredEditor: ReactNode;
  providerWarnings: string[];
  hasBlockingValidationIssues: boolean;
  localValidationErrors: string[];
  providerValidationHint: string;
  hasPolicyChanges: boolean;
  diffStats: { added: number; removed: number };
  isBusy: boolean;
  onValidate: () => void;
  validateLoading: boolean;
  serverValidation: BucketPolicyValidateResponse | null;
  serverValidationMessages: string[];
  serverValidationError: string | null;
  lastProviderError: APIError | null;
  providerCause: string | null;
  providerError: string | null;
  previewText: string;
  effectivePolicyText: string;
  showDiffContext: boolean;
  setShowDiffContext: (value: boolean) => void;
  visibleDiffText: string;
}) {
  return (
    <AppTabs
      activeKey={props.activeTab}
      onChange={(key) => props.setActiveTab(key as "validate" | "preview" | "diff")}
      items={[
        {
          key: "validate",
          label: "Validate",
          children: (
            <Space orientation="vertical" className={styles.fullWidth} size="middle">
              {props.parsed.ok ? (
                <Alert
                  type="success"
                  showIcon
                  title={
                    props.editorMode === "form"
                      ? "Valid policy (structured editor)"
                      : "Valid JSON policy"
                  }
                />
              ) : (
                <Alert
                  type="error"
                  showIcon
                  title="Invalid JSON policy"
                  description={props.parsed.error ?? "Invalid JSON"}
                />
              )}

              {props.policyKind !== "s3" ? (
                <details className={styles.disclosure}>
                  <summary className={styles.disclosureSummary}>
                    Advanced editor tools
                  </summary>
                  <div className={styles.disclosureBody}>
                    <Space align="center" wrap className={styles.controlRow}>
                      <Typography.Text type="secondary">Editor:</Typography.Text>
                      <NativeSelect
                        value={props.editorMode}
                        onChange={(value) => {
                          const next = value as "form" | "json";
                          if (next === "form") {
                            if (!props.parsed.ok) {
                              message.error(props.parsed.error ?? "Fix JSON errors first");
                              return;
                            }
                            props.updateStructuredStateFromText(props.policyText);
                            props.setEditorMode("form");
                          } else {
                            props.setPolicyText(props.formPolicyText);
                            props.setEditorMode("json");
                          }
                          props.resetServerValidationState();
                        }}
                        ariaLabel="Editor mode"
                        className={styles.editorModeGroup}
                        options={[
                          { value: "form", label: "Form editor" },
                          { value: "json", label: "JSON editor" },
                        ]}
                      />
                    </Space>

                    <Space align="center" wrap className={styles.controlRow}>
                      <Typography.Text type="secondary">Template:</Typography.Text>
                      <NativeSelect
                        value={props.selectedPresetKey ?? ""}
                        onChange={(value) => {
                          if (!value) {
                            props.setSelectedPresetKey(undefined);
                            return;
                          }
                          props.applyPolicyPreset(String(value));
                        }}
                        ariaLabel="Template preset"
                        className={styles.presetSelect}
                        placeholder="Load provider preset"
                        options={props.policyPresets.map((item) => ({
                          value: item.key,
                          label: item.label,
                        }))}
                      />
                    </Space>

                    {props.selectedPresetDescription ? (
                      <Typography.Text type="secondary">
                        {props.selectedPresetDescription}
                      </Typography.Text>
                    ) : null}
                  </div>
                </details>
              ) : null}

              {props.policyKind === "s3" ? (
                <Space align="center" wrap className={styles.controlRow}>
                  <Typography.Text type="secondary">Template:</Typography.Text>
                  <NativeSelect
                    value={props.selectedPresetKey ?? ""}
                    onChange={(value) => {
                      if (!value) {
                        props.setSelectedPresetKey(undefined);
                        return;
                      }
                      props.applyPolicyPreset(String(value));
                    }}
                    ariaLabel="Template preset"
                    className={styles.presetSelect}
                    placeholder="Load provider preset"
                    options={props.policyPresets.map((item) => ({
                      value: item.key,
                      label: item.label,
                    }))}
                  />
                </Space>
              ) : null}

              {props.policyKind === "s3" && props.selectedPresetDescription ? (
                <Typography.Text type="secondary">
                  {props.selectedPresetDescription}
                </Typography.Text>
              ) : null}

              {props.editorMode === "form" && props.policyKind !== "s3"
                ? props.structuredEditor
                : null}

              {props.editorMode === "json" || props.policyKind === "s3" ? (
                <details className={styles.disclosure} open={props.policyKind === "s3"}>
                  <summary className={styles.disclosureSummary}>Raw JSON editor</summary>
                  <div className={styles.disclosureBody}>
                    <Alert
                      type="warning"
                      showIcon
                      title="Advanced editing area"
                      description="Use raw JSON when the structured editor does not cover the policy you need. Review the diff before saving."
                    />
                    <Space orientation="vertical" size="small" className={styles.fullWidth}>
                      <Input.TextArea
                        value={props.policyText}
                        onChange={(e) => {
                          props.setPolicyText(e.target.value);
                          props.resetServerValidationState();
                        }}
                        autoSize={{ minRows: 8, maxRows: 24 }}
                        placeholder={props.editorPlaceholder}
                      />
                      {!props.parsed.ok ? (
                        <Alert
                          type="warning"
                          showIcon
                          title="Fix JSON errors first"
                          description={props.parsed.error ?? "Invalid JSON"}
                        />
                      ) : null}
                    </Space>
                  </div>
                </details>
              ) : null}

              {props.providerWarnings.length > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  title="Provider-specific notes"
                  description={props.providerWarnings.join("\n")}
                />
              ) : null}

              <Alert
                type={
                  props.hasBlockingValidationIssues
                    ? "warning"
                    : props.parsed.ok
                      ? "info"
                      : "warning"
                }
                showIcon
                title={
                  props.hasBlockingValidationIssues
                    ? "Local validation found issues"
                    : props.parsed.ok
                      ? "Local validation OK"
                      : "Local validation failed"
                }
                description={
                  props.hasBlockingValidationIssues ? (
                    <Space orientation="vertical" size={2} className={styles.fullWidth}>
                      {props.localValidationErrors.map((row, idx) => (
                        <Typography.Text key={`${idx}-${row}`} type="secondary">
                          {row}
                        </Typography.Text>
                      ))}
                      <Typography.Text type="secondary">
                        {props.providerValidationHint}
                      </Typography.Text>
                    </Space>
                  ) : (
                    props.providerValidationHint
                  )
                }
              />

              <Alert
                type={props.hasPolicyChanges ? "info" : "success"}
                showIcon
                title={
                  props.hasPolicyChanges ? "Unsaved changes detected" : "No changes to save"
                }
                description={
                  props.hasPolicyChanges
                    ? `Diff preview shows +${props.diffStats.added} / -${props.diffStats.removed} changed lines.`
                    : "Current editor value matches the loaded policy."
                }
              />

              <Button
                onClick={props.onValidate}
                loading={props.validateLoading}
                disabled={
                  props.isBusy || !props.parsed.ok || props.hasBlockingValidationIssues
                }
              >
                Validate with provider
              </Button>

              {props.serverValidation ? (
                <Alert
                  type={props.serverValidation.ok ? "success" : "warning"}
                  showIcon
                  title={
                    props.serverValidation.ok
                      ? "Server validation OK"
                      : "Server validation found issues"
                  }
                  description={
                    <Space orientation="vertical" size={4} className={styles.fullWidth}>
                      {props.serverValidationMessages.map((row, idx) => (
                        <Typography.Text key={`${idx}-${row}`} type="secondary">
                          {row}
                        </Typography.Text>
                      ))}
                    </Space>
                  }
                />
              ) : null}

              {props.serverValidationError ? (
                <Alert
                  type="error"
                  showIcon
                  title="Server validation failed"
                  description={props.serverValidationError}
                />
              ) : null}

              {props.lastProviderError ? (
                <Alert
                  type="error"
                  showIcon
                  title="Provider rejected the policy"
                  description={
                    <Space orientation="vertical" size={4} className={styles.fullWidth}>
                      <Typography.Text type="secondary">
                        {props.lastProviderError.message}
                      </Typography.Text>
                      {props.providerCause ? (
                        <Typography.Text type="secondary">
                          Cause: {props.providerCause}
                        </Typography.Text>
                      ) : null}
                      {props.providerError ? (
                        <Typography.Text type="secondary">
                          Provider: {props.providerError}
                        </Typography.Text>
                      ) : null}
                    </Space>
                  }
                />
              ) : null}
            </Space>
          ),
        },
        {
          key: "preview",
          label: "Preview",
          children: (
            <Space orientation="vertical" size="small" className={styles.fullWidth}>
              {!props.parsed.ok ? (
                <Alert
                  type="warning"
                  showIcon
                  title="Fix JSON errors first"
                  description={props.parsed.error ?? "Invalid JSON"}
                />
              ) : null}
              <Input.TextArea
                value={props.previewText || props.effectivePolicyText}
                readOnly
                autoSize={{ minRows: 10, maxRows: 24 }}
              />
            </Space>
          ),
        },
        {
          key: "diff",
          label: props.hasPolicyChanges
            ? `Diff (+${props.diffStats.added}/-${props.diffStats.removed})`
            : "Diff",
          children: (
            <Space orientation="vertical" size="small" className={styles.fullWidth}>
              <Alert
                type={props.hasPolicyChanges ? "info" : "success"}
                showIcon
                title={props.hasPolicyChanges ? "Changes ready to save" : "No policy changes"}
                description={
                  props.hasPolicyChanges
                    ? `+${props.diffStats.added} / -${props.diffStats.removed}`
                    : undefined
                }
              />
              <Space align="center" wrap>
                <ToggleSwitch
                  checked={props.showDiffContext}
                  onChange={props.setShowDiffContext}
                  disabled={!props.hasPolicyChanges}
                  ariaLabel="Show unchanged lines"
                />
                <Typography.Text type="secondary">Show unchanged lines</Typography.Text>
              </Space>
              <Input.TextArea
                value={props.visibleDiffText}
                readOnly
                autoSize={{ minRows: 10, maxRows: 24 }}
              />
            </Space>
          ),
        },
      ]}
    />
  );
}
