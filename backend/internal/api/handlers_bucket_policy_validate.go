package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"s3desk/internal/models"
)

func (s *server) handleValidateBucketPolicy(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := strings.TrimSpace(chi.URLParam(r, "bucket"))
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	var req models.BucketPolicyPutRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}

	if len(req.Policy) == 0 || strings.TrimSpace(string(req.Policy)) == "" {
		writeJSON(w, http.StatusOK, models.BucketPolicyValidateResponse{
			Ok:       false,
			Provider: secrets.Provider,
			Errors:   []string{"policy is required"},
		})
		return
	}

	var raw any
	if err := json.Unmarshal(req.Policy, &raw); err != nil {
		writeJSON(w, http.StatusOK, models.BucketPolicyValidateResponse{
			Ok:       false,
			Provider: secrets.Provider,
			Errors:   []string{"policy must be valid JSON"},
			Warnings: []string{err.Error()},
		})
		return
	}

	errs, warns := validateBucketPolicyStatic(secrets.Provider, bucket, raw)
	writeJSON(w, http.StatusOK, models.BucketPolicyValidateResponse{
		Ok:       len(errs) == 0,
		Provider: secrets.Provider,
		Errors:   errs,
		Warnings: warns,
	})
}

func validateBucketPolicyStatic(provider models.ProfileProvider, bucket string, policy any) (errs []string, warns []string) {
	switch provider {
	case models.ProfileProviderAwsS3, models.ProfileProviderS3Compatible, models.ProfileProviderOciS3Compat:
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
		if _, ok := v.(string); !ok {
			errs = append(errs, "S3 policy Version must be a string")
		}
	} else {
		warns = append(warns, "S3 policy should include a Version string (e.g. 2012-10-17)")
	}

	st, hasStmt := obj["Statement"]
	if !hasStmt {
		warns = append(warns, "S3 policy has no Statement; it will not grant any permissions")
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

		if eff, ok := stmt["Effect"]; ok {
			if s, ok := eff.(string); !ok || strings.TrimSpace(s) == "" {
				errs = append(errs, "S3 policy Statement.Effect must be a non-empty string")
			}
		} else {
			warns = append(warns, "S3 policy Statement is missing Effect")
		}

		// Action / Resource / Principal are provider-validated, but we can lint common mistakes.
		if _, ok := stmt["Action"]; !ok {
			warns = append(warns, "S3 policy Statement is missing Action")
		}
		if _, ok := stmt["Resource"]; !ok {
			warns = append(warns, "S3 policy Statement is missing Resource")
		}
		if _, ok := stmt["Principal"]; !ok {
			warns = append(warns, "S3 policy Statement is missing Principal")
		}

		// Bucket-aware resource lint.
		if res, ok := stmt["Resource"]; ok {
			resources := extractStringList(res)
			if bucket != "" {
				for _, r := range resources {
					if strings.Contains(r, "arn:aws:s3:::") && !strings.Contains(r, ":::"+bucket) {
						warns = append(warns, "Statement "+itoa(i)+" Resource does not reference this bucket: "+r)
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

	if et, ok := obj["etag"]; !ok {
		warns = append(warns, "GCS IAM policy usually includes an etag. Preserve it to avoid update conflicts.")
	} else {
		if s, ok := et.(string); !ok || strings.TrimSpace(s) == "" {
			warns = append(warns, "GCS IAM policy etag should be a non-empty string")
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
		role, ok := bm["role"].(string)
		if !ok || strings.TrimSpace(role) == "" {
			errs = append(errs, "GCS IAM policy binding.role must be a non-empty string")
		}
		membersRaw, ok := bm["members"]
		if !ok {
			errs = append(errs, "GCS IAM policy binding.members is required")
			continue
		}
		members := extractStringList(membersRaw)
		if len(members) == 0 {
			warns = append(warns, "GCS IAM policy binding has no members")
		}
		for _, m := range members {
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

	pa := "private"
	if v, ok := obj["publicAccess"]; ok {
		if s, ok := v.(string); ok {
			pa = strings.ToLower(strings.TrimSpace(s))
		} else {
			errs = append(errs, "Azure publicAccess must be a string")
		}
	} else {
		warns = append(warns, "Azure policy publicAccess is missing; it defaults to private")
	}
	if pa == "" {
		pa = "private"
	}
	if pa != "private" && pa != "blob" && pa != "container" {
		errs = append(errs, "Azure publicAccess must be one of: private, blob, container")
	}

	polRaw, ok := obj["storedAccessPolicies"]
	if !ok {
		warns = append(warns, "Azure storedAccessPolicies is missing; it defaults to an empty list")
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

	permRe := regexp.MustCompile(`^[rwdlacup]*$`)
	for _, pr := range pols {
		pm, ok := pr.(map[string]any)
		if !ok {
			errs = append(errs, "Azure storedAccessPolicies entries must be objects")
			continue
		}
		id, _ := pm["id"].(string)
		id = strings.TrimSpace(id)
		if id == "" {
			errs = append(errs, "Azure stored access policy id is required")
		}
		if len(id) > 64 {
			warns = append(warns, "Azure stored access policy id is long; Azure recommends <= 64 chars")
		}

		if start, ok := pm["start"].(string); ok && strings.TrimSpace(start) != "" {
			if _, err := time.Parse(time.RFC3339, strings.TrimSpace(start)); err != nil {
				errs = append(errs, "Azure stored access policy start must be RFC3339 (e.g. 2026-01-14T00:00:00Z)")
			}
		}
		if exp, ok := pm["expiry"].(string); ok && strings.TrimSpace(exp) != "" {
			if _, err := time.Parse(time.RFC3339, strings.TrimSpace(exp)); err != nil {
				errs = append(errs, "Azure stored access policy expiry must be RFC3339 (e.g. 2026-01-15T00:00:00Z)")
			}
		}
		if perm, ok := pm["permission"].(string); ok {
			p := strings.ToLower(strings.TrimSpace(perm))
			if p != "" && !permRe.MatchString(p) {
				errs = append(errs, "Azure stored access policy permission must be a combination of r,w,d,l,a,c,u,p")
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
