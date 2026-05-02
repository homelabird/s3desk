import { Alert, Input, Typography } from "antd";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import { FormField } from "../../../components/FormField";
import { NativeSelect } from "../../../components/NativeSelect";
import { ToggleSwitch } from "../../../components/ToggleSwitch";
import styles from "../BucketGovernanceModal.module.css";
import type { AzureImmutabilityView } from "./types";

type AzureProtectionControlsBodyProps = {
  softDeleteEnabled: boolean;
  setSoftDeleteEnabled: Dispatch<SetStateAction<boolean>>;
  softDeleteDays: string;
  setSoftDeleteDays: Dispatch<SetStateAction<string>>;
  immutability?: AzureImmutabilityView;
  immutabilityEditable: boolean;
  immutabilityLocked: boolean;
  immutabilityEnabled: boolean;
  setImmutabilityEnabled: Dispatch<SetStateAction<boolean>>;
  immutabilityDays: string;
  setImmutabilityDays: Dispatch<SetStateAction<string>>;
  immutabilityMode: "unlocked" | "locked";
  setImmutabilityMode: Dispatch<SetStateAction<"unlocked" | "locked">>;
  allowProtectedAppendWrites: boolean;
  setAllowProtectedAppendWrites: Dispatch<SetStateAction<boolean>>;
  allowProtectedAppendWritesAll: boolean;
  setAllowProtectedAppendWritesAll: Dispatch<SetStateAction<boolean>>;
  warnings: ReactNode;
};

export function AzureProtectionControlsBody({
  softDeleteEnabled,
  setSoftDeleteEnabled,
  softDeleteDays,
  setSoftDeleteDays,
  immutability,
  immutabilityEditable,
  immutabilityLocked,
  immutabilityEnabled,
  setImmutabilityEnabled,
  immutabilityDays,
  setImmutabilityDays,
  immutabilityMode,
  setImmutabilityMode,
  allowProtectedAppendWrites,
  setAllowProtectedAppendWrites,
  allowProtectedAppendWritesAll,
  setAllowProtectedAppendWritesAll,
  warnings,
}: AzureProtectionControlsBodyProps) {
  const immutabilityControlsDisabled =
    !immutabilityEditable || !immutabilityEnabled || immutabilityLocked;

  return (
    <>
      <div className={styles.toggleRow}>
        <div className={styles.toggleCopy}>
          <Typography.Text>Soft delete</Typography.Text>
          <Typography.Text type="secondary">
            Keeps deleted blobs recoverable for a configured number of days.
          </Typography.Text>
        </div>
        <ToggleSwitch
          checked={softDeleteEnabled}
          onChange={setSoftDeleteEnabled}
          ariaLabel="Azure soft delete"
        />
      </div>
      <FormField
        label="Retention days"
        htmlFor="bucket-governance-azure-soft-delete-days"
        extra="Required when soft delete is enabled."
      >
        <Input
          id="bucket-governance-azure-soft-delete-days"
          value={softDeleteDays}
          onChange={(e) => setSoftDeleteDays(e.target.value)}
          disabled={!softDeleteEnabled}
          inputMode="numeric"
          autoComplete="off"
        />
      </FormField>
      {!immutabilityEditable ? (
        <Alert
          type="info"
          showIcon
          title="Azure ARM credentials required for container immutability editing"
          description="Add subscription ID, resource group, tenant ID, client ID, and client secret to the Azure profile to create, update, lock, or delete container immutability policies."
        />
      ) : null}
      <div className={styles.toggleRow}>
        <div className={styles.toggleCopy}>
          <Typography.Text>Container immutability</Typography.Text>
          <Typography.Text type="secondary">
            Unlocked policies can be changed or deleted. Locked policies can
            only be extended.
          </Typography.Text>
        </div>
        <ToggleSwitch
          checked={immutabilityEnabled}
          onChange={setImmutabilityEnabled}
          disabled={!immutabilityEditable || immutabilityLocked}
          ariaLabel="Azure container immutability"
        />
      </div>
      <FormField
        label="Retention days"
        htmlFor="bucket-governance-azure-immutability-days"
        extra={
          immutabilityLocked
            ? "Locked policies can only increase this value."
            : "Required when container immutability is enabled."
        }
      >
        <Input
          id="bucket-governance-azure-immutability-days"
          value={immutabilityDays}
          onChange={(e) => setImmutabilityDays(e.target.value)}
          disabled={!immutabilityEditable || !immutabilityEnabled}
          inputMode="numeric"
          autoComplete="off"
        />
      </FormField>
      <FormField
        label="Policy mode"
        htmlFor="bucket-governance-azure-immutability-mode"
        extra="Switch to Locked only when you are ready to make the policy extend-only."
      >
        <NativeSelect
          id="bucket-governance-azure-immutability-mode"
          value={immutabilityMode}
          onChange={(value) =>
            setImmutabilityMode(value === "locked" ? "locked" : "unlocked")
          }
          disabled={immutabilityControlsDisabled}
          options={[
            { value: "unlocked", label: "Unlocked" },
            { value: "locked", label: "Locked" },
          ]}
          ariaLabel="Azure immutability mode"
        />
      </FormField>
      <div className={styles.toggleList}>
        <div className={styles.toggleRow}>
          <div className={styles.toggleCopy}>
            <Typography.Text>Allow protected append writes</Typography.Text>
            <Typography.Text type="secondary">
              Allow append-only writes to protected append blobs.
            </Typography.Text>
          </div>
          <ToggleSwitch
            checked={allowProtectedAppendWrites}
            onChange={(checked) => {
              setAllowProtectedAppendWrites(checked);
              if (checked) {
                setAllowProtectedAppendWritesAll(false);
              }
            }}
            disabled={immutabilityControlsDisabled}
            ariaLabel="Allow protected append writes"
          />
        </div>
        <div className={styles.toggleRow}>
          <div className={styles.toggleCopy}>
            <Typography.Text>Allow protected append writes for all</Typography.Text>
            <Typography.Text type="secondary">
              Allow append-only writes across append and block blob workloads
              while the policy is unlocked.
            </Typography.Text>
          </div>
          <ToggleSwitch
            checked={allowProtectedAppendWritesAll}
            onChange={(checked) => {
              setAllowProtectedAppendWritesAll(checked);
              if (checked) {
                setAllowProtectedAppendWrites(false);
              }
            }}
            disabled={immutabilityControlsDisabled}
            ariaLabel="Allow protected append writes for all"
          />
        </div>
      </div>
      {immutability?.legalHold ? (
        <Alert
          type="warning"
          showIcon
          title="Legal hold detected"
          description="A legal hold is active on this container. This client only edits time-based immutability policy; legal hold release remains outside this surface."
        />
      ) : null}
      {immutabilityLocked ? (
        <Alert
          type="info"
          showIcon
          title="Policy is locked"
          description="This Azure immutability policy is already locked. You can only increase retention days from this point."
        />
      ) : null}
      {warnings}
    </>
  );
}
