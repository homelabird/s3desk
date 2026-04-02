package api

import "net/http"

type uploadCommitRequest struct {
	Label          string             `json:"label,omitempty"`
	RootName       string             `json:"rootName,omitempty"`
	RootKind       string             `json:"rootKind,omitempty"`
	TotalFiles     *int               `json:"totalFiles,omitempty"`
	TotalBytes     *int64             `json:"totalBytes,omitempty"`
	Items          []uploadCommitItem `json:"items,omitempty"`
	ItemsTruncated bool               `json:"itemsTruncated,omitempty"`
}

type uploadCommitItem struct {
	Path string `json:"path"`
	Size *int64 `json:"size,omitempty"`
}

func (s *server) handleCommitUpload(w http.ResponseWriter, r *http.Request) {
	session, uploadErr := s.loadUploadCommitSession(r)
	if uploadErr != nil {
		writeError(w, uploadErr.status, uploadErr.code, uploadErr.message, uploadErr.details)
		return
	}
	req, err := decodeUploadCommitRequest(r)
	if err != nil {
		writeJSONDecodeError(w, err, uploadCommitJSONRequestBodyMaxBytes)
		return
	}
	s.dispatchUploadCommit(w, r, session, req)
}
