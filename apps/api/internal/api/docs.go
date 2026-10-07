package api

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"net/http"
	"strings"
	"sync"
)

//go:embed openapi.json
var openAPISchema []byte

var openAPIAssets = sync.OnceValue(func() *cached {
	sum := sha256.Sum256(openAPISchema)
	var buf bytes.Buffer
	gz, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	gz.Write(openAPISchema)
	gz.Close()
	return &cached{body: openAPISchema, gz: buf.Bytes(), etag: `"` + hex.EncodeToString(sum[:12]) + `"`}
})

func (s *Server) handleOpenAPI(w http.ResponseWriter, r *http.Request) {
	e := openAPIAssets()
	h := w.Header()
	h.Set("Content-Type", "application/vnd.oai.openapi+json")
	h.Set("ETag", e.etag)
	h.Add("Vary", "Accept-Encoding")
	if strings.Contains(r.Header.Get("If-None-Match"), e.etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	body := e.body
	if acceptsGzip(r) {
		h.Set("Content-Encoding", "gzip")
		body = e.gz
	}
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		w.Write(body)
	}
}

const swaggerHTML = `<!DOCTYPE html>
<html>
  <head>
    <title>PCA API</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="//unpkg.com/swagger-ui-dist@3/favicon-32x32.png">
    <link rel="stylesheet" href="//unpkg.com/swagger-ui-dist@3/swagger-ui.css">
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *:after, *:before { box-sizing: inherit; }
      body { background: #fafafa; margin: 0; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="//unpkg.com/swagger-ui-dist@3/swagger-ui-bundle.js"></script>
    <script src="//unpkg.com/swagger-ui-dist@3/swagger-ui-standalone-preset.js"></script>
    <script>
    "use strict";
    const ui = SwaggerUIBundle({
      url: "/openapi.json",
      dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis],
      layout: "BaseLayout",
      deepLinking: true,
      persistAuthorization: true,
      defaultModelsExpandDepth: 2,
      showExtensions: true,
      showCommonExtensions: true,
    });
    ui.initOAuth({});
    </script>
  </body>
</html>
`

func (s *Server) handleDocs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		w.Write([]byte(swaggerHTML))
	}
}
