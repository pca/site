package jsonx

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"testing"
)

// testdata/json_parser_errors.json lists request bodies and the parse error
// each must produce.
func TestPyLoadErrors(t *testing.T) {
	raw, err := os.ReadFile("testdata/json_parser_errors.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Input     string  `json:"input"`
		Error     string  `json:"error"`
		Type      string  `json:"type"`
		RegionStr *string `json:"region_str"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		data, _ := base64.StdEncoding.DecodeString(c.Input)
		doc, msg := PyLoadError(data)
		want := c.Error
		if want != "" {
			want = want[len("JSON parse error - "):]
		}
		if msg != want {
			t.Errorf("%q: got error %q, want %q", data, msg, want)
			continue
		}
		if msg != "" || c.RegionStr == nil {
			continue
		}
		var v map[string]json.RawMessage
		if err := json.Unmarshal(doc, &v); err != nil {
			t.Errorf("%q: Go cannot decode accepted input: %v", data, err)
			continue
		}
		if got := PyStr(v["region"]); got != *c.RegionStr {
			t.Errorf("%q: PyStr = %q, want %q", data, got, *c.RegionStr)
		}
	}
}
