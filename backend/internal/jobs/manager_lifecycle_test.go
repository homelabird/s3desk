package jobs

import (
	"context"
	"testing"
	"time"
)

func TestManagerStartRegistersLifecyclesBeforeWait(t *testing.T) {
	manager := NewManager(Config{Concurrency: 1})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	manager.Start(ctx)
	waitCtx, waitCancel := context.WithTimeout(context.Background(), time.Second)
	defer waitCancel()
	if err := manager.Wait(waitCtx); err != nil {
		t.Fatalf("Wait() after Start cancellation: %v", err)
	}
}
