import { Navigate, Route, Routes } from 'react-router'
import { Suspense, lazy, type ReactNode } from 'react'

import { ProfilesPage } from './pages/ProfilesPage'

const loadBucketsPage = async () => {
	const m = await import('./pages/BucketsPage')
	return { default: m.BucketsPage }
}

const loadObjectsPage = async () => {
	const m = await import('./pages/ObjectsPage')
	return { default: m.ObjectsPage }
}

const loadUploadsPage = async () => {
	const m = await import('./pages/UploadsPage')
	return { default: m.UploadsPage }
}

const loadJobsPage = async () => {
	const m = await import('./pages/JobsPage')
	return { default: m.JobsPage }
}

const BucketsPage = lazy(loadBucketsPage)
const ObjectsPage = lazy(loadObjectsPage)
const UploadsPage = lazy(loadUploadsPage)
const JobsPage = lazy(loadJobsPage)

const initialPageLoader = {
	'/buckets': loadBucketsPage,
	'/objects': loadObjectsPage,
	'/uploads': loadUploadsPage,
	'/jobs': loadJobsPage,
}[window.location.pathname]

void initialPageLoader?.()

export type FullAppRoutesProps = {
	apiToken: string
	profileId: string | null
	setProfileId: (profileId: string | null) => void
	shellScopeKey: string
	routeLocationKey: string
	loadingFallback: ReactNode
}

export function FullAppRoutes({
	apiToken,
	profileId,
	setProfileId,
	shellScopeKey,
	routeLocationKey,
	loadingFallback,
}: FullAppRoutesProps) {
	return (
		<Suspense fallback={loadingFallback}>
			<Routes>
				<Route
					path="/"
					element={<Navigate to={profileId ? '/objects' : '/profiles'} replace />}
				/>
				<Route
					path="/profiles"
					element={
						<ProfilesPage
							key={`profiles:${apiToken || 'none'}`}
							apiToken={apiToken}
							profileId={profileId}
							setProfileId={setProfileId}
						/>
					}
				/>
				<Route
					path="/buckets"
					element={<BucketsPage key={`buckets:${shellScopeKey}`} apiToken={apiToken} profileId={profileId} />}
				/>
				<Route
					path="/objects"
					element={<ObjectsPage key={`objects:${shellScopeKey}`} apiToken={apiToken} profileId={profileId} />}
				/>
				<Route
					path="/uploads"
					element={<UploadsPage key={`uploads:${shellScopeKey}`} apiToken={apiToken} profileId={profileId} />}
				/>
				<Route
					path="/jobs"
					element={
						<JobsPage
							key={`jobs:${apiToken || 'none'}:${profileId ?? 'none'}:${routeLocationKey}`}
							apiToken={apiToken}
							profileId={profileId}
						/>
					}
				/>
				<Route path="/settings" element={<Navigate to="/profiles?settings=1" replace />} />
				<Route path="*" element={<Navigate to="/profiles" replace />} />
			</Routes>
		</Suspense>
	)
}
