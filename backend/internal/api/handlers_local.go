package api

import "net/http"

func (s *server) handleListLocalEntries(w http.ResponseWriter, r *http.Request) {
	newLocalEntriesHTTPService(s).handleListLocalEntries(w, r)
}
