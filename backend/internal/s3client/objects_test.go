package s3client

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"s3desk/internal/models"
)

func TestObjectHelpersUseGuardedProfileClient(t *testing.T) {
	var requests []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		if r.Method == http.MethodPut && len(body) != 0 {
			t.Fatalf("put body length=%d, want 0", len(body))
		}
		requests = append(requests, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	profile := models.ProfileSecrets{
		Provider:        models.ProfileProviderS3Compatible,
		Endpoint:        srv.URL,
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
		ForcePathStyle:  true,
	}
	ctx := context.Background()
	if err := PutEmptyObjectWithOptions(ctx, profile, "bucket", "folder/", ProfileOptions{}); err != nil {
		t.Fatalf("PutEmptyObjectWithOptions: %v", err)
	}
	if err := DeleteFolderMarkersWithOptions(ctx, profile, "bucket", []string{"file.txt", "folder/"}, ProfileOptions{}); err != nil {
		t.Fatalf("DeleteFolderMarkersWithOptions: %v", err)
	}

	want := []string{"PUT /bucket/folder/", "DELETE /bucket/folder/"}
	if !reflect.DeepEqual(requests, want) {
		t.Fatalf("requests=%v, want %v", requests, want)
	}
}
