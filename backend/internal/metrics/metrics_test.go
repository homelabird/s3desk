package metrics

import (
	"testing"
	"time"
)

func TestObserveStorageOperationRegistersMetrics(t *testing.T) {
	m := New()

	m.ObserveStorageOperation("oci_object_storage", "list_objects", "success", 250*time.Millisecond)

	families, err := m.registry.Gather()
	if err != nil {
		t.Fatalf("gather metrics: %v", err)
	}

	var foundCounter bool
	var foundHistogram bool
	for _, family := range families {
		switch family.GetName() {
		case "storage_operations_total":
			foundCounter = true
		case "storage_operation_duration_ms":
			foundHistogram = true
		}
	}

	if !foundCounter {
		t.Fatal("expected storage_operations_total to be registered")
	}
	if !foundHistogram {
		t.Fatal("expected storage_operation_duration_ms to be registered")
	}
}
