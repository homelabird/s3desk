import { Space } from 'antd'
import { Suspense } from 'react'

import type { APIClient } from '../../api/client'
import type { JobsOverlaysHostProps } from './JobsOverlaysHost'
import { JobsTableSection, type JobsTableSectionProps } from './JobsTableSection'
import { JobsToolbar, type JobsToolbarProps } from './JobsToolbar'
import { JobsOverlaysHost } from './jobsLazy'
import styles from '../JobsPage.module.css'

export type JobsPageShellProps = {
  api: APIClient
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

export function JobsPageShell(props: JobsPageShellProps) {
  return (
    <Space orientation="vertical" size="large" className={styles.pageStack}>
      <JobsToolbar {...props.presentation.toolbar} />

      <JobsTableSection {...props.presentation.table} />

      {props.hasOpenOverlay ? (
        <Suspense fallback={null}>
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
