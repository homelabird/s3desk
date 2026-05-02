package api

import "net/http"

func (s *server) handleListObjectFavorites(w http.ResponseWriter, r *http.Request) {
	newObjectFavoritesHTTPService(s).handleListObjectFavorites(w, r)
}

func (s *server) handleCreateObjectFavorite(w http.ResponseWriter, r *http.Request) {
	newObjectFavoritesHTTPService(s).handleCreateObjectFavorite(w, r)
}

func (s *server) handleDeleteObjectFavorite(w http.ResponseWriter, r *http.Request) {
	newObjectFavoritesHTTPService(s).handleDeleteObjectFavorite(w, r)
}
