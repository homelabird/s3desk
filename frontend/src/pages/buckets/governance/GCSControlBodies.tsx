import { Alert, Button, Input, Tag, Typography } from "antd";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import type { BucketPublicExposureMode } from "../../../api/types";
import { FormField } from "../../../components/FormField";
import { NativeSelect } from "../../../components/NativeSelect";
import { ToggleSwitch } from "../../../components/ToggleSwitch";
import styles from "../BucketGovernanceModal.module.css";
import { GCSBindingEditorCard } from "./GCSBindingEditorCard";
import {
  GovernanceEditorList,
} from "./shell";
import type { GCSBindingDraft } from "./types";
import { createEmptyGCSBindingDraft } from "./utils";

export function GCSPublicExposureControlBody({
  publicMode,
  setPublicMode,
  publicAccessPrevention,
  setPublicAccessPrevention,
  warnings,
}: {
  publicMode: Extract<BucketPublicExposureMode, "private" | "public">;
  setPublicMode: (
    mode: Extract<BucketPublicExposureMode, "private" | "public">,
  ) => void;
  publicAccessPrevention: boolean;
  setPublicAccessPrevention: (enabled: boolean) => void;
  warnings: ReactNode;
}) {
  return (
    <>
      <FormField
        label="Access mode"
        htmlFor="bucket-governance-gcs-public-mode"
        extra="Public enables anonymous object viewer access through IAM bindings."
      >
        <NativeSelect
          id="bucket-governance-gcs-public-mode"
          value={publicMode}
          onChange={(value) =>
            setPublicMode(
              (value === "public" ? "public" : "private") as Extract<
                BucketPublicExposureMode,
                "private" | "public"
              >,
            )
          }
          options={[
            { value: "private", label: "Private" },
            { value: "public", label: "Public" },
          ]}
          ariaLabel="GCS public exposure mode"
        />
      </FormField>
      <div className={styles.toggleRow}>
        <div className={styles.toggleCopy}>
          <Typography.Text>Public Access Prevention</Typography.Text>
          <Typography.Text type="secondary">
            Enforce PAP to block public access even if IAM grants it.
          </Typography.Text>
        </div>
        <ToggleSwitch
          checked={publicAccessPrevention}
          onChange={setPublicAccessPrevention}
          ariaLabel="GCS public access prevention"
        />
      </div>
      {warnings}
    </>
  );
}

export function GCSProtectionControlBody({
  uniformAccess,
  setUniformAccess,
  warnings,
}: {
  uniformAccess: boolean;
  setUniformAccess: (enabled: boolean) => void;
  warnings: ReactNode;
}) {
  return (
    <>
      <div className={styles.toggleRow}>
        <div className={styles.toggleCopy}>
          <Typography.Text>Uniform bucket-level access</Typography.Text>
          <Typography.Text type="secondary">
            Recommended for consistent IAM-only authorization.
          </Typography.Text>
        </div>
        <ToggleSwitch
          checked={uniformAccess}
          onChange={setUniformAccess}
          ariaLabel="GCS uniform bucket-level access"
        />
      </div>
      {warnings}
    </>
  );
}

export function GCSVersioningControlBody({
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
        htmlFor="bucket-governance-gcs-versioning-status"
      >
        <NativeSelect
          id="bucket-governance-gcs-versioning-status"
          value={versioningStatus}
          onChange={(value) =>
            setVersioningStatus(value === "enabled" ? "enabled" : "disabled")
          }
          options={[
            { value: "enabled", label: "Enabled" },
            { value: "disabled", label: "Disabled" },
          ]}
          ariaLabel="GCS versioning status"
        />
      </FormField>
      {warnings}
    </>
  );
}

export function GCSRetentionControlBody({
  retentionEnabled,
  setRetentionEnabled,
  retentionDays,
  setRetentionDays,
  retentionLocked,
  retainUntil,
  warnings,
}: {
  retentionEnabled: boolean;
  setRetentionEnabled: (enabled: boolean) => void;
  retentionDays: string;
  setRetentionDays: (days: string) => void;
  retentionLocked: boolean;
  retainUntil?: string;
  warnings: ReactNode;
}) {
  return (
    <>
      <div className={styles.toggleRow}>
        <div className={styles.toggleCopy}>
          <Typography.Text>Retention enabled</Typography.Text>
          <Typography.Text type="secondary">
            Disable to clear retention when the policy is not locked.
          </Typography.Text>
        </div>
        <ToggleSwitch
          checked={retentionEnabled}
          onChange={setRetentionEnabled}
          disabled={retentionLocked}
          ariaLabel="GCS retention enabled"
        />
      </div>
      <FormField
        label="Retention days"
        htmlFor="bucket-governance-gcs-retention-days"
        extra="Required when retention is enabled."
      >
        <Input
          id="bucket-governance-gcs-retention-days"
          value={retentionDays}
          onChange={(e) => setRetentionDays(e.target.value)}
          disabled={!retentionEnabled || retentionLocked}
          inputMode="numeric"
          autoComplete="off"
        />
      </FormField>
      {retainUntil ? <Tag>Retain until {retainUntil}</Tag> : null}
      {retentionLocked ? <Tag color="warning">Locked retention</Tag> : null}
      {warnings}
    </>
  );
}

export function GCSIAMBindingsActions({
  setBindings,
}: {
  setBindings: Dispatch<SetStateAction<GCSBindingDraft[]>>;
}) {
  return (
    <Button
      onClick={() =>
        setBindings((current) => [...current, createEmptyGCSBindingDraft()])
      }
    >
      Add binding
    </Button>
  );
}

export function GCSIAMBindingsControlBody({
  etag,
  setETag,
  bindings,
  setBindings,
  warnings,
}: {
  etag: string;
  setETag: (etag: string) => void;
  bindings: GCSBindingDraft[];
  setBindings: Dispatch<SetStateAction<GCSBindingDraft[]>>;
  warnings: ReactNode;
}) {
  return (
    <>
      <FormField
        label="Policy ETag"
        htmlFor="bucket-governance-gcs-etag"
        extra="Leave the current etag in place unless you intentionally want the backend to reuse the latest server value."
      >
        <Input
          id="bucket-governance-gcs-etag"
          value={etag}
          onChange={(e) => setETag(e.target.value)}
          autoComplete="off"
        />
      </FormField>
      {bindings.length === 0 ? (
        <Alert
          type="info"
          showIcon
          title="No IAM bindings configured"
          description="Add a binding to grant access, or leave the list empty and save to clear all bindings."
        />
      ) : null}
      <GovernanceEditorList>
        {bindings.map((binding, index) => (
          <GCSBindingEditorCard
            key={`gcs-binding-${index}`}
            binding={binding}
            index={index}
            setBindings={setBindings}
          />
        ))}
      </GovernanceEditorList>
      {warnings}
    </>
  );
}
