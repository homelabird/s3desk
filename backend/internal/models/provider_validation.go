package models

import (
	"fmt"
	"strings"
)

const (
	OciAuthProviderUserPrincipal     = "user_principal"
	OciAuthProviderInstancePrincipal = "instance_principal"
	OciAuthProviderResourcePrincipal = "resource_principal"
)

func NormalizeOCIAuthProvider(value string) (string, error) {
	authProvider := strings.TrimSpace(value)
	if authProvider == "" {
		return "", nil
	}

	switch authProvider {
	case OciAuthProviderUserPrincipal,
		OciAuthProviderInstancePrincipal,
		OciAuthProviderResourcePrincipal:
		return authProvider, nil
	default:
		return "", fmt.Errorf(
			"authProvider must be one of %q, %q, or %q",
			OciAuthProviderUserPrincipal,
			OciAuthProviderInstancePrincipal,
			OciAuthProviderResourcePrincipal,
		)
	}
}
