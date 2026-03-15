package ocicli

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"s3desk/internal/models"
)

type Response struct {
	Body []byte
}

func GetBucket(ctx context.Context, profile models.ProfileSecrets, bucket string) (Response, error) {
	return run(ctx, profile, "os", "bucket", "get",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
	)
}

func UpdateBucket(ctx context.Context, profile models.ProfileSecrets, bucket string, publicAccessType string, versioning string) (Response, error) {
	args := []string{
		"os", "bucket", "update",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--force",
	}
	if value := strings.TrimSpace(publicAccessType); value != "" {
		args = append(args, "--public-access-type", value)
	}
	if value := strings.TrimSpace(versioning); value != "" {
		args = append(args, "--versioning", value)
	}
	return run(ctx, profile, args...)
}

func ListRetentionRules(ctx context.Context, profile models.ProfileSecrets, bucket string) (Response, error) {
	return run(ctx, profile, "os", "retention-rule", "list",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--all",
	)
}

func CreateRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, days int, displayName string) (Response, error) {
	args := []string{
		"os", "retention-rule", "create",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--time-amount", fmt.Sprintf("%d", days),
		"--time-unit", "DAYS",
	}
	if value := strings.TrimSpace(displayName); value != "" {
		args = append(args, "--display-name", value)
	}
	return run(ctx, profile, args...)
}

func UpdateRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, ruleID string, days int, displayName string) (Response, error) {
	args := []string{
		"os", "retention-rule", "update",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--retention-rule-id", strings.TrimSpace(ruleID),
		"--time-amount", fmt.Sprintf("%d", days),
		"--time-unit", "DAYS",
		"--force",
	}
	if value := strings.TrimSpace(displayName); value != "" {
		args = append(args, "--display-name", value)
	}
	return run(ctx, profile, args...)
}

func DeleteRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, ruleID string) (Response, error) {
	return run(ctx, profile, "os", "retention-rule", "delete",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--retention-rule-id", strings.TrimSpace(ruleID),
		"--force",
	)
}

func ListPreauthenticatedRequests(ctx context.Context, profile models.ProfileSecrets, bucket string) (Response, error) {
	return run(ctx, profile, "os", "preauth-request", "list",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--all",
	)
}

func CreatePreauthenticatedRequest(ctx context.Context, profile models.ProfileSecrets, bucket string, name string, accessType string, timeExpires string, objectName string, bucketListingAction string) (Response, error) {
	args := []string{
		"os", "preauth-request", "create",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--name", strings.TrimSpace(name),
		"--access-type", strings.TrimSpace(accessType),
		"--time-expires", strings.TrimSpace(timeExpires),
	}
	if value := strings.TrimSpace(objectName); value != "" {
		args = append(args, "--object-name", value)
	}
	if value := strings.TrimSpace(bucketListingAction); value != "" {
		args = append(args, "--bucket-listing-action", value)
	}
	return run(ctx, profile, args...)
}

func DeletePreauthenticatedRequest(ctx context.Context, profile models.ProfileSecrets, bucket string, parID string) (Response, error) {
	return run(ctx, profile, "os", "preauth-request", "delete",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--par-id", strings.TrimSpace(parID),
		"--force",
	)
}

func run(ctx context.Context, profile models.ProfileSecrets, args ...string) (Response, error) {
	if strings.TrimSpace(profile.OciNamespace) == "" {
		return Response{}, errors.New("missing oci namespace")
	}
	cmdArgs := append(buildGlobalArgs(profile), args...)
	cliPath, err := resolveCLIPath()
	if err != nil {
		return Response{}, err
	}

	// #nosec G204 -- cliPath is resolved from PATH or a validated configured executable path.
	cmd := exec.CommandContext(ctx, cliPath, cmdArgs...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return Response{}, errors.New(message)
	}
	return Response{Body: stdout.Bytes()}, nil
}

func resolveCLIPath() (string, error) {
	raw := strings.TrimSpace(os.Getenv("OCI_CLI_PATH"))
	if raw == "" {
		return exec.LookPath("oci")
	}
	if filepath.IsAbs(raw) {
		if _, err := os.Stat(raw); err != nil {
			return "", fmt.Errorf("invalid OCI_CLI_PATH %q: %w", raw, err)
		}
		return raw, nil
	}
	if strings.ContainsRune(raw, os.PathSeparator) {
		return "", fmt.Errorf("invalid OCI_CLI_PATH %q: must be an absolute path or executable name", raw)
	}
	resolved, err := exec.LookPath(raw)
	if err != nil {
		return "", fmt.Errorf("invalid OCI_CLI_PATH %q: %w", raw, err)
	}
	return resolved, nil
}

func buildGlobalArgs(profile models.ProfileSecrets) []string {
	args := make([]string, 0, 10)
	if value := strings.TrimSpace(profile.OciConfigFile); value != "" {
		args = append(args, "--config-file", value)
	}
	if value := strings.TrimSpace(profile.OciConfigProfile); value != "" {
		args = append(args, "--profile", value)
	}
	if value := strings.TrimSpace(profile.Region); value != "" {
		args = append(args, "--region", value)
	}
	if value := strings.TrimSpace(profile.OciEndpoint); value != "" {
		args = append(args, "--endpoint", value)
	}
	if value := normalizeCLIAuth(profile.OciAuthProvider); value != "" {
		args = append(args, "--auth", value)
	}
	return args
}

func normalizeCLIAuth(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "user_principal_auth":
		return ""
	case "instance_principal_auth":
		return "instance_principal"
	case "resource_principal_auth":
		return "resource_principal"
	default:
		return strings.TrimSpace(value)
	}
}
