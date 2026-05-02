package api

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

func TestBuildPortableImportEntityVerification_ReportsMissingEntityAndChecksumMismatch(t *testing.T) {
	t.Parallel()

	profilesData := []byte("[]\n")
	emptySum := sha256.Sum256([]byte{})

	verification := buildPortableImportEntityVerification(
		map[string]models.ServerMigrationEntityManifest{
			"profiles": {
				Count:  1,
				SHA256: "deadbeef",
			},
			"profile_connection_options": {
				Count:  0,
				SHA256: hex.EncodeToString(emptySum[:]),
			},
		},
		map[string][]byte{
			"profiles": profilesData,
		},
	)

	if verification.entityChecksumsVerified {
		t.Fatal("expected entityChecksumsVerified=false")
	}
	if len(verification.results) != 2 {
		t.Fatalf("expected 2 entity results, got %d", len(verification.results))
	}
	if verification.results[0].Name != "profiles" || verification.results[0].ChecksumVerified {
		t.Fatalf("expected profiles checksum mismatch result, got %#v", verification.results[0])
	}
	if verification.results[1].Name != "profile_connection_options" || verification.results[1].ChecksumVerified {
		t.Fatalf("expected missing profile_connection_options result, got %#v", verification.results[1])
	}
	blockers := strings.Join(verification.blockers, "\n")
	if !strings.Contains(blockers, "Checksum mismatch for profiles.") {
		t.Fatalf("expected checksum blocker, got %v", verification.blockers)
	}
	if !strings.Contains(blockers, "Portable bundle is missing data/profile_connection_options.jsonl.") {
		t.Fatalf("expected missing-file blocker, got %v", verification.blockers)
	}
}

func TestApplyPortableImportCounts_MapsImportedCounts(t *testing.T) {
	t.Parallel()

	results := []models.ServerPortableImportEntityResult{
		{Name: "profiles", ExportedCount: 1, ChecksumVerified: true},
		{Name: "jobs", ExportedCount: 2, ChecksumVerified: true},
		{Name: "object_favorites", ExportedCount: 3, ChecksumVerified: true},
	}

	got := applyPortableImportCounts(results, store.PortableImportCounts{
		Profiles:        1,
		Jobs:            2,
		ObjectFavorites: 4,
	})

	if got[0].ImportedCount != 1 || got[1].ImportedCount != 2 || got[2].ImportedCount != 4 {
		t.Fatalf("unexpected imported counts: %#v", got)
	}
	if verifyPortableImportCounts(got) {
		t.Fatal("expected verifyPortableImportCounts=false because object_favorites count mismatched")
	}
}
