import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Profiler,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Button, Empty, Spin } from "antd";

import type { ObjectItem } from "../../api/types";
import { logReactRender, measurePerf } from "../../lib/perf";
import type { ObjectRow } from "./objectsListUtils";
import type { ObjectsViewMode } from "./objectsTypes";
import gridStyles from "./ObjectsGridCards.module.css";
import listStyles from "./ObjectsListView.module.css";

type ObjectsListContentProps = {
  rows: ObjectRow[];
  virtualItems: { index: number; start: number }[];
  totalSize: number;
  hasProfile: boolean;
  hasBucket: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  emptyKind: "empty" | "noresults" | null;
  canClearSearch: boolean;
  onClearSearch: () => void;
  viewMode: ObjectsViewMode;
  renderPrefixRow: (
    prefix: string,
    offset: number,
    rowIndex: number,
  ) => ReactNode;
  renderObjectRow: (
    object: ObjectItem,
    offset: number,
    rowIndex: number,
  ) => ReactNode;
  renderPrefixGridItem: (prefix: string) => ReactNode;
  renderObjectGridItem: (object: ObjectItem) => ReactNode;
  showLoadMore?: boolean;
  loadMoreLabel?: string;
  loadMoreDisabled?: boolean;
  onLoadMore?: () => void;
};

export function ObjectsListContent(props: ObjectsListContentProps) {
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const [gridScrollMargin, setGridScrollMargin] = useState(0);
  const gridScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useCallback((node: HTMLDivElement | null) => {
    setGridElement(node);
    gridScrollContainerRef.current = node?.closest(
      '[data-scroll-container="app-content"]',
    ) as HTMLDivElement | null;
  }, []);

  useLayoutEffect(() => {
    if (!gridElement) return;
    const updateGeometry = () => {
      setGridWidth(gridElement.clientWidth);
      const container = gridScrollContainerRef.current;
      if (!container) return;
      const next = Math.max(
        0,
        Math.round(
          gridElement.getBoundingClientRect().top -
            container.getBoundingClientRect().top +
            container.scrollTop,
        ),
      );
      setGridScrollMargin((current) => (current === next ? current : next));
    };
    updateGeometry();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(gridElement);
    return () => observer.disconnect();
  }, [gridElement]);

  const compactGrid = typeof window !== "undefined" && window.innerWidth <= 768;
  const narrowGrid = typeof window !== "undefined" && window.innerWidth <= 480;
  const gridPadding = compactGrid ? 8 : 12;
  const gridGap = narrowGrid ? 8 : compactGrid ? 10 : 14;
  const gridMinCardWidth = narrowGrid ? 144 : compactGrid ? 152 : 210;
  const gridColumnCount = Math.max(
    1,
    Math.floor(
      (Math.max(0, gridWidth - gridPadding * 2) + gridGap) /
        (gridMinCardWidth + gridGap),
    ),
  );
  const gridRowCount = Math.ceil(props.rows.length / gridColumnCount);
  const estimatedGridRowHeight = compactGrid ? 300 : 360;
  const gridVirtualizer = useVirtualizer({
    count: props.viewMode === "grid" ? gridRowCount : 0,
    getScrollElement: () => gridScrollContainerRef.current,
    estimateSize: () => estimatedGridRowHeight,
    overscan: 2,
    scrollMargin: gridScrollMargin,
  });
  const measuredGridRows = gridVirtualizer.getVirtualItems();
  const virtualGridRows = useMemo(
    () =>
      measuredGridRows.length > 0 || gridRowCount === 0
        ? measuredGridRows
        : Array.from({ length: Math.min(gridRowCount, 4) }, (_, index) => ({
            index,
            key: index,
            start: index * estimatedGridRowHeight,
            size: estimatedGridRowHeight,
            end: (index + 1) * estimatedGridRowHeight,
            lane: 0,
          })),
    [estimatedGridRowHeight, gridRowCount, measuredGridRows],
  );
  const gridTotalSize =
    measuredGridRows.length > 0
      ? gridVirtualizer.getTotalSize()
      : gridRowCount * estimatedGridRowHeight;
  const gridStyle = {
    "--objects-grid-columns": gridColumnCount,
    "--objects-grid-gap": `${gridGap}px`,
  } as CSSProperties;
  const loadMoreButton =
    props.showLoadMore && props.onLoadMore ? (
      <Button
        size="small"
        onClick={props.onLoadMore}
        disabled={props.loadMoreDisabled}
      >
        {props.loadMoreLabel ?? "Load more"}
      </Button>
    ) : null;
  const renderedRows =
    props.viewMode === "grid"
      ? null
      : measurePerf(
          "ObjectsListContent.map",
          () =>
            props.virtualItems.map((vi) => {
              const row = props.rows[vi.index];
              if (!row) return null;
              if (row.kind === "prefix")
                return props.renderPrefixRow(row.prefix, vi.start, vi.index);
              return props.renderObjectRow(row.object, vi.start, vi.index);
            }),
          { items: props.virtualItems.length, rows: props.rows.length },
        );
  const renderedGridRows =
    props.viewMode !== "grid"
      ? null
      : measurePerf(
          "ObjectsListContent.grid",
          () =>
            virtualGridRows.map((virtualRow) => {
              const firstIndex = virtualRow.index * gridColumnCount;
              return (
                <div
                  key={virtualRow.key}
                  ref={gridVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className={gridStyles.gridVirtualRow}
                  style={{
                    paddingBottom:
                      virtualRow.index === gridRowCount - 1 ? 0 : gridGap,
                    transform: `translateY(${virtualRow.start - gridScrollMargin}px)`,
                  }}
                >
                  {props.rows
                    .slice(firstIndex, firstIndex + gridColumnCount)
                    .map((row) =>
                      row.kind === "prefix"
                        ? props.renderPrefixGridItem(row.prefix)
                        : props.renderObjectGridItem(row.object),
                    )}
                </div>
              );
            }),
          { rows: props.rows.length, mountedRows: virtualGridRows.length },
        );

  if (props.rows.length === 0) {
    const empty = (
      <div className={listStyles.listEmptyState}>
        {!props.hasProfile ? (
          <Empty description="Select a profile to browse objects." />
        ) : !props.hasBucket ? (
          <Empty description="Select a bucket to start browsing objects (use the dropdown above)." />
        ) : props.isFetching ? (
          <div
            className={listStyles.listEmptyLoading}
            role="status"
            aria-live="polite"
            aria-label="Loading objects"
          >
            <Spin />
            <span className="sr-only">Loading objects...</span>
          </div>
        ) : (
          <Empty
            description={
              props.emptyKind === "empty" ? "Empty folder" : "No results"
            }
          >
            {props.emptyKind === "noresults" ? (
              <Button
                onClick={props.onClearSearch}
                disabled={!props.canClearSearch}
              >
                Clear search
              </Button>
            ) : null}
          </Empty>
        )}

        {loadMoreButton ? (
          <div className={listStyles.listFooterAction}>{loadMoreButton}</div>
        ) : null}
      </div>
    );
    return (
      <Profiler id="ObjectsListContent.empty" onRender={logReactRender}>
        {empty}
      </Profiler>
    );
  }

  if (props.viewMode === "grid") {
    const content = (
      <div
        ref={gridRef}
        className={gridStyles.gridContent}
        style={gridStyle}
        data-testid="objects-grid-content"
        role="list"
        aria-label="Objects card list"
      >
        <div
          className={gridStyles.gridVirtualCanvas}
          style={{ height: gridTotalSize }}
        >
          {renderedGridRows}
        </div>
        {props.isFetchingNextPage ? (
          <div className={gridStyles.gridFooter}>
            <div className={gridStyles.gridFooterCell}>
              <Spin />
            </div>
          </div>
        ) : loadMoreButton ? (
          <div className={gridStyles.gridFooter}>
            <div className={gridStyles.gridFooterCell}>{loadMoreButton}</div>
          </div>
        ) : null}
      </div>
    );
    return (
      <Profiler id="ObjectsListContent.grid" onRender={logReactRender}>
        {content}
      </Profiler>
    );
  }

  const content = (
    <div
      className={listStyles.virtualListContent}
      style={{ height: props.totalSize }}
    >
      {renderedRows}

      {props.isFetchingNextPage ? (
        <div className={listStyles.virtualListFooter}>
          <Spin />
        </div>
      ) : loadMoreButton ? (
        <div className={listStyles.virtualListFooter}>{loadMoreButton}</div>
      ) : null}
    </div>
  );
  return (
    <Profiler id="ObjectsListContent.rows" onRender={logReactRender}>
      {content}
    </Profiler>
  );
}
