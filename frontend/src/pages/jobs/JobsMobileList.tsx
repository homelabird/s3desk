import { useVirtualizer } from "@tanstack/react-virtual";
import { Tag, Typography } from "antd";
import { useMemo, useRef, type ReactNode } from "react";

import type { Job } from "../../api/types";
import { formatDateTime } from "../../lib/format";
import { jobTypeLabel } from "../../lib/jobTypes";
import { formatProgress } from "./jobPresentation";
import { statusColor } from "./jobUtils";
import styles from "./JobsTableSection.module.css";

type Props = {
  jobs: Job[];
  height: number;
  getJobSummary: (job: Job) => string | null;
  renderJobActions: (job: Job) => ReactNode;
};

export function JobsMobileList({
  jobs,
  height,
  getJobSummary,
  renderJobActions,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: jobs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 220,
    overscan: 4,
  });
  const measuredItems = virtualizer.getVirtualItems();
  const virtualItems = useMemo(
    () =>
      measuredItems.length > 0
        ? measuredItems
        : jobs.slice(0, 20).map((_, index) => ({
            index,
            key: index,
            start: index * 220,
            size: 220,
            end: (index + 1) * 220,
            lane: 0,
          })),
    [jobs, measuredItems],
  );
  const totalSize =
    measuredItems.length > 0 ? virtualizer.getTotalSize() : jobs.length * 220;

  return (
    <div
      ref={scrollRef}
      className={styles.mobileList}
      role="list"
      aria-label="Job history"
      style={{ maxHeight: height }}
    >
      <div
        className={styles.mobileVirtualContent}
        style={{ height: totalSize }}
      >
        {virtualItems.map((virtualItem) => {
          const job = jobs[virtualItem.index];
          if (!job) return null;
          const summary = getJobSummary(job) ?? "No summary available.";
          const errorText = [job.errorCode, job.error]
            .filter(Boolean)
            .join(" · ");
          const cardClassName =
            job.status === "failed"
              ? `${styles.mobileCard} ${styles.mobileCardFailed}`
              : styles.mobileCard;
          return (
            <div
              key={job.id}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className={styles.mobileVirtualRow}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
              role="listitem"
            >
              <article className={cardClassName}>
                <div className={styles.mobileCardTop}>
                  <div className={styles.mobileCardCopy}>
                    <div className={styles.mobileTitleRow}>
                      <Tag color={statusColor(job.status)}>{job.status}</Tag>
                      <Typography.Text strong>
                        {jobTypeLabel(job.type)}
                      </Typography.Text>
                    </div>
                    <Typography.Paragraph className={styles.mobileSummary} title={summary}>
                      {summary}
                    </Typography.Paragraph>
                    <Typography.Text code className={styles.mobileJobId} title={job.id}>
                      {job.id}
                    </Typography.Text>
                  </div>
                </div>

                <div className={styles.mobileMetaGrid}>
                  <div>
                    <div className={styles.mobileMetaLabel}>Created</div>
                    <div className={styles.mobileMetaValue}>
                      {job.createdAt ? formatDateTime(job.createdAt) : "-"}
                    </div>
                  </div>
                  <div>
                    <div className={styles.mobileMetaLabel}>Progress</div>
                    <div className={styles.mobileMetaValue}>
                      {formatProgress(job.progress)}
                    </div>
                  </div>
                </div>

                {errorText ? (
                  <div className={styles.mobileError} title={errorText}>
                    {errorText}
                  </div>
                ) : null}

                <div className={styles.mobileActionRow}>
                  <div className={styles.mobileInlineActions}>
                    {renderJobActions(job)}
                  </div>
                </div>
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}
