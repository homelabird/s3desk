package jobs

import (
	"testing"
)

func TestApplyRcloneTuneAddsFlags(t *testing.T) {
	args := []string{"--config", "/tmp/cfg"}
	tune := rcloneTune{
		Transfers:         8,
		Checkers:          16,
		UploadConcurrency: 4,
	}

	result := applyRcloneTune(args, tune, true)

	if !hasAnyFlag(result, "--transfers") {
		t.Fatal("expected --transfers flag")
	}
	if !hasAnyFlag(result, "--checkers") {
		t.Fatal("expected --checkers flag")
	}
	if !hasAnyFlag(result, "--s3-upload-concurrency") {
		t.Fatal("expected --s3-upload-concurrency flag")
	}
}

func TestApplyRcloneTuneSkipsExistingFlags(t *testing.T) {
	args := []string{"--config", "/tmp/cfg", "--transfers", "2"}
	tune := rcloneTune{Transfers: 8, Checkers: 16}

	result := applyRcloneTune(args, tune, false)

	// --transfers already present, should not be duplicated
	count := 0
	for _, a := range result {
		if a == "--transfers" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 --transfers flag, got %d", count)
	}
	if !hasAnyFlag(result, "--checkers") {
		t.Fatal("expected --checkers flag")
	}
}

func TestApplyRcloneTuneSkipsUploadConcurrencyForNonS3(t *testing.T) {
	args := []string{"--config", "/tmp/cfg"}
	tune := rcloneTune{Transfers: 4, Checkers: 8, UploadConcurrency: 4}

	result := applyRcloneTune(args, tune, false)

	if hasAnyFlag(result, "--s3-upload-concurrency") {
		t.Fatal("--s3-upload-concurrency should not be added for non-S3 providers")
	}
}

func TestComputeRcloneTuneDisabled(t *testing.T) {
	m := &Manager{
		rcloneTuneEnabled: false,
		sem:               make(chan struct{}, 2),
	}

	_, ok := m.computeRcloneTune([]string{"copy", "src", "dst"}, true)
	if ok {
		t.Fatal("expected tune to be disabled")
	}
}

func TestComputeRcloneTuneDistributesAcrossJobs(t *testing.T) {
	m := &Manager{
		rcloneTuneEnabled:  true,
		rcloneMaxTransfers: 16,
		rcloneMaxCheckers:  32,
		sem:                make(chan struct{}, 4),
	}
	// Simulate 2 active jobs by filling 2 sem slots
	m.sem <- struct{}{}
	m.sem <- struct{}{}

	tune, ok := m.computeRcloneTune([]string{"copy", "src", "dst"}, false)
	if !ok {
		t.Fatal("expected tune to be enabled")
	}
	if tune.Transfers != 8 {
		t.Fatalf("transfers=%d want=8", tune.Transfers)
	}
	if tune.Checkers != 16 {
		t.Fatalf("checkers=%d want=16", tune.Checkers)
	}
}

func TestComputeRcloneTuneUnsupportedCommand(t *testing.T) {
	m := &Manager{
		rcloneTuneEnabled: true,
		sem:               make(chan struct{}, 2),
	}

	_, ok := m.computeRcloneTune([]string{"lsjson", "remote:"}, true)
	if ok {
		t.Fatal("lsjson should not be tunable")
	}
}

func TestHasAnyFlag(t *testing.T) {
	args := []string{"--config", "/tmp/cfg", "--transfers", "4", "--low-level-retries", "10"}

	if !hasAnyFlag(args, "--transfers") {
		t.Fatal("expected --transfers to be found")
	}
	if !hasAnyFlag(args, "--low-level-retries") {
		t.Fatal("expected --low-level-retries to be found")
	}
	if hasAnyFlag(args, "--checkers") {
		t.Fatal("expected --checkers not to be found")
	}
}
