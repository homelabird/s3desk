package jobs

import (
	"context"
)

func (m *Manager) QueueStats() QueueStats {
	m.queueMu.Lock()
	defer m.queueMu.Unlock()

	return QueueStats{
		Depth:    m.queueDepthLocked(),
		Capacity: m.queueCapacity,
	}
}

func (m *Manager) Enqueue(jobID string) error {
	m.queueMu.Lock()
	if m.queueDepthLocked() >= m.queueCapacity {
		m.queueMu.Unlock()
		return ErrJobQueueFull
	}
	m.compactQueueLocked()
	m.queue = append(m.queue, jobID)
	depth := m.queueDepthLocked()
	m.queueCond.Broadcast()
	m.queueMu.Unlock()
	m.setQueueDepth(depth)
	return nil
}

func (m *Manager) enqueueBlocking(ctx context.Context, ids []string) {
	// sync.Cond does not observe ctx, so cancellation must wake waiters.
	stopWake := context.AfterFunc(ctx, func() {
		m.queueMu.Lock()
		m.queueCond.Broadcast()
		m.queueMu.Unlock()
	})
	defer stopWake()

	for _, id := range ids {
		m.queueMu.Lock()
		for m.queueDepthLocked() >= m.queueCapacity {
			if ctx.Err() != nil {
				m.queueMu.Unlock()
				return
			}
			m.queueCond.Wait()
		}
		m.compactQueueLocked()
		m.queue = append(m.queue, id)
		depth := m.queueDepthLocked()
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
	for m.queueDepthLocked() == 0 {
		if ctx.Err() != nil {
			m.queueMu.Unlock()
			return "", false
		}
		m.queueCond.Wait()
	}

	jobID := m.queue[m.queueHead]
	m.queue[m.queueHead] = ""
	m.queueHead++
	depth := m.queueDepthLocked()
	if depth == 0 {
		m.queue = m.queue[:0]
		m.queueHead = 0
	}
	m.queueCond.Broadcast()
	m.queueMu.Unlock()
	m.setQueueDepth(depth)
	return jobID, true
}

func (m *Manager) removeQueued(jobID string) bool {
	m.queueMu.Lock()
	for i := m.queueHead; i < len(m.queue); i++ {
		if m.queue[i] != jobID {
			continue
		}

		copy(m.queue[i:], m.queue[i+1:])
		m.queue[len(m.queue)-1] = ""
		m.queue = m.queue[:len(m.queue)-1]
		depth := m.queueDepthLocked()
		if depth == 0 {
			m.queue = m.queue[:0]
			m.queueHead = 0
		}
		m.queueCond.Broadcast()
		m.queueMu.Unlock()
		m.setQueueDepth(depth)
		return true
	}

	m.queueMu.Unlock()
	return false
}

func (m *Manager) queueDepthLocked() int {
	return len(m.queue) - m.queueHead
}

func (m *Manager) compactQueueLocked() {
	if m.queueHead == 0 || len(m.queue) < cap(m.queue) {
		return
	}
	copy(m.queue, m.queue[m.queueHead:])
	m.queue = m.queue[:m.queueDepthLocked()]
	m.queueHead = 0
}

func (m *Manager) setQueueDepth(depth int) {
	if m.metrics != nil {
		m.metrics.SetJobsQueueDepth(depth)
	}
}
