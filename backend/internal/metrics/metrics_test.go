package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestObserveStorageOperationRegistersMetrics(t *testing.T) {
	m := New()

	m.ObserveStorageOperation("oci_object_storage", "list_objects", "success", 250*time.Millisecond)
	m.IncStorageListPageRequest("oci_object_storage", "success")
	m.IncStorageListPageRequest("oci_object_storage", "failure")
	m.AddStorageRcloneListEntriesScanned("gcp_gcs", "list_objects_continuation", 100_000)

	families, err := m.registry.Gather()
	if err != nil {
		t.Fatalf("gather metrics: %v", err)
	}

	var foundCounter bool
	var foundHistogram bool
	var foundRcloneScans bool
	var foundListPages bool
	for _, family := range families {
		switch family.GetName() {
		case "storage_operations_total":
			foundCounter = true
			if !strings.Contains(family.GetHelp(), "logical S3Desk storage operations") {
				t.Fatalf("storage_operations_total help=%q, want logical-operation semantics", family.GetHelp())
			}
		case "storage_operation_duration_ms":
			foundHistogram = true
		case "storage_rclone_list_entries_scanned_total":
			foundRcloneScans = true
		case "storage_list_page_requests_total":
			foundListPages = true
			if !strings.Contains(family.GetHelp(), "SDK internal retries are not included") {
				t.Fatalf("storage_list_page_requests_total help=%q, want retry limitation", family.GetHelp())
			}
		}
	}

	if !foundCounter {
		t.Fatal("expected storage_operations_total to be registered")
	}
	if !foundHistogram {
		t.Fatal("expected storage_operation_duration_ms to be registered")
	}
	if !foundRcloneScans {
		t.Fatal("expected storage_rclone_list_entries_scanned_total to be registered")
	}
	if !foundListPages {
		t.Fatal("expected storage_list_page_requests_total to be registered")
	}
}

func TestMaintenanceCleanupMetricTracksOutcomes(t *testing.T) {
	m := New()
	m.AddMaintenanceCleanup("upload_sessions", "run", 1)
	m.AddMaintenanceCleanup("upload_sessions", "scanned", 3)
	m.AddMaintenanceCleanup("upload_sessions", "db_batch", 1)
	m.AddMaintenanceCleanup("upload_sessions", "deleted", 2)
	m.ObserveMaintenanceCycle(25 * time.Millisecond)

	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	for _, want := range []string{
		`maintenance_cleanup_total{outcome="run",resource="upload_sessions"} 1`,
		`maintenance_cleanup_total{outcome="scanned",resource="upload_sessions"} 3`,
		`maintenance_cleanup_total{outcome="db_batch",resource="upload_sessions"} 1`,
		`maintenance_cleanup_total{outcome="deleted",resource="upload_sessions"} 2`,
		`maintenance_cycle_duration_ms_count 1`,
	} {
		if !strings.Contains(rec.Body.String(), want) {
			t.Fatalf("metrics output missing %q", want)
		}
	}
}

func TestRuntimeCollectorsAreRegistered(t *testing.T) {
	m := New()
	families, err := m.registry.Gather()
	if err != nil {
		t.Fatalf("gather metrics: %v", err)
	}

	found := map[string]bool{}
	for _, family := range families {
		found[family.GetName()] = true
	}
	for _, name := range []string{"go_goroutines", "process_cpu_seconds_total"} {
		if !found[name] {
			t.Fatalf("expected %s runtime metric", name)
		}
	}
}
