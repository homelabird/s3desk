package api

import (
	"errors"
	"io"
	"net/http"
)

type serverRestoreBundleOpenOptions struct {
	MaxBytes        int64
	TooLargeMessage string
	OnOpenError     func(http.ResponseWriter, error)
}

func openServerRestoreBundleRequest(
	w http.ResponseWriter,
	r *http.Request,
	options serverRestoreBundleOpenOptions,
) (multipartFile io.ReadCloser, bundlePassword string, cleanup func(), ok bool) {
	if options.MaxBytes > 0 {
		r.Body = http.MaxBytesReader(w, r.Body, options.MaxBytes)
	}
	file, password, fileCleanup, err := openServerRestoreBundle(r)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "bundle_too_large", options.TooLargeMessage, map[string]any{
				"maxBytes": options.MaxBytes,
			})
			return nil, "", nil, false
		}
		if options.OnOpenError != nil {
			options.OnOpenError(w, err)
			return nil, "", nil, false
		}
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
		return nil, "", nil, false
	}
	return file, password, fileCleanup, true
}

func writeServerRestorePreflightError(w http.ResponseWriter, code, message string, err serverRestorePreflightError) {
	writeError(w, http.StatusConflict, code, message, map[string]any{
		"error":          err.Error(),
		"path":           err.Path,
		"requiredBytes":  err.RequiredBytes,
		"availableBytes": err.AvailableBytes,
	})
}

func writeServerRestoreBundleOpenError(w http.ResponseWriter, err error) {
	var preflightErr serverRestorePreflightError
	if errors.As(err, &preflightErr) {
		writeServerRestorePreflightError(w, "restore_preflight_failed", "failed restore preflight before staging", preflightErr)
		return
	}
	writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), nil)
}
