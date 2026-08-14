import { Navigate } from "react-router";

export function renderProfileGate(args: {
  pathname: string;
  profileId: string | null;
}) {
  const { pathname, profileId } = args;
  if (profileId) {
    return null;
  }
  if (
    pathname.startsWith("/profiles") ||
    pathname.startsWith("/buckets") ||
    pathname.startsWith("/objects") ||
    pathname.startsWith("/jobs")
  ) {
    return null;
  }
  return <Navigate to="/profiles" replace />;
}
