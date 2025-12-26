package logging

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"sync"
	"time"
)

type Format string

const (
	FormatText Format = "text"
	FormatJSON Format = "json"
)

type Logger struct {
	format Format
	out    io.Writer
	text   *log.Logger
	mu     sync.Mutex
	base   map[string]any
	level  Level
}

var (
	defaultLogger = New(FormatText)
	stdoutMu      sync.Mutex
)

type Level int

const (
	LevelDebug Level = iota
	LevelInfo
	LevelWarn
	LevelError
)

func ParseFormat(raw string) (Format, error) {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return FormatText, nil
	}
	switch raw {
	case "text":
		return FormatText, nil
	case "json":
		return FormatJSON, nil
	default:
		return "", fmt.Errorf("unsupported log format %q (expected text or json)", raw)
	}
}

func Setup(raw string) (*Logger, error) {
	format, err := ParseFormat(raw)
	if err != nil {
		return nil, err
	}
	logger := New(format)
	SetDefault(logger)
	return logger, nil
}

func New(format Format) *Logger {
	out := os.Stderr
	if format == FormatJSON {
		out = os.Stdout
	}
	return &Logger{
		format: format,
		out:    out,
		text:   log.New(out, "", log.LstdFlags),
		base:   defaultBaseFields(),
		level:  LevelInfo,
	}
}

func SetDefault(l *Logger) {
	if l == nil {
		return
	}
	defaultLogger = l
}

func Infof(format string, args ...any) {
	if defaultLogger == nil {
		return
	}
	defaultLogger.Infof(format, args...)
}

func Debugf(format string, args ...any) {
	if defaultLogger == nil {
		return
	}
	defaultLogger.Debugf(format, args...)
}

func Warnf(format string, args ...any) {
	if defaultLogger == nil {
		return
	}
	defaultLogger.Warnf(format, args...)
}

func Errorf(format string, args ...any) {
	if defaultLogger == nil {
		return
	}
	defaultLogger.Errorf(format, args...)
}

func Fatalf(format string, args ...any) {
	if defaultLogger == nil {
		return
	}
	defaultLogger.Fatalf(format, args...)
}

func InfoFields(message string, fields map[string]any) {
	if defaultLogger == nil {
		return
	}
	defaultLogger.InfoFields(message, fields)
}

func DebugFields(message string, fields map[string]any) {
	if defaultLogger == nil {
		return
	}
	defaultLogger.DebugFields(message, fields)
}

func WarnFields(message string, fields map[string]any) {
	if defaultLogger == nil {
		return
	}
	defaultLogger.WarnFields(message, fields)
}

func ErrorFields(message string, fields map[string]any) {
	if defaultLogger == nil {
		return
	}
	defaultLogger.ErrorFields(message, fields)
}

func (l *Logger) Infof(format string, args ...any) {
	l.log(LevelInfo, "info", fmt.Sprintf(format, args...))
}

func (l *Logger) Errorf(format string, args ...any) {
	l.log(LevelError, "error", fmt.Sprintf(format, args...))
}

func (l *Logger) Warnf(format string, args ...any) {
	l.log(LevelWarn, "warn", fmt.Sprintf(format, args...))
}

func (l *Logger) Debugf(format string, args ...any) {
	l.log(LevelDebug, "debug", fmt.Sprintf(format, args...))
}

func (l *Logger) Fatalf(format string, args ...any) {
	l.log(LevelError, "error", fmt.Sprintf(format, args...))
	os.Exit(1)
}

func (l *Logger) InfoFields(message string, fields map[string]any) {
	l.log(LevelInfo, "info", message, fields)
}

func (l *Logger) ErrorFields(message string, fields map[string]any) {
	l.log(LevelError, "error", message, fields)
}

func (l *Logger) WarnFields(message string, fields map[string]any) {
	l.log(LevelWarn, "warn", message, fields)
}

func (l *Logger) DebugFields(message string, fields map[string]any) {
	l.log(LevelDebug, "debug", message, fields)
}

func (l *Logger) SetLevel(level Level) {
	l.level = level
}

func (l *Logger) Enabled(level Level) bool {
	return level >= l.level
}

func ParseLevel(raw string) (Level, error) {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return LevelInfo, nil
	}
	switch raw {
	case "debug":
		return LevelDebug, nil
	case "info":
		return LevelInfo, nil
	case "warn", "warning":
		return LevelWarn, nil
	case "error":
		return LevelError, nil
	default:
		return LevelInfo, fmt.Errorf("unsupported log level %q (expected debug, info, warn, error)", raw)
	}
}

func (l *Logger) log(level Level, label, message string, fields ...map[string]any) {
	if l == nil || !l.Enabled(level) {
		return
	}
	var extra map[string]any
	if len(fields) > 0 {
		extra = fields[0]
	}
	l.logWithFields(label, message, extra)
}

func (l *Logger) logWithFields(level, message string, fields map[string]any) {
	if l == nil {
		return
	}
	if l.format == FormatText {
		if len(fields) == 0 {
			l.text.Printf("[%s] %s", strings.ToUpper(level), message)
			return
		}
		l.text.Printf("[%s] %s %s", strings.ToUpper(level), message, formatFields(fields))
		return
	}

	out := map[string]any{
		"ts":    time.Now().UTC().Format(time.RFC3339Nano),
		"level": level,
		"msg":   message,
	}
	for k, v := range l.base {
		if v == nil || v == "" {
			continue
		}
		out[k] = v
	}
	if _, ok := out["component"]; !ok {
		out["component"] = "server"
	}
	for k, v := range fields {
		out[k] = v
	}
	if l.out == os.Stdout {
		stdoutMu.Lock()
		defer stdoutMu.Unlock()
		writeJSONLine(l.out, out)
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	writeJSONLine(l.out, out)
}

func WriteJSONLineStdout(fields map[string]any) {
	stdoutMu.Lock()
	defer stdoutMu.Unlock()
	writeJSONLine(os.Stdout, mergeFields(defaultLogger, fields))
}

func writeJSONLine(w io.Writer, fields map[string]any) {
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(fields)
}

func defaultBaseFields() map[string]any {
	fields := map[string]any{
		"service": envOr("LOG_SERVICE", "object-storage"),
		"env":     envOr("LOG_ENV", "local"),
	}
	if val := strings.TrimSpace(os.Getenv("LOG_VERSION")); val != "" {
		fields["version"] = val
	}
	if val := strings.TrimSpace(os.Getenv("LOG_COMPONENT")); val != "" {
		fields["component"] = val
	}
	return fields
}

func mergeFields(logger *Logger, fields map[string]any) map[string]any {
	out := map[string]any{}
	if logger != nil {
		for k, v := range logger.base {
			if v == nil || v == "" {
				continue
			}
			out[k] = v
		}
	}
	for k, v := range fields {
		out[k] = v
	}
	return out
}

func envOr(key, fallback string) string {
	if val := strings.TrimSpace(os.Getenv(key)); val != "" {
		return val
	}
	return fallback
}

func formatFields(fields map[string]any) string {
	parts := make([]string, 0, len(fields))
	for k, v := range fields {
		parts = append(parts, fmt.Sprintf("%s=%v", k, v))
	}
	return strings.Join(parts, " ")
}
