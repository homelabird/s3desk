package jobs

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

func lookupEnvInt(key string, defaultValue int) (int, error) {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue, nil
	}
	parsed, err := strconv.Atoi(val)
	if err != nil {
		return defaultValue, fmt.Errorf("%s must be an integer: %w", key, err)
	}
	return parsed, nil
}

func lookupEnvFloat(key string, defaultValue float64) (float64, error) {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue, nil
	}
	parsed, err := strconv.ParseFloat(val, 64)
	if err != nil {
		return defaultValue, fmt.Errorf("%s must be a number: %w", key, err)
	}
	return parsed, nil
}

func lookupEnvBool(key string, defaultValue bool) (bool, error) {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue, nil
	}
	switch strings.ToLower(val) {
	case "1", "true", "t", "yes", "y", "on":
		return true, nil
	case "0", "false", "f", "no", "n", "off":
		return false, nil
	default:
		return defaultValue, fmt.Errorf("%s must be a boolean", key)
	}
}

func lookupEnvDuration(key string, defaultValue time.Duration) (time.Duration, error) {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return defaultValue, nil
	}
	parsed, err := time.ParseDuration(val)
	if err != nil {
		return defaultValue, fmt.Errorf("%s must be a duration: %w", key, err)
	}
	return parsed, nil
}

type rcloneTune struct {
	Transfers         int
	Checkers          int
	UploadConcurrency int
	ActiveJobs        int
}

func hasAnyFlag(args []string, flags ...string) bool {
	for _, a := range args {
		for _, f := range flags {
			if a == f {
				return true
			}
		}
	}
	return false
}

func (m *Manager) computeRcloneTune(commandArgs []string, isS3 bool) (tune rcloneTune, ok bool) {
	if !m.rcloneTuneEnabled {
		return rcloneTune{}, false
	}
	if len(commandArgs) == 0 {
		return rcloneTune{}, false
	}

	switch commandArgs[0] {
	case "sync", "copy", "move", "copyto", "moveto", "delete", "purge":
		// supported
	default:
		return rcloneTune{}, false
	}

	activeJobs := len(m.sem)
	if activeJobs < 1 {
		activeJobs = 1
	}

	maxTransfers := m.rcloneMaxTransfers
	if maxTransfers <= 0 {
		maxTransfers = 4
	}
	maxCheckers := m.rcloneMaxCheckers
	if maxCheckers <= 0 {
		maxCheckers = 8
	}

	transfers := maxTransfers / activeJobs
	if transfers < 1 {
		transfers = 1
	}
	if transfers > maxTransfers {
		transfers = maxTransfers
	}

	checkers := maxCheckers / activeJobs
	if checkers < 1 {
		checkers = 1
	}
	if checkers > maxCheckers {
		checkers = maxCheckers
	}

	uploadConcurrency := 0
	if isS3 && m.rcloneS3UploadConcurrency > 0 {
		uploadConcurrency = m.rcloneS3UploadConcurrency / activeJobs
		if uploadConcurrency < 1 {
			uploadConcurrency = 1
		}
		if uploadConcurrency > m.rcloneS3UploadConcurrency {
			uploadConcurrency = m.rcloneS3UploadConcurrency
		}
	}

	return rcloneTune{
		Transfers:         transfers,
		Checkers:          checkers,
		UploadConcurrency: uploadConcurrency,
		ActiveJobs:        activeJobs,
	}, true
}

func applyRcloneTune(args []string, tune rcloneTune, isS3 bool) []string {
	if tune.Transfers > 0 && !hasAnyFlag(args, "--transfers") {
		args = append(args, "--transfers", strconv.Itoa(tune.Transfers))
	}
	if tune.Checkers > 0 && !hasAnyFlag(args, "--checkers") {
		args = append(args, "--checkers", strconv.Itoa(tune.Checkers))
	}
	if isS3 && tune.UploadConcurrency > 0 && !hasAnyFlag(args, "--s3-upload-concurrency") {
		args = append(args, "--s3-upload-concurrency", strconv.Itoa(tune.UploadConcurrency))
	}
	return args
}
