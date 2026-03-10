package bucketgov

import (
	"net/http"
	"strings"

	"s3desk/internal/models"
)

type OperationError struct {
	Status  int
	Code    string
	Message string
	Details map[string]any
}

func (e *OperationError) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	if e.Code != "" {
		return e.Code
	}
	return "bucket governance operation failed"
}

type UnsupportedOperationError struct {
	Provider models.ProfileProvider
	Section  string
}

func (e UnsupportedOperationError) Error() string {
	if e.Section == "" {
		return UnsupportedProviderError{Provider: e.Provider}.Error()
	}
	return "bucket governance section is not implemented yet for provider " + `"` + string(e.Provider) + `"` + ": " + e.Section
}

func RequiredFieldError(field string, details map[string]any) *OperationError {
	field = strings.TrimSpace(field)
	message := "field is required"
	if field != "" {
		message = field + " is required"
	}
	return InvalidFieldError(field, message, details)
}

func InvalidFieldError(field string, message string, details map[string]any) *OperationError {
	payload := cloneDetails(details)
	if field = strings.TrimSpace(field); field != "" {
		payload["field"] = field
	}
	return &OperationError{
		Status:  http.StatusBadRequest,
		Code:    "invalid_request",
		Message: strings.TrimSpace(message),
		Details: payload,
	}
}

func InvalidEnumFieldError(field string, value string, allowed ...string) *OperationError {
	payload := map[string]any{}
	value = strings.TrimSpace(value)
	if value != "" {
		payload["value"] = value
	}
	if len(allowed) > 0 {
		values := make([]string, 0, len(allowed))
		for _, item := range allowed {
			item = strings.TrimSpace(item)
			if item == "" {
				continue
			}
			values = append(values, item)
		}
		if len(values) > 0 {
			payload["allowed"] = values
		}
	}
	message := field + " has an unsupported value"
	if len(allowed) > 0 {
		message = field + " must be one of " + strings.Join(allowed, ", ")
	}
	return InvalidFieldError(field, message, payload)
}

func UnsupportedFieldError(provider models.ProfileProvider, section string, field string, capability models.BucketGovernanceCapability, details map[string]any) *OperationError {
	payload := GovernanceUnsupportedDetails(provider, section, capability)
	for key, value := range details {
		payload[key] = value
	}
	message := "field is not supported for this provider"
	if field = strings.TrimSpace(field); field != "" {
		message = field + " is not supported for this provider"
	}
	return InvalidFieldError(field, message, payload)
}

func GovernanceUnsupportedDetails(provider models.ProfileProvider, section string, capability models.BucketGovernanceCapability) map[string]any {
	details := map[string]any{}
	if provider != "" {
		details["provider"] = provider
	}
	if section = strings.TrimSpace(section); section != "" {
		details["section"] = section
	}
	if capability != "" {
		details["capability"] = capability
		if reason := CapabilityReason(provider, capability); reason != "" {
			details["reason"] = reason
		}
	}
	return details
}

func CapabilityReason(provider models.ProfileProvider, capability models.BucketGovernanceCapability) string {
	if capability == "" {
		return ""
	}
	state := capabilityState(provider, capability)
	if state.Enabled {
		return ""
	}
	return strings.TrimSpace(state.Reason)
}

func BucketNotFoundError(bucket string) *OperationError {
	return &OperationError{
		Status:  http.StatusNotFound,
		Code:    string(models.NormalizedErrorNotFound),
		Message: "bucket not found",
		Details: map[string]any{"bucket": bucket},
	}
}

func AccessDeniedError(bucket string, operation string) *OperationError {
	return &OperationError{
		Status:  http.StatusForbidden,
		Code:    string(models.NormalizedErrorAccessDenied),
		Message: "access denied",
		Details: map[string]any{"bucket": bucket, "operation": operation},
	}
}

func UpstreamOperationError(code string, message string, bucket string, err error) *OperationError {
	details := map[string]any{"bucket": bucket}
	if err != nil {
		details["error"] = err.Error()
	}
	return &OperationError{
		Status:  http.StatusBadGateway,
		Code:    strings.TrimSpace(code),
		Message: strings.TrimSpace(message),
		Details: details,
	}
}

func cloneDetails(in map[string]any) map[string]any {
	if len(in) == 0 {
		return map[string]any{}
	}
	out := make(map[string]any, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}
