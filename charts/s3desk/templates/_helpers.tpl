{{- define "s3desk.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "s3desk.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := include "s3desk.name" . -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end }}

{{- define "s3desk.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end }}

{{- define "s3desk.labels" -}}
helm.sh/chart: {{ include "s3desk.chart" . }}
{{ include "s3desk.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "s3desk.selectorLabels" -}}
app.kubernetes.io/name: {{ include "s3desk.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "s3desk.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "s3desk.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}

{{/*
Validate critical chart values at render time.

We intentionally fail fast during `helm template/install/upgrade` so users don't end up with
a CrashLoopBackOff caused by insecure or incomplete configuration.

NOTE: Helm's values.schema.json validation isn't always enforced in older tooling, so we keep
this template-level validation as a second line of defense.
*/}}
{{- define "s3desk.validateValues" -}}
  {{- $apiToken := trim (default "" .Values.server.apiToken) -}}
  {{- $existingSecret := trim (default "" .Values.secrets.existingSecret) -}}

  {{- if eq $apiToken "change-me" -}}
    {{- fail "Invalid value: server.apiToken must not be 'change-me'. Set a strong random token or use secrets.existingSecret." -}}
  {{- end -}}

  {{- if and (.Values.server.allowRemote | default false) (eq $apiToken "") (eq $existingSecret "") -}}
    {{- fail "Missing configuration: server.allowRemote is true, but no API token is configured. Set server.apiToken (recommended) or secrets.existingSecret." -}}
  {{- end -}}
{{- end }}
