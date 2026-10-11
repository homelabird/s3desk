package s3client

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/profileendpoint"
)

func TestObjectHelpersHonorProfileDNSCancellation(t *testing.T) {
	profile := models.ProfileSecrets{Provider: models.ProfileProviderS3Compatible, Endpoint: "https://storage.example.test"}
	operations := []struct {
		name string
		run  func(context.Context) error
	}{
		{"put", func(ctx context.Context) error {
			return PutEmptyObjectWithOptions(ctx, profile, "bucket", "folder/", ProfileOptions{})
		}},
		{"delete markers", func(ctx context.Context) error {
			return DeleteFolderMarkersWithOptions(ctx, profile, "bucket", []string{"folder/"}, ProfileOptions{})
		}},
		{"delete empty prefix", func(ctx context.Context) error {
			return DeletePrefixMarkerIfEmpty(ctx, profile, "bucket", "folder/", ProfileOptions{})
		}},
	}
	for _, operation := range operations {
		for _, stage := range []string{"cname", "ip"} {
			t.Run(operation.name+"/"+stage, func(t *testing.T) {
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				restore := profileendpoint.SetLookupHooksForTest(
					func(lookupCtx context.Context, _ string) (string, error) {
						if stage == "ip" {
							return "", errors.New("no cname")
						}
						cancel()
						if !errors.Is(lookupCtx.Err(), context.Canceled) {
							t.Error("CNAME lookup did not inherit object operation cancellation")
						}
						return "", lookupCtx.Err()
					},
					func(lookupCtx context.Context, _ string) ([]net.IPAddr, error) {
						if stage == "cname" {
							t.Error("IP lookup continued after CNAME cancellation")
							return nil, errors.New("unexpected lookup")
						}
						cancel()
						if !errors.Is(lookupCtx.Err(), context.Canceled) {
							t.Error("IP lookup did not inherit object operation cancellation")
						}
						return nil, lookupCtx.Err()
					},
				)
				t.Cleanup(restore)
				if err := operation.run(ctx); !errors.Is(err, context.Canceled) {
					t.Fatalf("error=%v, want context.Canceled", err)
				}
			})
		}
	}
}

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
