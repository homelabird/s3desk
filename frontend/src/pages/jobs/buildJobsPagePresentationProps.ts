import type { JobsToolbarProps } from './JobsToolbar'
import type { JobsTableSectionProps } from './JobsTableSection'

type Args = {
  apiToken: string
  profileId: string | null
  isOffline: boolean
  eventsConnected: boolean
  eventsTransport: JobsToolbarProps['eventsTransport']
  eventsRetryCount: number
  eventsRetryThreshold: number
  onRetryRealtime: () => void
  statusFilter: JobsToolbarProps['statusFilter']
  onStatusFilterChange: JobsToolbarProps['onStatusFilterChange']
  searchFilterNormalized: JobsToolbarProps['searchFilterNormalized']
  onSearchFilterChange: JobsToolbarProps['onSearchFilterChange']
  typeFilterNormalized: JobsToolbarProps['typeFilterNormalized']
  onTypeFilterChange: JobsToolbarProps['onTypeFilterChange']
  typeFilterSuggestions: JobsToolbarProps['typeFilterSuggestions']
  errorCodeFilterNormalized: JobsToolbarProps['errorCodeFilterNormalized']
  onErrorCodeFilterChange: JobsToolbarProps['onErrorCodeFilterChange']
  errorCodeSuggestions: JobsToolbarProps['errorCodeSuggestions']
  filtersDirty: JobsToolbarProps['filtersDirty']
  onResetFilters: JobsToolbarProps['onResetFilters']
  jobsStatusSummary: JobsToolbarProps['jobsStatusSummary']
  columnOptions: JobsToolbarProps['columnOptions']
  mergedColumnVisibility: JobsToolbarProps['mergedColumnVisibility']
  onSetColumnVisible: JobsToolbarProps['onSetColumnVisible']
  columnsDirty: JobsToolbarProps['columnsDirty']
  onResetColumns: JobsToolbarProps['onResetColumns']
  onRefreshJobs: JobsToolbarProps['onRefreshJobs']
  jobsRefreshing: JobsToolbarProps['jobsRefreshing']
  jobsCount: JobsToolbarProps['jobsCount']
  jobsError: JobsTableSectionProps['jobsError']
  sortedJobs: JobsTableSectionProps['sortedJobs']
  columns: JobsTableSectionProps['columns']
  isCompact: JobsTableSectionProps['isCompact']
  tableScrollY: JobsTableSectionProps['tableScrollY']
  isLoading: JobsTableSectionProps['isLoading']
  getJobSummary: JobsTableSectionProps['getJobSummary']
  renderJobActions: JobsTableSectionProps['renderJobActions']
  sortState: JobsTableSectionProps['sortState']
  onSortChange: JobsTableSectionProps['onSortChange']
  theme: JobsTableSectionProps['theme']
  hasNextPage: JobsTableSectionProps['hasNextPage']
  onLoadMore: JobsTableSectionProps['onLoadMore']
  isFetchingNextPage: JobsTableSectionProps['isFetchingNextPage']
  onTableContainerRef: JobsTableSectionProps['onTableContainerRef']
}

export function buildJobsPagePresentationProps(args: Args) {
  const scopeKey = `${args.apiToken || '__no_server__'}:${args.profileId?.trim() || '__no_profile__'}`

  const toolbar: JobsToolbarProps = {
    scopeKey,
    isOffline: args.isOffline,
    eventsConnected: args.eventsConnected,
    eventsTransport: args.eventsTransport,
    eventsRetryCount: args.eventsRetryCount,
    eventsRetryThreshold: args.eventsRetryThreshold,
    onRetryRealtime: args.onRetryRealtime,
    statusFilter: args.statusFilter,
    onStatusFilterChange: args.onStatusFilterChange,
    searchFilterNormalized: args.searchFilterNormalized,
    onSearchFilterChange: args.onSearchFilterChange,
    typeFilterNormalized: args.typeFilterNormalized,
    onTypeFilterChange: args.onTypeFilterChange,
    typeFilterSuggestions: args.typeFilterSuggestions,
    errorCodeFilterNormalized: args.errorCodeFilterNormalized,
    onErrorCodeFilterChange: args.onErrorCodeFilterChange,
    errorCodeSuggestions: args.errorCodeSuggestions,
    filtersDirty: args.filtersDirty,
    onResetFilters: args.onResetFilters,
    jobsStatusSummary: args.jobsStatusSummary,
    columnOptions: args.columnOptions,
    mergedColumnVisibility: args.mergedColumnVisibility,
    onSetColumnVisible: args.onSetColumnVisible,
    columnsDirty: args.columnsDirty,
    onResetColumns: args.onResetColumns,
    onRefreshJobs: args.onRefreshJobs,
    jobsRefreshing: args.jobsRefreshing,
    jobsCount: args.jobsCount,
  }

  const table: JobsTableSectionProps = {
    jobsError: args.jobsError,
    sortedJobs: args.sortedJobs,
    columns: args.columns,
    isCompact: args.isCompact,
    tableScrollY: args.tableScrollY,
    isLoading: args.isLoading,
    isOffline: args.isOffline,
    filtersDirty: args.filtersDirty,
    onResetFilters: args.onResetFilters,
    eventsConnected: args.eventsConnected,
    onRetryRealtime: args.onRetryRealtime,
    getJobSummary: args.getJobSummary,
    renderJobActions: args.renderJobActions,
    sortState: args.sortState,
    onSortChange: args.onSortChange,
    theme: args.theme,
    hasNextPage: args.hasNextPage,
    onLoadMore: args.onLoadMore,
    isFetchingNextPage: args.isFetchingNextPage,
    onTableContainerRef: args.onTableContainerRef,
  }

  return {
    scopeKey,
    toolbar,
    table,
  }
}
