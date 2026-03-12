package api

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type failingRealtimeTicketReader struct{}

func (failingRealtimeTicketReader) Read(_ []byte) (int, error) {
	return 0, errors.New("entropy unavailable")
}

func TestCreateRealtimeTicketReturnsStructuredErrorWhenRandomSourceFails(t *testing.T) {
	st, srv := newTestServer(t, testEncryptionKey())
	_ = st

	previousReader := realtimeTicketRandReader
	realtimeTicketRandReader = failingRealtimeTicketReader{}
	t.Cleanup(func() {
		realtimeTicketRandReader = previousReader
	})

	res := doJSONRequest(t, srv, http.MethodPost, "/api/v1/realtime-ticket?transport=ws", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected status 500, got %d: %s", res.StatusCode, string(body))
	}

	body, _ := io.ReadAll(res.Body)
	if !strings.Contains(string(body), "failed to create realtime ticket") {
		t.Fatalf("expected structured realtime ticket failure, got %s", string(body))
	}
}
