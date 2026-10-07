// Package jsonx renders the API's JSON: compact and without ASCII escaping.
package jsonx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Marshal encodes v compactly without HTML escaping.
func Marshal(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func MustMarshal(v any) []byte {
	b, err := Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

// String returns the JSON encoding of s.
func String(s string) []byte {
	return MustMarshal(s)
}

// PyFloat marshals the shortest round-trip form and always keeps a decimal
// point (e.g. 100.0, 33.333333333333336).
type PyFloat float64

func (f PyFloat) MarshalJSON() ([]byte, error) {
	return []byte(PyRepr(float64(f))), nil
}

func PyRepr(v float64) string {
	switch {
	case math.IsNaN(v):
		return "NaN"
	case math.IsInf(v, 1):
		return "Infinity"
	case math.IsInf(v, -1):
		return "-Infinity"
	}
	if v == 0 {
		if math.Signbit(v) {
			return "-0.0"
		}
		return "0.0"
	}
	exp := int(math.Floor(math.Log10(math.Abs(v))))
	// Recompute the decimal exponent from the shortest representation to
	// avoid Log10 rounding at powers of ten.
	sci := strconv.FormatFloat(v, 'e', -1, 64)
	if i := strings.IndexByte(sci, 'e'); i >= 0 {
		if e, err := strconv.Atoi(sci[i+1:]); err == nil {
			exp = e
		}
	}
	if exp < -4 || exp >= 16 {
		mant, e, _ := strings.Cut(sci, "e")
		n, _ := strconv.Atoi(e)
		sign := "+"
		if n < 0 {
			sign = "-"
			n = -n
		}
		return fmt.Sprintf("%se%s%02d", mant, sign, n)
	}
	s := strconv.FormatFloat(v, 'f', -1, 64)
	if !strings.ContainsAny(s, ".") {
		s += ".0"
	}
	return s
}

// Normalize re-encodes stored JSON compactly while preserving key order, so
// ASCII-escaped, spaced values render like the rest of the API's output.
func Normalize(raw []byte) ([]byte, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var out bytes.Buffer
	if err := normalizeValue(dec, &out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func normalizeValue(dec *json.Decoder, out *bytes.Buffer) error {
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			out.WriteByte('{')
			first := true
			for dec.More() {
				keyTok, err := dec.Token()
				if err != nil {
					return err
				}
				if !first {
					out.WriteByte(',')
				}
				first = false
				out.Write(String(keyTok.(string)))
				out.WriteByte(':')
				if err := normalizeValue(dec, out); err != nil {
					return err
				}
			}
			if _, err := dec.Token(); err != nil {
				return err
			}
			out.WriteByte('}')
		case '[':
			out.WriteByte('[')
			first := true
			for dec.More() {
				if !first {
					out.WriteByte(',')
				}
				first = false
				if err := normalizeValue(dec, out); err != nil {
					return err
				}
			}
			if _, err := dec.Token(); err != nil {
				return err
			}
			out.WriteByte(']')
		}
	case string:
		out.Write(String(t))
	case json.Number:
		out.WriteString(t.String())
	case bool:
		if t {
			out.WriteString("true")
		} else {
			out.WriteString("false")
		}
	case nil:
		out.WriteString("null")
	}
	return nil
}

// PyCanonical encodes v with sorted keys, "," and ":" separators and non-ASCII
// characters escaped, the form content hashes are computed over. Maps are
// sorted by encoding/json, so v should use map[string]any for objects.
func PyCanonical(v any) ([]byte, error) {
	b, err := Marshal(v)
	if err != nil {
		return nil, err
	}
	return asciiEscape(b), nil
}

// PyDumps encodes v with ", " and ": " separators and non-ASCII characters
// escaped, which is how JSON columns are stored. Key order follows v, so use
// structs or *Object to control it.
func PyDumps(v any) ([]byte, error) {
	b, err := Marshal(v)
	if err != nil {
		return nil, err
	}
	out := make([]byte, 0, len(b)+len(b)/4)
	inString, escaped := false, false
	for _, c := range b {
		out = append(out, c)
		switch {
		case inString:
			switch {
			case escaped:
				escaped = false
			case c == '\\':
				escaped = true
			case c == '"':
				inString = false
			}
		case c == '"':
			inString = true
		case c == ',' || c == ':':
			out = append(out, ' ')
		}
	}
	return asciiEscape(out), nil
}

func asciiEscape(b []byte) []byte {
	var out bytes.Buffer
	out.Grow(len(b))
	for len(b) > 0 {
		r, size := utf8.DecodeRune(b)
		if r < utf8.RuneSelf {
			out.WriteByte(b[0])
		} else if r > 0xFFFF {
			r -= 0x10000
			fmt.Fprintf(&out, "\\u%04x\\u%04x", 0xD800+(r>>10), 0xDC00+(r&0x3FF))
		} else {
			fmt.Fprintf(&out, "\\u%04x", r)
		}
		b = b[size:]
	}
	return out.Bytes()
}

// Object is an insertion-ordered JSON object.
type Object struct {
	keys   []string
	values map[string]any
}

func NewObject() *Object {
	return &Object{values: map[string]any{}}
}

func (o *Object) Set(key string, value any) {
	if _, ok := o.values[key]; !ok {
		o.keys = append(o.keys, key)
	}
	o.values[key] = value
}

func (o *Object) Get(key string) (any, bool) {
	v, ok := o.values[key]
	return v, ok
}

func (o *Object) Len() int { return len(o.keys) }

func (o *Object) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range o.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		buf.Write(String(k))
		buf.WriteByte(':')
		v, err := Marshal(o.values[k])
		if err != nil {
			return nil, err
		}
		buf.Write(v)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}
