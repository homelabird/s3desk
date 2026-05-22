import type { ReactNode } from "react";
import { Alert, Button, Tag, Typography } from "antd";

import type { BucketAdvancedView, Profile } from "../../../api/types";
import { DialogModal } from "../../../components/DialogModal";
import { OverlaySheet } from "../../../components/OverlaySheet";
import {
  getBucketGovernanceDecisionGuide,
  type BucketDecisionTone,
} from "../bucketPolicyDecisionGuide";
import styles from "../BucketGovernanceModal.module.css";
import type { WarningCarrier } from "./types";

function getDecisionBadgeClassName(tone: BucketDecisionTone) {
  switch (tone) {
    case "danger":
      return `${styles.decisionBadge} ${styles.decisionBadgeDanger}`;
    case "warning":
      return `${styles.decisionBadge} ${styles.decisionBadgeWarning}`;
    case "info":
      return `${styles.decisionBadge} ${styles.decisionBadgeInfo}`;
    case "default":
    default:
      return styles.decisionBadge;
  }
}

export function BucketGovernanceDialogShell(props: {
  mobile: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  closeDisabled?: boolean;
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
        closeDisabled={props.closeDisabled}
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
      closeDisabled={props.closeDisabled}
      width="min(96vw, 1080px)"
    >
      {shellContent}
    </DialogModal>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function extractWarningList(view?: WarningCarrier | null): string[] {
  return Array.isArray(view?.warnings)
    ? view.warnings.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

// eslint-disable-next-line react-refresh/only-export-components
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

export function GovernanceDecisionGuideCard(props: {
  provider: Profile["provider"];
}) {
  const guide = getBucketGovernanceDecisionGuide(props.provider);

  return (
    <section
      className={styles.decisionHeader}
      data-testid="bucket-governance-decision-header"
    >
      <div className={styles.decisionHeaderTop}>
        <div className={styles.decisionHeaderCopy}>
          <Typography.Text strong>{guide.workspaceTitle}</Typography.Text>
          <Typography.Text type="secondary">
            {guide.workspaceDescription}
          </Typography.Text>
        </div>
        <div
          className={styles.decisionBadgeRow}
          aria-label="Governance risk signals"
        >
          {guide.riskBadges.map((badge) => (
            <Tag key={badge.label} className={getDecisionBadgeClassName(badge.tone)}>
              {badge.label}
            </Tag>
          ))}
        </div>
      </div>

      <div className={styles.decisionRouteGrid}>
        <div
          className={`${styles.decisionRoute} ${styles.decisionRoutePrimary}`}
          data-testid="bucket-governance-recommended-route"
        >
          <Typography.Text strong>{guide.recommendedTitle}</Typography.Text>
          <Typography.Text type="secondary">
            {guide.recommendedDescription}
          </Typography.Text>
          <ul className={styles.decisionRouteList}>
            {guide.recommendedItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div
          className={`${styles.decisionRoute} ${styles.decisionRouteAdvanced}`}
          data-testid="bucket-governance-advanced-route"
        >
          <Typography.Text strong>{guide.advancedTitle}</Typography.Text>
          <Typography.Text type="secondary">
            {guide.advancedDescription}
          </Typography.Text>
          <ul className={styles.decisionRouteList}>
            {guide.advancedItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function GovernanceControlSection(props: {
  testId: string;
  title: string;
  description: ReactNode;
  wide?: boolean;
  saveLabel?: string;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  onSave?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const saveAction = props.onSave ? (
    <Button
      type="primary"
      loading={props.saveLoading}
      disabled={props.saveDisabled}
      onClick={props.onSave}
    >
      {props.saveLabel ?? "Save"}
    </Button>
  ) : null;
  const actions =
    props.actions || saveAction ? (
      props.actions ? (
        <div className={styles.sectionActions}>
          {props.actions}
          {saveAction}
        </div>
      ) : (
        saveAction
      )
    ) : null;

  return (
    <section
      className={
        props.wide
          ? `${styles.sectionCard} ${styles.sectionWide}`
          : styles.sectionCard
      }
      data-testid={props.testId}
    >
      <div className={styles.sectionHeader}>
        <div className={styles.sectionCopy}>
          <Typography.Text strong>{props.title}</Typography.Text>
          <Typography.Text type="secondary">
            {props.description}
          </Typography.Text>
        </div>
        {actions}
      </div>
      <div className={styles.sectionBody}>{props.children}</div>
    </section>
  );
}

export type GovernanceControlSectionModel = {
  key?: string;
  testId: string;
  title: string;
  description: ReactNode;
  wide?: boolean;
  saveLabel?: string;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  onSave?: () => void;
  actions?: ReactNode;
  content: ReactNode;
};

export function GovernanceControlSections(props: {
  sections: GovernanceControlSectionModel[];
}) {
  return (
    <>
      {props.sections.map((section) => (
        <GovernanceControlSection
          key={section.key ?? section.testId}
          testId={section.testId}
          title={section.title}
          description={section.description}
          wide={section.wide}
          saveLabel={section.saveLabel}
          saveLoading={section.saveLoading}
          saveDisabled={section.saveDisabled}
          onSave={section.onSave}
          actions={section.actions}
        >
          {section.content}
        </GovernanceControlSection>
      ))}
    </>
  );
}

export function GovernanceEditorList(props: { children: ReactNode }) {
  return <div className={styles.editorList}>{props.children}</div>;
}

export function GovernanceEditorCard(props: {
  testId?: string;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.editorCard} data-testid={props.testId}>
      <div className={styles.editorCardHeader}>
        <div className={styles.sectionCopy}>
          <Typography.Text strong>{props.title}</Typography.Text>
          <Typography.Text type="secondary">
            {props.description}
          </Typography.Text>
        </div>
        {props.actions}
      </div>
      {props.children}
    </div>
  );
}

export function GovernanceNestedSectionStack(props: { children: ReactNode }) {
  return <div className={styles.warningStack}>{props.children}</div>;
}

export function GovernanceNestedSectionCard(props: {
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionCopy}>
          <Typography.Text strong>{props.title}</Typography.Text>
          <Typography.Text type="secondary">
            {props.description}
          </Typography.Text>
        </div>
        {props.actions}
      </div>
      <div className={styles.sectionBody}>{props.children}</div>
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
      <details className={styles.advancedDisclosure}>
        <summary className={styles.advancedDisclosureSummary}>
          Raw policy editor
        </summary>
        <div className={styles.advancedDisclosureBody}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionCopy}>
              <Typography.Text type="secondary">
                Use raw policy editing for statements that do not fit the typed
                controls surface. Keep routine access and protection changes in
                typed controls first.
              </Typography.Text>
            </div>
            <Button
              onClick={() => props.onOpenAdvancedPolicy?.(props.bucket)}
              disabled={!props.onOpenAdvancedPolicy || !props.advancedPolicy.rawPolicyEditable}
            >
              Open Policy
            </Button>
          </div>
          <div className={styles.tagRow}>
            <Tag color={props.advancedPolicy.rawPolicyEditable ? "blue" : "default"}>
              {props.advancedPolicy.rawPolicyEditable
                ? "Editable raw policy"
                : "Read-only raw policy"}
            </Tag>
            <Tag color="gold">Raw policy</Tag>
            <Tag>
              {props.advancedPolicy.rawPolicy
                ? "Policy document detected"
                : "No raw policy document loaded in summary"}
            </Tag>
          </div>
        </div>
      </details>
    </section>
  );
}

export function GovernanceControlsLayout(props: {
  provider: Profile["provider"];
  mobile: boolean;
  bucket: string;
  onClose: () => void;
  closeDisabled: boolean;
  summaryTitle: string;
  summaryDescription: string;
  summaryTags: string[];
  isRefreshing: boolean;
  warnings?: WarningCarrier | null;
  advancedPolicy?: BucketAdvancedView;
  onOpenAdvancedPolicy?: (bucket: string) => void;
  children: ReactNode;
}) {
  const handleClose = () => {
    if (props.closeDisabled) return;
    props.onClose();
  };

  return (
    <BucketGovernanceDialogShell
      mobile={props.mobile}
      title={`Controls: ${props.bucket}`}
      onClose={handleClose}
      closeDisabled={props.closeDisabled}
      footer={
        <div className={styles.footerActions}>
          <Button onClick={handleClose} disabled={props.closeDisabled}>Close</Button>
        </div>
      }
    >
      <GovernanceSummaryCard
        title={props.summaryTitle}
        description={props.summaryDescription}
        tags={props.summaryTags}
        isRefreshing={props.isRefreshing}
      />

      <GovernanceDecisionGuideCard provider={props.provider} />

      {renderWarningStack(extractWarningList(props.warnings))}

      <AdvancedPolicySection
        bucket={props.bucket}
        advancedPolicy={props.advancedPolicy}
        onOpenAdvancedPolicy={props.onOpenAdvancedPolicy}
      />

      <div className={styles.grid}>{props.children}</div>
    </BucketGovernanceDialogShell>
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
