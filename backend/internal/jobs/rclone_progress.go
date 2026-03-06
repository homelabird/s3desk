package jobs

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"strings"
	"time"

	"s3desk/internal/models"
	"s3desk/internal/ws"
)

const logReadBufferSize = 64 * 1024

type runRcloneOptions struct {
	TrackProgress bool
	DryRun        bool
	ProgressMode  rcloneProgressMode
}

type rcloneStatsUpdate struct {
	BytesDone    int64
	BytesTotal   *int64
	ObjectsDone  int64
	ObjectsTotal *int64
	SpeedBps     *int64
	EtaSeconds   *int
}

type rcloneProgressMode int

const (
	rcloneProgressTransfers rcloneProgressMode = iota
	rcloneProgressDeletes
)

func (m *Manager) trackRcloneProgress(ctx context.Context, jobID string, progress <-chan rcloneStatsUpdate) {
	var (
		objectsTotal *int64
		bytesTotal   *int64
	)

	loadTotals := func() {
		updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_, job, ok, err := m.store.GetJobByID(updateCtx, jobID)
		cancel()
		if err != nil || !ok || job.Progress == nil {
			return
		}
		if job.Progress.ObjectsTotal != nil {
			objectsTotal = job.Progress.ObjectsTotal
		}
		if job.Progress.BytesTotal != nil {
			bytesTotal = job.Progress.BytesTotal
		}
	}
	loadTotals()

	for {
		select {
		case <-ctx.Done():
			return
		case update, ok := <-progress:
			if !ok {
				return
			}

			if update.ObjectsTotal != nil && *update.ObjectsTotal > 0 {
				objectsTotal = update.ObjectsTotal
			}
			if update.BytesTotal != nil && *update.BytesTotal > 0 {
				bytesTotal = update.BytesTotal
			}

			od := update.ObjectsDone
			bd := update.BytesDone
			if objectsTotal == nil || bytesTotal == nil {
				loadTotals()
			}

			jp := &models.JobProgress{
				ObjectsDone:  &od,
				BytesDone:    &bd,
				ObjectsTotal: objectsTotal,
				BytesTotal:   bytesTotal,
			}
			if update.SpeedBps != nil {
				jp.SpeedBps = update.SpeedBps
			}
			if update.EtaSeconds != nil {
				jp.EtaSeconds = update.EtaSeconds
			}

			if err := m.persistAndPublishRunningProgress(jobID, jp); err != nil {
				m.logProgressPersistenceError(jobID, err)
			}
		}
	}
}

func readLogLine(r *bufio.Reader, maxBytes int) (string, bool, error) {
	var out strings.Builder
	if maxBytes > 0 {
		if maxBytes < logReadBufferSize {
			out.Grow(maxBytes)
		} else {
			out.Grow(logReadBufferSize)
		}
	}

	truncated := false
	for {
		chunk, err := r.ReadString('\n')
		if len(chunk) > 0 {
			if maxBytes <= 0 {
				out.WriteString(chunk)
			} else {
				remaining := maxBytes - out.Len()
				switch {
				case remaining <= 0:
					truncated = true
				case len(chunk) <= remaining:
					out.WriteString(chunk)
				default:
					out.WriteString(chunk[:remaining])
					truncated = true
				}
			}
		}

		if err != nil {
			if errors.Is(err, bufio.ErrBufferFull) {
				truncated = true
				continue
			}
			if errors.Is(err, io.EOF) {
				if out.Len() == 0 {
					return "", truncated, io.EOF
				}
				break
			}
			return strings.TrimRight(out.String(), "\r\n"), truncated, err
		}
		break
	}

	line := strings.TrimRight(out.String(), "\r\n")
	if truncated {
		return line, true, bufio.ErrTooLong
	}
	return line, false, nil
}

func (m *Manager) pipeLogs(ctx context.Context, r io.Reader, w io.Writer, jobID, level string, capture *logCapture, progressCh chan<- rcloneStatsUpdate, mode rcloneProgressMode, maxLineBytes int) {
	reader := bufio.NewReaderSize(r, logReadBufferSize)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		line, truncated, err := readLogLine(reader, maxLineBytes)
		if err != nil && !errors.Is(err, bufio.ErrTooLong) && !errors.Is(err, io.EOF) {
			return
		}
		if line == "" {
			if errors.Is(err, io.EOF) {
				return
			}
			continue
		}
		if truncated {
			line = line + " [truncated]"
		}

		rendered, stats := formatRcloneJSONLine(line)
		if rendered == "" {
			rendered = line
		}
		if capture != nil {
			capture.Add(rendered)
		}

		_, _ = w.Write([]byte("[" + level + "] " + rendered + "\n"))
		if progressCh != nil && stats != nil {
			if update, ok := progressFromStats(stats, mode); ok {
				select {
				case progressCh <- update:
				default:
				}
			}
		}
		m.hub.Publish(ws.Event{
			Type:  "job.log",
			JobID: jobID,
			Payload: map[string]any{
				"level":   level,
				"message": rendered,
			},
		})
		m.emitJobLogStdout(jobID, level, rendered)

		if errors.Is(err, io.EOF) {
			return
		}
	}
}

type rcloneLogLine struct {
	Msg    string       `json:"msg"`
	Object string       `json:"object"`
	Size   *int64       `json:"size"`
	Stats  *rcloneStats `json:"stats"`
}

type rcloneStats struct {
	Bytes          int64    `json:"bytes"`
	TotalBytes     int64    `json:"totalBytes"`
	Transfers      int64    `json:"transfers"`
	TotalTransfers int64    `json:"totalTransfers"`
	Speed          float64  `json:"speed"`
	Eta            *float64 `json:"eta"`
	Deletes        int64    `json:"deletes"`
}

func formatRcloneJSONLine(line string) (rendered string, stats *rcloneStats) {
	var msg rcloneLogLine
	if err := json.Unmarshal([]byte(line), &msg); err != nil {
		return "", nil
	}

	rendered = strings.TrimSpace(msg.Msg)
	if msg.Object != "" {
		if rendered == "" {
			rendered = msg.Object
		} else if !strings.Contains(rendered, msg.Object) {
			rendered = fmt.Sprintf("%s %s", rendered, msg.Object)
		}
	}
	return rendered, msg.Stats
}

func progressFromStats(stats *rcloneStats, mode rcloneProgressMode) (rcloneStatsUpdate, bool) {
	if stats == nil {
		return rcloneStatsUpdate{}, false
	}
	update := rcloneStatsUpdate{
		BytesDone: stats.Bytes,
	}
	if stats.TotalBytes > 0 {
		bt := stats.TotalBytes
		update.BytesTotal = &bt
	}

	switch mode {
	case rcloneProgressDeletes:
		update.ObjectsDone = stats.Deletes
	default:
		update.ObjectsDone = stats.Transfers
		if stats.TotalTransfers > 0 {
			ot := stats.TotalTransfers
			update.ObjectsTotal = &ot
		}
	}

	if stats.Speed > 0 {
		sp := int64(stats.Speed)
		update.SpeedBps = &sp
	}
	if stats.Eta != nil && *stats.Eta > 0 {
		eta := int(math.Round(*stats.Eta))
		update.EtaSeconds = &eta
	}
	return update, true
}
