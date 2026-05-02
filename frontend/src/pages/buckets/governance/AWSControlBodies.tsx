import { Input, Typography } from "antd";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import type {
  BucketBlockPublicAccess,
  BucketEncryptionMode,
  BucketObjectOwnershipMode,
} from "../../../api/types";
import { FormField } from "../../../components/FormField";
import { NativeSelect } from "../../../components/NativeSelect";
import { ToggleSwitch } from "../../../components/ToggleSwitch";
import styles from "../BucketGovernanceModal.module.css";

type AWSPublicExposureControlBodyProps = {
  publicAccessBlock: BucketBlockPublicAccess;
  setPublicAccessBlock: Dispatch<SetStateAction<BucketBlockPublicAccess>>;
  warnings: ReactNode;
};

const publicAccessBlockControls = [
  ["blockPublicAcls", "Block public ACLs"],
  ["ignorePublicAcls", "Ignore public ACLs"],
  ["blockPublicPolicy", "Block public bucket policies"],
  ["restrictPublicBuckets", "Restrict public buckets"],
] as const;

export function AWSPublicExposureControlBody({
  publicAccessBlock,
  setPublicAccessBlock,
  warnings,
}: AWSPublicExposureControlBodyProps) {
  return (
    <>
      <div className={styles.toggleList}>
        {publicAccessBlockControls.map(([key, label]) => (
          <div key={key} className={styles.toggleRow}>
            <div className={styles.toggleCopy}>
              <Typography.Text>{label}</Typography.Text>
            </div>
            <ToggleSwitch
              checked={publicAccessBlock[key]}
              onChange={(checked) =>
                setPublicAccessBlock((current) => ({
                  ...current,
                  [key]: checked,
                }))
              }
              ariaLabel={label}
            />
          </div>
        ))}
      </div>
      {warnings}
    </>
  );
}

export function AWSObjectOwnershipControlBody({
  objectOwnership,
  setObjectOwnership,
  warnings,
}: {
  objectOwnership: BucketObjectOwnershipMode;
  setObjectOwnership: (mode: BucketObjectOwnershipMode) => void;
  warnings: ReactNode;
}) {
  return (
    <>
      <FormField
        label="Ownership mode"
        htmlFor="bucket-governance-object-ownership"
      >
        <NativeSelect
          id="bucket-governance-object-ownership"
          value={objectOwnership}
          onChange={(value) =>
            setObjectOwnership(value as BucketObjectOwnershipMode)
          }
          options={[
            {
              value: "bucket_owner_enforced",
              label: "Bucket owner enforced",
            },
            {
              value: "bucket_owner_preferred",
              label: "Bucket owner preferred",
            },
            { value: "object_writer", label: "Object writer" },
          ]}
          ariaLabel="Ownership mode"
        />
      </FormField>
      {warnings}
    </>
  );
}

export function AWSVersioningControlBody({
  versioningStatus,
  setVersioningStatus,
  warnings,
}: {
  versioningStatus: "enabled" | "suspended";
  setVersioningStatus: (status: "enabled" | "suspended") => void;
  warnings: ReactNode;
}) {
  return (
    <>
      <FormField label="Status" htmlFor="bucket-governance-versioning-status">
        <NativeSelect
          id="bucket-governance-versioning-status"
          value={versioningStatus}
          onChange={(value) =>
            setVersioningStatus(value as "enabled" | "suspended")
          }
          options={[
            { value: "enabled", label: "Enabled" },
            { value: "suspended", label: "Suspended" },
          ]}
          ariaLabel="Versioning status"
        />
      </FormField>
      {warnings}
    </>
  );
}

export function AWSEncryptionControlBody({
  encryptionMode,
  setEncryptionMode,
  kmsKeyId,
  setKmsKeyId,
  warnings,
}: {
  encryptionMode: "sse_s3" | "sse_kms";
  setEncryptionMode: (mode: "sse_s3" | "sse_kms") => void;
  kmsKeyId: string;
  setKmsKeyId: (keyId: string) => void;
  warnings: ReactNode;
}) {
  return (
    <>
      <FormField
        label="Encryption mode"
        htmlFor="bucket-governance-encryption-mode"
      >
        <NativeSelect
          id="bucket-governance-encryption-mode"
          value={encryptionMode}
          onChange={(value) =>
            setEncryptionMode(
              value as Extract<BucketEncryptionMode, "sse_s3" | "sse_kms">,
            )
          }
          options={[
            { value: "sse_s3", label: "SSE-S3" },
            { value: "sse_kms", label: "SSE-KMS" },
          ]}
          ariaLabel="Encryption mode"
        />
      </FormField>
      {encryptionMode === "sse_kms" ? (
        <FormField
          label="KMS key ID (optional)"
          htmlFor="bucket-governance-kms-key-id"
          extra="Leave blank to use the default AWS managed KMS key."
        >
          <Input
            id="bucket-governance-kms-key-id"
            value={kmsKeyId}
            onChange={(e) => setKmsKeyId(e.target.value)}
            placeholder="alias/project-bucket-key"
            autoComplete="off"
          />
        </FormField>
      ) : null}
      {warnings}
    </>
  );
}

export function AWSLifecycleControlBody({
  lifecycleText,
  setLifecycleText,
  warnings,
}: {
  lifecycleText: string;
  setLifecycleText: (value: string) => void;
  warnings: ReactNode;
}) {
  return (
    <>
      <FormField
        label="Lifecycle rules JSON"
        htmlFor="bucket-governance-lifecycle-json"
      >
        <Input.TextArea
          id="bucket-governance-lifecycle-json"
          className={styles.jsonArea}
          value={lifecycleText}
          onChange={(e) => setLifecycleText(e.target.value)}
          rows={10}
        />
      </FormField>
      {warnings}
    </>
  );
}
