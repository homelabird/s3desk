package ws

import (
	"encoding/json"
	"testing"
)

func TestSubscribeFromAddsReconnectRequiredNoticeOnResumeGap(t *testing.T) {
	hub := NewHub()
	for i := 0; i < maxBufferedMessages+88; i++ {
		hub.Publish(Event{Type: "job.progress", JobID: "job-1"})
	}

	client, backlog := hub.SubscribeFrom(1, false)
	defer hub.Unsubscribe(client)

	if len(backlog) != maxBufferedMessages+1 {
		t.Fatalf("backlog length = %d, want %d", len(backlog), maxBufferedMessages+1)
	}

	notice := decodeEvent(t, backlog[0])
	if notice.Type != reconnectRequiredEventType {
		t.Fatalf("notice type = %q, want %q", notice.Type, reconnectRequiredEventType)
	}
	if notice.Seq != 0 {
		t.Fatalf("notice seq = %d, want 0", notice.Seq)
	}

	payload, ok := notice.Payload.(map[string]any)
	if !ok {
		t.Fatalf("notice payload type = %T, want map[string]any", notice.Payload)
	}
	if got := payload["reason"]; got != "resume_gap" {
		t.Fatalf("notice reason = %v, want resume_gap", got)
	}
	if got := int64(payload["requestedAfterSeq"].(float64)); got != 1 {
		t.Fatalf("requestedAfterSeq = %d, want 1", got)
	}
	oldestBuffered := int64(payload["oldestBufferedSeq"].(float64))
	if oldestBuffered <= 2 {
		t.Fatalf("oldestBufferedSeq = %d, want > 2", oldestBuffered)
	}
	if got := int64(payload["latestSeq"].(float64)); got != maxBufferedMessages+88 {
		t.Fatalf("latestSeq = %d, want %d", got, maxBufferedMessages+88)
	}

	firstBuffered := decodeEvent(t, backlog[1])
	if firstBuffered.Type != "job.progress" {
		t.Fatalf("first buffered type = %q, want job.progress", firstBuffered.Type)
	}
	if firstBuffered.Seq != oldestBuffered {
		t.Fatalf("first buffered seq = %d, want %d", firstBuffered.Seq, oldestBuffered)
	}
}

func TestPublishOverflowReplacesBufferedMessagesWithReconnectNotice(t *testing.T) {
	hub := NewHub()
	client := hub.Subscribe()

	for i := 0; i < cap(client.send)+1; i++ {
		hub.Publish(Event{Type: "job.progress", JobID: "job-1"})
	}

	msgs := make([]Message, 0, 1)
	for msg := range client.Messages() {
		msgs = append(msgs, msg)
	}
	if len(msgs) != 1 {
		t.Fatalf("message count after overflow = %d, want 1", len(msgs))
	}

	notice := decodeEvent(t, msgs[0])
	if notice.Type != reconnectRequiredEventType {
		t.Fatalf("notice type = %q, want %q", notice.Type, reconnectRequiredEventType)
	}
	if notice.Seq != 0 {
		t.Fatalf("notice seq = %d, want 0", notice.Seq)
	}

	payload, ok := notice.Payload.(map[string]any)
	if !ok {
		t.Fatalf("notice payload type = %T, want map[string]any", notice.Payload)
	}
	if got := payload["reason"]; got != "client_overflow" {
		t.Fatalf("notice reason = %v, want client_overflow", got)
	}
	if got := int64(payload["droppedSeq"].(float64)); got != int64(cap(client.send)+1) {
		t.Fatalf("droppedSeq = %d, want %d", got, cap(client.send)+1)
	}
	if got := payload["droppedType"]; got != "job.progress" {
		t.Fatalf("droppedType = %v, want job.progress", got)
	}
	if got := int64(payload["latestSeq"].(float64)); got != int64(cap(client.send)+1) {
		t.Fatalf("latestSeq = %d, want %d", got, cap(client.send)+1)
	}

	if _, ok := hub.clients[client]; ok {
		t.Fatal("overflowed client should be removed from hub")
	}

	hub.Unsubscribe(client)
}

func decodeEvent(t *testing.T, msg Message) Event {
	t.Helper()

	var evt Event
	if err := json.Unmarshal(msg.Data, &evt); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}
	return evt
}
