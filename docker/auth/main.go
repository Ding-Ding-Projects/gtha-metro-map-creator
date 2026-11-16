// gmmc-auth is the optional sign-in service for the hosted server.
//
// It uses only the Go standard library. nginx asks it, through auth_request, whether a request carries a
// valid session cookie; it also serves the sign-in page and handles sign-in and sign-out.
// The password is never stored: GMMC_PASSWORD_HASH holds a PBKDF2-HMAC-SHA256 hash in the form
// pbkdf2-sha256:<iterations>:<salt>:<hash> (salt and hash are base64url without padding).
package main

import (
	"bufio"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
	"encoding/base64"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

//go:embed web/*
var webFS embed.FS

const (
	cookieName = "gmmc_session"
	minIter    = 100000
	maxIter    = 5000000
	hashLen    = 32
)

type server struct {
	iter        int
	salt, want  []byte
	key         []byte
	ttl         time.Duration
	forceSecure bool
	page        *template.Template
	css, js     []byte
}

type texts3 struct {
	Title, Sub, Password, Button, Show, Hide, Other, OtherLang, ErrBad, ErrRate string
}

var texts = map[string]texts3{
	"en": {
		Title: "Sign in", Sub: "This map server needs a password", Password: "Password", Button: "Sign in",
		Show: "Show password", Hide: "Hide password", Other: "中文", OtherLang: "yue",
		ErrBad: "That password is not correct. Please try again.", ErrRate: "Too many attempts. Please wait a minute and try again.",
	},
	"yue": {
		Title: "登入", Sub: "呢部地圖伺服器需要密碼", Password: "密碼", Button: "登入",
		Show: "顯示密碼", Hide: "隱藏密碼", Other: "English", OtherLang: "en",
		ErrBad: "密碼唔啱，請再試過。", ErrRate: "試咗太多次，請等一分鐘再試。",
	},
}

func parseHash(s string) (iter int, salt, want []byte, err error) {
	p := strings.Split(strings.TrimSpace(s), ":")
	if len(p) != 4 || p[0] != "pbkdf2-sha256" {
		return 0, nil, nil, fmt.Errorf("unsupported format")
	}
	iter, e := strconv.Atoi(p[1])
	if e != nil || iter < minIter || iter > maxIter {
		return 0, nil, nil, fmt.Errorf("iteration count out of range")
	}
	enc := base64.RawURLEncoding
	if salt, err = enc.DecodeString(p[2]); err != nil || len(salt) < 16 {
		return 0, nil, nil, fmt.Errorf("invalid salt")
	}
	if want, err = enc.DecodeString(p[3]); err != nil || len(want) != hashLen {
		return 0, nil, nil, fmt.Errorf("invalid hash")
	}
	return iter, salt, want, nil
}

func (s *server) passwordOK(pw string) bool {
	if len(pw) == 0 || len(pw) > 1024 {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, pw, s.salt, s.iter, hashLen)
	return err == nil && subtle.ConstantTimeCompare(got, s.want) == 1
}

func (s *server) mint() (string, time.Time) {
	exp := time.Now().Add(s.ttl)
	body := "v1." + strconv.FormatInt(exp.Unix(), 10)
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(body))
	return body + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil)), exp
}

func (s *server) valid(tok string) bool {
	p := strings.Split(tok, ".")
	if len(p) != 3 || p[0] != "v1" {
		return false
	}
	exp, err := strconv.ParseInt(p[1], 10, 64)
	if err != nil || exp <= time.Now().Unix() {
		return false
	}
	sig, err := base64.RawURLEncoding.DecodeString(p[2])
	if err != nil {
		return false
	}
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(p[0] + "." + p[1]))
	return hmac.Equal(sig, m.Sum(nil))
}

func (s *server) secure(r *http.Request) bool {
	return s.forceSecure || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func (s *server) setCookie(w http.ResponseWriter, r *http.Request, val string, exp time.Time, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: val, Path: "/", Expires: exp, MaxAge: maxAge,
		HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: s.secure(r),
	})
}

// safeNext keeps the post-sign-in redirect on this site: a single-slash path of plain characters.
func safeNext(n string) string {
	if n == "" || len(n) > 512 || n[0] != '/' || strings.HasPrefix(n, "//") || strings.HasPrefix(n, "/signin") || strings.HasPrefix(n, "/signout") {
		return "/"
	}
	for _, c := range n {
		if c < 0x21 || c > 0x7e || c == '\\' || c == '"' || c == '<' || c == '>' || c == '`' {
			return "/"
		}
	}
	return n
}

func pickLang(r *http.Request) string {
	if l := r.FormValue("lang"); l == "en" || l == "yue" {
		return l
	}
	first := strings.ToLower(strings.TrimSpace(strings.SplitN(r.Header.Get("Accept-Language"), ",", 2)[0]))
	if strings.HasPrefix(first, "zh") || strings.HasPrefix(first, "yue") {
		return "yue"
	}
	return "en"
}

func baseHeaders(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Cache-Control", "no-store")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Frame-Options", "SAMEORIGIN")
	h.Set("Content-Security-Policy", "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'self'")
}

func (s *server) check(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil && s.valid(c.Value) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.WriteHeader(http.StatusUnauthorized)
}

type pageData struct {
	T                    texts3
	Lang, HTMLLang, Next string
	Err                  string
	OtherHref            string
}

func (s *server) signin(w http.ResponseWriter, r *http.Request) {
	baseHeaders(w)
	lang := pickLang(r)
	next := safeNext(r.FormValue("next"))
	d := pageData{T: texts[lang], Lang: lang, HTMLLang: map[string]string{"en": "en", "yue": "zh-HK"}[lang], Next: next}
	switch r.FormValue("error") {
	case "1":
		d.Err = d.T.ErrBad
	case "rate":
		d.Err = d.T.ErrRate
	}
	q := url.Values{"lang": {d.T.OtherLang}}
	if next != "/" {
		q.Set("next", next)
	}
	d.OtherHref = "/signin?" + q.Encode()
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Vary", "Accept-Language")
	if err := s.page.Execute(w, d); err != nil {
		log.Print("template error")
	}
}

func (s *server) login(w http.ResponseWriter, r *http.Request) {
	baseHeaders(w)
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	lang, next := pickLang(r), safeNext(r.PostFormValue("next"))
	if s.passwordOK(r.PostFormValue("password")) {
		tok, exp := s.mint()
		s.setCookie(w, r, tok, exp, int(s.ttl.Seconds()))
		http.Redirect(w, r, next, http.StatusSeeOther)
		return
	}
	time.Sleep(400 * time.Millisecond)
	log.Print("sign-in attempt refused")
	q := url.Values{"error": {"1"}, "lang": {lang}}
	if next != "/" {
		q.Set("next", next)
	}
	http.Redirect(w, r, "/signin?"+q.Encode(), http.StatusSeeOther)
}

func (s *server) signout(w http.ResponseWriter, r *http.Request) {
	baseHeaders(w)
	s.setCookie(w, r, "", time.Unix(0, 0), -1)
	http.Redirect(w, r, "/signin", http.StatusSeeOther)
}

func (s *server) asset(body []byte, ctype string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", ctype)
		w.Header().Set("Cache-Control", "private, max-age=3600")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Write(body)
	}
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, "gmmc-auth: "+msg)
	os.Exit(1)
}

// hashCommand reads one line (the password) from standard input and prints a hash for GMMC_PASSWORD_HASH.
// It is a convenience for Linux and macOS: docker run --rm -i <image> gmmc-auth hash
func hashCommand() {
	line, err := bufio.NewReader(io.LimitReader(os.Stdin, 4096)).ReadString(10)
	pw := strings.TrimRight(line, "\r\n")
	if (err != nil && err != io.EOF) || len(pw) < 8 || len(pw) > 200 {
		fatal("the password must be 8 to 200 characters")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		fatal("no random source")
	}
	key, err := pbkdf2.Key(sha256.New, pw, salt, 600000, hashLen)
	if err != nil {
		fatal("could not hash the password")
	}
	enc := base64.RawURLEncoding
	fmt.Printf("pbkdf2-sha256:%d:%s:%s\n", 600000, enc.EncodeToString(salt), enc.EncodeToString(key))
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "hash" {
		hashCommand()
		return
	}
	iter, salt, want, err := parseHash(os.Getenv("GMMC_PASSWORD_HASH"))
	if err != nil {
		// The value itself is never printed.
		fatal("GMMC_PASSWORD_HASH is not a valid pbkdf2-sha256 hash (" + err.Error() + ")")
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		fatal("no random source")
	}
	ttl := 12 * time.Hour
	if v := os.Getenv("GMMC_SESSION_HOURS"); v != "" {
		h, e := strconv.Atoi(v)
		if e != nil || h < 1 || h > 24*30 {
			fatal("GMMC_SESSION_HOURS must be a whole number from 1 to 720")
		}
		ttl = time.Duration(h) * time.Hour
	}
	read := func(n string) []byte { b, _ := webFS.ReadFile("web/" + n); return b }
	s := &server{
		iter: iter, salt: salt, want: want, key: key, ttl: ttl, forceSecure: os.Getenv("GMMC_COOKIE_SECURE") == "1",
		page: template.Must(template.New("signin").Parse(string(read("signin.html")))),
		css:  read("signin.css"), js: read("signin.js"),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/check", s.check)
	mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("GET /signin", s.signin)
	mux.HandleFunc("POST /signin/login", s.login)
	mux.HandleFunc("/signout", s.signout)
	mux.HandleFunc("GET /signin/assets/signin.css", s.asset(s.css, "text/css; charset=utf-8"))
	mux.HandleFunc("GET /signin/assets/signin.js", s.asset(s.js, "text/javascript; charset=utf-8"))
	addr := os.Getenv("GMMC_AUTH_ADDR")
	if addr == "" {
		addr = "127.0.0.1:9100"
	}
	log.Print("sign-in service listening")
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second}
	fatal(srv.ListenAndServe().Error())
}
