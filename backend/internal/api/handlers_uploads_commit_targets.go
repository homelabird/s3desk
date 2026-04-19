package api

import (
	"context"

	"s3desk/internal/store"
)

type uploadCommitVerificationPlan struct {
	targets        []uploadVerificationTarget
	includeTotals  bool
	itemsTruncated bool
}

func mergeUploadVerificationTargets(groups ...[]uploadVerificationTarget) []uploadVerificationTarget {
	merged := make([]uploadVerificationTarget, 0)
	seen := make(map[string]struct{})
	for _, group := range groups {
		for _, target := range group {
			identity := target.Path
			if identity == "" {
				identity = target.Key
			}
			if identity == "" {
				continue
			}
			if _, exists := seen[identity]; exists {
				continue
			}
			seen[identity] = struct{}{}
			merged = append(merged, target)
		}
	}
	return merged
}

func (s *server) buildImmediateUploadVerificationPlan(
	ctx context.Context,
	profileID, uploadID string,
	us store.UploadSession,
	req uploadCommitRequest,
	multipartUploads []store.MultipartUpload,
) (uploadCommitVerificationPlan, *uploadHTTPError) {
	return newUploadCommitVerificationService(s).buildPlan(ctx, profileID, uploadID, us, req, multipartUploads)
}
