package api

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"s3desk/internal/azureacl"
	"s3desk/internal/gcsiam"
	"s3desk/internal/models"
)

func (s *server) handleValidateBucketPolicy(w http.ResponseWriter, r *http.Request) {
	newBucketPolicyValidateHTTPService(s).handleValidateBucketPolicy(w, r)
}

func validateBucketPolicyStatic(provider models.ProfileProvider, bucket string, policy any) (errs []string, warns []string) {
	switch provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible:
		return validateS3BucketPolicyStatic(bucket, policy)
	case models.ProfileProviderGcpGcs:
		return validateGCSIamPolicyStatic(policy)
	case models.ProfileProviderAzureBlob:
		return validateAzureContainerPolicyStatic(policy)
	default:
		return []string{"policy is not supported for this provider"}, nil
	}
}

func validateS3BucketPolicyStatic(bucket string, policy any) (errs []string, warns []string) {
	obj, ok := policy.(map[string]any)
	if !ok {
		return []string{"S3 policy must be a JSON object"}, nil
	}

	// Version (optional but recommended)
	if v, ok := obj["Version"]; ok {
		if version, ok := v.(string); !ok || (version != "2008-10-17" && version != "2012-10-17") {
			errs = append(errs, "S3 policy Version must be 2008-10-17 or 2012-10-17")
		}
	} else {
		warns = append(warns, "S3 policy should include a Version string (e.g. 2012-10-17)")
	}

	st, hasStmt := obj["Statement"]
	if !hasStmt {
		errs = append(errs, "S3 policy Statement is required")
		return errs, warns
	}

	// Normalize Statement to a slice.
	var statements []any
	switch t := st.(type) {
	case []any:
		statements = t
	case map[string]any:
		warns = append(warns, "S3 policy Statement is an object; it is usually an array")
		statements = []any{t}
	default:
		errs = append(errs, "S3 policy Statement must be an array (or object)")
		return errs, warns
	}

	for i, stmtRaw := range statements {
		stmt, ok := stmtRaw.(map[string]any)
		if !ok {
			errs = append(errs, "S3 policy Statement entries must be objects")
			continue
		}

		if effect, ok := stmt["Effect"].(string); !ok || (effect != "Allow" && effect != "Deny") {
			errs = append(errs, "S3 policy Statement "+itoa(i)+".Effect is required and must be Allow or Deny (case-sensitive)")
		}

		for _, field := range []string{"Action", "Resource", "Principal"} {
			_, positive := stmt[field]
			_, negative := stmt["Not"+field]
			if positive == negative {
				errs = append(errs, "S3 policy Statement "+itoa(i)+" must include exactly one of "+field+" or Not"+field)
			}
		}

		for _, field := range []string{"Action", "NotAction", "Resource", "NotResource"} {
			if value, present := stmt[field]; present && !isPolicyStringList(value) {
				errs = append(errs, "S3 policy Statement "+itoa(i)+"."+field+" must be a non-empty string or array of non-empty strings")
			}
		}
		for _, field := range []string{"Principal", "NotPrincipal"} {
			value, present := stmt[field]
			if !present {
				continue
			}
			if wildcard, ok := value.(string); ok && wildcard == "*" {
				continue
			}
			principals, ok := value.(map[string]any)
			if !ok || len(principals) == 0 {
				errs = append(errs, "S3 policy Statement "+itoa(i)+"."+field+" must be * or a non-empty principal map")
				continue
			}
			for kind, ids := range principals {
				switch kind {
				case "AWS", "Service", "Federated", "CanonicalUser":
				default:
					errs = append(errs, "S3 policy Statement "+itoa(i)+"."+field+" contains an unsupported principal type: "+kind)
				}
				if !isPolicyStringList(ids) {
					errs = append(errs, "S3 policy Statement "+itoa(i)+"."+field+"."+kind+" must be a non-empty string or array of non-empty strings")
				}
			}
		}

		if raw, present := stmt["Condition"]; present {
			conditions, ok := raw.(map[string]any)
			if !ok || len(conditions) == 0 {
				errs = append(errs, "S3 policy Statement.Condition must be a non-empty object")
			}
			for operator, rawKeys := range conditions {
				keys, ok := rawKeys.(map[string]any)
				if strings.TrimSpace(operator) == "" || !ok || len(keys) == 0 {
					errs = append(errs, "S3 policy Condition operators must name non-empty condition key objects")
					continue
				}
				for key, value := range keys {
					values, array := value.([]any)
					if !array {
						values = []any{value}
					}
					if strings.TrimSpace(key) == "" || len(values) == 0 {
						errs = append(errs, "S3 policy Condition keys and value lists must not be empty")
					}
					for _, item := range values {
						switch item.(type) {
						case string, float64, int, bool:
						default:
							errs = append(errs, "S3 policy Condition values must be strings, numbers, booleans, or arrays of these values")
						}
					}
				}
			}
		}

		// Bucket-aware resource lint.
		if res, ok := stmt["Resource"]; ok {
			resources := extractStringList(res)
			if bucket != "" {
				for _, r := range resources {
					if resource, ok := strings.CutPrefix(r, "arn:aws:s3:::"); ok && resource != bucket && !strings.HasPrefix(resource, bucket+"/") {
						warns = append(warns, "Statement "+itoa(i)+" Resource does not explicitly reference this bucket: "+r)
					}
				}
			}
		}
	}

	return errs, warns
}

func validateGCSIamPolicyStatic(policy any) (errs []string, warns []string) {
	obj, ok := policy.(map[string]any)
	if !ok {
		return []string{"GCS IAM policy must be a JSON object"}, nil
	}

	version := float64(0)
	if raw, present := obj["version"]; present {
		var numeric bool
		version, numeric = raw.(float64)
		if integer, ok := raw.(int); ok {
			version, numeric = float64(integer), true
		}
		if !numeric || (version != 0 && version != 1 && version != 3) {
			errs = append(errs, "GCS IAM policy version must be the integer 0, 1, or 3")
		}
	}

	if et, ok := obj["etag"]; !ok {
		errs = append(errs, "GCS IAM policy edits require the loaded policy etag; reload the policy before saving")
	} else {
		if s, ok := et.(string); !ok || strings.TrimSpace(s) == "" {
			errs = append(errs, "GCS IAM policy etag must be a non-empty string when provided")
		}
	}

	b, ok := obj["bindings"]
	if !ok {
		return []string{"GCS IAM policy must include bindings"}, warns
	}
	bindings, ok := b.([]any)
	if !ok {
		return []string{"GCS IAM policy bindings must be an array"}, warns
	}
	for _, br := range bindings {
		bm, ok := br.(map[string]any)
		if !ok {
			errs = append(errs, "GCS IAM policy binding must be an object")
			continue
		}
		if rawCondition, present := bm["condition"]; present {
			if version != 3 {
				errs = append(errs, "GCS IAM conditions require policy version 3")
			}
			if err := gcsiam.ValidateCondition(rawCondition); err != nil {
				errs = append(errs, err.Error())
			}
		}
		role, ok := bm["role"].(string)
		if !ok || strings.TrimSpace(role) == "" {
			errs = append(errs, "GCS IAM policy binding.role must be a non-empty string")
		}
		membersRaw, ok := bm["members"]
		if !ok {
			errs = append(errs, "GCS IAM policy binding.members is required")
			continue
		}
		members, ok := membersRaw.([]any)
		if !ok {
			errs = append(errs, "GCS IAM policy binding.members must be an array of strings")
			continue
		}
		if len(members) == 0 {
			errs = append(errs, "GCS IAM policy binding.members must include at least one member")
		}
		for _, member := range members {
			m, ok := member.(string)
			if !ok || strings.TrimSpace(m) == "" {
				errs = append(errs, "GCS IAM policy binding.members entries must be non-empty strings")
				continue
			}
			if m == "allUsers" || m == "allAuthenticatedUsers" {
				warns = append(warns, "GCS IAM policy grants public access via "+m+" (review carefully)")
			}
		}
	}
	return errs, warns
}

func validateAzureContainerPolicyStatic(policy any) (errs []string, warns []string) {
	obj, ok := policy.(map[string]any)
	if !ok {
		return []string{"Azure container policy must be a JSON object"}, nil
	}

	for field := range obj {
		if field != "publicAccess" && field != "storedAccessPolicies" {
			errs = append(errs, "Azure policy contains unsupported field: "+field)
		}
	}

	pa := "private"
	if v, ok := obj["publicAccess"]; ok {
		if s, ok := v.(string); ok {
			pa = strings.ToLower(strings.TrimSpace(s))
		} else {
			errs = append(errs, "Azure publicAccess must be a string")
		}
	} else {
		errs = append(errs, "Azure publicAccess is required; specify private explicitly to disable public access")
	}
	if pa != "private" && pa != "blob" && pa != "container" {
		errs = append(errs, "Azure publicAccess must be one of: private, blob, container")
	}

	polRaw, ok := obj["storedAccessPolicies"]
	if !ok {
		errs = append(errs, "Azure storedAccessPolicies is required; specify an empty array explicitly to remove stored policies")
		return errs, warns
	}
	pols, ok := polRaw.([]any)
	if !ok {
		errs = append(errs, "Azure storedAccessPolicies must be an array")
		return errs, warns
	}
	if len(pols) > 5 {
		errs = append(errs, "Azure allows a maximum of 5 stored access policies")
	}

	seenIDs := make(map[string]bool)
	for _, pr := range pols {
		pm, ok := pr.(map[string]any)
		if !ok {
			errs = append(errs, "Azure storedAccessPolicies entries must be objects")
			continue
		}
		for field := range pm {
			if field != "id" && field != "start" && field != "expiry" && field != "permission" {
				errs = append(errs, "Azure stored access policy contains unsupported field: "+field)
			}
		}
		id, _ := pm["id"].(string)
		id = strings.TrimSpace(id)
		if id == "" {
			errs = append(errs, "Azure stored access policy id is required")
		}
		if utf8.RuneCountInString(id) > 64 {
			errs = append(errs, "Azure stored access policy id must not exceed 64 characters")
		}
		if seenIDs[id] {
			errs = append(errs, "Azure stored access policy ids must be unique")
		}
		seenIDs[id] = true

		for _, field := range []string{"start", "expiry", "permission"} {
			if value, present := pm[field]; present {
				if _, ok := value.(string); !ok {
					errs = append(errs, "Azure stored access policy "+field+" must be a string when provided")
				}
			}
		}

		if start, ok := pm["start"].(string); ok && strings.TrimSpace(start) != "" {
			if err := azureacl.ValidateStoredPolicyTime(strings.TrimSpace(start)); err != nil {
				errs = append(errs, "Azure stored access policy start must be an ISO 8601 date or timestamp with timezone (e.g. 2026-01-14T00:00:00Z)")
			}
		}
		if exp, ok := pm["expiry"].(string); ok && strings.TrimSpace(exp) != "" {
			if err := azureacl.ValidateStoredPolicyTime(strings.TrimSpace(exp)); err != nil {
				errs = append(errs, "Azure stored access policy expiry must be an ISO 8601 date or timestamp with timezone (e.g. 2026-01-15T00:00:00Z)")
			}
		}
		if perm, ok := pm["permission"].(string); ok {
			if err := azureacl.ValidateStoredPolicyPermission(perm); err != nil {
				errs = append(errs, err.Error())
			}
		}
	}
	return errs, warns
}

func extractStringList(v any) []string {
	out := []string{}
	switch t := v.(type) {
	case string:
		if strings.TrimSpace(t) != "" {
			out = append(out, strings.TrimSpace(t))
		}
	case []any:
		for _, it := range t {
			if s, ok := it.(string); ok {
				s = strings.TrimSpace(s)
				if s != "" {
					out = append(out, s)
				}
			}
		}
	}
	return out
}

func itoa(i int) string {
	// local small helper to avoid pulling strconv into this file.
	if i == 0 {
		return "0"
	}
	neg := false
	if i < 0 {
		neg = true
		i = -i
	}
	buf := [32]byte{}
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + (i % 10))
		i /= 10
	}
	if neg {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}

func isPolicyStringList(value any) bool {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v) != ""
	case []any:
		if len(v) == 0 {
			return false
		}
		for _, item := range v {
			if text, ok := item.(string); !ok || strings.TrimSpace(text) == "" {
				return false
			}
		}
		return true
	default:
		return false
	}
}
