// Package wcaformat renders WCA result values. The rendered strings, edge
// cases included, are part of the public API contract.
package wcaformat

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/pca/backend/internal/jsonx"
)

const (
	DNF      = -1
	DNS      = -2
	NoResult = 0
)

// Ao5Events are scored as an average of five.
var Ao5Events = map[string]bool{
	"333": true, "222": true, "444": true, "555": true, "333oh": true,
	"clock": true, "minx": true, "pyram": true, "skewb": true, "sq1": true,
}

// parseTime mirrors parse_time(timedelta(seconds=micro/1e6), hide_ms).
func parseTime(micro int64, hideMs bool) string {
	totalSeconds := (micro / 1_000_000) % 86400
	us := micro % 1_000_000
	minutes, seconds := totalSeconds/60, totalSeconds%60
	hours, minutes := minutes/60, minutes%60

	parts := make([]string, 0, 3)
	if hours != 0 {
		parts = append(parts, strconv.FormatInt(hours, 10))
	}
	if minutes != 0 {
		parts = append(parts, strconv.FormatInt(minutes, 10))
	}
	switch {
	case seconds != 0:
		ms := ".00"
		if us != 0 {
			ms = fmt.Sprintf(".%02d", us/10000)
		}
		if hideMs {
			ms = ""
		}
		if minutes != 0 {
			parts = append(parts, fmt.Sprintf("%02d%s", seconds, ms))
		} else {
			parts = append(parts, fmt.Sprintf("%d%s", seconds, ms))
		}
	case hideMs:
		parts = append(parts, "00")
	case us != 0:
		if minutes != 0 {
			parts = append(parts, "00."+strconv.FormatInt(us/10000, 10))
		} else {
			parts = append(parts, "0."+strconv.FormatInt(us/10000, 10))
		}
	}
	return strings.Join(parts, ":")
}

func str(s string) *string { return &s }

// Value mirrors parse_value(value, format, rank_type). average selects the
// "average" rank type; any other rank type behaves identically to "best".
func Value(value int, format string, average bool) *string {
	switch value {
	case DNF:
		return str("DNF")
	case DNS:
		return str("DNS")
	case NoResult:
		return nil
	}
	switch format {
	case "time":
		return str(parseTime(int64(value)*10000, false))
	case "number":
		if average {
			return str(jsonx.PyRepr(float64(value) / 100))
		}
		return str(strconv.Itoa(value))
	case "multi":
		return multi(value)
	}
	return nil
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

func multi(value int) *string {
	v := strconv.Itoa(value)
	if len(v) == 9 {
		difference := 99 - atoi(v[0:2])
		seconds := 0
		if v[2:7] != "99999" {
			seconds = atoi(v[2:7])
		}
		missed := atoi(v[7:])
		solved := difference + missed
		total := solved + missed
		if seconds != 0 {
			return str(fmt.Sprintf("%d/%d %s", solved, total, parseTime(int64(seconds)*1_000_000, true)))
		}
	}
	if len(v) == 10 && v[0] == '1' {
		solved := 99 - atoi(v[1:3])
		total := atoi(v[3:5])
		seconds := 0
		if v[2:7] != "99999" {
			seconds = atoi(v[2:7])
		}
		if seconds != 0 {
			return str(fmt.Sprintf("%d/%d %s", solved, total, parseTime(int64(seconds)*10000, true)))
		}
	}
	return nil
}

// Solves mirrors parse_solves(result, rank_type).
func Solves(values [5]int, average int, eventID, format string, rankAverage bool) [5]*string {
	if rankAverage && average != DNF && Ao5Events[eventID] {
		return ao5Solves(values, format)
	}
	var out [5]*string
	for i, v := range values {
		out[i] = Value(v, format, false)
	}
	return out
}

func minOf(values []int) int {
	m := values[0]
	for _, v := range values[1:] {
		if v < m {
			m = v
		}
	}
	return m
}

func maxOf(values []int) int {
	m := values[0]
	for _, v := range values[1:] {
		if v > m {
			m = v
		}
	}
	return m
}

// ao5Solves mirrors parse_ao5_solves, including list.pop(min_solve), which
// pops by the negative DNF/DNS value used as an index.
func ao5Solves(values [5]int, format string) [5]*string {
	solves := values[:]
	minSolve := minOf(solves)
	var maxSolve int
	if minSolve == DNS || minSolve == DNF {
		maxSolve = minSolve
		complete := make([]int, 0, 4)
		popIndex := len(solves) + minSolve
		for i, v := range solves {
			if i != popIndex {
				complete = append(complete, v)
			}
		}
		minSolve = minOf(complete)
	} else {
		maxSolve = maxOf(solves)
	}

	var out [5]*string
	minRemoved, maxRemoved := false, false
	for i, solve := range solves {
		value := Value(solve, format, false)
		text := "None"
		if value != nil {
			text = *value
		}
		switch {
		case solve == minSolve && !minRemoved:
			out[i] = str("(" + text + ")")
			minRemoved = true
		case solve == maxSolve && !maxRemoved:
			out[i] = str("(" + text + ")")
			maxRemoved = true
		default:
			out[i] = value
		}
	}
	return out
}
