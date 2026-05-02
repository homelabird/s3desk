package api

import (
	"context"

	"s3desk/internal/ws"
)

func serveRealtimeSSE(ctx context.Context, client *ws.Client, backlog []ws.Message, session realtimeSSESession) {
	session.emitter.replay(backlog)

	for {
		select {
		case <-ctx.Done():
			return
		case <-session.heartbeat.C:
			session.emitter.writePing()
		case msg, ok := <-client.Messages():
			if !ok {
				return
			}
			session.emitter.writeMessage(msg)
		}
	}
}

func serveRealtimeWS(ctx context.Context, client *ws.Client, backlog []ws.Message, session realtimeWSSession) {
	if err := session.emitter.replay(backlog); err != nil {
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-session.done:
			return
		case <-session.ping.C:
			if err := session.emitter.writePing(); err != nil {
				return
			}
		case msg, ok := <-client.Messages():
			if !ok {
				return
			}
			if err := session.emitter.writeMessage(msg); err != nil {
				return
			}
		}
	}
}
