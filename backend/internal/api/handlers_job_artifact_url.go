package api

import (
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"s3desk/internal/downloadticket"
	"s3desk/internal/models"
)

// Link issuance remains authenticated and profile scoped. Browser downloads do
// not need the API token, and possession of a link grants only this one artifact.
func (s *server) handleGetJobArtifactURL(w http.ResponseWriter, r *http.Request) {
	request, err := s.prepareJobRequest(r.Context(), r)
	if err != nil {
		writeJobReadServiceFailure(w, err)
		return
	}
	_, _, _, file, err := buildJobArtifactReadResult(s.cfg.DataDir, request)
	if err != nil {
		writeJobReadServiceFailure(w, err)
		return
	}
	_ = file.Close()
	expires := time.Now().UTC().Add(downloadticket.Lifetime)
	ticket := downloadticket.Ticket{ProfileID: request.profileID, JobID: request.jobID, Expires: expires.Unix()}
	values := url.Values{}
	values.Set("profileId", ticket.ProfileID)
	values.Set("jobId", ticket.JobID)
	values.Set("expires", strconv.FormatInt(ticket.Expires, 10))
	values.Set("sig", downloadticket.Sign(s.proxySecret, ticket))
	target := url.URL{Scheme: requestScheme(r), Host: r.Host, Path: "/artifact-download-proxy"}
	if base := s.externalBaseURL(); base != nil {
		target = *base
		target.Path = strings.TrimSuffix(canonicalDownloadProxyBasePath(base.Path), "/download-proxy") + "/artifact-download-proxy"
		target.RawPath = ""
	}
	target.RawQuery = values.Encode()
	target.Fragment = ""
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	writeJSON(w, http.StatusOK, models.PresignedURLResponse{URL: target.String(), ExpiresAt: expires.Format(time.RFC3339)})
}

func (s *server) handleJobArtifactDownloadProxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	values, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		writeError(w, http.StatusForbidden, "invalid_download_ticket", "Invalid or expired download link", nil)
		return
	}
	for _, key := range []string{"profileId", "jobId", "expires", "sig"} {
		if len(values[key]) != 1 {
			writeError(w, http.StatusForbidden, "invalid_download_ticket", "Invalid or expired download link", nil)
			return
		}
	}
	expires, err := strconv.ParseInt(values.Get("expires"), 10, 64)
	ticket := downloadticket.Ticket{ProfileID: values.Get("profileId"), JobID: values.Get("jobId"), Expires: expires}
	if err != nil || !downloadticket.Verify(s.proxySecret, ticket, values.Get("sig"), time.Now()) {
		writeError(w, http.StatusForbidden, "invalid_download_ticket", "Invalid or expired download link", nil)
		return
	}
	release, ok := s.acquireDownloadSlot(w, r, ticket.ProfileID)
	if !ok {
		return
	}
	defer release()
	// Never accept a path from the link. Re-check the current job, ownership,
	// success status and server-controlled artifact path on every GET/HEAD.
	job, found, err := s.store.GetJob(r.Context(), ticket.ProfileID, ticket.JobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to load artifact", nil)
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "not_found", "Artifact not found", nil)
		return
	}
	filename, size, modified, file, err := buildJobArtifactReadResult(s.cfg.DataDir, jobRequest{profileID: ticket.ProfileID, jobID: ticket.JobID, job: job})
	if err != nil {
		writeJobReadServiceFailure(w, err)
		return
	}
	defer func() { _ = file.Close() }()
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	http.ServeContent(w, r, filename, modified, file)
}
