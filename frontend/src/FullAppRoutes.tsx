import { Navigate, Route, Routes, useLocation } from 'react-router'
import { Suspense, lazy, useEffect, useMemo, useRef, type ReactNode } from 'react'


const loadProfilesPage = async () => {
	const m = await import('./pages/ProfilesPage')
	return { default: m.ProfilesPage }
}

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

const ProfilesPage = lazy(loadProfilesPage)
const BucketsPage = lazy(loadBucketsPage)
const ObjectsPage = lazy(loadObjectsPage)
const UploadsPage = lazy(loadUploadsPage)
const JobsPage = lazy(loadJobsPage)

const initialPageLoader = {
	'/profiles': loadProfilesPage,
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
	loadingFallback: ReactNode
}

export function FullAppRoutes({
	apiToken,
	profileId,
	setProfileId,
	shellScopeKey,
	loadingFallback,
}: FullAppRoutesProps) {
	const location = useLocation()
	const jobRequest = useMemo(() => {
		const state = location.state as { jobId?: unknown; profileId?: unknown } | null
		if (location.pathname !== '/jobs' || typeof state?.jobId !== 'string' || !state.jobId.trim() ||
			typeof state.profileId !== 'string' || !state.profileId.trim()) return null
		return { jobId: state.jobId, profileId: state.profileId }
	}, [location.pathname, location.state])
	const handledJobNavigation = useRef<string | null>(null)
	useEffect(() => {
		if (!jobRequest || handledJobNavigation.current === location.key) return
		handledJobNavigation.current = location.key
		if (jobRequest.profileId !== profileId) setProfileId(jobRequest.profileId)
	}, [jobRequest, location.key, profileId, setProfileId])

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
							key={`jobs:${apiToken || 'none'}:${profileId ?? 'none'}`}
							apiToken={apiToken}
							profileId={profileId}
							initialJobId={jobRequest?.profileId === profileId ? jobRequest.jobId : undefined}
							jobRequestKey={location.key}
						/>
					}
				/>
				<Route path="/settings" element={<Navigate to="/profiles?settings=1" replace />} />
				<Route path="*" element={<Navigate to="/profiles" replace />} />
			</Routes>
		</Suspense>
	)
}
