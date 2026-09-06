import { useQueryClient } from '@tanstack/react-query'
import { Grid, theme } from 'antd'
import { useLocation } from 'react-router'

import { useAPIClient } from '../../api/useAPIClient'
import { useTransfersCommands } from '../../components/useTransfers'
import { useIsOffline } from '../../lib/useIsOffline'
import { useJobsPageControllerState } from './useJobsPageControllerState'

type Props = {
  apiToken: string
  profileId: string | null
  initialJobId?: string
  jobRequestKey?: string
}

export function useJobsPageController(props: Props) {
  const api = useAPIClient()
  const queryClient = useQueryClient()
  const transfers = useTransfersCommands()
  const location = useLocation()
  const screens = Grid.useBreakpoint()
  const { token } = theme.useToken()
  const isOffline = useIsOffline()

  return useJobsPageControllerState({
    api,
    apiToken: props.apiToken,
    isOffline,
    locationState: location.state,
    initialJobId: props.initialJobId,
    jobRequestKey: props.jobRequestKey,
    profileId: props.profileId,
    queryClient,
    screens,
    themeToken: token,
    transfers,
  })
}
