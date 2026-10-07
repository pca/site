package static

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ManifestName is the file scripts/build-sites.mjs writes next to the built
// frontends.
const ManifestName = "sites.json"

// SiteSpec is one entry of sites.json.
type SiteSpec struct {
	Name  string `json:"name"`
	Mount string `json:"mount"` // "/" or a path like "/admin"
	SPA   bool   `json:"spa"`   // unknown paths get index.html instead of 404.html
	Dir   string `json:"dir"`   // relative to the manifest
}

// Mounted is a loaded site and the path it is served under.
type Mounted struct {
	Spec SiteSpec
	Site *Site
}

// LoadSites reads dir/sites.json and loads every site it lists.
func LoadSites(dir string) ([]Mounted, error) {
	b, err := os.ReadFile(filepath.Join(dir, ManifestName))
	if err != nil {
		return nil, err
	}
	var specs []SiteSpec
	if err := json.Unmarshal(b, &specs); err != nil {
		return nil, fmt.Errorf("%s: %w", ManifestName, err)
	}
	out := make([]Mounted, 0, len(specs))
	for _, spec := range specs {
		if !strings.HasPrefix(spec.Mount, "/") || strings.Contains(spec.Dir, "..") {
			return nil, fmt.Errorf("%s: invalid entry %q", ManifestName, spec.Name)
		}
		prefix := strings.TrimRight(spec.Mount, "/")
		site, err := Load(filepath.Join(dir, spec.Dir), prefix, spec.SPA)
		if err != nil {
			return nil, fmt.Errorf("site %s: %w", spec.Name, err)
		}
		out = append(out, Mounted{Spec: spec, Site: site})
	}
	return out, nil
}
