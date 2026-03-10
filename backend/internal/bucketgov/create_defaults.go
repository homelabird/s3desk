package bucketgov

import (
	"context"
	"errors"
	"strings"

	"s3desk/internal/models"
)

type CreateDefaultsApplyError struct {
	Section string
	Err     error
}

func (e *CreateDefaultsApplyError) Error() string {
	if e == nil {
		return ""
	}
	if e.Section == "" {
		return "failed to apply bucket create defaults"
	}
	return "failed to apply bucket create defaults for section " + e.Section
}

func (e *CreateDefaultsApplyError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func ValidateCreateDefaults(provider models.ProfileProvider, defaults *models.BucketCreateDefaults) error {
	if defaults == nil {
		return nil
	}
	validationCtx := newValidationContext(provider, "")
	if !hasCreateDefaults(defaults) {
		return InvalidFieldError("defaults", "defaults must include at least one setting", map[string]any{
			"section": "create-defaults",
		})
	}
	if defaults.PublicExposure != nil {
		if err := ValidatePublicExposurePut(validationCtx, *defaults.PublicExposure); err != nil {
			return prefixOperationErrorField(err, "defaults.publicExposure")
		}
	}
	if defaults.Access != nil {
		if isEmptyAccessPut(*defaults.Access) {
			return InvalidFieldError("defaults.access", "defaults.access must include at least one setting", map[string]any{
				"section": "create-defaults",
			})
		}
		if err := ValidateAccessPut(validationCtx, *defaults.Access); err != nil {
			return prefixOperationErrorField(err, "defaults.access")
		}
	}
	if defaults.Versioning != nil {
		if err := ValidateVersioningPut(validationCtx, *defaults.Versioning); err != nil {
			return prefixOperationErrorField(err, "defaults.versioning")
		}
	}
	if defaults.Encryption != nil {
		if err := ValidateEncryptionPut(validationCtx, *defaults.Encryption); err != nil {
			return prefixOperationErrorField(err, "defaults.encryption")
		}
	}
	return nil
}

func ApplyCreateDefaults(ctx context.Context, svc *Service, profile models.ProfileSecrets, bucket string, defaults *models.BucketCreateDefaults) error {
	if defaults == nil {
		return nil
	}
	if svc == nil {
		return &OperationError{
			Status:  500,
			Code:    "bucket_governance_unavailable",
			Message: "bucket governance service is unavailable",
		}
	}
	bucket = strings.TrimSpace(bucket)
	if defaults.PublicExposure != nil {
		if err := svc.PutPublicExposure(ctx, profile, bucket, *defaults.PublicExposure); err != nil {
			return &CreateDefaultsApplyError{Section: "publicExposure", Err: err}
		}
	}
	if defaults.Access != nil {
		if err := svc.PutAccess(ctx, profile, bucket, *defaults.Access); err != nil {
			return &CreateDefaultsApplyError{Section: "access", Err: err}
		}
	}
	if defaults.Versioning != nil {
		if err := svc.PutVersioning(ctx, profile, bucket, *defaults.Versioning); err != nil {
			return &CreateDefaultsApplyError{Section: "versioning", Err: err}
		}
	}
	if defaults.Encryption != nil {
		if err := svc.PutEncryption(ctx, profile, bucket, *defaults.Encryption); err != nil {
			return &CreateDefaultsApplyError{Section: "encryption", Err: err}
		}
	}
	return nil
}

func hasCreateDefaults(defaults *models.BucketCreateDefaults) bool {
	if defaults == nil {
		return false
	}
	return defaults.Access != nil ||
		defaults.PublicExposure != nil ||
		defaults.Versioning != nil ||
		defaults.Encryption != nil
}

func isEmptyAccessPut(req models.BucketAccessPutRequest) bool {
	return req.ObjectOwnership == nil &&
		len(req.Bindings) == 0 &&
		strings.TrimSpace(req.ETag) == "" &&
		len(req.StoredAccessPolicies) == 0
}

func prefixOperationErrorField(err error, prefix string) error {
	if strings.TrimSpace(prefix) == "" {
		return err
	}
	var opErr *OperationError
	if !errors.As(err, &opErr) || opErr == nil {
		return err
	}
	cloned := &OperationError{
		Status:  opErr.Status,
		Code:    opErr.Code,
		Message: opErr.Message,
		Details: cloneDetails(opErr.Details),
	}
	field, _ := cloned.Details["field"].(string)
	field = strings.TrimSpace(field)
	if field == "" {
		cloned.Details["field"] = prefix
	} else {
		cloned.Details["field"] = prefix + "." + field
	}
	return cloned
}
