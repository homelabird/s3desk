import { Button, Tag, Typography } from "antd";

import {
  getBucketPolicyDecisionGuide,
  type BucketDecisionTone,
} from "./bucketPolicyDecisionGuide";
import styles from "./BucketPolicyModal.module.css";
import type { PolicyKind } from "./policyPresets";

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

export function BucketPolicyWorkspaceHeader(props: {
  policyKind: PolicyKind;
  controlsShortcut: { title: string; description: string } | null;
  bucket: string;
  onOpenControls?: (bucket: string) => void;
}) {
  const guide = getBucketPolicyDecisionGuide(props.policyKind);
  return (
    <section
      className={styles.decisionHeader}
      data-testid="bucket-policy-decision-header"
    >
      <div className={styles.decisionHeaderTop}>
        <div className={styles.decisionHeaderCopy}>
          <Typography.Text strong>{guide.workspaceTitle}</Typography.Text>
          <Typography.Text type="secondary">
            {guide.workspaceDescription}
          </Typography.Text>
        </div>
        <div className={styles.decisionBadgeRow} aria-label="Policy risk signals">
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
          data-testid="bucket-policy-recommended-route"
        >
          <Tag className={styles.routeTagPrimary}>Recommended path</Tag>
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
          data-testid="bucket-policy-advanced-route"
        >
          <Tag className={styles.routeTagAdvanced}>Advanced path</Tag>
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

      {props.controlsShortcut ? (
        <div
          className={styles.awsShortcutBanner}
          data-testid="bucket-policy-controls-shortcut"
        >
          <div className={styles.awsShortcutCopy}>
            <Typography.Text strong>{props.controlsShortcut.title}</Typography.Text>
            <Typography.Text type="secondary">
              {props.controlsShortcut.description}
            </Typography.Text>
          </div>
          <Button onClick={() => props.onOpenControls?.(props.bucket)}>
            Open Controls
          </Button>
        </div>
      ) : null}
    </section>
  );
}
