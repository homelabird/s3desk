package api

func uploadMultipartRequiredFieldError(field string) *uploadHTTPError {
	return newUploadBadRequestError(field+" is required", nil)
}

func uploadMultipartInvalidFieldError(message string, details map[string]any) *uploadHTTPError {
	return newUploadBadRequestError(message, details)
}

func uploadMultipartSessionRequiredError() *uploadHTTPError {
	return newUploadBadRequestError("profile and uploadId are required", nil)
}

func uploadMultipartInvalidPartNumberError(partNumber int) *uploadHTTPError {
	return newUploadBadRequestError("invalid part number", map[string]any{"partNumber": partNumber})
}

func uploadMultipartInvalidETagError(partNumber int) *uploadHTTPError {
	return newUploadBadRequestError("etag is required", map[string]any{"partNumber": partNumber})
}

func uploadMultipartInvalidChunkCountError(totalRaw string) *uploadHTTPError {
	return newUploadBadRequestError("invalid total", map[string]any{"total": totalRaw})
}

func uploadMultipartInvalidChunkSizeError(chunkSizeRaw string) *uploadHTTPError {
	return newUploadBadRequestError("invalid chunkSize", map[string]any{"chunkSize": chunkSizeRaw})
}

func uploadMultipartInvalidFileSizeError(fileSizeRaw string) *uploadHTTPError {
	return newUploadBadRequestError("invalid fileSize", map[string]any{"fileSize": fileSizeRaw})
}

func uploadMultipartInvalidPathError() *uploadHTTPError {
	return uploadMultipartRequiredFieldError("path")
}

func uploadMultipartInvalidPartsError() *uploadHTTPError {
	return newUploadBadRequestError("parts are required", nil)
}
