package main

import "testing"

func TestBackendIsFixedToRoomSocket(t *testing.T) {
	for _, value := range []string{"http://127.0.0.1:28439/api/rooms/ws", "ws://127.0.0.1:28439/api/rooms/ws?token=x", "ws://user:secret@127.0.0.1/api/rooms/ws", "ws://127.0.0.1/arbitrary"} {
		if _, err := backendURL(value); err == nil {
			t.Fatalf("unsafe backend accepted: %q", value)
		}
	}
	if _, err := backendURL("ws://127.0.0.1:28439/api/rooms/ws"); err != nil {
		t.Fatal(err)
	}
}
func TestDatagramsOnlyCarryAuthenticatedPing(t *testing.T) {
	for _, value := range []string{`{"type":"event","event":{"kind":"state"}}`, `{"type":"auth","ticket":"x"}`, `invalid`, `{"type":"ping","extra":"x"}`} {
		if validDatagram([]byte(value)) {
			t.Fatalf("forbidden datagram accepted: %s", value)
		}
	}
	if !validDatagram([]byte(`{"type":"ping"}`)) {
		t.Fatal("ping rejected")
	}
}
