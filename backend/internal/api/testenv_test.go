package api

import (
	"sync"
	"testing"
)

var testEnvMu sync.Mutex

func lockTestEnv(t *testing.T) {
	t.Helper()
	testEnvMu.Lock()
	t.Cleanup(testEnvMu.Unlock)
}
