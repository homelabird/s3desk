package ocicli

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"s3desk/internal/models"
	"s3desk/internal/processio"
	"s3desk/internal/profileendpoint"
)

type Response struct {
	Body []byte
}

type ClientOptions struct {
	AllowRemote bool
}

var (
	ociCLIStdoutMaxBytes = processio.DefaultStdoutMaxBytes
	ociCLIStderrMaxBytes = processio.DefaultStderrMaxBytes
)

func GetBucket(ctx context.Context, profile models.ProfileSecrets, bucket string) (Response, error) {
	return GetBucketWithOptions(ctx, profile, bucket, ClientOptions{})
}

func GetBucketWithOptions(ctx context.Context, profile models.ProfileSecrets, bucket string, opts ClientOptions) (Response, error) {
	return run(ctx, profile, opts, "os", "bucket", "get",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
	)
}

func UpdateBucket(ctx context.Context, profile models.ProfileSecrets, bucket string, publicAccessType string, versioning string) (Response, error) {
	return UpdateBucketWithOptions(ctx, profile, bucket, publicAccessType, versioning, ClientOptions{})
}

func UpdateBucketWithOptions(ctx context.Context, profile models.ProfileSecrets, bucket string, publicAccessType string, versioning string, opts ClientOptions) (Response, error) {
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
	return run(ctx, profile, opts, args...)
}

func ListRetentionRules(ctx context.Context, profile models.ProfileSecrets, bucket string) (Response, error) {
	return ListRetentionRulesWithOptions(ctx, profile, bucket, ClientOptions{})
}

func ListRetentionRulesWithOptions(ctx context.Context, profile models.ProfileSecrets, bucket string, opts ClientOptions) (Response, error) {
	return run(ctx, profile, opts, "os", "retention-rule", "list",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--all",
	)
}

func CreateRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, days int, displayName string) (Response, error) {
	return CreateRetentionRuleWithOptions(ctx, profile, bucket, days, displayName, ClientOptions{})
}

func CreateRetentionRuleWithOptions(ctx context.Context, profile models.ProfileSecrets, bucket string, days int, displayName string, opts ClientOptions) (Response, error) {
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
	return run(ctx, profile, opts, args...)
}

func UpdateRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, ruleID string, days int, displayName string) (Response, error) {
	return UpdateRetentionRuleWithOptions(ctx, profile, bucket, ruleID, days, displayName, ClientOptions{})
}

func UpdateRetentionRuleWithOptions(ctx context.Context, profile models.ProfileSecrets, bucket string, ruleID string, days int, displayName string, opts ClientOptions) (Response, error) {
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
	return run(ctx, profile, opts, args...)
}

func DeleteRetentionRule(ctx context.Context, profile models.ProfileSecrets, bucket string, ruleID string) (Response, error) {
	return DeleteRetentionRuleWithOptions(ctx, profile, bucket, ruleID, ClientOptions{})
}

func DeleteRetentionRuleWithOptions(ctx context.Context, profile models.ProfileSecrets, bucket string, ruleID string, opts ClientOptions) (Response, error) {
	return run(ctx, profile, opts, "os", "retention-rule", "delete",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--retention-rule-id", strings.TrimSpace(ruleID),
		"--force",
	)
}

func ListPreauthenticatedRequests(ctx context.Context, profile models.ProfileSecrets, bucket string) (Response, error) {
	return ListPreauthenticatedRequestsWithOptions(ctx, profile, bucket, ClientOptions{})
}

func ListPreauthenticatedRequestsWithOptions(ctx context.Context, profile models.ProfileSecrets, bucket string, opts ClientOptions) (Response, error) {
	return run(ctx, profile, opts, "os", "preauth-request", "list",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--all",
	)
}

func CreatePreauthenticatedRequest(ctx context.Context, profile models.ProfileSecrets, bucket string, name string, accessType string, timeExpires string, objectName string, bucketListingAction string) (Response, error) {
	return CreatePreauthenticatedRequestWithOptions(ctx, profile, bucket, name, accessType, timeExpires, objectName, bucketListingAction, ClientOptions{})
}

func CreatePreauthenticatedRequestWithOptions(ctx context.Context, profile models.ProfileSecrets, bucket string, name string, accessType string, timeExpires string, objectName string, bucketListingAction string, opts ClientOptions) (Response, error) {
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
	return run(ctx, profile, opts, args...)
}

func DeletePreauthenticatedRequest(ctx context.Context, profile models.ProfileSecrets, bucket string, parID string) (Response, error) {
	return DeletePreauthenticatedRequestWithOptions(ctx, profile, bucket, parID, ClientOptions{})
}

func DeletePreauthenticatedRequestWithOptions(ctx context.Context, profile models.ProfileSecrets, bucket string, parID string, opts ClientOptions) (Response, error) {
	return run(ctx, profile, opts, "os", "preauth-request", "delete",
		"-bn", strings.TrimSpace(bucket),
		"-ns", strings.TrimSpace(profile.OciNamespace),
		"--par-id", strings.TrimSpace(parID),
		"--force",
	)
}

func run(ctx context.Context, profile models.ProfileSecrets, opts ClientOptions, args ...string) (Response, error) {
	if strings.TrimSpace(profile.OciNamespace) == "" {
		return Response{}, errors.New("missing oci namespace")
	}
	if err := profileendpoint.ValidateProfileSecretsEndpoints(profile, opts.AllowRemote); err != nil {
		return Response{}, err
	}
	cmdArgs := append(buildGlobalArgs(profile), args...)
	cliPath, err := resolveCLIPath()
	if err != nil {
		return Response{}, err
	}

	// #nosec G204 -- cliPath is resolved from PATH or a validated configured executable path.
	cmd := exec.CommandContext(ctx, cliPath, cmdArgs...)
	stdout := processio.NewLimitBuffer(ociCLIStdoutMaxBytes)
	stderr := processio.NewLimitBuffer(ociCLIStderrMaxBytes)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return Response{}, errors.New(message)
	}
	if stdout.Truncated() {
		return Response{}, fmt.Errorf("oci cli output: %w", &processio.OutputLimitError{Stream: "stdout", Limit: stdout.Limit()})
	}
	return Response{Body: append([]byte(nil), stdout.Bytes()...)}, nil
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
