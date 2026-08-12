package api

import (
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	defaultRequestBodyIdleTimeout = 30 * time.Second
	// ponytail: fixed route policy; make configurable only when deployments need distinct idle windows.
	streamingUploadBodyIdleTimeout = 2 * time.Minute
)

func requestBodyIdleTimeout(next http.Handler) http.Handler {
	return requestBodyIdleTimeoutFor(next, defaultRequestBodyIdleTimeout, streamingUploadBodyIdleTimeout)
}

func requestBodyIdleTimeoutFor(next http.Handler, controlTimeout, uploadTimeout time.Duration) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body == nil || r.Body == http.NoBody {
			next.ServeHTTP(w, r)
			return
		}

		timeout := controlTimeout
		if isStreamingUploadPath(r.URL.Path) {
			timeout = uploadTimeout
		}
		controller := http.NewResponseController(w)
		_ = controller.SetReadDeadline(time.Now().Add(timeout))
		r.Body = &idleTimeoutRequestBody{body: r.Body, controller: controller, timeout: timeout}
		next.ServeHTTP(w, r)
	})
}

func isStreamingUploadPath(requestPath string) bool {
	return strings.HasPrefix(requestPath, "/api/v1/uploads/") && strings.HasSuffix(requestPath, "/files")
}

type idleTimeoutRequestBody struct {
	body       io.ReadCloser
	controller *http.ResponseController
	timeout    time.Duration
}

func (b *idleTimeoutRequestBody) Read(p []byte) (int, error) {
	_ = b.controller.SetReadDeadline(time.Now().Add(b.timeout))
	n, err := b.body.Read(p)
	if err != nil {
		_ = b.controller.SetReadDeadline(time.Time{})
	}
	return n, err
}

func (b *idleTimeoutRequestBody) Close() error {
	_ = b.controller.SetReadDeadline(time.Time{})
	return b.body.Close()
}
