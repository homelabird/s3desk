// Package streamlimit bounds actual download responses, including browser handoffs.
package streamlimit

import "sync"

type Limiter struct {
	mu                      sync.Mutex
	max, perProfile, active int
	profiles                map[string]int
}

func New(max, perProfile int) *Limiter {
	if max <= 0 {
		max = 8
	}
	if perProfile <= 0 {
		perProfile = 4
	}
	return &Limiter{max: max, perProfile: perProfile, profiles: make(map[string]int)}
}
func (l *Limiter) Acquire(profile string) (release func(), ok bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.active >= l.max || l.profiles[profile] >= l.perProfile {
		return nil, false
	}
	l.active++
	l.profiles[profile]++
	var once sync.Once
	return func() {
		once.Do(func() {
			l.mu.Lock()
			defer l.mu.Unlock()
			l.active--
			l.profiles[profile]--
			if l.profiles[profile] == 0 {
				delete(l.profiles, profile)
			}
		})
	}, true
}
func (l *Limiter) Active() int { l.mu.Lock(); defer l.mu.Unlock(); return l.active }
