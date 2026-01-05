import { useQuery } from '@tanstack/react-query'
import { Grid, Select, Space, Typography } from 'antd'

import { APIClient } from '../api/client'
import type { Profile } from '../api/types'

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

	return (
		<Space>
			{showLabel ? <Typography.Text type="secondary">Profile</Typography.Text> : null}
			<Select
				showSearch
				allowClear
				placeholder="Select profile"
				style={{ width: selectWidth, maxWidth: '100%' }}
				aria-label="Profile"
				value={props.profileId ?? undefined}
				options={options}
				loading={profilesQuery.isFetching}
				onChange={(value) => props.setProfileId(value ?? null)}
				optionFilterProp="label"
			/>
		</Space>
	)
}
