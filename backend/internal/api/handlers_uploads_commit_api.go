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
	newUploadCommitHTTPService(s).handleCommitUpload(w, r)
}
