package wcaimport

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"strconv"
)

// tsvReader tokenizes WCA export TSVs the way pandas.read_csv(sep="\t") does
// with its defaults: a field that starts with a double quote is quoted
// (doubled quotes escape, tabs and newlines may appear inside); quotes
// elsewhere are literal; blank lines are skipped.
//
// Returned fields alias internal buffers and are valid until the next call.
type tsvReader struct {
	r      *bufio.Reader
	fields [][]byte
	record []byte
	ends   []int
	header map[string]int
	line   int
}

func newTSVReader(r io.Reader) (*tsvReader, error) {
	t := &tsvReader{r: bufio.NewReaderSize(r, 1<<20)}
	head, err := t.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}
	t.header = make(map[string]int, len(head))
	for i, h := range head {
		t.header[string(h)] = i
	}
	return t, nil
}

// columns resolves column names to indexes.
func (t *tsvReader) columns(names ...string) ([]int, error) {
	idx := make([]int, len(names))
	for i, n := range names {
		j, ok := t.header[n]
		if !ok {
			return nil, fmt.Errorf("missing column %q", n)
		}
		idx[i] = j
	}
	return idx, nil
}

func (t *tsvReader) readLine() ([]byte, error) {
	line, err := t.r.ReadSlice('\n')
	if errors.Is(err, bufio.ErrBufferFull) {
		buf := append([]byte(nil), line...)
		for errors.Is(err, bufio.ErrBufferFull) {
			line, err = t.r.ReadSlice('\n')
			buf = append(buf, line...)
		}
		line = buf
	}
	if err == io.EOF && len(line) > 0 {
		err = nil
	}
	t.line++
	return line, err
}

func trimEOL(b []byte) []byte {
	if n := len(b); n > 0 && b[n-1] == '\n' {
		b = b[:n-1]
	}
	if n := len(b); n > 0 && b[n-1] == '\r' {
		b = b[:n-1]
	}
	return b
}

func (t *tsvReader) Read() ([][]byte, error) {
	for {
		raw, err := t.readLine()
		if err != nil {
			return nil, err
		}
		line := trimEOL(raw)
		if len(line) == 0 {
			continue
		}
		if bytes.IndexByte(line, '"') < 0 {
			t.fields = t.fields[:0]
			for {
				i := bytes.IndexByte(line, '\t')
				if i < 0 {
					t.fields = append(t.fields, line)
					break
				}
				t.fields = append(t.fields, line[:i])
				line = line[i+1:]
			}
			return t.fields, nil
		}
		return t.readQuoted(raw)
	}
}

const (
	stStartField = iota
	stInField
	stInQuoted
	stQuoteInQuoted
)

func (t *tsvReader) readQuoted(raw []byte) ([][]byte, error) {
	t.record = t.record[:0]
	t.ends = t.ends[:0]
	state := stStartField
	endField := func() {
		t.ends = append(t.ends, len(t.record))
		state = stStartField
	}
	for {
		for i := 0; i < len(raw); i++ {
			c := raw[i]
			switch state {
			case stStartField, stInField:
				switch {
				case c == '"' && state == stStartField:
					state = stInQuoted
				case c == '\t':
					endField()
				case c == '\n' || (c == '\r' && (i+1 == len(raw) || raw[i+1] == '\n')):
					endField()
					return t.split(), nil
				default:
					t.record = append(t.record, c)
					state = stInField
				}
			case stInQuoted:
				if c == '"' {
					state = stQuoteInQuoted
				} else {
					t.record = append(t.record, c)
				}
			case stQuoteInQuoted:
				switch {
				case c == '"':
					t.record = append(t.record, '"')
					state = stInQuoted
				case c == '\t':
					endField()
				case c == '\n' || c == '\r':
					endField()
					return t.split(), nil
				default:
					t.record = append(t.record, c)
					state = stInField
				}
			}
		}
		// The record continues past this physical line only inside quotes.
		next, err := t.readLine()
		if err != nil {
			if errors.Is(err, io.EOF) {
				if state == stInQuoted {
					return nil, fmt.Errorf("line %d: unterminated quoted field", t.line)
				}
				endField()
				return t.split(), nil
			}
			return nil, err
		}
		raw = next
	}
}

func (t *tsvReader) split() [][]byte {
	t.fields = t.fields[:0]
	start := 0
	for _, end := range t.ends {
		t.fields = append(t.fields, t.record[start:end])
		start = end
	}
	return t.fields
}

// pandasNA lists the strings pandas.read_csv reads as missing by default.
var pandasNA = map[string]bool{
	"": true, "#N/A": true, "#N/A N/A": true, "#NA": true, "-1.#IND": true, "-1.#QNAN": true, "-NaN": true,
	"-nan": true, "1.#IND": true, "1.#QNAN": true, "<NA>": true, "N/A": true, "NA": true, "NULL": true,
	"NaN": true, "None": true, "n/a": true, "nan": true, "null": true,
}

// text reads a text column: missing values become NULL.
func text(b []byte) *string {
	if pandasNA[string(b)] {
		return nil
	}
	s := string(b)
	return &s
}

func integer(b []byte) (int64, error) {
	n, err := strconv.ParseInt(string(b), 10, 64)
	if err != nil {
		// pandas reads integer columns containing missing values as floats.
		f, ferr := strconv.ParseFloat(string(b), 64)
		if ferr != nil || f != float64(int64(f)) {
			return 0, fmt.Errorf("invalid integer %q", b)
		}
		return int64(f), nil
	}
	return n, nil
}

func optionalInt(b []byte) (*int64, error) {
	if pandasNA[string(b)] {
		return nil, nil
	}
	n, err := integer(b)
	if err != nil {
		return nil, err
	}
	return &n, nil
}
