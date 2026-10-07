// Package static serves a built frontend from memory. Files are read once at
// startup together with their precompressed .br/.gz siblings (gzip is
// generated when the build did not provide one).
package static

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

type file struct {
	data, gz, br []byte
	ctype        string
	etag         string
	cache        string
}

// Site serves the files under one URL prefix ("" for the root).
type Site struct {
	prefix   string
	spa      bool
	files    map[string]*file
	fallback *file
}

// Load reads dir. With spa, unknown extensionless paths get index.html;
// otherwise they get 404.html with a 404 status.
func Load(dir, prefix string, spa bool) (*Site, error) {
	s := &Site{prefix: strings.TrimRight(prefix, "/"), spa: spa, files: map[string]*file{}}
	root := os.DirFS(dir)
	err := fs.WalkDir(root, ".", func(name string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		ext := path.Ext(name)
		if ext == ".br" || ext == ".gz" {
			return nil
		}
		data, err := fs.ReadFile(root, name)
		if err != nil {
			return err
		}
		f := &file{data: data, ctype: contentType(name, data)}
		f.br, _ = fs.ReadFile(root, name+".br")
		f.gz, _ = fs.ReadFile(root, name+".gz")
		if f.gz == nil && len(data) > 512 && compressible(f.ctype) {
			f.gz = gzipBytes(data)
		}
		sum := sha256.Sum256(data)
		f.etag = `"` + hex.EncodeToString(sum[:12]) + `"`
		switch {
		case ext == ".html":
			f.cache = "no-cache"
		case strings.HasPrefix(name, "assets/"):
			f.cache = "public, max-age=31536000, immutable"
		default:
			f.cache = "public, max-age=86400"
		}
		s.files["/"+filepath.ToSlash(name)] = f
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("load %s: %w", dir, err)
	}
	if spa {
		s.fallback = s.files["/index.html"]
		if s.fallback == nil {
			return nil, fmt.Errorf("load %s: index.html is missing", dir)
		}
	} else if s.fallback = s.files["/404.html"]; s.fallback == nil {
		s.fallback = s.files["/404/index.html"]
	}
	return s, nil
}

// Has reports whether urlPath (including the prefix) maps to a page or file.
func (s *Site) Has(urlPath string) bool {
	_, ok := s.lookup(urlPath)
	return ok
}

func (s *Site) lookup(urlPath string) (*file, bool) {
	p, ok := strings.CutPrefix(urlPath, s.prefix)
	if !ok || p != "" && p[0] != '/' {
		return nil, false
	}
	p = path.Clean("/" + p)
	if f := s.files[p]; f != nil {
		return f, true
	}
	if path.Ext(p) == "" {
		if f := s.files[strings.TrimRight(p, "/")+"/index.html"]; f != nil {
			return f, true
		}
		if f := s.files[p+".html"]; f != nil {
			return f, true
		}
	}
	return nil, false
}

func (s *Site) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	status := http.StatusOK
	f, ok := s.lookup(r.URL.Path)
	if !ok {
		isAsset := path.Ext(r.URL.Path) != ""
		switch {
		case s.spa && !isAsset:
			f = s.fallback
		case !s.spa && s.fallback != nil && !isAsset:
			f, status = s.fallback, http.StatusNotFound
		default:
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
	}
	s.write(w, r, f, status)
}

// HasFile reports whether the site has a file at name, e.g. "/maintenance.html".
func (s *Site) HasFile(name string) bool { return s.files[name] != nil }

// ServeFile writes the file at name with status, reporting false when the
// site has no such file.
func (s *Site) ServeFile(w http.ResponseWriter, r *http.Request, name string, status int) bool {
	f := s.files[name]
	if f == nil {
		return false
	}
	s.write(w, r, f, status)
	return true
}

func (s *Site) write(w http.ResponseWriter, r *http.Request, f *file, status int) {
	h := w.Header()
	h.Set("Content-Type", f.ctype)
	h.Set("X-Content-Type-Options", "nosniff")
	body, etag := f.data, f.etag
	if f.gz != nil || f.br != nil {
		h.Add("Vary", "Accept-Encoding")
		accept := r.Header.Get("Accept-Encoding")
		switch {
		case f.br != nil && acceptsEncoding(accept, "br"):
			body, etag = f.br, strings.TrimSuffix(f.etag, `"`)+`-br"`
			h.Set("Content-Encoding", "br")
		case f.gz != nil && acceptsEncoding(accept, "gzip"):
			body, etag = f.gz, strings.TrimSuffix(f.etag, `"`)+`-gz"`
			h.Set("Content-Encoding", "gzip")
		}
	}
	if status == http.StatusOK {
		h.Set("Cache-Control", f.cache)
		h.Set("ETag", etag)
		if match := r.Header.Get("If-None-Match"); match != "" && etagMatches(match, etag) {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	} else {
		h.Set("Cache-Control", "no-cache")
	}
	h.Set("Content-Length", fmt.Sprint(len(body)))
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		w.Write(body)
	}
}

func etagMatches(header, etag string) bool {
	for _, part := range strings.Split(header, ",") {
		part = strings.TrimPrefix(strings.TrimSpace(part), "W/")
		if part == etag || part == "*" {
			return true
		}
	}
	return false
}

func acceptsEncoding(header, enc string) bool {
	for _, part := range strings.Split(header, ",") {
		name, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if !strings.EqualFold(strings.TrimSpace(name), enc) {
			continue
		}
		q := strings.ReplaceAll(params, " ", "")
		return q != "q=0" && q != "q=0.0" && q != "q=0.00" && q != "q=0.000"
	}
	return false
}

func contentType(name string, data []byte) string {
	switch path.Ext(name) {
	case ".html":
		return "text/html; charset=utf-8"
	case ".js", ".mjs":
		return "text/javascript; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".svg":
		return "image/svg+xml"
	case ".json", ".map":
		return "application/json"
	case ".webmanifest":
		return "application/manifest+json"
	case ".txt":
		return "text/plain; charset=utf-8"
	case ".xml":
		return "application/xml"
	case ".woff2":
		return "font/woff2"
	case ".ttf":
		return "font/ttf"
	}
	if t := mime.TypeByExtension(path.Ext(name)); t != "" {
		return t
	}
	return http.DetectContentType(data)
}

func compressible(ctype string) bool {
	return strings.HasPrefix(ctype, "text/") || strings.Contains(ctype, "json") ||
		strings.Contains(ctype, "xml") || strings.Contains(ctype, "javascript") || ctype == "font/ttf"
}

func gzipBytes(data []byte) []byte {
	var buf bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	zw.Write(data)
	zw.Close()
	if buf.Len() >= len(data) {
		return nil
	}
	return buf.Bytes()
}
