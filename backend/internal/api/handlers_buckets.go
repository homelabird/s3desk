package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
	smithyhttp "github.com/aws/smithy-go/transport/http"
	"github.com/go-chi/chi/v5"

	"object-storage/internal/models"
	"object-storage/internal/s3client"
)

func (s *server) handleListBuckets(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	client, err := s3client.New(r.Context(), secrets)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_profile", "failed to configure s3 client", map[string]any{"error": err.Error()})
		return
	}

	out, err := client.ListBuckets(r.Context(), &s3.ListBucketsInput{})
	if err != nil {
		writeError(w, http.StatusBadRequest, "s3_error", "failed to list buckets", map[string]any{"error": err.Error()})
		return
	}

	resp := make([]models.Bucket, 0, len(out.Buckets))
	for _, b := range out.Buckets {
		item := models.Bucket{Name: aws.ToString(b.Name)}
		if b.CreationDate != nil {
			item.CreatedAt = b.CreationDate.UTC().Format(time.RFC3339Nano)
		}
		resp = append(resp, item)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleCreateBucket(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	var req models.BucketCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "invalid request body", map[string]any{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Region = strings.TrimSpace(req.Region)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket name is required", nil)
		return
	}

	client, err := s3client.New(r.Context(), secrets)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_profile", "failed to configure s3 client", map[string]any{"error": err.Error()})
		return
	}

	region := secrets.Region
	if req.Region != "" {
		region = req.Region
	}

	in := &s3.CreateBucketInput{
		Bucket: aws.String(req.Name),
	}
	if region != "" && region != "us-east-1" {
		in.CreateBucketConfiguration = &types.CreateBucketConfiguration{
			LocationConstraint: types.BucketLocationConstraint(region),
		}
	}

	if _, err := client.CreateBucket(r.Context(), in); err != nil {
		writeError(w, http.StatusBadRequest, "s3_error", "failed to create bucket", map[string]any{"error": err.Error()})
		return
	}

	resp := models.Bucket{
		Name:      req.Name,
		CreatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (s *server) handleDeleteBucket(w http.ResponseWriter, r *http.Request) {
	secrets, ok := profileFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_profile", "profile is required", nil)
		return
	}

	bucket := chi.URLParam(r, "bucket")
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "bucket is required", nil)
		return
	}

	client, err := s3client.New(r.Context(), secrets)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_profile", "failed to configure s3 client", map[string]any{"error": err.Error()})
		return
	}

	_, err = client.DeleteBucket(r.Context(), &s3.DeleteBucketInput{Bucket: aws.String(bucket)})
	if err != nil {
		if isBucketNotEmpty(err) {
			writeError(w, http.StatusConflict, "bucket_not_empty", "bucket is not empty; delete objects first", map[string]any{"bucket": bucket})
			return
		}
		if isBucketNotFound(err) {
			writeError(w, http.StatusNotFound, "not_found", "bucket not found", map[string]any{"bucket": bucket})
			return
		}
		writeError(w, http.StatusBadRequest, "s3_error", "failed to delete bucket", map[string]any{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func isBucketNotEmpty(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return apiErr.ErrorCode() == "BucketNotEmpty"
	}
	return false
}

func isBucketNotFound(err error) bool {
	var re *smithyhttp.ResponseError
	if errors.As(err, &re) {
		if re.HTTPStatusCode() == http.StatusNotFound {
			return true
		}
	}

	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		code := apiErr.ErrorCode()
		return code == "NoSuchBucket" || code == "NotFound"
	}
	return false
}
