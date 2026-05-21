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
		t.TempDir(),
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

func TestBuildPortableImportEntityVerification_BlocksManifestCountMismatch(t *testing.T) {
	t.Parallel()

	profilesData := []byte("{}\n{}\n")
	sum := sha256.Sum256(profilesData)
	emptySum := sha256.Sum256([]byte{})
	manifestEntities := make(map[string]models.ServerMigrationEntityManifest, len(portableEntityOrder))
	entityFiles := make(map[string][]byte, len(portableEntityOrder))
	for _, name := range portableEntityOrder {
		manifestEntities[name] = models.ServerMigrationEntityManifest{
			Count:  0,
			SHA256: hex.EncodeToString(emptySum[:]),
		}
		entityFiles[name] = nil
	}
	manifestEntities["profiles"] = models.ServerMigrationEntityManifest{
		Count:  1,
		SHA256: hex.EncodeToString(sum[:]),
	}
	entityFiles["profiles"] = profilesData

	verification := buildPortableImportEntityVerification(
		manifestEntities,
		entityFiles,
		t.TempDir(),
	)

	if !verification.entityChecksumsVerified {
		t.Fatal("expected checksum verification to pass")
	}
	blockers := strings.Join(verification.blockers, "\n")
	if !strings.Contains(blockers, "Portable manifest count mismatch for profiles: manifest has 1 row(s), bundle has 2 row(s).") {
		t.Fatalf("expected count mismatch blocker, got %v", verification.blockers)
	}
	profilesResult := verification.results[0]
	if profilesResult.Name != "profiles" || !profilesResult.ChecksumVerified {
		t.Fatalf("unexpected results: %#v", verification.results)
	}
}

func TestBuildPortableImportEntityVerification_AllowsLegacyBundleWithoutIndexReplacements(t *testing.T) {
	t.Parallel()

	emptySum := sha256.Sum256([]byte{})
	manifestEntities := make(map[string]models.ServerMigrationEntityManifest, len(portableEntityOrder))
	entityFiles := make(map[string][]byte, len(portableEntityOrder))
	for _, name := range portableEntityOrder {
		if name == "object_index_replacements" {
			continue
		}
		manifestEntities[name] = models.ServerMigrationEntityManifest{
			Count:  0,
			SHA256: hex.EncodeToString(emptySum[:]),
		}
		entityFiles[name] = nil
	}

	verification := buildPortableImportEntityVerification(
		manifestEntities,
		entityFiles,
		t.TempDir(),
	)

	if !verification.entityChecksumsVerified {
		t.Fatal("expected checksum verification to pass for missing optional entity")
	}
	blockers := strings.Join(verification.blockers, "\n")
	if strings.Contains(blockers, "object_index_replacements") {
		t.Fatalf("optional object_index_replacements should not block legacy bundles, got %v", verification.blockers)
	}
}

func TestBuildPortableImportEntityVerification_BlocksUnknownEntityFields(t *testing.T) {
	t.Parallel()

	emptySum := sha256.Sum256([]byte{})
	jobsData := []byte(`{"ID":"01ARZ3NDEKTSV4RRFFQ69G5FAV","ProfileID":"01ARZ3NDEKTSV4RRFFQ69G5FAV","Type":"object_index","Status":"succeeded","PayloadJSON":"{}","CreatedAt":"2026-05-19T00:00:00Z","UnexpectedColumn":"silently ignored"}` + "\n")
	jobsSum := sha256.Sum256(jobsData)
	manifestEntities := make(map[string]models.ServerMigrationEntityManifest, len(portableEntityOrder))
	entityFiles := make(map[string][]byte, len(portableEntityOrder))
	for _, name := range portableEntityOrder {
		manifestEntities[name] = models.ServerMigrationEntityManifest{
			Count:  0,
			SHA256: hex.EncodeToString(emptySum[:]),
		}
		entityFiles[name] = nil
	}
	manifestEntities["jobs"] = models.ServerMigrationEntityManifest{
		Count:  1,
		SHA256: hex.EncodeToString(jobsSum[:]),
	}
	entityFiles["jobs"] = jobsData

	verification := buildPortableImportEntityVerification(
		manifestEntities,
		entityFiles,
		t.TempDir(),
	)

	if !verification.entityChecksumsVerified {
		t.Fatal("expected checksum verification to pass")
	}
	blockers := strings.Join(verification.blockers, "\n")
	if !strings.Contains(blockers, "Portable bundle entity schema validation failed: parse jobs") ||
		!strings.Contains(blockers, "unknown field") {
		t.Fatalf("expected schema validation blocker, got %v", verification.blockers)
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
