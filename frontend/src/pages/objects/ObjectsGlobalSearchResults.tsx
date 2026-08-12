import {
  CopyOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button, Empty, Spin, Typography } from "antd";
import { useMemo, useRef } from "react";

import type { ObjectItem } from "../../api/types";
import { formatDateTime } from "../../lib/format";
import { formatBytes } from "../../lib/transfer";
import styles from "./ObjectsSearch.module.css";

type ObjectsGlobalSearchResultsProps = {
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isMd: boolean;
  useWideResults: boolean;
  items: ObjectItem[];
  onCopyKey: (key: string) => void;
  onDownloadKey: (key: string, size?: number) => void;
  onLoadMore: () => void;
  onOpenDetails: (key: string) => void;
  onOpenPrefixForKey: (key: string) => void;
  searchQueryText: string;
};

function ObjectsGlobalSearchResultActions({
  variant,
  onCopyKey,
  onDownloadKey,
  onOpenDetails,
  onOpenPrefixForKey,
  row,
}: Pick<
  ObjectsGlobalSearchResultsProps,
  "onCopyKey" | "onDownloadKey" | "onOpenDetails" | "onOpenPrefixForKey"
> & {
  variant: "card" | "table";
  row: ObjectItem;
}) {
  const isCard = variant === "card";

  return (
    <div
      className={
        isCard
          ? styles.globalSearchResultActions
          : styles.globalSearchTableActionRow
      }
      data-global-search-table-action-row={isCard ? undefined : "true"}
    >
      <Button
        size="small"
        className={
          isCard
            ? styles.globalSearchResultPrimaryButton
            : styles.globalSearchTablePrimaryButton
        }
        aria-label={`Open ${row.key}`}
        title={`Open ${row.key}`}
        onClick={() => onOpenPrefixForKey(row.key)}
      >
        Open
      </Button>
      <Button
        size="small"
        className={
          isCard
            ? styles.globalSearchResultIconButton
            : styles.globalSearchTableIconButton
        }
        icon={<CopyOutlined />}
        aria-label={`Copy key ${row.key}`}
        onClick={() => onCopyKey(row.key)}
      />
      <Button
        size="small"
        className={
          isCard
            ? styles.globalSearchResultIconButton
            : styles.globalSearchTableIconButton
        }
        icon={<DownloadOutlined />}
        aria-label={`Download ${row.key}`}
        onClick={() => onDownloadKey(row.key, row.size)}
      />
      <Button
        size="small"
        className={
          isCard
            ? styles.globalSearchResultSecondaryButton
            : styles.globalSearchTableIconButton
        }
        icon={<InfoCircleOutlined />}
        aria-label={`Open details for ${row.key}`}
        title={`Open details for ${row.key}`}
        onClick={() => onOpenDetails(row.key)}
      >
        {isCard ? "Details" : null}
      </Button>
    </div>
  );
}

export function ObjectsGlobalSearchResults({
  hasNextPage,
  isFetching,
  isFetchingNextPage,
  isMd,
  useWideResults,
  items,
  onCopyKey,
  onDownloadKey,
  onLoadMore,
  onOpenDetails,
  onOpenPrefixForKey,
  searchQueryText,
}: ObjectsGlobalSearchResultsProps) {
  const buttonSize = isMd ? "middle" : "small";
  const showMobileResults = !useWideResults;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const estimatedRowHeight = showMobileResults ? 168 : 58;
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 6,
  });
  const measuredVirtualItems = virtualizer.getVirtualItems();
  const virtualItems = useMemo(
    () =>
      measuredVirtualItems.length > 0 || items.length === 0
        ? measuredVirtualItems
        : items.slice(0, 20).map((row, index) => ({
            index,
            key: row.key,
            start: index * estimatedRowHeight,
            size: estimatedRowHeight,
            end: (index + 1) * estimatedRowHeight,
            lane: 0,
          })),
    [estimatedRowHeight, items, measuredVirtualItems],
  );
  const totalSize =
    measuredVirtualItems.length > 0
      ? virtualizer.getTotalSize()
      : items.length * estimatedRowHeight;
  const tableWrapClass = `${styles.globalSearchTableWrap} ${isMd ? styles.globalSearchTableWrapMd : ""}`;
  const tableClass = `${styles.globalSearchTable} ${isMd ? styles.globalSearchTableMd : styles.globalSearchTableSm}`;
  const keyTextClass = `${styles.globalSearchKeyText} ${isMd ? styles.globalSearchKeyTextMd : styles.globalSearchKeyTextSm}`;

  if (!searchQueryText) {
    return <Empty description="Type a query to search" />;
  }

  if (isFetching && items.length === 0) {
    return (
      <div
        className={styles.loadingRow}
        role="status"
        aria-live="polite"
        aria-label="Loading search results"
      >
        <Spin />
        <Typography.Text type="secondary">Loading results...</Typography.Text>
      </div>
    );
  }

  if (items.length === 0) {
    return <Empty description="No results" />;
  }

  return (
    <>
      <p
        className={styles.globalSearchResultsMeta}
        role="status"
        aria-live="polite"
      >
        {items.length} result(s)
        {hasNextPage ? " (more available)" : ""}
      </p>
      {showMobileResults ? (
        <div
          ref={scrollRef}
          className={styles.globalSearchResultsViewport}
          data-testid="objects-global-search-results"
          role="list"
          aria-label="Global object search results"
        >
          <div
            className={styles.globalSearchVirtualList}
            style={{ height: totalSize }}
          >
            {virtualItems.map((virtualItem) => {
              const row = items[virtualItem.index];
              if (!row) return null;
              return (
                <div
                  key={virtualItem.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  className={styles.globalSearchVirtualCard}
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                  role="listitem"
                >
                  <article
                    className={styles.globalSearchResultCard}
                    data-global-search-result-card="true"
                  >
                    <code
                      title={row.key}
                      className={styles.globalSearchResultKey}
                      data-global-search-result-key="true"
                    >
                      {row.key}
                    </code>
                    <div className={styles.globalSearchResultMeta}>
                      <span className={styles.globalSearchResultMetaItem}>
                        <span className={styles.globalSearchMuted}>Size</span>
                        <strong>
                          {typeof row.size === "number" && row.size >= 0
                            ? formatBytes(row.size)
                            : "-"}
                        </strong>
                      </span>
                      <span className={styles.globalSearchResultMetaItem}>
                        <span className={styles.globalSearchMuted}>
                          Modified
                        </span>
                        <strong>
                          {row.lastModified
                            ? formatDateTime(row.lastModified, {
                                showSeconds: false,
                              })
                            : "-"}
                        </strong>
                      </span>
                    </div>
                    <ObjectsGlobalSearchResultActions
                      variant="card"
                      row={row}
                      onCopyKey={onCopyKey}
                      onDownloadKey={onDownloadKey}
                      onOpenDetails={onOpenDetails}
                      onOpenPrefixForKey={onOpenPrefixForKey}
                    />
                  </article>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className={tableWrapClass}
          data-testid="objects-global-search-table-wrap"
        >
          <table className={tableClass} aria-rowcount={items.length + 1}>
            <caption className="sr-only">Global object search results</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={`${styles.globalSearchTh} ${styles.globalSearchThKey}`}
                >
                  Key
                </th>
                <th
                  scope="col"
                  className={`${styles.globalSearchTh} ${styles.globalSearchThSize}`}
                >
                  Size
                </th>
                <th
                  scope="col"
                  className={`${styles.globalSearchTh} ${styles.globalSearchThModified}`}
                >
                  Last modified
                </th>
                <th
                  scope="col"
                  className={`${styles.globalSearchTh} ${styles.globalSearchThActions}`}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {virtualItems[0]?.start ? (
                <tr aria-hidden>
                  <td
                    className={styles.globalSearchSpacerCell}
                    colSpan={4}
                    style={{ height: virtualItems[0].start }}
                  />
                </tr>
              ) : null}
              {virtualItems.map((virtualItem) => {
                const row = items[virtualItem.index];
                if (!row) return null;
                return (
                  <tr
                    key={virtualItem.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    aria-rowindex={virtualItem.index + 2}
                  >
                    <td
                      className={`${styles.globalSearchTd} ${styles.globalSearchTdKey}`}
                    >
                      <code title={row.key} className={keyTextClass}>
                        {row.key}
                      </code>
                    </td>
                    <td className={styles.globalSearchTd}>
                      <span className={styles.globalSearchMuted}>
                        {typeof row.size === "number" && row.size >= 0
                          ? formatBytes(row.size)
                          : "-"}
                      </span>
                    </td>
                    <td className={styles.globalSearchTd}>
                      {row.lastModified ? (
                        <code
                          title={row.lastModified}
                          className={styles.globalSearchDateText}
                        >
                          {formatDateTime(row.lastModified, {
                            showSeconds: false,
                          })}
                        </code>
                      ) : (
                        <span className={styles.globalSearchMuted}>-</span>
                      )}
                    </td>
                    <td
                      className={`${styles.globalSearchTd} ${styles.globalSearchTdActions}`}
                    >
                      <ObjectsGlobalSearchResultActions
                        variant="table"
                        row={row}
                        onCopyKey={onCopyKey}
                        onDownloadKey={onDownloadKey}
                        onOpenDetails={onOpenDetails}
                        onOpenPrefixForKey={onOpenPrefixForKey}
                      />
                    </td>
                  </tr>
                );
              })}
              {virtualItems.length > 0 &&
              virtualItems[virtualItems.length - 1]!.end < totalSize ? (
                <tr aria-hidden>
                  <td
                    className={styles.globalSearchSpacerCell}
                    colSpan={4}
                    style={{
                      height:
                        totalSize - virtualItems[virtualItems.length - 1]!.end,
                    }}
                  />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      <div className={styles.globalSearchLoadMoreRow}>
        <Button
          size={buttonSize}
          className={styles.globalSearchCompactButton}
          onClick={onLoadMore}
          disabled={!hasNextPage}
          loading={isFetchingNextPage}
        >
          Load more
        </Button>
      </div>
    </>
  );
}
