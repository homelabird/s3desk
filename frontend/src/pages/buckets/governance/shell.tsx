import type { ReactNode } from "react";
import { Alert, Button, Tag, Typography } from "antd";

import type { BucketAdvancedView } from "../../../api/types";
import { DialogModal } from "../../../components/DialogModal";
import { OverlaySheet } from "../../../components/OverlaySheet";
import styles from "../BucketGovernanceModal.module.css";
import type { WarningCarrier } from "./types";

export function BucketGovernanceDialogShell(props: {
  mobile: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const shellContent = (
    <div
      className={props.mobile ? styles.mobileShell : styles.desktopShell}
      data-testid={
        props.mobile
          ? "bucket-governance-mobile-shell"
          : "bucket-governance-desktop-shell"
      }
    >
      {props.children}
    </div>
  );

  if (props.mobile) {
    return (
      <OverlaySheet
        open
        onClose={props.onClose}
        title={props.title}
        placement="right"
        width="100vw"
        footer={props.footer}
      >
        {shellContent}
      </OverlaySheet>
    );
  }

  return (
    <DialogModal
      open
      title={props.title}
      onClose={props.onClose}
      footer={props.footer ?? null}
      width="min(96vw, 1080px)"
    >
      {shellContent}
    </DialogModal>
  );
}

export function extractWarningList(view?: WarningCarrier | null): string[] {
  return Array.isArray(view?.warnings)
    ? view.warnings.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

export function renderWarningStack(warnings: string[]) {
  if (warnings.length === 0) return null;
  return (
    <div className={styles.warningStack}>
      {warnings.map((warning) => (
        <Alert key={warning} type="warning" showIcon title={warning} />
      ))}
    </div>
  );
}

export function GovernanceSummaryCard(props: {
  title: string;
  description: string;
  tags: string[];
  isRefreshing: boolean;
}) {
  return (
    <section className={styles.summaryCard}>
      <div className={styles.summaryHeader}>
        <div className={styles.summaryCopy}>
          <Typography.Text strong>{props.title}</Typography.Text>
          <Typography.Text type="secondary">
            {props.description}
          </Typography.Text>
        </div>
        {props.isRefreshing ? <Tag color="processing">Refreshing</Tag> : null}
      </div>
      {props.tags.length > 0 ? (
        <div className={styles.tagRow}>
          {props.tags.map((item) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function AdvancedPolicySection(props: {
  bucket: string;
  advancedPolicy?: BucketAdvancedView;
  onOpenAdvancedPolicy?: (bucket: string) => void;
}) {
  if (!props.advancedPolicy?.rawPolicySupported) return null;

  return (
    <section
      className={`${styles.sectionCard} ${styles.sectionWide}`}
      data-testid="bucket-governance-advanced-policy"
    >
      <div className={styles.sectionHeader}>
        <div className={styles.sectionCopy}>
          <Typography.Text strong>Advanced Policy</Typography.Text>
          <Typography.Text type="secondary">
            Use raw policy editing for statements that do not fit the typed
            controls surface.
          </Typography.Text>
        </div>
        <Button
          onClick={() => props.onOpenAdvancedPolicy?.(props.bucket)}
          disabled={!props.onOpenAdvancedPolicy || !props.advancedPolicy.rawPolicyEditable}
        >
          Open Policy
        </Button>
      </div>
      <div className={styles.sectionBody}>
        <div className={styles.tagRow}>
          <Tag color={props.advancedPolicy.rawPolicyEditable ? "blue" : "default"}>
            {props.advancedPolicy.rawPolicyEditable
              ? "Editable raw policy"
              : "Read-only raw policy"}
          </Tag>
          <Tag>
            {props.advancedPolicy.rawPolicy
              ? "Policy document detected"
              : "No raw policy document loaded in summary"}
          </Tag>
        </div>
      </div>
    </section>
  );
}

export function UnsupportedProviderNotice(props: {
  bucket: string;
  isMobile: boolean;
  onClose: () => void;
}) {
  return (
    <BucketGovernanceDialogShell
      mobile={props.isMobile}
      title={`Controls: ${props.bucket}`}
      onClose={props.onClose}
    >
      <Alert
        type="info"
        showIcon
        title="Typed controls are not available for this provider."
        description="This controls surface currently supports AWS S3, GCS, Azure Blob, and OCI Object Storage."
      />
    </BucketGovernanceDialogShell>
  );
}
