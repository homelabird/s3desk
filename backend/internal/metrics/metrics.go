package metrics

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Metrics struct {
	registry *prometheus.Registry

	jobsQueueDepth     prometheus.Gauge
	jobsQueueCapacity  prometheus.Gauge
	jobsStartedTotal   *prometheus.CounterVec
	jobsCompletedTotal *prometheus.CounterVec
	jobsDurationMs     *prometheus.HistogramVec
	jobsCanceledTotal  *prometheus.CounterVec
	jobsRetriedTotal   *prometheus.CounterVec

	httpRequestsTotal     *prometheus.CounterVec
	httpRequestDurationMs *prometheus.HistogramVec

	transferBytesTotal  *prometheus.CounterVec
	transferErrorsTotal *prometheus.CounterVec

	storageOperationsTotal     *prometheus.CounterVec
	storageOperationDurationMs *prometheus.HistogramVec
	thumbnailCacheHitsTotal    *prometheus.CounterVec
	downloadProxyModeTotal     *prometheus.CounterVec

	eventsConnections     prometheus.Gauge
	eventsReconnectsTotal prometheus.Counter
}

func New() *Metrics {
	reg := prometheus.NewRegistry()
	m := &Metrics{registry: reg}

	m.jobsQueueDepth = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "jobs_queue_depth",
		Help: "Current depth of the job queue.",
	})
	m.jobsQueueCapacity = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "jobs_queue_capacity",
		Help: "Configured capacity of the job queue.",
	})
	m.jobsStartedTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "jobs_started_total",
		Help: "Total number of jobs started.",
	}, []string{"type"})
	m.jobsCompletedTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "jobs_completed_total",
		Help: "Total number of jobs completed.",
	}, []string{"type", "status", "error_code"})
	m.jobsDurationMs = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "jobs_duration_ms",
		Help:    "Job duration in milliseconds.",
		Buckets: prometheus.ExponentialBuckets(250, 2, 16),
	}, []string{"type", "status", "error_code"})
	m.jobsCanceledTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "jobs_canceled_total",
		Help: "Total number of jobs canceled.",
	}, []string{"type"})
	m.jobsRetriedTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "jobs_retried_total",
		Help: "Total number of jobs retried.",
	}, []string{"type"})

	m.httpRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total number of HTTP requests.",
	}, []string{"method", "route", "status"})
	m.httpRequestDurationMs = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_ms",
		Help:    "HTTP request duration in milliseconds.",
		Buckets: prometheus.ExponentialBuckets(5, 2, 12),
	}, []string{"method", "route"})

	m.transferBytesTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "transfer_bytes_total",
		Help: "Total number of bytes transferred.",
	}, []string{"direction"})
	m.transferErrorsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "transfer_errors_total",
		Help: "Total number of transfer errors.",
	}, []string{"code"})
	m.storageOperationsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "storage_operations_total",
		Help: "Total number of storage operations issued by provider, operation, and status.",
	}, []string{"provider", "operation", "status"})
	m.storageOperationDurationMs = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "storage_operation_duration_ms",
		Help:    "Storage operation duration in milliseconds.",
		Buckets: prometheus.ExponentialBuckets(10, 2, 14),
	}, []string{"provider", "operation", "status"})
	m.thumbnailCacheHitsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "thumbnail_cache_hits_total",
		Help: "Total number of backend thumbnail cache hits by source.",
	}, []string{"source"})
	m.downloadProxyModeTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "download_proxy_mode_total",
		Help: "Total number of download proxy requests by metadata mode.",
	}, []string{"mode"})

	m.eventsConnections = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "events_connections",
		Help: "Number of active realtime connections.",
	})
	m.eventsReconnectsTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "events_reconnects_total",
		Help: "Total number of realtime reconnects.",
	})

	reg.MustRegister(
		m.jobsQueueDepth,
		m.jobsQueueCapacity,
		m.jobsStartedTotal,
		m.jobsCompletedTotal,
		m.jobsDurationMs,
		m.jobsCanceledTotal,
		m.jobsRetriedTotal,
		m.httpRequestsTotal,
		m.httpRequestDurationMs,
		m.transferBytesTotal,
		m.transferErrorsTotal,
		m.storageOperationsTotal,
		m.storageOperationDurationMs,
		m.thumbnailCacheHitsTotal,
		m.downloadProxyModeTotal,
		m.eventsConnections,
		m.eventsReconnectsTotal,
	)

	return m
}

func (m *Metrics) Handler() http.Handler {
	if m == nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.NotFound(w, r)
		})
	}
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}

func (m *Metrics) SetJobsQueueDepth(depth int) {
	if m == nil {
		return
	}
	if depth < 0 {
		depth = 0
	}
	m.jobsQueueDepth.Set(float64(depth))
}

func (m *Metrics) SetJobsQueueCapacity(capacity int) {
	if m == nil {
		return
	}
	if capacity < 0 {
		capacity = 0
	}
	m.jobsQueueCapacity.Set(float64(capacity))
}

func (m *Metrics) IncJobsStarted(jobType string) {
	if m == nil {
		return
	}
	m.jobsStartedTotal.WithLabelValues(jobType).Inc()
}

func (m *Metrics) IncJobsCompleted(jobType, status string, errorCode *string) {
	if m == nil {
		return
	}
	m.jobsCompletedTotal.WithLabelValues(jobType, status, normalizeErrorCode(status, errorCode)).Inc()
}

func (m *Metrics) ObserveJobsDuration(jobType, status string, errorCode *string, duration time.Duration) {
	if m == nil {
		return
	}
	ms := float64(duration.Milliseconds())
	if ms < 0 {
		ms = 0
	}
	m.jobsDurationMs.WithLabelValues(jobType, status, normalizeErrorCode(status, errorCode)).Observe(ms)
}

func (m *Metrics) IncJobsCanceled(jobType string) {
	if m == nil {
		return
	}
	m.jobsCanceledTotal.WithLabelValues(jobType).Inc()
}

func (m *Metrics) IncJobsRetried(jobType string) {
	if m == nil {
		return
	}
	m.jobsRetriedTotal.WithLabelValues(jobType).Inc()
}

func (m *Metrics) ObserveHTTPRequest(method, route string, status int, duration time.Duration) {
	if m == nil {
		return
	}
	route = strings.TrimSpace(route)
	if route == "" {
		route = "unknown"
	}
	statusLabel := strconv.Itoa(status)
	m.httpRequestsTotal.WithLabelValues(method, route, statusLabel).Inc()
	ms := float64(duration.Milliseconds())
	if ms < 0 {
		ms = 0
	}
	m.httpRequestDurationMs.WithLabelValues(method, route).Observe(ms)
}

func (m *Metrics) AddTransferBytes(direction string, bytes int64) {
	if m == nil {
		return
	}
	if direction == "" || bytes <= 0 {
		return
	}
	m.transferBytesTotal.WithLabelValues(direction).Add(float64(bytes))
}

func (m *Metrics) IncTransferErrors(code string) {
	if m == nil {
		return
	}
	code = strings.TrimSpace(code)
	if code == "" {
		code = "unknown"
	}
	m.transferErrorsTotal.WithLabelValues(code).Inc()
}

func (m *Metrics) ObserveStorageOperation(provider, operation, status string, duration time.Duration) {
	if m == nil {
		return
	}
	provider = strings.TrimSpace(provider)
	if provider == "" {
		provider = "unknown"
	}
	operation = strings.TrimSpace(operation)
	if operation == "" {
		operation = "unknown"
	}
	status = strings.TrimSpace(status)
	if status == "" {
		status = "error"
	}
	m.storageOperationsTotal.WithLabelValues(provider, operation, status).Inc()
	ms := float64(duration.Milliseconds())
	if ms < 0 {
		ms = 0
	}
	m.storageOperationDurationMs.WithLabelValues(provider, operation, status).Observe(ms)
}

func (m *Metrics) IncThumbnailCacheHit(source string) {
	if m == nil {
		return
	}
	source = strings.TrimSpace(source)
	if source == "" {
		source = "unknown"
	}
	m.thumbnailCacheHitsTotal.WithLabelValues(source).Inc()
}

func (m *Metrics) IncDownloadProxyMode(mode string) {
	if m == nil {
		return
	}
	mode = strings.TrimSpace(mode)
	if mode == "" {
		mode = "unknown"
	}
	m.downloadProxyModeTotal.WithLabelValues(mode).Inc()
}

func normalizeErrorCode(status string, errorCode *string) string {
	code := ""
	if errorCode != nil {
		code = strings.TrimSpace(*errorCode)
	}
	if code != "" {
		return code
	}
	if strings.TrimSpace(status) == "failed" {
		return "unknown"
	}
	return "none"
}

func (m *Metrics) IncEventsConnections() {
	if m == nil {
		return
	}
	m.eventsConnections.Inc()
}

func (m *Metrics) DecEventsConnections() {
	if m == nil {
		return
	}
	m.eventsConnections.Dec()
}

func (m *Metrics) IncEventsReconnects() {
	if m == nil {
		return
	}
	m.eventsReconnectsTotal.Inc()
}
