import { Badge, Input, Typography } from "antd";
import { SearchOutlined, StarFilled } from "@ant-design/icons";
import { useMemo, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { ToggleSwitch } from "../../components/ToggleSwitch";
import type { FavoriteObjectItem } from "../../api/types";
import {
  clearFavoritesFilterHint,
  chooseProfileToShowPinnedObjectsHint,
  failedToLoadFavoritesTitle,
  fetchingPinnedObjectsHint,
  favoritesUnavailableUntilBucketSelectedLabel,
  favoritesUnavailableUntilProfileSelectedLabel,
  loadingFavoritesTitle,
  loadingFavoritesCountLabel,
  noFavoritesMatchQueryTitle,
  noFavoritesYetTitle,
  pickBucketToShowPinnedObjectsHint,
  selectBucketFirstHint,
  selectProfileFirstHint,
  starObjectsToKeepThemHereHint,
} from "../../lib/actionHints";
import styles from "./ObjectsFavorites.module.css";
import { ObjectsPaneStatus } from "./ObjectsPaneStatus";
import { ObjectsTreePane } from "./ObjectsTreePane";

type ObjectsFavoritesPaneProps = {
  hasProfile: boolean;
  hasBucket: boolean;
  favoriteCount: number;
  isLoading: boolean;
  errorMessage?: string | null;
  favorites: FavoriteObjectItem[];
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (value: boolean) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectFavorite: (key: string) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

function splitFavoriteKey(key: string): { name: string; path: string } {
  const trimmed = key.replace(/\/+$/, "");
  if (!trimmed) return { name: key, path: "" };
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 0) return { name: key, path: "" };
  const name = parts.pop() ?? key;
  const path = parts.length ? `${parts.join("/")}/` : "";
  return { name, path };
}

export function ObjectsFavoritesPane(props: ObjectsFavoritesPaneProps) {
  const disabled = !props.hasProfile || !props.hasBucket;
  const isExpanded = props.expanded !== false;
  const availableFavorites = useMemo(
    () => (disabled ? [] : props.favorites),
    [disabled, props.favorites],
  );
  const favoriteCount = disabled ? 0 : props.favoriteCount;
  const queryText = props.query.trim();
  const query = queryText.toLowerCase();
  const sorted = useMemo(() => {
    const filtered = query
      ? availableFavorites.filter((item) =>
          item.key.toLowerCase().includes(query),
        )
      : availableFavorites;
    return [...filtered].sort((a, b) => a.key.localeCompare(b.key));
  }, [availableFavorites, query]);
  const favoritesListRef = useRef<HTMLDivElement | null>(null);
  const favoritesVirtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => favoritesListRef.current,
    estimateSize: () => 44,
    overscan: 5,
  });
  const measuredFavorites = favoritesVirtualizer.getVirtualItems();
  const virtualFavorites = useMemo(
    () =>
      measuredFavorites.length > 0
        ? measuredFavorites
        : sorted.slice(0, 20).map((_, index) => ({
            index,
            key: index,
            start: index * 44,
            size: 44,
            end: (index + 1) * 44,
            lane: 0,
          })),
    [measuredFavorites, sorted],
  );
  const favoritesTotalSize =
    measuredFavorites.length > 0
      ? favoritesVirtualizer.getTotalSize()
      : sorted.length * 44;
  const hasFavorites = favoriteCount > 0;
  const showSearch = hasFavorites || query.length > 0;
  const showBehaviorControls = props.favoritesOnly;
  const showLoadingBadge =
    !disabled &&
    props.isLoading &&
    favoriteCount === 0 &&
    availableFavorites.length === 0;

  let status: {
    kind: "prereq" | "loading" | "empty" | "error";
    title: string;
    description?: string;
  } | null = null;
  if (!props.hasProfile) {
    status = {
      kind: "prereq",
      title: selectProfileFirstHint(),
      description: chooseProfileToShowPinnedObjectsHint(),
    };
  } else if (!props.hasBucket) {
    status = {
      kind: "prereq",
      title: selectBucketFirstHint(),
      description: pickBucketToShowPinnedObjectsHint(),
    };
  } else if (props.errorMessage) {
    status = {
      kind: "error",
      title: failedToLoadFavoritesTitle(),
      description: props.errorMessage,
    };
  } else if (props.isLoading && availableFavorites.length === 0) {
    status = {
      kind: "loading",
      title: loadingFavoritesTitle(),
      description: fetchingPinnedObjectsHint(),
    };
  } else if (availableFavorites.length === 0) {
    status = {
      kind: "empty",
      title: noFavoritesYetTitle(),
      description: starObjectsToKeepThemHereHint(),
    };
  } else if (sorted.length === 0) {
    status = {
      kind: "empty",
      title: noFavoritesMatchQueryTitle(queryText),
      description: clearFavoritesFilterHint(),
    };
  }

  let badgeCount: ReactNode = favoriteCount;
  let badgeLabel =
    favoriteCount === 1
      ? "1 favorite pinned"
      : `${favoriteCount} favorites pinned`;
  if (!props.hasProfile) {
    badgeCount = null;
    badgeLabel = favoritesUnavailableUntilProfileSelectedLabel();
  } else if (!props.hasBucket) {
    badgeCount = null;
    badgeLabel = favoritesUnavailableUntilBucketSelectedLabel();
  } else if (
    props.errorMessage &&
    favoriteCount === 0 &&
    availableFavorites.length === 0
  ) {
    badgeCount = "!";
    badgeLabel = failedToLoadFavoritesTitle();
  } else if (showLoadingBadge) {
    badgeCount = "…";
    badgeLabel = loadingFavoritesCountLabel();
  }

  const collapsedSummaryParts: string[] = [];
  if (props.favoritesOnly) collapsedSummaryParts.push("Only");
  if (queryText) collapsedSummaryParts.push(`"${queryText}"`);
  const collapsedSummary =
    !isExpanded && collapsedSummaryParts.length > 0
      ? collapsedSummaryParts.join(" · ")
      : null;
  const liveStatusText = props.errorMessage
    ? `${failedToLoadFavoritesTitle()}: ${props.errorMessage}`
    : props.isLoading && !disabled
      ? `${loadingFavoritesTitle()}: ${fetchingPinnedObjectsHint()}`
      : badgeLabel;

  return (
    <ObjectsTreePane
      title={
        <span
          className={styles.favoritesTitle}
          data-testid="objects-favorites-title"
        >
          <span className={styles.favoritesTitleLabel}>Favorites</span>
          {collapsedSummary ? (
            <span
              className={styles.favoritesTitleSummary}
              data-testid="objects-favorites-summary"
              title={collapsedSummary}
            >
              {collapsedSummary}
            </span>
          ) : null}
        </span>
      }
      testId="objects-favorites-pane"
      collapsible
      expanded={props.expanded}
      onExpandedChange={props.onExpandedChange}
      extra={
        <>
          <span
            data-testid="objects-favorites-badge"
            aria-label={badgeLabel}
            title={badgeLabel}
          >
            <Badge
              count={badgeCount}
              overflowCount={999}
              showZero={!showLoadingBadge && badgeCount !== null}
              style={{
                backgroundColor:
                  showLoadingBadge || props.errorMessage || favoriteCount > 0
                    ? "var(--s3d-color-primary)"
                    : "var(--s3d-color-border-strong)",
              }}
            />
          </span>
          <span
            className="sr-only"
            role={props.errorMessage ? "alert" : "status"}
            aria-live={props.errorMessage ? "assertive" : "polite"}
            aria-atomic="true"
            data-testid="objects-favorites-live-status"
          >
            {liveStatusText}
          </span>
        </>
      }
    >
      <div className={styles.favoritesPane}>
        {showSearch ? (
          <Input
            allowClear
            size="small"
            placeholder="Find favorite…"
            aria-label="Find favorite"
            prefix={<SearchOutlined />}
            value={props.query}
            onChange={(e) => props.onQueryChange(e.target.value)}
            disabled={disabled}
          />
        ) : null}
        {showBehaviorControls ? (
          <div
            className={styles.favoritesControls}
            data-testid="objects-favorites-controls"
          >
            <div className={styles.favoritesControl}>
              <ToggleSwitch
                checked={props.favoritesOnly}
                onChange={props.onFavoritesOnlyChange}
                disabled={disabled}
                ariaLabel="Favorites only"
              />
              <Typography.Text
                type="secondary"
                className={styles.favoritesControlLabel}
              >
                Favorites only
              </Typography.Text>
            </div>
          </div>
        ) : null}
        <div
          ref={favoritesListRef}
          className={styles.favoritesList}
          role="list"
          aria-label="Favorite objects"
        >
          <div
            className={styles.favoritesVirtualContent}
            style={{ height: favoritesTotalSize }}
          >
            {virtualFavorites.map((virtualItem) => {
              const item = sorted[virtualItem.index];
              if (!item) return null;
              const { name, path } = splitFavoriteKey(item.key);
              return (
                <div
                  key={item.key}
                  ref={favoritesVirtualizer.measureElement}
                  data-index={virtualItem.index}
                  className={styles.favoritesVirtualItem}
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                role="listitem"
                aria-posinset={virtualItem.index + 1}
                aria-setsize={sorted.length}
                >
                  <button
                    type="button"
                    className={styles.favoritesItem}
                    data-testid="objects-favorite-item"
                    data-favorite-key={item.key}
                    onClick={() => props.onSelectFavorite(item.key)}
                    disabled={disabled}
                  >
                    <div className={styles.favoritesItemTitle}>
                      <StarFilled className={styles.favoritesStar} />
                      <Typography.Text
                        className={styles.favoritesItemName}
                        title={name}
                      >
                        {name}
                      </Typography.Text>
                    </div>
                    <Typography.Text
                      className={styles.favoritesItemPath}
                      title={item.key}
                      type="secondary"
                    >
                      {path || "/"}
                    </Typography.Text>
                  </button>
                </div>
              );
            })}
          </div>
          {status ? (
            <ObjectsPaneStatus
              kind={status.kind}
              title={status.title}
              description={status.description}
              testId="objects-favorites-status"
              kindAttributeName="data-favorites-status-kind"
            />
          ) : null}
        </div>
      </div>
    </ObjectsTreePane>
  );
}
