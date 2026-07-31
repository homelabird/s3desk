import { Button, Tooltip, Typography } from "antd";

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
      <div className={styles.footerDangerZone}>
        <div className={styles.footerDangerCopy}>
          <Typography.Text strong>Danger zone</Typography.Text>
          <Typography.Text type="secondary">
            Remove or reset the current policy only when you intend to revoke this path.
          </Typography.Text>
        </div>
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
      </div>

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
