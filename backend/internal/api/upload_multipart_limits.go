package api

import "fmt"

const maxMultipartUploadParts = 10_000

func expectedMultipartPartCount(fileSize, chunkSize int64) (int, error) {
	if fileSize <= 0 {
		return 0, fmt.Errorf("fileSize must be positive")
	}
	if chunkSize <= 0 {
		return 0, fmt.Errorf("chunkSize must be positive")
	}
	count := fileSize / chunkSize
	if fileSize%chunkSize != 0 {
		count++
	}
	if count < 1 || count > int64(maxMultipartUploadParts) {
		return 0, fmt.Errorf("multipart upload exceeds %d parts", maxMultipartUploadParts)
	}
	return int(count), nil
}

func multipartPartNumber(number int) (int32, error) {
	if number < 1 || number > maxMultipartUploadParts {
		return 0, fmt.Errorf("invalid multipart part number %d", number)
	}
	return int32(number), nil
}
