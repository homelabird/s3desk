import { Button, Tooltip } from "antd";

import { confirmDangerAction } from "../../lib/confirmDangerAction";
import styles from "./BucketPolicyModal.module.css";
import type { PolicyKind } from "./policyPresets";

export function BucketPolicyFooterActions(props: {
  policyKind: PolicyKind;
  deleteDisabledReason: string;
  canDelete: boolean;
  isBusy: boolean;
  deleteLoading: boolean;
  saveLoading: boolean;
  deleteLabel: string;
  deleteHelp: string;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <div className={styles.footerActions}>
      <Tooltip title={props.deleteDisabledReason || null}>
        <span>
          <Button
            danger
            disabled={!props.canDelete || props.isBusy}
            loading={props.deleteLoading}
            onClick={() => {
              if (props.isBusy) return;
              confirmDangerAction({
                title:
                  props.policyKind === "azure"
                    ? "Reset container access policy?"
                    : "Delete bucket policy?",
                description: props.deleteHelp,
                confirmText: "delete",
                confirmHint: 'Type "delete" to confirm',
                onConfirm: async () => {
                  await props.onDelete();
                },
              });
            }}
          >
            {props.deleteLabel}
          </Button>
        </span>
      </Tooltip>

      <div className={styles.footerPrimaryActions}>
        <Button onClick={props.onCancel} disabled={props.isBusy}>
          Cancel
        </Button>
        <Button
          type="primary"
          loading={props.saveLoading}
          disabled={props.isBusy || !props.canSave}
          onClick={props.onSave}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
