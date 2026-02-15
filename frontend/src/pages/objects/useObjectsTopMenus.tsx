import { SnippetsOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useMemo } from 'react'

import type { UIAction } from './objectsActions'
import { actionToMenuItem, compactMenuItems } from './objectsActions'

type UseObjectsTopMenusArgs = {
	isAdvanced: boolean
	profileId: string | null
	bucket: string
	prefix: string
	dockTree: boolean
	globalActionMap: Map<string, UIAction>
	currentPrefixActionMap: Map<string, UIAction>
}

export function useObjectsTopMenus({
	isAdvanced,
	profileId,
	bucket,
	prefix,
	dockTree,
	globalActionMap,
	currentPrefixActionMap,
}: UseObjectsTopMenusArgs): { topMoreMenu: MenuProps } {
	const prefixMenuItems = useMemo(
		() =>
			compactMenuItems([
				actionToMenuItem(currentPrefixActionMap.get('copy'), undefined, isAdvanced),
				{ type: 'divider' as const },
				actionToMenuItem(currentPrefixActionMap.get('downloadZip'), undefined, isAdvanced),
				actionToMenuItem(currentPrefixActionMap.get('downloadToDevice'), undefined, isAdvanced),
				{ type: 'divider' as const },
				actionToMenuItem(currentPrefixActionMap.get('rename'), undefined, isAdvanced),
				actionToMenuItem(currentPrefixActionMap.get('copyJob'), undefined, isAdvanced),
				actionToMenuItem(currentPrefixActionMap.get('moveJob'), undefined, isAdvanced),
				{ type: 'divider' as const },
				actionToMenuItem(currentPrefixActionMap.get('delete'), undefined, isAdvanced),
				actionToMenuItem(currentPrefixActionMap.get('deleteDry'), undefined, isAdvanced),
			]),
		[currentPrefixActionMap, isAdvanced],
	)

	const topMoreMenuItems = useMemo(
		() =>
			compactMenuItems([
				actionToMenuItem(globalActionMap.get('nav_back'), undefined, isAdvanced),
				actionToMenuItem(globalActionMap.get('nav_forward'), undefined, isAdvanced),
				actionToMenuItem(globalActionMap.get('nav_up'), undefined, isAdvanced),
				{ type: 'divider' as const },
				actionToMenuItem(globalActionMap.get('toggle_details'), undefined, isAdvanced),
				...(dockTree ? [] : [actionToMenuItem(globalActionMap.get('open_folders'), undefined, isAdvanced)]),
				{ type: 'divider' as const },
				actionToMenuItem(globalActionMap.get('refresh'), undefined, isAdvanced),
				actionToMenuItem(globalActionMap.get('go_to_path'), undefined, isAdvanced),
				...(isAdvanced
					? [
							actionToMenuItem(globalActionMap.get('upload_files'), undefined, isAdvanced),
							actionToMenuItem(globalActionMap.get('upload_folder'), undefined, isAdvanced),
							actionToMenuItem(globalActionMap.get('new_folder'), undefined, isAdvanced),
						]
					: []),
				{ type: 'divider' as const },
				actionToMenuItem(globalActionMap.get('commands'), undefined, isAdvanced),
				{ type: 'divider' as const },
				actionToMenuItem(globalActionMap.get('transfers'), undefined, isAdvanced),
				...(bucket && prefix.trim() && !isAdvanced
					? [
							{ type: 'divider' as const },
							actionToMenuItem(currentPrefixActionMap.get('downloadZip'), undefined, isAdvanced),
							actionToMenuItem(currentPrefixActionMap.get('delete'), undefined, isAdvanced),
						]
					: []),
				...(isAdvanced
					? [
							{ type: 'divider' as const },
							actionToMenuItem(globalActionMap.get('new_tab'), undefined, isAdvanced),
							actionToMenuItem(globalActionMap.get('global_search'), undefined, isAdvanced),
							...(prefixMenuItems.length > 0
								? [
										{
											key: 'prefix_actions',
											label: 'Folder actions',
											icon: <SnippetsOutlined />,
											disabled: !profileId || !bucket || !prefix.trim(),
											children: prefixMenuItems,
										},
									]
								: []),
						]
					: []),
				{ type: 'divider' as const },
				actionToMenuItem(globalActionMap.get('ui_mode'), undefined, isAdvanced),
			]),
		[bucket, currentPrefixActionMap, dockTree, globalActionMap, isAdvanced, prefix, prefixMenuItems, profileId],
	)

	const topMoreMenu = useMemo<MenuProps>(
		() => ({
			items: topMoreMenuItems,
			onClick: ({ key }) => {
				const action = globalActionMap.get(String(key)) ?? currentPrefixActionMap.get(String(key))
				if (!action || !action.enabled) return
				action.run()
			},
		}),
		[currentPrefixActionMap, globalActionMap, topMoreMenuItems],
	)

	return { topMoreMenu }
}
