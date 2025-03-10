/*
Copyright 2024 The Karmada Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package pod

import (
	"context"
	"io"

	v1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
)

// LogOptions contains options for getting pod logs
type LogOptions struct {
	Container string
	Previous  bool
	TailLines *int64
}

// PodLogsResult contains the logs and total lines information
type PodLogsResult struct {
	Logs       string `json:"logs"`
	TotalLines int64  `json:"totalLines"`
}

// GetPodLogs returns logs from a specific container in a pod
func GetPodLogs(client kubernetes.Interface, namespace, name string, opts LogOptions) (*PodLogsResult, error) {
	podLogOpts := &v1.PodLogOptions{
		Container: opts.Container,
		Previous:  opts.Previous,
		TailLines: opts.TailLines,
	}

	req := client.CoreV1().Pods(namespace).GetLogs(name, podLogOpts)
	podLogs, err := req.Stream(context.TODO())
	if err != nil {
		return nil, err
	}
	defer podLogs.Close()

	buf := new([]byte)
	*buf, err = io.ReadAll(podLogs)
	if err != nil {
		return nil, err
	}
	// Count total lines
	totalLines := int64(0)
	for _, b := range *buf {
		if b == '\n' {
			totalLines++
		}
	}
	// Add 1 for the last line if it doesn't end with newline
	if len(*buf) > 0 && (*buf)[len(*buf)-1] != '\n' {
		totalLines++
	}

	return &PodLogsResult{
		Logs:       string(*buf),
		TotalLines: totalLines,
	}, nil
}
