package api

import (
	"context"
	"net/http"

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
	trackedObjects, err := s.store.ListUploadObjects(ctx, profileID, uploadID)
	if err != nil {
		return uploadCommitVerificationPlan{}, &uploadHTTPError{
			status:  http.StatusInternalServerError,
			code:    "internal_error",
			message: "failed to load upload objects",
		}
	}

	targets := mergeUploadVerificationTargets(
		buildUploadVerificationTargetsFromTracked(trackedObjects),
		buildUploadVerificationTargetsFromMultipart(multipartUploads),
	)
	plan := uploadCommitVerificationPlan{
		targets:       targets,
		includeTotals: true,
	}
	if len(plan.targets) == 0 {
		plan.targets = buildUploadVerificationTargetsFromRequest(us, req)
		plan.includeTotals = !req.ItemsTruncated
		plan.itemsTruncated = req.ItemsTruncated
	}
	if len(plan.targets) == 0 {
		return uploadCommitVerificationPlan{}, &uploadHTTPError{
			status:  http.StatusBadRequest,
			code:    "upload_incomplete",
			message: "no uploaded objects to commit",
		}
	}

	return plan, nil
}
