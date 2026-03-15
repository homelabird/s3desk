package jobs

import (
	"bufio"
	"fmt"
	"os"

	"s3desk/internal/rcloneconfig"
)

func writeFilesFromRawTempFile(pattern string, keys []string) (string, error) {
	f, err := os.CreateTemp("", pattern)
	if err != nil {
		return "", err
	}
	tmpPath := f.Name()

	w := bufio.NewWriter(f)
	for i, key := range keys {
		if err := rcloneconfig.ValidateSingleLineValue(fmt.Sprintf("line %d", i+1), key); err != nil {
			_ = f.Close()
			_ = os.Remove(tmpPath)
			return "", err
		}
		if _, err := w.WriteString(key + "\n"); err != nil {
			_ = f.Close()
			_ = os.Remove(tmpPath)
			return "", err
		}
	}
	if err := w.Flush(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return "", err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return "", err
	}
	return tmpPath, nil
}
