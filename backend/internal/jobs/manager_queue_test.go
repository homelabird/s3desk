package jobs

import (
	"context"
	"errors"
	"testing"
	"time"
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

func TestCancelRunningJobInvokesCancelFunc(t *testing.T) {
	manager := NewManager(Config{Concurrency: 1})
	called := make(chan struct{}, 1)

	manager.mu.Lock()
	manager.cancels["job-1"] = func() {
		select {
		case called <- struct{}{}:
		default:
		}
	}
	manager.mu.Unlock()

	manager.Cancel("job-1")

	select {
	case <-called:
	case <-time.After(time.Second):
		t.Fatal("Cancel did not invoke running job cancel func")
	}
}

func TestManagerWaitHonorsDeadlineAndWaitsForLifecycle(t *testing.T) {
	manager := NewManager(Config{Concurrency: 1})
	manager.lifecycleWG.Add(1)
	release := make(chan struct{})
	go func() {
		<-release
		manager.lifecycleWG.Done()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if err := manager.Wait(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Wait() error=%v, want deadline exceeded", err)
	}

	close(release)
	if err := manager.Wait(context.Background()); err != nil {
		t.Fatalf("Wait() after lifecycle completion: %v", err)
	}
}

func TestQueueDequeueChurnKeepsBoundedBackingStorage(t *testing.T) {
	t.Setenv("JOB_QUEUE_CAPACITY", "8")
	manager := NewManager(Config{Concurrency: 1})

	for i := 0; i < 10_000; i++ {
		if err := manager.Enqueue("job"); err != nil {
			t.Fatalf("enqueue %d: %v", i, err)
		}
		if _, ok := manager.dequeue(context.Background()); !ok {
			t.Fatalf("dequeue %d failed", i)
		}
	}

	if got := cap(manager.queue); got > manager.queueCapacity {
		t.Fatalf("queue backing capacity=%d, want <= %d", got, manager.queueCapacity)
	}
}

func TestManagerKeepsJobQueuedUntilWorkerSlotIsAvailable(t *testing.T) {
	manager := NewManager(Config{Concurrency: 1})
	manager.sem <- struct{}{}
	if err := manager.Enqueue("job-1"); err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	manager.lifecycleWG.Add(1)
	go manager.run(ctx)
	t.Cleanup(func() {
		cancel()
		_ = manager.Wait(context.Background())
		<-manager.sem
	})

	time.Sleep(10 * time.Millisecond)
	if stats := manager.QueueStats(); stats.Depth != 1 {
		t.Fatalf("queue depth=%d, want 1 while worker slot is unavailable", stats.Depth)
	}
	manager.Cancel("job-1")
	if stats := manager.QueueStats(); stats.Depth != 0 {
		t.Fatalf("queue depth=%d, want 0 after queued cancellation", stats.Depth)
	}
}
