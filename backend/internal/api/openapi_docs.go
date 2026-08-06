package api

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
)

const openAPIDocsNoncePlaceholder = "__S3DESK_DOCS_NONCE__"

const openAPIDocsContentSecurityPolicy = "base-uri 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:; object-src 'none'; style-src 'self' 'unsafe-inline' https://unpkg.com; script-src 'self' https://unpkg.com 'nonce-"

const openAPIDocsHTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>S3Desk API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>
    html, body { height: 100%; margin: 0; padding: 0; }
    #swagger-ui { height: 100%; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js"></script>
  <script nonce="__S3DESK_DOCS_NONCE__">
    window.addEventListener('load', function () {
      var specUrl = new URL('/openapi.yml', window.location.href).toString();
      SwaggerUIBundle({
        url: specUrl,
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'StandaloneLayout'
      });
    });
  </script>
</body>
</html>
`

func serveOpenAPIDocs(w http.ResponseWriter, r *http.Request) {
	var nonceBytes [16]byte
	if _, err := rand.Read(nonceBytes[:]); err != nil {
		http.Error(w, "failed to prepare API docs", http.StatusInternalServerError)
		return
	}
	nonce := base64.RawStdEncoding.EncodeToString(nonceBytes[:])
	w.Header().Set("Content-Security-Policy", openAPIDocsContentSecurityPolicy+nonce+"'")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	html := strings.Replace(openAPIDocsHTML, openAPIDocsNoncePlaceholder, nonce, 1)
	_, _ = w.Write([]byte(html))
}
