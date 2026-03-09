package ocicli

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
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

func CreateRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, days int) (Response, error) {
	return run(ctx, profile, "os", "retention-rule", "create",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--display-name", "s3desk-retention",
		"--time-amount", fmt.Sprintf("%d", days),
		"--time-unit", "DAYS",
	)
}

func UpdateRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, ruleID string, days int) (Response, error) {
	return run(ctx, profile, "os", "retention-rule", "update",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--retention-rule-id", strings.TrimSpace(ruleID),
		"--time-amount", fmt.Sprintf("%d", days),
		"--time-unit", "DAYS",
		"--force",
	)
}

func DeleteRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, ruleID string) (Response, error) {
	return run(ctx, profile, "os", "retention-rule", "delete",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--retention-rule-id", strings.TrimSpace(ruleID),
		"--force",
	)
}

func run(ctx context.Context, profile models.ProfileSecrets, args ...string) (Response, error) {
	if strings.TrimSpace(profile.OciNamespace) == "" {
		return Response{}, errors.New("missing oci namespace")
	}
	cmdArgs := append(buildGlobalArgs(profile), args...)
	path := os.Getenv("OCI_CLI_PATH")
	if strings.TrimSpace(path) == "" {
		path = "oci"
	}

	cmd := exec.CommandContext(ctx, path, cmdArgs...)
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
