// Package timefmt reads and writes the API's datetime formats: naive UTC text
// in SQLite, Asia/Manila ISO 8601 in serialized fields, and UTC "Z" ISO 8601
// in JSON-encoded values.
package timefmt

import (
	"fmt"
	"strings"
	"time"
	_ "time/tzdata"
)

var Manila = mustLoad("Asia/Manila")

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.FixedZone(name, 8*3600)
	}
	return loc
}

// Now returns the current UTC time truncated to the stored microsecond precision.
func Now() time.Time {
	return time.Now().UTC().Truncate(time.Microsecond)
}

var dbLayouts = []string{
	"2006-01-02 15:04:05.999999999",
	"2006-01-02T15:04:05.999999999",
	"2006-01-02 15:04:05.999999999Z07:00",
	"2006-01-02T15:04:05.999999999Z07:00",
	"2006-01-02",
}

// ParseDB parses a datetime stored in SQLite (naive UTC).
func ParseDB(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	for _, layout := range dbLayouts {
		if t, err := time.ParseInLocation(layout, s, time.UTC); err == nil {
			return t.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("timefmt: cannot parse %q", s)
}

// FormatDB renders a naive UTC time as "YYYY-MM-DD HH:MM:SS[.ffffff]".
func FormatDB(t time.Time) string {
	t = t.UTC()
	if us := t.Nanosecond() / 1000; us != 0 {
		return t.Format("2006-01-02 15:04:05") + fmt.Sprintf(".%06d", us)
	}
	return t.Format("2006-01-02 15:04:05")
}

func isoformat(t time.Time) string {
	base := t.Format("2006-01-02T15:04:05")
	if us := t.Nanosecond() / 1000; us != 0 {
		base += fmt.Sprintf(".%06d", us)
	}
	offset := t.Format("-07:00")
	if offset == "+00:00" {
		return base + "Z"
	}
	return base + offset
}

// Serializer formats a serialized datetime field (Asia/Manila offset).
func Serializer(t time.Time) string {
	return isoformat(t.In(Manila))
}

// Encoder formats a datetime embedded in JSON values (UTC, "Z" suffix).
func Encoder(t time.Time) string {
	return isoformat(t.UTC())
}

// LocalYear is the current calendar year in Asia/Manila.
func LocalYear() int {
	return time.Now().In(Manila).Year()
}
