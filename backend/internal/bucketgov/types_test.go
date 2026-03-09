package bucketgov

import (
	"testing"

	"s3desk/internal/models"
)

func TestNewViewInitializesCapabilities(t *testing.T) {
	t.Parallel()

	view := NewView(models.ProfileProviderAwsS3, " demo ")
	if view.Provider != models.ProfileProviderAwsS3 {
		t.Fatalf("provider=%q, want %q", view.Provider, models.ProfileProviderAwsS3)
	}
	if view.Bucket != "demo" {
		t.Fatalf("bucket=%q, want demo", view.Bucket)
	}
	if view.Capabilities == nil {
		t.Fatal("capabilities=nil, want initialized map")
	}
}

func TestSetCapabilityTracksEnabledAndDisabledState(t *testing.T) {
	t.Parallel()

	view := NewView(models.ProfileProviderAwsS3, "demo")
	SetCapability(&view, models.BucketGovernanceCapabilityPublicAccessBlock, true, "ignored")
	SetCapability(&view, models.BucketGovernanceCapabilityLifecycle, false, " not supported ")

	if got := view.Capabilities[models.BucketGovernanceCapabilityPublicAccessBlock]; !got.Enabled {
		t.Fatalf("public access block=%+v, want enabled", got)
	}
	got := view.Capabilities[models.BucketGovernanceCapabilityLifecycle]
	if got.Enabled {
		t.Fatalf("lifecycle=%+v, want disabled", got)
	}
	if got.Reason != "not supported" {
		t.Fatalf("reason=%q, want %q", got.Reason, "not supported")
	}
}
