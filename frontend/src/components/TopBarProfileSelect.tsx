import { useQuery } from '@tanstack/react-query'
import { Grid, Space, Typography } from 'antd'

import { APIClient } from '../api/client'
import type { Profile } from '../api/types'
import { NativeSelect } from './NativeSelect'

type Props = {
	apiToken: string
	profileId: string | null
	setProfileId: (profileId: string | null) => void
}

export function TopBarProfileSelect(props: Props) {
	const screens = Grid.useBreakpoint()
	const profilesQuery = useQuery({
		queryKey: ['profiles', props.apiToken],
		queryFn: async () => {
			const api = new APIClient({ apiToken: props.apiToken })
			return api.listProfiles()
		},
		retry: false,
	})

	const options = (profilesQuery.data ?? []).map((p: Profile) => ({ label: p.name, value: p.id }))
	const showLabel = !!screens.sm
	const selectWidth = screens.md ? 260 : screens.sm ? 200 : 160
	const isInitialLoad = profilesQuery.isFetching && !profilesQuery.data

	return (
		<Space>
			{showLabel ? <Typography.Text type="secondary">Profile</Typography.Text> : null}
			<NativeSelect
				value={props.profileId ?? ''}
				onChange={(value) => props.setProfileId(value || null)}
				placeholder={isInitialLoad ? 'Loading profiles…' : 'Select profile…'}
				disabled={isInitialLoad}
				options={options}
				ariaLabel="Profile"
				style={{ width: selectWidth, maxWidth: '100%' }}
			/>
		</Space>
	)
}
