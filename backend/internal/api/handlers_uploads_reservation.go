package api

import (
	"context"
	"errors"
	"net/http"

	"s3desk/internal/store"
)

func (s *server) addUploadSessionBytesWithReservation(ctx context.Context, profileID, uploadID string, delta int64) *uploadHTTPError {
	if err := s.store.AddUploadSessionBytesWithinLimit(ctx, profileID, uploadID, delta, s.cfg.UploadMaxBytes); err != nil {
		return uploadReservationError(err, uploadID, s.cfg.UploadMaxBytes, "failed to update upload bytes")
	}
	return nil
}

func (s *server) upsertUploadObjectWithByteReservation(ctx context.Context, obj store.UploadObject) *uploadHTTPError {
	if err := s.store.UpsertUploadObjectWithByteLimit(ctx, obj, s.cfg.UploadMaxBytes); err != nil {
		return uploadReservationError(err, obj.UploadID, s.cfg.UploadMaxBytes, "failed to persist upload object")
	}
	return nil
}

func (s *server) upsertUploadObjectWithByteReservationRollback(ctx context.Context, obj store.UploadObject) (store.UploadObjectReservation, *uploadHTTPError) {
	reservation, err := s.store.UpsertUploadObjectWithByteLimitReservation(ctx, obj, s.cfg.UploadMaxBytes)
	if err != nil {
		return store.UploadObjectReservation{}, uploadReservationError(err, obj.UploadID, s.cfg.UploadMaxBytes, "failed to persist upload object")
	}
	return reservation, nil
}

func (s *server) rollbackUploadObjectByteReservation(ctx context.Context, reservation store.UploadObjectReservation) *uploadHTTPError {
	if err := s.store.RollbackUploadObjectReservation(ctx, reservation); err != nil {
		return uploadReservationError(err, reservation.UploadID, s.cfg.UploadMaxBytes, "failed to roll back upload object reservation")
	}
	return nil
}

func uploadReservationError(err error, uploadID string, maxBytes int64, internalMessage string) *uploadHTTPError {
	if errors.Is(err, store.ErrUploadSessionBytesExceeded) {
		return newUploadTooLargeError("upload exceeds maxBytes", map[string]any{"maxBytes": maxBytes})
	}
	if errors.Is(err, store.ErrUploadSessionNotFound) {
		return &uploadHTTPError{
			status:  http.StatusNotFound,
			code:    "not_found",
			message: "upload session not found",
			details: map[string]any{"uploadId": uploadID},
		}
	}
	return newUploadInternalError(internalMessage, map[string]any{"error": err.Error()})
}
