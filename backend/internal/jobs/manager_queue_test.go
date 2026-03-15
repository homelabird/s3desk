package jobs

import (
	"errors"
	"testing"
)

func TestCancelQueuedJobFreesCapacityImmediately(t *testing.T) {
	t.Setenv("JOB_QUEUE_CAPACITY", "1")

	manager := NewManager(Config{Concurrency: 1})

	if err := manager.Enqueue("job-1"); err != nil {
		t.Fatalf("enqueue first job: %v", err)
	}
	if stats := manager.QueueStats(); stats.Depth != 1 || stats.Capacity != 1 {
		t.Fatalf("expected queue depth/capacity 1/1 after first enqueue, got %d/%d", stats.Depth, stats.Capacity)
	}

	if err := manager.Enqueue("job-2"); !errors.Is(err, ErrJobQueueFull) {
		t.Fatalf("expected ErrJobQueueFull before cancel, got %v", err)
	}

	manager.Cancel("job-1")

	if stats := manager.QueueStats(); stats.Depth != 0 || stats.Capacity != 1 {
		t.Fatalf("expected queue depth/capacity 0/1 after cancel, got %d/%d", stats.Depth, stats.Capacity)
	}

	if err := manager.Enqueue("job-2"); err != nil {
		t.Fatalf("enqueue second job after cancel: %v", err)
	}
}
