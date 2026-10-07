// Package upstream forwards a URL prefix to another backend service, so extra
// services can sit behind the same origin and port as the main API.
package upstream

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// Route forwards requests under Prefix to Target. The path is passed through
// unchanged, so the service sees /prefix/... exactly as the browser sent it.
type Route struct {
	Prefix string
	Target *url.URL
}

// Parse reads "PREFIX=URL" pairs separated by commas, for example
// "/api/shop=http://shop:9000,/shop=http://shop-web:3000".
func Parse(spec string) ([]Route, error) {
	var routes []Route
	for _, part := range strings.Split(spec, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		prefix, target, ok := strings.Cut(part, "=")
		prefix = strings.TrimRight(strings.TrimSpace(prefix), "/")
		if !ok || !strings.HasPrefix(prefix, "/") {
			return nil, fmt.Errorf("upstream %q: want /prefix=http://host:port", part)
		}
		u, err := url.Parse(strings.TrimSpace(target))
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return nil, fmt.Errorf("upstream %q: invalid target URL", part)
		}
		routes = append(routes, Route{Prefix: prefix, Target: u})
	}
	return routes, nil
}

// Handler proxies to the route's target and answers 502 when it is down.
func (r Route) Handler(log *slog.Logger) http.Handler {
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(r.Target)
			pr.SetXForwarded()
			pr.Out.Host = pr.In.Host
		},
		ErrorHandler: func(w http.ResponseWriter, req *http.Request, err error) {
			log.Warn("upstream unavailable", "prefix", r.Prefix, "target", r.Target.String(), "err", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			w.Write([]byte(`{"error":"This service is unavailable."}`))
		},
	}
}
