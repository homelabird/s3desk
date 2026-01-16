package jobs

import "errors"

// ErrProfileNotFound is returned when a job or operation references a profile that
// does not exist in the store.
var ErrProfileNotFound = errors.New("profile not found")
