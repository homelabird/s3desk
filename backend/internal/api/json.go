package api

import (
	"encoding/json"
	"net/http"

	"object-storage/internal/models"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string, details map[string]any) {
	resp := models.ErrorResponse{
		Error: models.APIError{
			Code:    code,
			Message: message,
			Details: details,
		},
	}
	writeJSON(w, status, resp)
}

func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
