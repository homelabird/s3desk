package ws

import (
	"encoding/json"
	"sync"
	"time"
)

const (
	maxBufferedMessages        = 512
	reconnectRequiredEventType = "reconnect_required"
)

type Event struct {
	Type    string `json:"type"`
	Ts      string `json:"ts"`
	Seq     int64  `json:"seq"`
	JobID   string `json:"jobId,omitempty"`
	Payload any    `json:"payload,omitempty"`
}

type Message struct {
	Seq  int64
	Type string
	Data []byte
}

type Hub struct {
	mu      sync.Mutex
	clients map[*Client]struct{}
	seq     int64
	buffer  []Message
}

type Client struct {
	send        chan Message
	includeLogs bool
	closed      bool
}

type reconnectRequiredPayload struct {
	Reason            string `json:"reason"`
	RequestedAfterSeq int64  `json:"requestedAfterSeq,omitempty"`
	OldestBufferedSeq int64  `json:"oldestBufferedSeq,omitempty"`
	LatestSeq         int64  `json:"latestSeq,omitempty"`
	DroppedSeq        int64  `json:"droppedSeq,omitempty"`
	DroppedType       string `json:"droppedType,omitempty"`
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[*Client]struct{}),
	}
}

func (h *Hub) Subscribe() *Client {
	c := &Client{send: make(chan Message, 128), includeLogs: true}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	return c
}

func (h *Hub) SubscribeFrom(afterSeq int64, includeLogs bool) (client *Client, backlog []Message) {
	c := &Client{send: make(chan Message, 128), includeLogs: includeLogs}

	h.mu.Lock()
	defer h.mu.Unlock()

	h.clients[c] = struct{}{}

	if afterSeq > 0 && len(h.buffer) > 0 {
		out := make([]Message, 0, len(h.buffer)+1)
		oldestBufferedSeq := h.buffer[0].Seq
		if oldestBufferedSeq > afterSeq+1 {
			if reconnectMsg, err := newReconnectRequiredMessage(reconnectRequiredPayload{
				Reason:            "resume_gap",
				RequestedAfterSeq: afterSeq,
				OldestBufferedSeq: oldestBufferedSeq,
				LatestSeq:         h.seq,
			}); err == nil {
				out = append(out, reconnectMsg)
			}
		}
		for _, msg := range h.buffer {
			if msg.Seq > afterSeq {
				out = append(out, msg)
			}
		}
		backlog = out
	}
	return c, backlog
}

func (c *Client) Messages() <-chan Message {
	return c.send
}

func (h *Hub) Unsubscribe(c *Client) {
	h.mu.Lock()
	h.closeClientLocked(c)
	h.mu.Unlock()
}

func (h *Hub) Publish(evt Event) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.seq++
	evt.Seq = h.seq
	evt.Ts = time.Now().UTC().Format(time.RFC3339Nano)

	msg, err := newMessage(evt)
	if err != nil {
		return
	}

	// Keep a small buffer for resume (exclude logs; logs can be fetched via HTTP).
	if evt.Type != "job.log" {
		h.buffer = append(h.buffer, msg)
		if len(h.buffer) > maxBufferedMessages {
			h.buffer = h.buffer[len(h.buffer)-maxBufferedMessages:]
		}
	}

	for c := range h.clients {
		if evt.Type == "job.log" && !c.includeLogs {
			continue
		}
		select {
		case c.send <- msg:
		default:
			reconnectMsg, err := newReconnectRequiredMessage(reconnectRequiredPayload{
				Reason:            "client_overflow",
				OldestBufferedSeq: oldestBufferedSeq(h.buffer),
				LatestSeq:         h.seq,
				DroppedSeq:        msg.Seq,
				DroppedType:       msg.Type,
			})
			if err != nil {
				h.closeClientLocked(c)
				continue
			}
			h.replaceBufferedMessagesWithLocked(c, reconnectMsg)
		}
	}
}

func newMessage(evt Event) (Message, error) {
	data, err := json.Marshal(evt)
	if err != nil {
		return Message{}, err
	}
	return Message{Seq: evt.Seq, Type: evt.Type, Data: data}, nil
}

func newReconnectRequiredMessage(payload reconnectRequiredPayload) (Message, error) {
	return newMessage(Event{
		Type:    reconnectRequiredEventType,
		Ts:      time.Now().UTC().Format(time.RFC3339Nano),
		Seq:     0,
		Payload: payload,
	})
}

func oldestBufferedSeq(buffer []Message) int64 {
	if len(buffer) == 0 {
		return 0
	}
	return buffer[0].Seq
}

func (h *Hub) replaceBufferedMessagesWithLocked(c *Client, msg Message) {
	if c == nil || c.closed {
		return
	}
	delete(h.clients, c)
	for {
		select {
		case <-c.send:
		default:
			c.send <- msg
			close(c.send)
			c.closed = true
			return
		}
	}
}

func (h *Hub) closeClientLocked(c *Client) {
	if c == nil || c.closed {
		return
	}
	delete(h.clients, c)
	close(c.send)
	c.closed = true
}
