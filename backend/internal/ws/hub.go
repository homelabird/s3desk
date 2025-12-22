package ws

import (
	"encoding/json"
	"sync"
	"time"
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
		out := make([]Message, 0, len(h.buffer))
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
	delete(h.clients, c)
	close(c.send)
	h.mu.Unlock()
}

func (h *Hub) Publish(evt Event) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.seq++
	evt.Seq = h.seq
	evt.Ts = time.Now().UTC().Format(time.RFC3339Nano)

	data, err := json.Marshal(evt)
	if err != nil {
		return
	}

	msg := Message{Seq: evt.Seq, Type: evt.Type, Data: data}

	// Keep a small buffer for resume (exclude logs; logs can be fetched via HTTP).
	if evt.Type != "job.log" {
		const maxBuffered = 512
		h.buffer = append(h.buffer, msg)
		if len(h.buffer) > maxBuffered {
			h.buffer = h.buffer[len(h.buffer)-maxBuffered:]
		}
	}

	for c := range h.clients {
		if evt.Type == "job.log" && !c.includeLogs {
			continue
		}
		select {
		case c.send <- msg:
		default:
		}
	}
}
