package jobs

import (
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/profiletls"
)

func TestPrepareRcloneTLSFlagsAllowsSkipVerifyOutsideProduction(t *testing.T) {
	t.Setenv("LOG_ENV", "local")
	t.Setenv(profiletls.TLSSkipVerifyApprovalEnv, "")

	flags, cleanup, err := PrepareRcloneTLSFlags(models.ProfileSecrets{
		ID:                    "profile-local",
		Provider:              models.ProfileProviderS3Compatible,
		TLSInsecureSkipVerify: true,
	})
	defer cleanup()

	if err != nil {
		t.Fatalf("PrepareRcloneTLSFlags err=%v", err)
	}
	if !containsString(flags, "--no-check-certificate") {
		t.Fatalf("flags=%v, want --no-check-certificate", flags)
	}
}

func TestPrepareRcloneTLSFlagsRejectsSkipVerifyInProductionWithoutApproval(t *testing.T) {
	t.Setenv("LOG_ENV", "production")
	t.Setenv(profiletls.TLSSkipVerifyApprovalEnv, "")

	flags, cleanup, err := PrepareRcloneTLSFlags(models.ProfileSecrets{
		ID:                    "profile-prod",
		Provider:              models.ProfileProviderS3Compatible,
		TLSInsecureSkipVerify: true,
	})
	defer cleanup()

	if err == nil {
		t.Fatalf("PrepareRcloneTLSFlags flags=%v, want error", flags)
	}
	if !strings.Contains(err.Error(), profiletls.TLSSkipVerifyApprovalEnv) {
		t.Fatalf("err=%v, want approval env mention", err)
	}
}

func TestPrepareRcloneTLSFlagsAllowsSkipVerifyInProductionWithApproval(t *testing.T) {
	t.Setenv("LOG_ENV", "prod")
	t.Setenv(profiletls.TLSSkipVerifyApprovalEnv, "true")

	flags, cleanup, err := PrepareRcloneTLSFlags(models.ProfileSecrets{
		ID:                    "profile-prod-approved",
		Provider:              models.ProfileProviderS3Compatible,
		TLSInsecureSkipVerify: true,
	})
	defer cleanup()

	if err != nil {
		t.Fatalf("PrepareRcloneTLSFlags err=%v", err)
	}
	if !containsString(flags, "--no-check-certificate") {
		t.Fatalf("flags=%v, want --no-check-certificate", flags)
	}
}

func TestRcloneTLSSkipVerifyApprovedValues(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want bool
	}{
		{name: "true", raw: "true", want: true},
		{name: "one", raw: "1", want: true},
		{name: "approved", raw: "approved", want: true},
		{name: "false", raw: "false", want: false},
		{name: "blank", raw: "", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(profiletls.TLSSkipVerifyApprovalEnv, tc.raw)
			if got := profiletls.SkipVerifyApproved(); got != tc.want {
				t.Fatalf("SkipVerifyApproved()=%v, want %v", got, tc.want)
			}
		})
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
