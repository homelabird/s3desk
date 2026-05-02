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

{{- define "s3desk.secretName" -}}
{{- default (include "s3desk.fullname" .) .Values.secrets.existingSecret -}}
{{- end }}

{{- define "s3desk.metricsTokenRequired" -}}
{{- if or (.Values.server.allowRemote | default false) (.Values.monitoring.serviceMonitor.enabled | default false) (.Values.monitoring.podMonitor.enabled | default false) -}}
true
{{- else -}}
false
{{- end -}}
{{- end }}

{{- define "s3desk.renderHTTPProbe" -}}
{{- $root := .root -}}
{{- $probe := deepCopy .probe -}}
{{- $httpGet := get $probe "httpGet" -}}
{{- if kindIs "map" $httpGet -}}
  {{- $headers := get $httpGet "httpHeaders" | default (list) -}}
  {{- $hasHostHeader := false -}}
  {{- range $headers -}}
    {{- if eq (lower (toString .name)) "host" -}}
      {{- $hasHostHeader = true -}}
    {{- end -}}
  {{- end -}}
  {{- if not $hasHostHeader -}}
    {{- $_ := set $httpGet "httpHeaders" (append $headers (dict "name" "Host" "value" (include "s3desk.fullname" $root))) -}}
  {{- end -}}
  {{- $_ := set $probe "httpGet" $httpGet -}}
{{- end -}}
{{- toYaml $probe -}}
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
  {{- $databaseURL := trim (default "" .Values.db.databaseUrl) -}}
  {{- $encryptionKey := trim (default "" .Values.server.encryptionKey) -}}
  {{- $autoGenerateAPIToken := .Values.secrets.autoGenerateApiToken | default false -}}
  {{- $tokenRequired := eq (include "s3desk.metricsTokenRequired" .) "true" -}}
  {{- $browserFacing := or (.Values.ingress.enabled | default false) (.Values.istio.virtualService.enabled | default false) -}}
  {{- $remoteBrowserFacing := and (.Values.server.allowRemote | default false) $browserFacing -}}

  {{- $placeholderTokens := list "change-me" "changeme" "default" "token" "api-token" "s3desk" "s3desk-local" "replace-me" "replace-with-a-long-random-token" "replace-me-with-a-strong-token" -}}
  {{- if has (lower $apiToken) $placeholderTokens -}}
    {{- fail "Invalid value: server.apiToken must not use a placeholder value. Set a strong random token or use secrets.existingSecret." -}}
  {{- end -}}

  {{- if and $tokenRequired (eq $apiToken "") (eq $existingSecret "") (not $autoGenerateAPIToken) -}}
    {{- fail "Missing configuration: this release needs an API token for remote access or metrics scraping. Set server.apiToken, enable secrets.autoGenerateApiToken, or use secrets.existingSecret." -}}
  {{- end -}}

  {{- if and (eq .Values.db.backend "postgres") (eq $databaseURL "") (eq $existingSecret "") -}}
    {{- fail "Missing configuration: db.backend=postgres requires db.databaseUrl or secrets.existingSecret with the configured database URL key." -}}
  {{- end -}}

  {{- if gt (int .Values.replicaCount) 1 -}}
    {{- fail "Unsupported configuration: S3Desk currently requires replicaCount=1 because job and DATA_DIR ownership are single-writer." -}}
  {{- end -}}

  {{- if and $remoteBrowserFacing (eq $encryptionKey "") (eq $existingSecret "") -}}
    {{- fail "Missing production hardening: browser-facing remote deployments require server.encryptionKey or secrets.existingSecret so backups can be authenticated." -}}
  {{- end -}}

  {{- if and $remoteBrowserFacing (not (.Values.networkPolicy.enabled | default false)) -}}
    {{- fail "Missing production hardening: browser-facing remote deployments require networkPolicy.enabled=true. Use values-production.yaml as a baseline." -}}
  {{- end -}}

  {{- if and $remoteBrowserFacing (or (not (kindIs "map" .Values.resources)) (not (hasKey .Values.resources "requests")) (not (hasKey .Values.resources "limits"))) -}}
    {{- fail "Missing production hardening: browser-facing remote deployments require resources.requests and resources.limits. Use values-production.yaml as a baseline." -}}
  {{- end -}}

  {{- $podSecurityContext := .Values.podSecurityContext | default dict -}}
  {{- if and $remoteBrowserFacing (ne (toString (get $podSecurityContext "runAsNonRoot")) "true") -}}
    {{- fail "Missing production hardening: browser-facing remote deployments require podSecurityContext.runAsNonRoot=true. Use values-production.yaml as a baseline." -}}
  {{- end -}}

  {{- $securityContext := .Values.securityContext | default dict -}}
  {{- if and $remoteBrowserFacing (ne (toString (get $securityContext "allowPrivilegeEscalation")) "false") -}}
    {{- fail "Missing production hardening: browser-facing remote deployments require securityContext.allowPrivilegeEscalation=false. Use values-production.yaml as a baseline." -}}
  {{- end -}}
  {{- if and $remoteBrowserFacing (ne (toString (get $securityContext "readOnlyRootFilesystem")) "true") -}}
    {{- fail "Missing production hardening: browser-facing remote deployments require securityContext.readOnlyRootFilesystem=true. Use values-production.yaml as a baseline." -}}
  {{- end -}}
  {{- $capabilities := get $securityContext "capabilities" | default dict -}}
  {{- $capabilityDrops := get $capabilities "drop" | default (list) -}}
  {{- if and $remoteBrowserFacing (not (has "ALL" $capabilityDrops)) -}}
    {{- fail "Missing production hardening: browser-facing remote deployments require securityContext.capabilities.drop to include ALL. Use values-production.yaml as a baseline." -}}
  {{- end -}}

  {{- if and $remoteBrowserFacing (.Values.serviceAccount.automountServiceAccountToken | default false) -}}
    {{- fail "Missing production hardening: browser-facing remote deployments require serviceAccount.automountServiceAccountToken=false unless a dedicated Kubernetes API integration is added." -}}
  {{- end -}}
{{- end }}
