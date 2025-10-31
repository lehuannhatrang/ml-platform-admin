{{/*
Expand the name of the chart.
*/}}
{{- define "ml-platform-admin.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Extract the namespace of the chart.
*/}}
{{- define "ml-platform-admin.namespace" -}}
{{- default .Release.Namespace -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "ml-platform-admin.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "ml-platform-admin.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "ml-platform-admin.labels" -}}
helm.sh/chart: {{ include "ml-platform-admin.chart" . }}
{{ include "ml-platform-admin.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "ml-platform-admin.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ml-platform-admin.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ml-platform-admin-api labels
*/}}
{{- define "ml-platform-admin.api.labels" -}}
{{ include "ml-platform-admin.labels" . }}
app: {{ include "ml-platform-admin.name" . }}-api
{{- end -}}


{{/*
Return the proper karmada search image name
*/}}
{{- define "ml-platform-admin.api.image" -}}
{{ include "common.images.image" (dict "imageRoot" .Values.api.image "global" .Values.global) }}
{{- end -}}


{{/*
Return the proper karmada search image name
*/}}
{{- define "ml-platform-admin.web.image" -}}
{{ include "common.images.image" (dict "imageRoot" .Values.web.image "global" .Values.global) }}
{{- end -}}

{{/*
ml-platform-admin-web labels
*/}}
{{- define "ml-platform-admin.web.labels" -}}
{{ include "ml-platform-admin.labels" . }}
app: {{ include "ml-platform-admin.name" . }}-web
{{- if .Values.web.labels }}
{{- range $key, $value := .Values.web.labels }}
{{ $key }}: {{ $value }}
{{- end }}
{{- end }}
{{- end -}}


{{/*
Return the proper Docker Image Registry Secret Names
*/}}
{{- define "ml-platform-admin.imagePullSecrets" -}}
{{ include "common.images.pullSecrets" (dict "images" (list .Values.api.image .Values.web.image) "global" .Values.global) }}
{{- end -}}
