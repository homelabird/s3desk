package jobs

import (
	"strings"
	"sync"
)

type logCapture struct {
	mu    sync.Mutex
	lines []string
	max   int
}

func newLogCapture(max int) *logCapture {
	if max < 1 {
		max = 1
	}
	return &logCapture{max: max}
}

func (c *logCapture) Add(line string) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if line == "" {
		return
	}
	c.lines = append(c.lines, line)
	if len(c.lines) > c.max {
		c.lines = c.lines[len(c.lines)-c.max:]
	}
}

func (c *logCapture) String() string {
	if c == nil {
		return ""
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return strings.TrimSpace(strings.Join(c.lines, "\n"))
}
