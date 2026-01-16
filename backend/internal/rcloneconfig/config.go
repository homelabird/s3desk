package rcloneconfig

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"s3desk/internal/models"
)

var ErrUnsupportedProvider = errors.New("unsupported provider")

func IsS3LikeProvider(p models.ProfileProvider) bool {
	switch p {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		return true
	default:
		return false
	}
}

func RenderConfig(profile models.ProfileSecrets, remoteName string) (string, error) {
	name := strings.TrimSpace(remoteName)
	if name == "" {
		name = RemoteName
	}

	var b strings.Builder
	if _, err := fmt.Fprintf(&b, "[%s]\n", name); err != nil {
		return "", err
	}

	switch profile.Provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
		if _, err := fmt.Fprintln(&b, "type = s3"); err != nil {
			return "", err
		}
		if profile.Provider == models.ProfileProviderAwsS3 {
			if _, err := fmt.Fprintln(&b, "provider = AWS"); err != nil {
				return "", err
			}
		} else {
			if _, err := fmt.Fprintln(&b, "provider = Other"); err != nil {
				return "", err
			}
		}

		endpoint := strings.TrimSpace(profile.Endpoint)
		if endpoint != "" {
			if _, err := fmt.Fprintf(&b, "endpoint = %s\n", endpoint); err != nil {
				return "", err
			}
		}
		region := strings.TrimSpace(profile.Region)
		if region != "" {
			if _, err := fmt.Fprintf(&b, "region = %s\n", region); err != nil {
				return "", err
			}
		}

		if _, err := fmt.Fprintf(&b, "access_key_id = %s\n", profile.AccessKeyID); err != nil {
			return "", err
		}
		if _, err := fmt.Fprintf(&b, "secret_access_key = %s\n", profile.SecretAccessKey); err != nil {
			return "", err
		}
		if profile.SessionToken != nil {
			token := strings.TrimSpace(*profile.SessionToken)
			if token != "" {
				if _, err := fmt.Fprintf(&b, "session_token = %s\n", token); err != nil {
					return "", err
				}
			}
		}
		if _, err := fmt.Fprintf(&b, "force_path_style = %t\n", profile.ForcePathStyle); err != nil {
			return "", err
		}

	case models.ProfileProviderAzureBlob:
		if _, err := fmt.Fprintln(&b, "type = azureblob"); err != nil {
			return "", err
		}
		if _, err := fmt.Fprintf(&b, "account = %s\n", strings.TrimSpace(profile.AzureAccountName)); err != nil {
			return "", err
		}
		if _, err := fmt.Fprintf(&b, "key = %s\n", profile.AzureAccountKey); err != nil {
			return "", err
		}
		endpoint := strings.TrimSpace(profile.AzureEndpoint)
		if endpoint == "" && profile.AzureUseEmulator {
			acct := strings.TrimSpace(profile.AzureAccountName)
			if acct != "" {
				endpoint = fmt.Sprintf("http://azurite:10000/%s", acct)
			}
		}
		if endpoint != "" {
			if _, err := fmt.Fprintf(&b, "endpoint = %s\n", endpoint); err != nil {
				return "", err
			}
		}

	case models.ProfileProviderGcpGcs:
		if _, err := fmt.Fprintln(&b, "type = google cloud storage"); err != nil {
			return "", err
		}
		if profile.GcpAnonymous {
			if _, err := fmt.Fprintln(&b, "anonymous = true"); err != nil {
				return "", err
			}
		} else {
			raw := strings.TrimSpace(profile.GcpServiceAccountJSON)
			if raw == "" {
				return "", errors.New("serviceAccountJson is required")
			}
			var compact bytes.Buffer
			if err := json.Compact(&compact, []byte(raw)); err != nil {
				return "", fmt.Errorf("invalid serviceAccountJson: %w", err)
			}
			if _, err := fmt.Fprintf(&b, "service_account_credentials = %s\n", compact.String()); err != nil {
				return "", err
			}
		}
		if endpoint := strings.TrimSpace(profile.GcpEndpoint); endpoint != "" {
			if _, err := fmt.Fprintf(&b, "endpoint = %s\n", endpoint); err != nil {
				return "", err
			}
		}
		if pn := strings.TrimSpace(profile.GcpProjectNumber); pn != "" {
			if _, err := fmt.Fprintf(&b, "project_number = %s\n", pn); err != nil {
				return "", err
			}
		}

	case models.ProfileProviderOciObjectStorage:
		if _, err := fmt.Fprintln(&b, "type = oracleobjectstorage"); err != nil {
			return "", err
		}
		ns := strings.TrimSpace(profile.OciNamespace)
		if ns == "" {
			return "", errors.New("namespace is required")
		}
		if _, err := fmt.Fprintf(&b, "namespace = %s\n", ns); err != nil {
			return "", err
		}
		comp := strings.TrimSpace(profile.OciCompartment)
		if comp == "" {
			return "", errors.New("compartment is required")
		}
		if _, err := fmt.Fprintf(&b, "compartment = %s\n", comp); err != nil {
			return "", err
		}
		region := strings.TrimSpace(profile.Region)
		if region == "" {
			return "", errors.New("region is required")
		}
		if _, err := fmt.Fprintf(&b, "region = %s\n", region); err != nil {
			return "", err
		}
		if endpoint := strings.TrimSpace(profile.OciEndpoint); endpoint != "" {
			if _, err := fmt.Fprintf(&b, "endpoint = %s\n", endpoint); err != nil {
				return "", err
			}
		}
		if ap := strings.TrimSpace(profile.OciAuthProvider); ap != "" {
			// rclone's oracleobjectstorage backend uses OCI SDK auth providers.
			if _, err := fmt.Fprintf(&b, "auth_provider = %s\n", ap); err != nil {
				return "", err
			}
		}
		if cf := strings.TrimSpace(profile.OciConfigFile); cf != "" {
			if _, err := fmt.Fprintf(&b, "config_file = %s\n", cf); err != nil {
				return "", err
			}
		}
		if cp := strings.TrimSpace(profile.OciConfigProfile); cp != "" {
			if _, err := fmt.Fprintf(&b, "config_profile = %s\n", cp); err != nil {
				return "", err
			}
		}

	default:
		return "", fmt.Errorf("%w: %s", ErrUnsupportedProvider, profile.Provider)
	}

	return b.String(), nil
}

func WriteConfigFile(path string, profile models.ProfileSecrets, remoteName string) error {
	config, err := RenderConfig(profile, remoteName)
	if err != nil {
		return err
	}
	// Create the file with restrictive permissions.
	// #nosec G304 -- path is derived from controlled config paths.
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	if _, err := f.WriteString(config); err != nil {
		return err
	}
	return f.Close()
}

func WriteTempConfig(dataDir, filePrefix, hint string, profile models.ProfileSecrets) (path string, cleanup func(), err error) {
	baseDir := strings.TrimSpace(dataDir)
	if baseDir == "" {
		baseDir = os.TempDir()
	}
	cfgDir := filepath.Join(baseDir, "tmp", "rclone")
	if err := os.MkdirAll(cfgDir, 0o700); err != nil {
		return "", func() {}, err
	}

	prefix := strings.TrimSpace(filePrefix)
	if prefix == "" {
		prefix = "rclone"
	}
	if hint != "" {
		prefix += "-" + hint
	}

	f, err := os.CreateTemp(cfgDir, prefix+"-*.rclone.conf")
	if err != nil {
		return "", func() {}, err
	}
	path = f.Name()
	cleanup = func() { _ = os.Remove(path) }
	defer func() { _ = f.Close() }()

	config, err := RenderConfig(profile, RemoteName)
	if err != nil {
		cleanup()
		return "", func() {}, err
	}
	if _, err := f.WriteString(config); err != nil {
		cleanup()
		return "", func() {}, err
	}
	if err := f.Close(); err != nil {
		cleanup()
		return "", func() {}, err
	}
	return path, cleanup, nil
}
