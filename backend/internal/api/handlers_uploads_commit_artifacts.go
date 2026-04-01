package api

import (
	"path"
	"strings"

	"s3desk/internal/models"
	"s3desk/internal/store"
)

type uploadCommitArtifacts struct {
	payload      map[string]any
	indexEntries []store.ObjectIndexEntry
	progress     *models.JobProgress
}

func buildUploadCommitBasePayload(uploadID string, us store.UploadSession, req uploadCommitRequest) map[string]any {
	payload := map[string]any{
		"uploadId": uploadID,
		"bucket":   us.Bucket,
	}
	if us.Prefix != "" {
		payload["prefix"] = us.Prefix
	}

	if label := strings.TrimSpace(req.Label); label != "" {
		payload["label"] = label
	}
	if rootName := strings.TrimSpace(req.RootName); rootName != "" {
		payload["rootName"] = rootName
	}
	switch req.RootKind {
	case "file", "folder", "collection":
		payload["rootKind"] = req.RootKind
	}
	return payload
}

func buildUploadCommitArtifacts(uploadID string, us store.UploadSession, req uploadCommitRequest) uploadCommitArtifacts {
	payload := buildUploadCommitBasePayload(uploadID, us, req)
	if req.TotalFiles != nil {
		payload["totalFiles"] = *req.TotalFiles
	}
	if req.TotalBytes != nil {
		payload["totalBytes"] = *req.TotalBytes
	}

	items := req.Items
	itemsTruncated := req.ItemsTruncated
	if len(items) > maxCommitItems {
		items = items[:maxCommitItems]
		itemsTruncated = true
	}

	indexEntries := make([]store.ObjectIndexEntry, 0, len(items))
	cleaned := make([]map[string]any, 0, len(items))
	for _, item := range items {
		cleanedPath := sanitizeUploadPath(item.Path)
		if cleanedPath == "" {
			continue
		}
		key := cleanedPath
		if us.Prefix != "" {
			key = path.Join(us.Prefix, cleanedPath)
		}

		entry := map[string]any{
			"path": cleanedPath,
			"key":  key,
		}
		if item.Size != nil && *item.Size >= 0 {
			entry["size"] = *item.Size
			indexEntries = append(indexEntries, store.ObjectIndexEntry{
				Key:  key,
				Size: *item.Size,
			})
		}
		cleaned = append(cleaned, entry)
	}
	if len(cleaned) > 0 {
		payload["items"] = cleaned
	}
	if itemsTruncated {
		payload["itemsTruncated"] = true
	}

	return uploadCommitArtifacts{
		payload:      payload,
		indexEntries: indexEntries,
		progress:     buildUploadCommitProgress(req),
	}
}

func buildUploadCommitProgress(req uploadCommitRequest) *models.JobProgress {
	if req.TotalBytes == nil && req.TotalFiles == nil {
		return nil
	}
	p := models.JobProgress{}
	if req.TotalBytes != nil && *req.TotalBytes >= 0 {
		total := *req.TotalBytes
		p.BytesTotal = &total
		p.BytesDone = &total
	}
	if req.TotalFiles != nil && *req.TotalFiles >= 0 {
		total := int64(*req.TotalFiles)
		p.ObjectsTotal = &total
		p.ObjectsDone = &total
	}
	return &p
}

func buildVerifiedUploadCommitArtifacts(uploadID string, us store.UploadSession, req uploadCommitRequest, verified []verifiedUploadObject, includeTotals bool, itemsTruncated bool) uploadCommitArtifacts {
	payload := buildUploadCommitBasePayload(uploadID, us, req)
	if len(verified) > maxCommitItems {
		itemsTruncated = true
	}

	var totalBytes int64
	indexEntries := make([]store.ObjectIndexEntry, 0, len(verified))
	for _, obj := range verified {
		totalBytes += obj.Size
		indexEntries = append(indexEntries, store.ObjectIndexEntry{
			Key:          obj.Key,
			Size:         obj.Size,
			ETag:         obj.ETag,
			LastModified: obj.LastModified,
		})
	}

	items := verified
	if len(items) > maxCommitItems {
		items = items[:maxCommitItems]
	}
	if len(items) > 0 {
		cleaned := make([]map[string]any, 0, len(items))
		for _, obj := range items {
			cleaned = append(cleaned, map[string]any{
				"path": obj.Path,
				"key":  obj.Key,
				"size": obj.Size,
			})
		}
		payload["items"] = cleaned
	}
	if itemsTruncated {
		payload["itemsTruncated"] = true
	}
	if includeTotals {
		payload["totalFiles"] = len(verified)
		payload["totalBytes"] = totalBytes
	}

	return uploadCommitArtifacts{
		payload:      payload,
		indexEntries: indexEntries,
		progress:     buildVerifiedUploadCommitProgress(len(verified), totalBytes, includeTotals),
	}
}

func buildVerifiedUploadCommitProgress(totalFiles int, totalBytes int64, includeTotals bool) *models.JobProgress {
	if !includeTotals {
		return nil
	}

	files := int64(totalFiles)
	bytes := totalBytes
	return &models.JobProgress{
		ObjectsDone:  &files,
		ObjectsTotal: &files,
		BytesDone:    &bytes,
		BytesTotal:   &bytes,
	}
}
