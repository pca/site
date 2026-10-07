package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/pca/backend/internal/auth"
	"github.com/pca/backend/internal/jsonx"
	"github.com/pca/backend/internal/regions"
	"github.com/pca/backend/internal/store"
	"github.com/pca/backend/internal/timefmt"
)

// field is a parsed request value: missing, null, or a primitive.
type field struct {
	present bool
	null    bool
	value   any
	// raw is the JSON text of the value; nil for form fields.
	raw []byte
}

// pyStr is the field rendered as text for validation messages.
func (f field) pyStr() string {
	if f.raw == nil {
		s, _ := f.value.(string)
		return s
	}
	return jsonx.PyStr(f.raw)
}

// serializerNonObject answers a JSON body that is not an object with a
// non_field_errors validation error.
func serializerNonObject(w http.ResponseWriter, r *http.Request, raw any) {
	msg := "No data provided"
	if raw != nil {
		msg = fmt.Sprintf("Invalid data. Expected a dictionary, but got %s.", pyTypeName(raw))
	}
	body, _ := marshal(map[string][]string{"non_field_errors": {msg}})
	writeJSON(w, r, http.StatusBadRequest, body, false)
}

// parseBody accepts JSON, form-urlencoded and multipart bodies; nonObject answers valid JSON that is not an object. When
// ok is false a response has already been written.
func parseBody(w http.ResponseWriter, r *http.Request, nonObject func(http.ResponseWriter, *http.Request, any)) (map[string]field, bool) {
	out := map[string]field{}
	ct, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	switch ct {
	case "application/x-www-form-urlencoded", "multipart/form-data":
		if err := r.ParseMultipartForm(1 << 20); err != nil && !errors.Is(err, http.ErrNotMultipart) {
			writeDetail(w, http.StatusBadRequest, "Malformed request.")
			return nil, false
		}
		for k, v := range r.PostForm {
			if len(v) > 0 {
				out[k] = field{present: true, value: v[len(v)-1]}
			}
		}
		return out, true
	case "":
		return out, true
	case "application/json":
		data, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			writeDetail(w, http.StatusBadRequest, "Malformed request.")
			return nil, false
		}
		if len(data) == 0 {
			return out, true
		}
		doc, msg := jsonx.PyLoadError(data)
		if msg != "" {
			writeDetail(w, http.StatusBadRequest, "JSON parse error - "+msg)
			return nil, false
		}
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(doc, &obj); err != nil || obj == nil {
			var raw any
			dec := json.NewDecoder(bytes.NewReader(doc))
			dec.UseNumber()
			dec.Decode(&raw)
			nonObject(w, r, raw)
			return nil, false
		}
		for k, raw := range obj {
			dec := json.NewDecoder(bytes.NewReader(raw))
			dec.UseNumber()
			var v any
			if err := dec.Decode(&v); err != nil {
				writeDetail(w, http.StatusBadRequest, "JSON parse error - "+err.Error())
				return nil, false
			}
			out[k] = field{present: true, null: v == nil, value: v, raw: raw}
		}
		return out, true
	default:
		writeDetail(w, http.StatusUnsupportedMediaType, `Unsupported media type "`+r.Header.Get("Content-Type")+`" in request.`)
		return nil, false
	}
}

func pyTypeName(v any) string {
	switch v.(type) {
	case []any:
		return "list"
	case string:
		return "str"
	case json.Number:
		if strings.ContainsAny(v.(json.Number).String(), ".eE") {
			return "float"
		}
		return "int"
	case bool:
		return "bool"
	}
	return "NoneType"
}

// charField validates a required, non-blank string field.
func charField(f field, required bool) (string, string) {
	if !f.present {
		if required {
			return "", "This field is required."
		}
		return "", ""
	}
	if f.null {
		return "", "This field may not be null."
	}
	var s string
	switch v := f.value.(type) {
	case string:
		s = v
	case json.Number:
		s = jsonx.PyNumber(v)
	default:
		return "", "Not a valid string."
	}
	if s == "" {
		return "", "This field may not be blank."
	}
	return s, ""
}

type fieldErrors struct{ obj *jsonx.Object }

func (e *fieldErrors) add(name, msg string) {
	if e.obj == nil {
		e.obj = jsonx.NewObject()
	}
	e.obj.Set(name, []string{msg})
}

func (e *fieldErrors) write(w http.ResponseWriter, r *http.Request) bool {
	if e.obj == nil {
		return false
	}
	body, _ := marshal(e.obj)
	writeJSON(w, r, http.StatusBadRequest, body, false)
	return true
}

func (s *Server) handleWCALogin(w http.ResponseWriter, r *http.Request) {
	// The contract answers any non-object body with a 500.
	body, ok := parseBody(w, r, func(w http.ResponseWriter, _ *http.Request, _ any) { writeServerError(w) })
	if !ok {
		return
	}
	var errs fieldErrors
	code, msg := charField(body["code"], true)
	if msg != "" {
		errs.add("code", msg)
	}
	callback := s.cfg.WCADefaultCallbackURL
	if f := body["callback_url"]; f.present {
		value, msg := charField(f, false)
		switch {
		case f.null:
			if !s.callbackAllowed("") {
				errs.add("callback_url", "Url is not allowed")
			}
		case msg != "":
			errs.add("callback_url", msg)
		case !s.callbackAllowed(value):
			errs.add("callback_url", "Url is not allowed")
		default:
			callback = value
		}
	}
	if errs.write(w, r) {
		return
	}

	key, err := s.wca.Login(r.Context(), s.db, code, callback)
	switch {
	case errors.Is(err, auth.ErrExchange), errors.Is(err, auth.ErrProfile):
		body, _ := marshal(map[string][]string{"non_field_errors": {err.Error()}})
		writeJSON(w, r, http.StatusBadRequest, body, false)
		return
	case errors.Is(err, auth.ErrNotConfigured):
		s.log.Error("WCA login requested but no client credentials are configured")
		writeServerError(w)
		return
	case err != nil:
		s.log.Error("wca login", "err", err)
		writeServerError(w)
		return
	}
	out, _ := marshal(map[string]string{"key": key})
	writeJSON(w, r, http.StatusOK, out, false)
}

func (s *Server) callbackAllowed(url string) bool {
	for _, allowed := range s.cfg.WCAAllowedCallbackURLs {
		if allowed == url {
			return true
		}
	}
	return false
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if u := currentUser(r); u != nil {
		if err := store.DeleteToken(r.Context(), s.db.Write, u.ID); err != nil {
			s.log.Error("logout", "err", err)
		}
	}
	writeDetail(w, http.StatusOK, "Successfully logged out.")
}

func serializerTime(t time.Time, valid bool) *string {
	if !valid {
		return nil
	}
	v := timefmt.Serializer(t)
	return &v
}

func (s *Server) handleUser(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	payload := struct {
		FirstName       string  `json:"first_name"`
		LastName        string  `json:"last_name"`
		WCAID           *string `json:"wca_id"`
		Region          *string `json:"region"`
		RegionUpdatedAt *string `json:"region_updated_at"`
		CreatedAt       *string `json:"created_at"`
	}{
		FirstName:       u.FirstName,
		LastName:        u.LastName,
		WCAID:           nullable(u.WCAID),
		Region:          nullable(u.Region),
		RegionUpdatedAt: serializerTime(u.RegionUpdatedAt.Time, u.RegionUpdatedAt.Valid),
		CreatedAt:       serializerTime(u.CreatedAt.Time, u.CreatedAt.Valid),
	}
	body, _ := marshal(payload)
	writeJSON(w, r, http.StatusOK, body, false)
}

type requestPayload struct {
	Region    string  `json:"region"`
	Status    string  `json:"status"`
	CreatedAt *string `json:"created_at"`
}

func toRequestPayload(rr store.RegionRequest) requestPayload {
	return requestPayload{Region: rr.Region, Status: rr.StatusLabel(), CreatedAt: serializerTime(rr.CreatedAt.Time, rr.CreatedAt.Valid)}
}

func (s *Server) handleListRequests(w http.ResponseWriter, r *http.Request) {
	list, err := store.RequestsForUser(r.Context(), s.db.Read, currentUser(r).ID)
	if err != nil {
		s.log.Error("list requests", "err", err)
		writeServerError(w)
		return
	}
	out := make([]requestPayload, len(list))
	for i, rr := range list {
		out[i] = toRequestPayload(rr)
	}
	body, _ := marshal(out)
	writeJSON(w, r, http.StatusOK, body, false)
}

func (s *Server) handleCreateRequest(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	existing, err := store.RequestsForUser(r.Context(), s.db.Read, u.ID)
	if err != nil {
		s.log.Error("create request", "err", err)
		writeServerError(w)
		return
	}
	if len(existing) > 0 && existing[0].CreatedAt.Valid && existing[0].CreatedAt.Time.UTC().Year() == time.Now().UTC().Year() {
		writeDetail(w, http.StatusForbidden, "You can only request once a year.")
		return
	}

	body, ok := parseBody(w, r, serializerNonObject)
	if !ok {
		return
	}
	var errs fieldErrors
	f := body["region"]
	region := ""
	switch {
	case !f.present:
		errs.add("region", "This field is required.")
	case f.null:
		errs.add("region", "This field may not be null.")
	default:
		region = f.pyStr()
		if !regions.Valid(region) {
			errs.add("region", `"`+region+`" is not a valid choice.`)
		}
	}
	if errs.write(w, r) {
		return
	}

	created, err := store.CreateRequest(r.Context(), s.db.Write, u.ID, region)
	if err != nil {
		s.log.Error("create request", "err", err)
		writeServerError(w)
		return
	}
	out, _ := marshal(toRequestPayload(*created))
	writeJSON(w, r, http.StatusCreated, out, false)
}
