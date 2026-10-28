// WVN WebTransport 网关只转换传输，权限、票据和事件序号仍由 Node 房间服务负责。
package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/quic-go/quic-go"
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"
)

const maxFrame = 16384

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
func backendURL(value string) (*url.URL, error) {
	u, err := url.Parse(value)
	if err != nil {
		return nil, err
	}
	if (u.Scheme != "ws" && u.Scheme != "wss") || u.Host == "" || u.User != nil || u.Path != "/api/rooms/ws" || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("upstream must be a fixed ws(s) room endpoint")
	}
	return u, nil
}
func validDatagram(data []byte) bool {
	if len(data) > 1200 {
		return false
	}
	var frame map[string]json.RawMessage
	if json.Unmarshal(data, &frame) != nil || len(frame) != 1 {
		return false
	}
	return string(frame["type"]) == `"ping"`
}

func bridge(session *webtransport.Session, backend, origin string) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	defer session.CloseWithError(1, "connection_closed")
	authCtx, authCancel := context.WithTimeout(ctx, 3*time.Second)
	stream, err := session.AcceptStream(authCtx)
	authCancel()
	if err != nil {
		return
	}
	defer stream.Close()
	// 一个会话只允许一条双向控制流，禁止额外单向流与无限并发流。
	go func() {
		extra, err := session.AcceptStream(ctx)
		if err == nil {
			extra.CancelRead(1)
			extra.CancelWrite(1)
			session.CloseWithError(1, "one_stream_only")
		}
	}()
	go func() {
		extra, err := session.AcceptUniStream(ctx)
		if err == nil {
			extra.CancelRead(1)
			session.CloseWithError(1, "unidirectional_stream_forbidden")
		}
	}()
	dialer := websocket.Dialer{HandshakeTimeout: 3 * time.Second, Proxy: nil}
	upstream, _, err := dialer.DialContext(ctx, backend, http.Header{"Origin": []string{origin}})
	if err != nil {
		return
	}
	defer upstream.Close()
	upstream.SetReadLimit(262144)
	var writeMu sync.Mutex
	write := func(data []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		if err := upstream.SetWriteDeadline(time.Now().Add(3 * time.Second)); err != nil {
			return err
		}
		return upstream.WriteMessage(websocket.TextMessage, data)
	}
	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 1024), maxFrame+1)
	stream.SetReadDeadline(time.Now().Add(3 * time.Second))
	if !scanner.Scan() {
		return
	}
	auth := append([]byte(nil), scanner.Bytes()...)
	var frame struct {
		Type string `json:"type"`
	}
	if json.Unmarshal(auth, &frame) != nil || frame.Type != "auth" || len(auth) > maxFrame {
		return
	}
	if err := write(auth); err != nil {
		return
	}
	upstream.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, ready, err := upstream.ReadMessage()
	if err != nil {
		return
	}
	stream.SetWriteDeadline(time.Now().Add(3 * time.Second))
	if _, err = stream.Write(append(ready, '\n')); err != nil {
		return
	}
	if json.Unmarshal(ready, &frame) != nil || frame.Type != "ready" {
		return
	}
	upstream.SetReadDeadline(time.Time{})
	stream.SetReadDeadline(time.Time{})
	upstream.SetPingHandler(func(value string) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return upstream.WriteControl(websocket.PongMessage, []byte(value), time.Now().Add(3*time.Second))
	})
	done := make(chan struct{}, 3)
	// 可靠流承载房间状态与信令，后端回复继续保留服务器序号。
	go func() {
		defer func() { done <- struct{}{} }()
		for scanner.Scan() {
			data := scanner.Bytes()
			if len(data) > maxFrame || !json.Valid(data) {
				return
			}
			if err := write(data); err != nil {
				return
			}
		}
	}()
	// 数据报仅允许已认证连接发送轻量ping，仍通过后端会话/成员/限流检查。
	go func() {
		defer func() { done <- struct{}{} }()
		window, count := time.Now(), 0
		for {
			data, err := session.ReceiveDatagram(ctx)
			if err != nil {
				return
			}
			if time.Since(window) > time.Second {
				window = time.Now()
				count = 0
			}
			count++
			if count > 16 || !validDatagram(data) {
				return
			}
			if err := write(data); err != nil {
				return
			}
		}
	}()
	go func() {
		defer func() { done <- struct{}{} }()
		for {
			kind, data, err := upstream.ReadMessage()
			if err != nil || kind != websocket.TextMessage {
				return
			}
			var frame struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(data, &frame) != nil {
				return
			}
			if frame.Type == "pong" {
				if err := session.SendDatagram(data); err != nil {
					return
				}
			} else {
				stream.SetWriteDeadline(time.Now().Add(3 * time.Second))
				if _, err := stream.Write(append(data, '\n')); err != nil {
					return
				}
			}
		}
	}()
	select {
	case <-done:
	case <-ctx.Done():
	}
}

func run() error {
	origin := os.Getenv("WT_ORIGIN")
	parsedOrigin, err := url.Parse(origin)
	if err != nil || parsedOrigin.Scheme != "https" || parsedOrigin.Host == "" || parsedOrigin.Path != "" || parsedOrigin.RawQuery != "" || parsedOrigin.User != nil || parsedOrigin.Fragment != "" {
		return errors.New("WT_ORIGIN must be an exact https origin")
	}
	upstream, err := backendURL(env("WT_UPSTREAM_WS", "ws://127.0.0.1:28439/api/rooms/ws"))
	if err != nil {
		return err
	}
	cert, err := tls.LoadX509KeyPair(os.Getenv("WT_TLS_CERT"), os.Getenv("WT_TLS_KEY"))
	if err != nil {
		return errors.New("valid WT_TLS_CERT / WT_TLS_KEY required")
	}
	mux := http.NewServeMux()
	server := webtransport.Server{
		H3: &http3.Server{Addr: env("WT_LISTEN", "127.0.0.1:28443"), Handler: mux,
			TLSConfig:      http3.ConfigureTLSConfig(&tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS13}),
			QUICConfig:     &quic.Config{EnableDatagrams: true, EnableStreamResetPartialDelivery: true, MaxIncomingStreams: 4, MaxIncomingUniStreams: 4, HandshakeIdleTimeout: 5 * time.Second, MaxIdleTimeout: 30 * time.Second, KeepAlivePeriod: 10 * time.Second},
			MaxHeaderBytes: 8192,
		},
		CheckOrigin: func(r *http.Request) bool { return r.Header.Get("Origin") == origin },
	}
	capacity := make(chan struct{}, 128)
	mux.HandleFunc("/rooms", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rooms" || r.URL.RawQuery != "" || r.Header.Get("Origin") != origin {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		select {
		case capacity <- struct{}{}:
			defer func() { <-capacity }()
		default:
			http.Error(w, "busy", http.StatusServiceUnavailable)
			return
		}
		log.Printf("HTTP/3 room request: method=%s origin-match=%t protocol=%s", r.Method, r.Header.Get("Origin") == origin, r.Proto)
		session, err := server.Upgrade(w, r)
		if err != nil {
			log.Printf("WebTransport upgrade failed: %v", err)
			return
		}
		bridge(session, upstream.String(), origin)
	})
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() { <-ctx.Done(); server.Close() }()
	log.Printf("WVN WebTransport listening on %s (fixed room backend)", server.H3.Addr)
	if err := server.ListenAndServe(); err != nil && ctx.Err() == nil {
		return fmt.Errorf("HTTP/3 gateway failed: %w", err)
	}
	return nil
}
func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
