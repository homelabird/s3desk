package api

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
)

type profileConnectivityKind string

const (
	profileConnectivityTest      profileConnectivityKind = "test"
	profileConnectivityBenchmark profileConnectivityKind = "benchmark"
)

type profileConnectivityPreparationError struct {
	status  int
	code    string
	message string
	details map[string]any
}

type profileConnectivityHTTPService struct {
	server *server
}

func (e *profileConnectivityPreparationError) Error() string {
	return e.message
}

func newProfileConnectivityPreparationError(status int, code, message string, details map[string]any) *profileConnectivityPreparationError {
	return &profileConnectivityPreparationError{
		status:  status,
		code:    code,
		message: message,
		details: details,
	}
}

func newProfileConnectivityHTTPService(s *server) profileConnectivityHTTPService {
	return profileConnectivityHTTPService{server: s}
}

func profileConnectivityFailedSpec(kind profileConnectivityKind) (failedCode, failedMessage, missingEngineMessage string) {
	switch kind {
	case profileConnectivityBenchmark:
		return "benchmark_failed", "benchmark failed", "rclone is required to run benchmarks (install it or set RCLONE_PATH)"
	default:
		return "test_failed", "profile test failed", "rclone is required to test connectivity (install it or set RCLONE_PATH)"
	}
}

func (svc profileConnectivityHTTPService) prepareProfileConnectivity(kind profileConnectivityKind, r *http.Request) (string, error) {
	profileID := chi.URLParam(r, "profileId")
	if profileID == "" {
		return "", newProfileConnectivityPreparationError(
			http.StatusBadRequest,
			"invalid_request",
			"profileId is required",
			nil,
		)
	}
	return profileID, nil
}

func (svc profileConnectivityHTTPService) executeTest(r *http.Request, profileID string) (*models.ProfileTestResponse, error) {
	ok, details, err := svc.server.jobs.TestConnectivity(r.Context(), profileID)
	if err != nil {
		return nil, err
	}

	resp := models.ProfileTestResponse{
		OK:      ok,
		Details: details,
	}
	if ok {
		resp.Message = "ok"
	} else {
		resp.Message = "failed"
	}
	return &resp, nil
}

func (svc profileConnectivityHTTPService) executeBenchmark(r *http.Request, profileID string) (*models.ProfileBenchmarkResponse, error) {
	resp, err := svc.server.jobs.BenchmarkConnectivity(r.Context(), profileID)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (svc profileConnectivityHTTPService) prepareTestProfile(r *http.Request) (string, error) {
	return svc.prepareProfileConnectivity(profileConnectivityTest, r)
}

func (svc profileConnectivityHTTPService) prepareBenchmarkProfile(r *http.Request) (string, error) {
	return svc.prepareProfileConnectivity(profileConnectivityBenchmark, r)
}

func (svc profileConnectivityHTTPService) handleTestProfile(w http.ResponseWriter, r *http.Request) {
	profileID, err := svc.prepareTestProfile(r)
	if err == nil {
		var resp *models.ProfileTestResponse
		resp, err = svc.executeTest(r, profileID)
		if err == nil {
			writeJSON(w, http.StatusOK, resp)
			return
		}
	}
	if prepErr := (*profileConnectivityPreparationError)(nil); errors.As(err, &prepErr) {
		respErr := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
		writeJSON(w, prepErr.status, respErr)
		return
	}
	if errors.Is(err, jobs.ErrProfileNotFound) {
		respErr := buildAPIErrorResponse("not_found", "profile not found", map[string]any{"profileId": profileID})
		writeJSON(w, http.StatusNotFound, respErr)
		return
	}
	failedCode, failedMessage, missingEngineMessage := profileConnectivityFailedSpec(profileConnectivityTest)
	if errors.Is(err, jobs.ErrRcloneNotFound) {
		respErr := buildAPIErrorResponse("transfer_engine_missing", missingEngineMessage, nil)
		writeJSON(w, http.StatusBadRequest, respErr)
		return
	}
	if inc := (*jobs.RcloneIncompatibleError)(nil); errors.As(err, &inc) {
		respErr := buildAPIErrorResponse(
			"transfer_engine_incompatible",
			"rclone version is incompatible",
			map[string]any{"currentVersion": inc.CurrentVersion, "minVersion": inc.MinVersion},
		)
		writeJSON(w, http.StatusBadRequest, respErr)
		return
	}
	respErr := buildAPIErrorResponse(
		failedCode,
		failedMessage,
		map[string]any{"error": err.Error()},
	)
	writeJSON(w, http.StatusBadRequest, respErr)
}

func (svc profileConnectivityHTTPService) handleBenchmarkProfile(w http.ResponseWriter, r *http.Request) {
	profileID, err := svc.prepareBenchmarkProfile(r)
	if err == nil {
		var resp *models.ProfileBenchmarkResponse
		resp, err = svc.executeBenchmark(r, profileID)
		if err == nil {
			writeJSON(w, http.StatusOK, resp)
			return
		}
	}
	if prepErr := (*profileConnectivityPreparationError)(nil); errors.As(err, &prepErr) {
		respErr := buildAPIErrorResponse(prepErr.code, prepErr.message, prepErr.details)
		writeJSON(w, prepErr.status, respErr)
		return
	}
	if errors.Is(err, jobs.ErrProfileNotFound) {
		respErr := buildAPIErrorResponse("not_found", "profile not found", map[string]any{"profileId": profileID})
		writeJSON(w, http.StatusNotFound, respErr)
		return
	}
	failedCode, failedMessage, missingEngineMessage := profileConnectivityFailedSpec(profileConnectivityBenchmark)
	if errors.Is(err, jobs.ErrRcloneNotFound) {
		respErr := buildAPIErrorResponse("transfer_engine_missing", missingEngineMessage, nil)
		writeJSON(w, http.StatusBadRequest, respErr)
		return
	}
	if inc := (*jobs.RcloneIncompatibleError)(nil); errors.As(err, &inc) {
		respErr := buildAPIErrorResponse(
			"transfer_engine_incompatible",
			"rclone version is incompatible",
			map[string]any{"currentVersion": inc.CurrentVersion, "minVersion": inc.MinVersion},
		)
		writeJSON(w, http.StatusBadRequest, respErr)
		return
	}
	respErr := buildAPIErrorResponse(
		failedCode,
		failedMessage,
		map[string]any{"error": err.Error()},
	)
	writeJSON(w, http.StatusBadRequest, respErr)
}
