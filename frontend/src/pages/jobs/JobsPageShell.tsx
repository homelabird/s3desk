import { Grid, Space, Spin, Typography } from 'antd'
import { Suspense } from 'react'

import type { APIClientShape } from '../../api/client'
import { OverlaySheet } from '../../components/OverlaySheet'
import type { JobsOverlaysHostProps } from './JobsOverlaysHost'
import { JobsTableSection, type JobsTableSectionProps } from './JobsTableSection'
import { JobsToolbar, type JobsToolbarProps } from './JobsToolbar'
import { JobsOverlaysHost } from './jobsLazy'
import styles from '../JobsPage.module.css'

export type JobsPageShellProps = {
  api: APIClientShape
  apiToken: string
  profileId: string
  isOffline: boolean
  hasOpenOverlay: boolean
  overlaysHost: Omit<JobsOverlaysHostProps, 'api' | 'apiToken' | 'profileId' | 'isOffline'>
  presentation: {
    toolbar: JobsToolbarProps
    table: JobsTableSectionProps
  }
}

function JobsOverlaysFallback({ overlaysHost }: Pick<JobsPageShellProps, 'overlaysHost'>) {
  const screens = Grid.useBreakpoint()
  const deleteActive = overlaysHost.logsState.logRequestJobId === null && !overlaysHost.detailsState.detailsOpen
  const activeOverlay = overlaysHost.logsState.logRequestJobId !== null
    ? { title: 'Job Logs', onClose: overlaysHost.logsState.onCloseLogs }
    : overlaysHost.detailsState.detailsOpen
      ? { title: 'Job Details', onClose: overlaysHost.detailsState.onCloseDetails }
      : { title: 'Create delete job (S3)', onClose: overlaysHost.createFlow.onCloseDelete }
  const loadingLabel = `Loading ${activeOverlay.title.toLowerCase()}`

  return (
    <OverlaySheet
      open
      onClose={activeOverlay.onClose}
      title={activeOverlay.title}
      placement={deleteActive && !screens.md ? 'bottom' : 'right'}
      width={deleteActive ? (screens.md ? 520 : undefined) : overlaysHost.layout.drawerWidth}
      height={deleteActive && !screens.md ? 'calc(100dvh - env(safe-area-inset-top))' : undefined}
    >
      <Space role="status" aria-live="polite" aria-label={loadingLabel}>
        <Spin size="small" />
        <Typography.Text type="secondary">{loadingLabel}…</Typography.Text>
      </Space>
    </OverlaySheet>
  )
}

export function JobsPageShell(props: JobsPageShellProps) {
  return (
    <Space orientation="vertical" size="large" className={styles.pageStack}>
      <JobsToolbar {...props.presentation.toolbar} />

      <JobsTableSection {...props.presentation.table} />

      {props.hasOpenOverlay ? (
        <Suspense fallback={<JobsOverlaysFallback overlaysHost={props.overlaysHost} />}>
          <JobsOverlaysHost
            api={props.api}
            apiToken={props.apiToken}
            profileId={props.profileId}
            isOffline={props.isOffline}
            {...props.overlaysHost}
          />
        </Suspense>
      ) : null}
    </Space>
  )
}
