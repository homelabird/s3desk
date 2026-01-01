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
