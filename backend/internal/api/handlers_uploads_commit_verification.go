package api

import (
	"path"

	"s3desk/internal/store"
)

type uploadVerificationTarget struct {
	Path         string
	Bucket       string
	Key          string
	ExpectedSize *int64
}

type verifiedUploadObject struct {
	Path         string
	Key          string
	Size         int64
	ETag         string
	LastModified string
}

func buildUploadVerificationTargetsFromTracked(objects []store.UploadObject) []uploadVerificationTarget {
	targets := make([]uploadVerificationTarget, 0, len(objects))
	for _, obj := range objects {
		if obj.Path == "" || obj.Bucket == "" || obj.ObjectKey == "" {
			continue
		}
		targets = append(targets, uploadVerificationTarget{
			Path:         obj.Path,
			Bucket:       obj.Bucket,
			Key:          obj.ObjectKey,
			ExpectedSize: obj.ExpectedSize,
		})
	}
	return targets
}

func buildUploadVerificationTargetsFromMultipart(multipartUploads []store.MultipartUpload) []uploadVerificationTarget {
	targets := make([]uploadVerificationTarget, 0, len(multipartUploads))
	for _, meta := range multipartUploads {
		if meta.Path == "" || meta.Bucket == "" || meta.ObjectKey == "" {
			continue
		}
		expectedSize := meta.FileSize
		targets = append(targets, uploadVerificationTarget{
			Path:         meta.Path,
			Bucket:       meta.Bucket,
			Key:          meta.ObjectKey,
			ExpectedSize: &expectedSize,
		})
	}
	return targets
}

func buildUploadVerificationTargetsFromRequest(us store.UploadSession, req uploadCommitRequest) []uploadVerificationTarget {
	targets := make([]uploadVerificationTarget, 0, len(req.Items))
	for _, item := range req.Items {
		cleanedPath := sanitizeUploadPath(item.Path)
		if cleanedPath == "" {
			continue
		}

		key := cleanedPath
		if us.Prefix != "" {
			key = path.Join(us.Prefix, cleanedPath)
		}

		var expectedSize *int64
		if item.Size != nil && *item.Size >= 0 {
			size := *item.Size
			expectedSize = &size
		}
		targets = append(targets, uploadVerificationTarget{
			Path:         cleanedPath,
			Bucket:       us.Bucket,
			Key:          key,
			ExpectedSize: expectedSize,
		})
	}
	return targets
}
