import { useQueryClient } from '@tanstack/react-query'
import { Grid } from 'antd'
import { useNavigate } from 'react-router-dom'

import { useAPIClient } from '../../api/useAPIClient'
import { useBucketsPageControllerState } from './useBucketsPageControllerState'

type UseBucketsPageStateArgs = {
	apiToken: string
	profileId: string | null
}

export function useBucketsPageState({ apiToken, profileId }: UseBucketsPageStateArgs) {
	const api = useAPIClient()
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const screens = Grid.useBreakpoint()

	return useBucketsPageControllerState({
		api,
		apiToken,
		profileId,
		queryClient,
		navigate,
		useCompactList: !screens.lg,
	})
}

export type BucketsPageState = ReturnType<typeof useBucketsPageState>
