package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"s3desk/internal/jobs"
	"s3desk/internal/models"
)

func TestHandleTestProfileReturnsSuccessDetails(t *testing.T) {
	lockTestEnv(t)
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		if len(args) >= 2 && args[0] == "lsjson" && args[len(args)-1] == "remote:" {
			return `[{"Name":"bucket-a","IsDir":true}]`, "", nil
		}
		return "", "", errors.New("unexpected rclone args: " + joinArgs(args))
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles/"+profile.ID+"/test", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var resp models.ProfileTestResponse
	decodeJSONResponse(t, res, &resp)
	if !resp.OK || resp.Message != "ok" {
		t.Fatalf("response=%+v, want ok test result", resp)
	}
	if got := resp.Details["provider"]; got != string(models.ProfileProviderS3Compatible) {
		t.Fatalf("provider=%v, want %q", got, models.ProfileProviderS3Compatible)
	}
	if got, ok := resp.Details["buckets"].(float64); !ok || got != 1 {
		t.Fatalf("buckets=%v, want 1", resp.Details["buckets"])
	}
	if _, ok := resp.Details["error"]; ok {
		t.Fatalf("details.error=%v, want omitted on success", resp.Details["error"])
	}
	if _, ok := resp.Details["normalizedError"]; ok {
		t.Fatalf("details.normalizedError=%v, want omitted on success", resp.Details["normalizedError"])
	}
}

func TestHandleTestProfileReturnsNormalizedFailureDetails(t *testing.T) {
	lockTestEnv(t)
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		if len(args) >= 1 && args[0] == "lsjson" {
			return "", "AccessDenied", errors.New("exit status 9")
		}
		return "", "", errors.New("unexpected rclone args: " + joinArgs(args))
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles/"+profile.ID+"/test", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var resp models.ProfileTestResponse
	decodeJSONResponse(t, res, &resp)
	if resp.OK || resp.Message != "failed" {
		t.Fatalf("response=%+v, want failed test result", resp)
	}
	if got := resp.Details["provider"]; got != string(models.ProfileProviderS3Compatible) {
		t.Fatalf("provider=%v, want %q", got, models.ProfileProviderS3Compatible)
	}
	if got := resp.Details["error"]; got != "AccessDenied" {
		t.Fatalf("details.error=%v, want AccessDenied", got)
	}
	norm, ok := resp.Details["normalizedError"].(map[string]any)
	if !ok {
		t.Fatalf("details=%+v, want normalizedError map", resp.Details)
	}
	if got := norm["code"]; got != string(models.NormalizedErrorAccessDenied) {
		t.Fatalf("normalizedError.code=%v, want %q", got, models.NormalizedErrorAccessDenied)
	}
	if got, ok := norm["retryable"].(bool); !ok || got {
		t.Fatalf("normalizedError.retryable=%v, want false", norm["retryable"])
	}
}

func TestHandleBenchmarkProfileReturnsSuccessDetails(t *testing.T) {
	lockTestEnv(t)
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		if len(args) == 0 {
			return "", "", errors.New("unexpected rclone args")
		}
		switch args[0] {
		case "lsjson":
			if args[len(args)-1] == "remote:" {
				return `[{"Name":"bucket-a","IsDir":true}]`, "", nil
			}
		case "cat":
			return "benchmark-bytes", "", nil
		case "copyto", "deletefile":
			return "", "", nil
		}
		return "", "", errors.New("unexpected rclone args: " + joinArgs(args))
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles/"+profile.ID+"/benchmark", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var resp models.ProfileBenchmarkResponse
	decodeJSONResponse(t, res, &resp)
	if !resp.OK || resp.Message != "ok" || !resp.CleanedUp {
		t.Fatalf("response=%+v, want successful benchmark", resp)
	}
	if got := resp.Details["provider"]; got != string(models.ProfileProviderS3Compatible) {
		t.Fatalf("provider=%v, want %q", got, models.ProfileProviderS3Compatible)
	}
	if resp.FileSizeBytes == nil || *resp.FileSizeBytes != 1<<20 {
		t.Fatalf("fileSizeBytes=%v, want %d", resp.FileSizeBytes, 1<<20)
	}
	if _, ok := resp.Details["error"]; ok {
		t.Fatalf("details.error=%v, want omitted on success", resp.Details["error"])
	}
	if _, ok := resp.Details["normalizedError"]; ok {
		t.Fatalf("details.normalizedError=%v, want omitted on success", resp.Details["normalizedError"])
	}
}

func TestHandleBenchmarkProfileReturnsNormalizedFailureDetails(t *testing.T) {
	lockTestEnv(t)
	installAPIRcloneCaptureHook(t, func(args []string) (string, string, error) {
		if len(args) >= 1 && args[0] == "lsjson" {
			return "", "AccessDenied", errors.New("exit status 9")
		}
		return "", "", errors.New("unexpected rclone args: " + joinArgs(args))
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles/"+profile.ID+"/benchmark", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusOK)
	}

	var resp models.ProfileBenchmarkResponse
	decodeJSONResponse(t, res, &resp)
	if resp.OK || resp.CleanedUp {
		t.Fatalf("response=%+v, want failed benchmark without cleanup", resp)
	}
	if !strings.Contains(resp.Message, "failed to list buckets: AccessDenied") {
		t.Fatalf("message=%q, want bucket list failure", resp.Message)
	}
	if got := resp.Details["provider"]; got != string(models.ProfileProviderS3Compatible) {
		t.Fatalf("provider=%v, want %q", got, models.ProfileProviderS3Compatible)
	}
	if got := resp.Details["error"]; got != "AccessDenied" {
		t.Fatalf("details.error=%v, want AccessDenied", got)
	}
	norm, ok := resp.Details["normalizedError"].(map[string]any)
	if !ok {
		t.Fatalf("details=%+v, want normalizedError map", resp.Details)
	}
	if got := norm["code"]; got != string(models.NormalizedErrorAccessDenied) {
		t.Fatalf("normalizedError.code=%v, want %q", got, models.NormalizedErrorAccessDenied)
	}
	if got, ok := norm["retryable"].(bool); !ok || got {
		t.Fatalf("normalizedError.retryable=%v, want false", norm["retryable"])
	}
}

func TestHandleProfileConnectivityRoutesNotFound(t *testing.T) {
	for _, suffix := range []string{"test", "benchmark"} {
		t.Run(suffix, func(t *testing.T) {
			st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
			_ = st

			res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles/missing-profile/"+suffix, nil)
			defer res.Body.Close()
			if res.StatusCode != http.StatusNotFound {
				t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusNotFound)
			}

			var errResp models.ErrorResponse
			decodeJSONResponse(t, res, &errResp)
			if errResp.Error.Code != "not_found" {
				t.Fatalf("code=%q, want not_found", errResp.Error.Code)
			}
			if got := errResp.Error.Details["profileId"]; got != "missing-profile" {
				t.Fatalf("details.profileId=%v, want missing-profile", got)
			}
		})
	}
}

func TestHandleProfileConnectivityRoutesTransferEngineMissing(t *testing.T) {
	lockTestEnv(t)
	installJobsEnsureRcloneHook(t, func(context.Context) (string, string, error) {
		return "", "", jobs.ErrRcloneNotFound
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	for _, tc := range []struct {
		name    string
		suffix  string
		wantMsg string
	}{
		{name: "test", suffix: "test", wantMsg: "rclone is required to test connectivity (install it or set RCLONE_PATH)"},
		{name: "benchmark", suffix: "benchmark", wantMsg: "rclone is required to run benchmarks (install it or set RCLONE_PATH)"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles/"+profile.ID+"/"+tc.suffix, nil)
			defer res.Body.Close()
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
			}

			var errResp models.ErrorResponse
			decodeJSONResponse(t, res, &errResp)
			if errResp.Error.Code != "transfer_engine_missing" {
				t.Fatalf("code=%q, want transfer_engine_missing", errResp.Error.Code)
			}
			if errResp.Error.Message != tc.wantMsg {
				t.Fatalf("message=%q, want %q", errResp.Error.Message, tc.wantMsg)
			}
		})
	}
}

func TestHandleProfileConnectivityRoutesTransferEngineIncompatible(t *testing.T) {
	lockTestEnv(t)
	installJobsEnsureRcloneHook(t, func(context.Context) (string, string, error) {
		return "rclone", "rclone v1.51.0", &jobs.RcloneIncompatibleError{
			CurrentVersion: "rclone v1.51.0",
			MinVersion:     jobs.MinSupportedRcloneVersion,
			Reason:         "version too old",
		}
	})

	st, _, srv, _ := newTestJobsServer(t, testEncryptionKey(), false)
	profile := createTestProfile(t, st)

	for _, suffix := range []string{"test", "benchmark"} {
		t.Run(suffix, func(t *testing.T) {
			res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/profiles/"+profile.ID+"/"+suffix, nil)
			defer res.Body.Close()
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("status=%d, want %d", res.StatusCode, http.StatusBadRequest)
			}

			var errResp models.ErrorResponse
			decodeJSONResponse(t, res, &errResp)
			if errResp.Error.Code != "transfer_engine_incompatible" {
				t.Fatalf("code=%q, want transfer_engine_incompatible", errResp.Error.Code)
			}
			if errResp.Error.Message != "rclone version is incompatible" {
				t.Fatalf("message=%q, want %q", errResp.Error.Message, "rclone version is incompatible")
			}
			if got := errResp.Error.Details["currentVersion"]; got != "rclone v1.51.0" {
				t.Fatalf("details.currentVersion=%v, want rclone v1.51.0", got)
			}
			if got := errResp.Error.Details["minVersion"]; got != "1.52.0" {
				t.Fatalf("details.minVersion=%v, want 1.52.0", got)
			}
		})
	}
}
