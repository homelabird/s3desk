package azureblob

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"s3desk/internal/azureutil"
	"s3desk/internal/models"
	"s3desk/internal/objectlisting"
	"s3desk/internal/responsebody"
)

type HTTPStatusError struct{ StatusCode int }

func (e *HTTPStatusError) Error() string {
	return fmt.Sprintf("Azure Blob API returned HTTP %d", e.StatusCode)
}

func ListBlobsPage(ctx context.Context, profile models.ProfileSecrets, input objectlisting.Request, allowRemote bool) (objectlisting.Page, error) {
	baseURL, accountName, accountKey, err := azureutil.ResolveBlobCredentials(profile)
	if err != nil {
		return objectlisting.Page{}, err
	}
	u := *baseURL
	u.Path = strings.TrimRight(u.Path, "/") + "/" + url.PathEscape(input.Bucket)
	query := u.Query()
	query.Set("restype", "container")
	query.Set("comp", "list")
	query.Set("maxresults", strconv.Itoa(input.MaxKeys))
	if input.Prefix != "" {
		query.Set("prefix", input.Prefix)
	}
	if input.Delimiter != "" {
		query.Set("delimiter", input.Delimiter)
	}
	if input.ContinuationToken != "" {
		query.Set("marker", input.ContinuationToken)
	}
	u.RawQuery = query.Encode()
	client, err := azureutil.NewHTTPClient(profile, allowRemote)
	if err != nil {
		return objectlisting.Page{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return objectlisting.Page{}, err
	}
	req.Header.Set("x-ms-date", time.Now().UTC().Format(http.TimeFormat))
	req.Header.Set("x-ms-version", "2020-10-02")
	authorization, err := azureutil.BuildSharedKeyAuthorization(req, accountName, accountKey)
	if err != nil {
		return objectlisting.Page{}, err
	}
	req.Header.Set("Authorization", authorization)
	resp, err := client.Do(req)
	if err != nil {
		return objectlisting.Page{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return objectlisting.Page{}, &HTTPStatusError{StatusCode: resp.StatusCode}
	}
	body, err := responsebody.ReadAll(resp.Body, responsebody.ControlPlaneMaxBytes)
	if err != nil {
		return objectlisting.Page{}, err
	}
	var result struct {
		Blobs struct {
			Items []struct {
				Name       string `xml:"Name"`
				Properties struct {
					ContentLength string `xml:"Content-Length"`
					ETag          string `xml:"Etag"`
					LastModified  string `xml:"Last-Modified"`
				} `xml:"Properties"`
			} `xml:"Blob"`
			Prefixes []struct {
				Name string `xml:"Name"`
			} `xml:"BlobPrefix"`
		} `xml:"Blobs"`
		NextMarker string `xml:"NextMarker"`
	}
	if err := xml.Unmarshal(body, &result); err != nil {
		return objectlisting.Page{}, objectlisting.ErrInvalidPage
	}
	page := objectlisting.Page{NextToken: result.NextMarker, IsTruncated: result.NextMarker != ""}
	for _, prefix := range result.Blobs.Prefixes {
		if prefix.Name == "" {
			return objectlisting.Page{}, objectlisting.ErrInvalidPage
		}
		page.CommonPrefixes = append(page.CommonPrefixes, prefix.Name)
	}
	for _, blob := range result.Blobs.Items {
		size, err := strconv.ParseInt(blob.Properties.ContentLength, 10, 64)
		if err != nil || size < 0 || blob.Name == "" {
			return objectlisting.Page{}, objectlisting.ErrInvalidPage
		}
		modified := ""
		if raw := strings.TrimSpace(blob.Properties.LastModified); raw != "" {
			value, err := http.ParseTime(raw)
			if err != nil {
				return objectlisting.Page{}, objectlisting.ErrInvalidPage
			}
			modified = value.UTC().Format(time.RFC3339Nano)
		}
		page.Items = append(page.Items, models.ObjectItem{Key: blob.Name, Size: size, ETag: strings.TrimSpace(blob.Properties.ETag), LastModified: modified})
	}
	return page, nil
}
