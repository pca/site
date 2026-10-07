package api

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

// options.json holds the OPTIONS metadata bodies of each endpoint.
//
//go:embed options.json
var optionsJSON []byte

type optionsMeta struct {
	Anonymous     string `json:"anonymous"`
	Authenticated string `json:"authenticated"`
	RequiresAuth  bool   `json:"requires_auth"`
}

var optionsByRoute = func() map[string]optionsMeta {
	var m map[string]optionsMeta
	if err := json.Unmarshal(optionsJSON, &m); err != nil {
		panic(fmt.Sprintf("api: invalid options.json: %v", err))
	}
	return m
}()

func (m optionsMeta) body(authenticated bool) []byte {
	if authenticated && m.Authenticated != "" {
		return []byte(m.Authenticated)
	}
	return []byte(m.Anonymous)
}
