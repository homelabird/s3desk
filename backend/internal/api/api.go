package api

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"object-storage/internal/config"
	"object-storage/internal/jobs"
	"object-storage/internal/store"
	"object-storage/internal/ws"
)

type Dependencies struct {
	Config     config.Config
	Store      *store.Store
	Jobs       *jobs.Manager
	Hub        *ws.Hub
	ServerAddr string
}

func New(dep Dependencies) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))
	r.Use(securityHeaders)

	api := &server{
		cfg:        dep.Config,
		store:      dep.Store,
		jobs:       dep.Jobs,
		hub:        dep.Hub,
		serverAddr: dep.ServerAddr,
	}

	apiRouter := chi.NewRouter()
	apiRouter.Use(api.requireLocalHost)
	apiRouter.Use(api.requireAPIToken)

	apiRouter.Get("/ws", api.handleWS)
	apiRouter.Get("/events", api.handleEventsSSE)
	apiRouter.Get("/meta", api.handleGetMeta)

	apiRouter.Route("/profiles", func(r chi.Router) {
		r.Get("/", api.handleListProfiles)
		r.Post("/", api.handleCreateProfile)
		r.Route("/{profileId}", func(r chi.Router) {
			r.Patch("/", api.handleUpdateProfile)
			r.Delete("/", api.handleDeleteProfile)
			r.Post("/test", api.handleTestProfile)
		})
	})

	apiRouter.Group(func(r chi.Router) {
		r.Use(api.requireProfile)

		r.Route("/buckets", func(r chi.Router) {
			r.Get("/", api.handleListBuckets)
			r.Post("/", api.handleCreateBucket)
			r.Delete("/{bucket}", api.handleDeleteBucket)
		})

		r.Route("/buckets/{bucket}/objects", func(r chi.Router) {
			r.Get("/", api.handleListObjects)
			r.Delete("/", api.handleDeleteObjects)
		})
		r.Get("/buckets/{bucket}/objects/search", api.handleSearchObjects)
		r.Get("/buckets/{bucket}/objects/index-summary", api.handleGetObjectIndexSummary)
		r.Get("/buckets/{bucket}/objects/meta", api.handleGetObjectMeta)
		r.Post("/buckets/{bucket}/objects/folder", api.handleCreateFolder)
		r.Get("/buckets/{bucket}/objects/download", api.handleDownloadObject)
		r.Get("/buckets/{bucket}/objects/download-url", api.handleGetObjectDownloadURL)

		r.Get("/local/entries", api.handleListLocalEntries)

		r.Route("/uploads", func(r chi.Router) {
			r.Post("/", api.handleCreateUpload)
			r.Post("/{uploadId}/files", api.handleUploadFiles)
			r.Post("/{uploadId}/commit", api.handleCommitUpload)
			r.Delete("/{uploadId}", api.handleDeleteUpload)
		})

		r.Route("/jobs", func(r chi.Router) {
			r.Get("/", api.handleListJobs)
			r.Post("/", api.handleCreateJob)
			r.Route("/{jobId}", func(r chi.Router) {
				r.Get("/", api.handleGetJob)
				r.Delete("/", api.handleDeleteJob)
				r.Get("/artifact", api.handleGetJobArtifact)
				r.Get("/logs", api.handleGetJobLogs)
				r.Post("/retry", api.handleRetryJob)
				r.Post("/cancel", api.handleCancelJob)
			})
		})
	})

	r.Mount("/api/v1", apiRouter)

	r.Get("/openapi.yml", func(w http.ResponseWriter, r *http.Request) {
		specPath, ok := findOpenAPISpecPath(dep.Config.StaticDir)
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
		http.ServeFile(w, r, specPath)
	})

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok\n"))
	})

	staticIndex := filepath.Join(dep.Config.StaticDir, "index.html")
	uiEnabled := false
	if dep.Config.StaticDir != "" {
		if info, err := os.Stat(staticIndex); err == nil && !info.IsDir() {
			spa := spaHandler(dep.Config.StaticDir)
			r.Get("/", spa)
			r.Get("/*", spa)
			r.Head("/", spa)
			r.Head("/*", spa)
			uiEnabled = true
		}
	}

	if !uiEnabled {
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte("object-storage backend is running\n\nHint: build the frontend and point --static-dir to frontend/dist\n"))
		})
	}

	return r
}

func spaHandler(staticDir string) http.HandlerFunc {
	fileServer := http.FileServer(http.Dir(staticDir))
	indexPath := filepath.Join(staticDir, "index.html")

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}

		reqPath := path.Clean(r.URL.Path)
		if reqPath == "/" {
			http.ServeFile(w, r, indexPath)
			return
		}

		rel := strings.TrimPrefix(reqPath, "/")
		target := filepath.Join(staticDir, rel)
		if info, err := os.Stat(target); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}

		http.ServeFile(w, r, indexPath)
	}
}

func findOpenAPISpecPath(staticDir string) (path string, ok bool) {
	candidates := []string{}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates, filepath.Join(exeDir, "openapi.yml"))
	}

	candidates = append(candidates,
		"openapi.yml",
		filepath.Join("dist", "openapi.yml"),
		filepath.Join("..", "openapi.yml"),
	)

	if staticDir != "" {
		sd := filepath.Clean(staticDir)
		candidates = append(candidates,
			filepath.Join(sd, "..", "openapi.yml"),
			filepath.Join(sd, "..", "..", "openapi.yml"),
		)
	}

	for _, p := range candidates {
		if fileExists(p) {
			return p, true
		}
	}
	return "", false
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
