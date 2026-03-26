package jobs

import (
	"context"
)

func (m *Manager) QueueStats() QueueStats {
	m.queueMu.Lock()
	defer m.queueMu.Unlock()

	return QueueStats{
		Depth:    len(m.queue),
		Capacity: m.queueCapacity,
	}
}

func (m *Manager) Enqueue(jobID string) error {
	m.queueMu.Lock()
	if len(m.queue) >= m.queueCapacity {
		m.queueMu.Unlock()
		return ErrJobQueueFull
	}
	m.queue = append(m.queue, jobID)
	depth := len(m.queue)
	m.queueCond.Broadcast()
	m.queueMu.Unlock()
	m.setQueueDepth(depth)
	return nil
}

func (m *Manager) enqueueBlocking(ctx context.Context, ids []string) {
	stopWake := context.AfterFunc(ctx, func() {
		m.queueMu.Lock()
		m.queueCond.Broadcast()
		m.queueMu.Unlock()
	})
	defer stopWake()

	for _, id := range ids {
		m.queueMu.Lock()
		for len(m.queue) >= m.queueCapacity {
			if ctx.Err() != nil {
				m.queueMu.Unlock()
				return
			}
			m.queueCond.Wait()
		}
		m.queue = append(m.queue, id)
		depth := len(m.queue)
		m.queueCond.Broadcast()
		m.queueMu.Unlock()
		m.setQueueDepth(depth)
	}
}

func (m *Manager) Cancel(jobID string) {
	if m.removeQueued(jobID) {
		return
	}

	m.mu.Lock()
	cancel, ok := m.cancels[jobID]
	m.mu.Unlock()

	if ok {
		cancel()
	}
}

func (m *Manager) dequeue(ctx context.Context) (string, bool) {
	m.queueMu.Lock()
	for len(m.queue) == 0 {
		if ctx.Err() != nil {
			m.queueMu.Unlock()
			return "", false
		}
		m.queueCond.Wait()
	}

	jobID := m.queue[0]
	copy(m.queue, m.queue[1:])
	m.queue[len(m.queue)-1] = ""
	m.queue = m.queue[:len(m.queue)-1]
	depth := len(m.queue)
	m.queueCond.Broadcast()
	m.queueMu.Unlock()
	m.setQueueDepth(depth)
	return jobID, true
}

func (m *Manager) removeQueued(jobID string) bool {
	m.queueMu.Lock()
	for i := range m.queue {
		if m.queue[i] != jobID {
			continue
		}

		copy(m.queue[i:], m.queue[i+1:])
		m.queue[len(m.queue)-1] = ""
		m.queue = m.queue[:len(m.queue)-1]
		depth := len(m.queue)
		m.queueCond.Broadcast()
		m.queueMu.Unlock()
		m.setQueueDepth(depth)
		return true
	}

	m.queueMu.Unlock()
	return false
}

func (m *Manager) setQueueDepth(depth int) {
	if m.metrics != nil {
		m.metrics.SetJobsQueueDepth(depth)
	}
}
