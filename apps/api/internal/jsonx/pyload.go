package jsonx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"strconv"
	"strings"
)

// PyLoadError validates a JSON request body (UTF-8 stream decoding, then a
// strict JSON scan) and returns the parse error message of the API contract,
// or "" with the decoded document when the input is valid.
func PyLoadError(data []byte) (doc []byte, msg string) {
	doc, msg = pyDecodeUTF8(data)
	if msg != "" {
		return nil, msg
	}
	s := []rune(string(doc))
	if len(s) > 0 && s[0] == '\ufeff' {
		return nil, pyErr("Unexpected UTF-8 BOM (decode using utf-8-sig)", s, 0)
	}
	p := &pyScanner{s: s}
	idx := p.ws(0)
	end, err := p.scan(idx)
	if err != "" {
		return nil, err
	}
	if end = p.ws(end); end != len(s) {
		return nil, pyErr("Extra data", s, end)
	}
	return doc, ""
}

// pyDecodeUTF8 mirrors codecs.StreamReader.read() for UTF-8: strict errors,
// with an incomplete trailing sequence silently dropped (final=False).
func pyDecodeUTF8(b []byte) ([]byte, string) {
	inRange := func(c byte, lo, hi byte) bool { return c >= lo && c <= hi }
	for i := 0; i < len(b); {
		c := b[i]
		if c < 0x80 {
			i++
			continue
		}
		var n int
		lo, hi := byte(0x80), byte(0xBF)
		switch {
		case inRange(c, 0xC2, 0xDF):
			n = 2
		case inRange(c, 0xE0, 0xEF):
			n = 3
			if c == 0xE0 {
				lo = 0xA0
			} else if c == 0xED {
				hi = 0x9F
			}
		case inRange(c, 0xF0, 0xF4):
			n = 4
			if c == 0xF0 {
				lo = 0x90
			} else if c == 0xF4 {
				hi = 0x8F
			}
		default:
			return nil, fmt.Sprintf("'utf-8' codec can't decode byte 0x%02x in position %d: invalid start byte", c, i)
		}
		for k := 1; k < n; k++ {
			if i+k >= len(b) {
				return b[:i], ""
			}
			ok := inRange(b[i+k], 0x80, 0xBF)
			if k == 1 {
				ok = inRange(b[i+k], lo, hi)
			}
			if !ok {
				if k == 1 {
					return nil, fmt.Sprintf("'utf-8' codec can't decode byte 0x%02x in position %d: invalid continuation byte", c, i)
				}
				return nil, fmt.Sprintf("'utf-8' codec can't decode bytes in position %d-%d: invalid continuation byte", i, i+k-1)
			}
		}
		i += n
	}
	return b, ""
}

func pyErr(msg string, s []rune, pos int) string {
	line, lastNL := 1, -1
	for i := 0; i < pos && i < len(s); i++ {
		if s[i] == '\n' {
			line++
			lastNL = i
		}
	}
	return fmt.Sprintf("%s: line %d column %d (char %d)", msg, line, pos-lastNL, pos)
}

type pyScanner struct{ s []rune }

func (p *pyScanner) ws(i int) int {
	for i < len(p.s) && (p.s[i] == ' ' || p.s[i] == '\t' || p.s[i] == '\n' || p.s[i] == '\r') {
		i++
	}
	return i
}

func (p *pyScanner) has(i int, lit string) bool {
	r := []rune(lit)
	if i+len(r) > len(p.s) {
		return false
	}
	for k, c := range r {
		if p.s[i+k] != c {
			return false
		}
	}
	return true
}

// scan mirrors scan_once_unicode; "Expecting value" is the StopIteration path.
func (p *pyScanner) scan(i int) (int, string) {
	if i >= len(p.s) {
		return 0, pyErr("Expecting value", p.s, i)
	}
	switch c := p.s[i]; {
	case c == '"':
		return p.str(i + 1)
	case c == '{':
		return p.object(i + 1)
	case c == '[':
		return p.array(i + 1)
	case c == 'n' && p.has(i, "null"):
		return i + 4, ""
	case c == 't' && p.has(i, "true"):
		return i + 4, ""
	case c == 'f' && p.has(i, "false"):
		return i + 5, ""
	case c == 'N' && p.has(i, "NaN"):
		return 0, "Out of range float values are not JSON compliant: 'NaN'"
	case c == 'I' && p.has(i, "Infinity"):
		return 0, "Out of range float values are not JSON compliant: 'Infinity'"
	case c == '-' && p.has(i, "-Infinity"):
		return 0, "Out of range float values are not JSON compliant: '-Infinity'"
	}
	return p.number(i)
}

func isDigit(c rune) bool { return c >= '0' && c <= '9' }

func (p *pyScanner) number(start int) (int, string) {
	s, i, last := p.s, start, len(p.s)-1
	if s[i] == '-' {
		i++
		if i > last {
			return 0, pyErr("Expecting value", s, start)
		}
	}
	switch {
	case s[i] >= '1' && s[i] <= '9':
		i++
		for i <= last && isDigit(s[i]) {
			i++
		}
	case s[i] == '0':
		i++
	default:
		return 0, pyErr("Expecting value", s, start)
	}
	if i < last && s[i] == '.' && isDigit(s[i+1]) {
		i += 2
		for i <= last && isDigit(s[i]) {
			i++
		}
	}
	if i < last && (s[i] == 'e' || s[i] == 'E') {
		eStart := i
		i++
		if i < last && (s[i] == '-' || s[i] == '+') {
			i++
		}
		for i <= last && isDigit(s[i]) {
			i++
		}
		if !isDigit(s[i-1]) {
			i = eStart
		}
	}
	return i, ""
}

func isHex(c rune) bool {
	return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

// str mirrors scanstring_unicode; begin is the index after the opening quote.
func (p *pyScanner) str(end int) (int, string) {
	s, begin := p.s, end-1
	for {
		next := end
		var c rune
		for ; next < len(s); next++ {
			c = s[next]
			if c == '"' || c == '\\' {
				break
			}
			if c <= 0x1f {
				return 0, pyErr("Invalid control character at", s, next)
			}
		}
		if next == len(s) {
			return 0, pyErr("Unterminated string starting at", s, begin)
		}
		if c == '"' {
			return next + 1, ""
		}
		next++
		if next == len(s) {
			return 0, pyErr("Unterminated string starting at", s, begin)
		}
		c = s[next]
		if c != 'u' {
			end = next + 1
			if !strings.ContainsRune(`"\/bfnrt`, c) {
				return 0, pyErr("Invalid \\escape", s, end-2)
			}
			continue
		}
		next++
		end = next + 4
		if end >= len(s) {
			return 0, pyErr("Invalid \\uXXXX escape", s, next-1)
		}
		var u rune
		for ; next < end; next++ {
			if !isHex(s[next]) {
				return 0, pyErr("Invalid \\uXXXX escape", s, end-5)
			}
			h, _ := strconv.ParseUint(string(s[next]), 16, 8)
			u = u<<4 | rune(h)
		}
		if u >= 0xD800 && u <= 0xDBFF && end+6 < len(s) && s[next] == '\\' && s[next+1] == 'u' {
			next += 2
			end = next + 4
			for ; next < end; next++ {
				if !isHex(s[next]) {
					return 0, pyErr("Invalid \\uXXXX escape", s, end-5)
				}
			}
		}
	}
}

func (p *pyScanner) object(i int) (int, string) {
	s := p.s
	i = p.ws(i)
	if i >= len(s) || s[i] != '}' {
		for {
			if i >= len(s) || s[i] != '"' {
				return 0, pyErr("Expecting property name enclosed in double quotes", s, i)
			}
			next, err := p.str(i + 1)
			if err != "" {
				return 0, err
			}
			i = p.ws(next)
			if i >= len(s) || s[i] != ':' {
				return 0, pyErr("Expecting ':' delimiter", s, i)
			}
			i = p.ws(i + 1)
			if i, err = p.scan(i); err != "" {
				return 0, err
			}
			i = p.ws(i)
			if i < len(s) && s[i] == '}' {
				break
			}
			if i >= len(s) || s[i] != ',' {
				return 0, pyErr("Expecting ',' delimiter", s, i)
			}
			i = p.ws(i + 1)
		}
	}
	return i + 1, ""
}

func (p *pyScanner) array(i int) (int, string) {
	s := p.s
	i = p.ws(i)
	if i >= len(s) || s[i] != ']' {
		for {
			var err string
			if i, err = p.scan(i); err != "" {
				return 0, err
			}
			i = p.ws(i)
			if i < len(s) && s[i] == ']' {
				break
			}
			if i >= len(s) || s[i] != ',' {
				return 0, pyErr("Expecting ',' delimiter", s, i)
			}
			i = p.ws(i + 1)
		}
	}
	return i + 1, ""
}

// PyStr formats one raw JSON value like Python's str() of what json.loads
// would have produced (dicts keep insertion order, the last duplicate key
// winning in its first position).
func PyStr(raw []byte) string {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	tok, err := dec.Token()
	if err != nil {
		return string(raw)
	}
	if s, ok := tok.(string); ok {
		return s
	}
	return pyRepr(dec, tok)
}

func pyRepr(dec *json.Decoder, tok json.Token) string {
	switch v := tok.(type) {
	case nil:
		return "None"
	case bool:
		if v {
			return "True"
		}
		return "False"
	case string:
		return pyStrRepr(v)
	case json.Number:
		return PyNumber(v)
	case json.Delim:
		var parts []string
		if v == '[' {
			for dec.More() {
				t, _ := dec.Token()
				parts = append(parts, pyRepr(dec, t))
			}
			dec.Token()
			return "[" + strings.Join(parts, ", ") + "]"
		}
		index := map[string]int{}
		for dec.More() {
			k, _ := dec.Token()
			key := k.(string)
			t, _ := dec.Token()
			item := pyStrRepr(key) + ": " + pyRepr(dec, t)
			if i, ok := index[key]; ok {
				parts[i] = item
				continue
			}
			index[key] = len(parts)
			parts = append(parts, item)
		}
		dec.Token()
		return "{" + strings.Join(parts, ", ") + "}"
	}
	return fmt.Sprint(tok)
}

// PyNumber renders a JSON number as Python's str(int) or str(float).
func PyNumber(n json.Number) string {
	s := n.String()
	if !strings.ContainsAny(s, ".eE") {
		if i, ok := new(big.Int).SetString(s, 10); ok {
			return i.String()
		}
		return s
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil && !math.IsInf(f, 0) {
		return s
	}
	switch {
	case math.IsInf(f, 1):
		return "inf"
	case math.IsInf(f, -1):
		return "-inf"
	}
	return PyRepr(f)
}

func pyStrRepr(s string) string {
	quote := byte('\'')
	if strings.ContainsRune(s, '\'') && !strings.ContainsRune(s, '"') {
		quote = '"'
	}
	var b strings.Builder
	b.WriteByte(quote)
	for _, r := range s {
		switch {
		case r == rune(quote) || r == '\\':
			b.WriteByte('\\')
			b.WriteRune(r)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r < 0x20 || r == 0x7f:
			fmt.Fprintf(&b, `\x%02x`, r)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte(quote)
	return b.String()
}
