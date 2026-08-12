package bucketops

import (
	"context"
	"io"
	"reflect"
	"strings"
	"testing"

	"s3desk/internal/models"
)

func TestServiceListFiltersEntriesAndUsesPathFallback(t *testing.T) {
	service := NewService(func(context.Context, models.ProfileSecrets, []string, string) (*Process, error) {
		return &Process{
			Stdout: io.NopCloser(strings.NewReader(`[
{"Name":"bucket-a","IsDir":true},
{"Path":"bucket-b","IsBucket":true},
{"Name":"object.txt","IsDir":false,"IsBucket":false}
]`)),
			Wait: func() error { return nil },
		}, nil
	}, nil)

	buckets, err := service.List(context.Background(), models.ProfileSecrets{})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	want := []models.Bucket{{Name: "bucket-a"}, {Name: "bucket-b"}}
	if !reflect.DeepEqual(buckets, want) {
		t.Fatalf("buckets=%+v, want %+v", buckets, want)
	}
}

func TestServiceBuildsProviderAwareBucketCommands(t *testing.T) {
	type call struct {
		profile models.ProfileSecrets
		args    []string
		hint    string
	}
	var calls []call
	service := NewService(nil, func(_ context.Context, profile models.ProfileSecrets, args []string, hint string) (string, string, error) {
		calls = append(calls, call{profile: profile, args: append([]string(nil), args...), hint: hint})
		return "", "", nil
	})

	s3Profile := models.ProfileSecrets{Provider: models.ProfileProviderS3Compatible, Region: "us-east-1"}
	if err := service.Create(context.Background(), s3Profile, "demo", "ap-northeast-2"); err != nil {
		t.Fatalf("S3 Create: %v", err)
	}
	gcsProfile := models.ProfileSecrets{Provider: models.ProfileProviderGcpGcs, Region: "us-east-1"}
	if err := service.Create(context.Background(), gcsProfile, "gcs-demo", "asia-northeast3"); err != nil {
		t.Fatalf("GCS Create: %v", err)
	}
	if err := service.Delete(context.Background(), s3Profile, "demo"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if got, want := len(calls), 3; got != want {
		t.Fatalf("calls=%d, want %d", got, want)
	}
	if !reflect.DeepEqual(calls[0].args, []string{"mkdir", "remote:demo"}) || calls[0].profile.Region != "ap-northeast-2" || calls[0].hint != "create-bucket" {
		t.Fatalf("S3 create call=%+v", calls[0])
	}
	if !reflect.DeepEqual(calls[1].args, []string{"mkdir", "--gcs-location", "asia-northeast3", "remote:gcs-demo"}) || calls[1].profile.Region != "us-east-1" {
		t.Fatalf("GCS create call=%+v", calls[1])
	}
	if !reflect.DeepEqual(calls[2].args, []string{"rmdir", "remote:demo"}) || calls[2].hint != "delete-bucket" {
		t.Fatalf("delete call=%+v", calls[2])
	}
}
