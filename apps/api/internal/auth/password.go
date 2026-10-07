// Package auth implements PBKDF2 password hashing ("algorithm$iterations$salt$hash")
// and the WCA OAuth login flow.
package auth

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"hash"
	"strconv"
	"strings"
)

const PBKDF2Iterations = 1_000_000

const saltChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func salt() string {
	b := make([]byte, 22)
	rand.Read(b)
	for i := range b {
		b[i] = saltChars[int(b[i])%len(saltChars)]
	}
	return string(b)
}

// HashPassword returns a pbkdf2_sha256 hash.
func HashPassword(password string) (string, error) {
	s := salt()
	key, err := pbkdf2.Key(sha256.New, password, []byte(s), PBKDF2Iterations, sha256.Size)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("pbkdf2_sha256$%d$%s$%s", PBKDF2Iterations, s, base64.StdEncoding.EncodeToString(key)), nil
}

// UsablePassword reports whether encoded can ever match a password; unusable
// passwords start with "!".
func UsablePassword(encoded string) bool {
	return encoded != "" && !strings.HasPrefix(encoded, "!")
}

// CheckPassword verifies a pbkdf2_sha256 or pbkdf2_sha1 hash.
func CheckPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 {
		return false
	}
	var h func() hash.Hash
	var size int
	switch parts[0] {
	case "pbkdf2_sha256":
		h, size = sha256.New, sha256.Size
	case "pbkdf2_sha1":
		h, size = sha1.New, sha1.Size
	default:
		return false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations <= 0 {
		return false
	}
	want, err := base64.StdEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}
	got, err := pbkdf2.Key(h, password, []byte(parts[2]), iterations, size)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}
