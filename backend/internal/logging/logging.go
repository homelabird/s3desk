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
}

var (
	defaultLogger = New(FormatText)
	stdoutMu      sync.Mutex
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

func (l *Logger) Infof(format string, args ...any) {
	l.log("info", fmt.Sprintf(format, args...))
}

func (l *Logger) Errorf(format string, args ...any) {
	l.log("error", fmt.Sprintf(format, args...))
}

func (l *Logger) Fatalf(format string, args ...any) {
	l.log("error", fmt.Sprintf(format, args...))
	os.Exit(1)
}

func (l *Logger) log(level, message string) {
	if l == nil {
		return
	}
	if l.format == FormatText {
		l.text.Printf("%s", message)
		return
	}

	fields := map[string]any{
		"ts":        time.Now().UTC().Format(time.RFC3339Nano),
		"level":     level,
		"msg":       message,
		"component": "server",
	}
	if l.out == os.Stdout {
		WriteJSONLineStdout(fields)
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	writeJSONLine(l.out, fields)
}

func WriteJSONLineStdout(fields map[string]any) {
	stdoutMu.Lock()
	defer stdoutMu.Unlock()
	writeJSONLine(os.Stdout, fields)
}

func writeJSONLine(w io.Writer, fields map[string]any) {
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(fields)
}
