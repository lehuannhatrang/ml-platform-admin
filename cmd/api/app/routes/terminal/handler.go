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

package terminal

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
)

// TerminalMessage represents the message structure for terminal communication
type TerminalMessage struct {
	Operation string `json:"operation"` // stdin, resize, ping
	Data      string `json:"data,omitempty"`
	Rows      uint16 `json:"rows,omitempty"`
	Cols      uint16 `json:"cols,omitempty"`
}

// TerminalSession represents a terminal session
type TerminalSession struct {
	wsConn     *websocket.Conn
	sizeChan   chan remotecommand.TerminalSize
	doneChan   chan struct{}
	clientGone chan struct{}
}

// upgrader configures the websocket connection
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for now - in production, you should validate origins
		return true
	},
}

// Read implements the io.Reader interface for TerminalSession
func (t *TerminalSession) Read(p []byte) (int, error) {
	_, message, err := t.wsConn.ReadMessage()
	if err != nil {
		klog.V(4).Infof("read message err: %v", err)
		if t.clientGone != nil {
			close(t.clientGone)
		}
		return copy(p, endOfTransmission), err
	}

	var msg TerminalMessage
	if err := json.Unmarshal(message, &msg); err != nil {
		klog.V(4).Infof("read parse err: %v", err)
		return copy(p, endOfTransmission), err
	}

	switch msg.Operation {
	case "stdin":
		return copy(p, msg.Data), nil
	case "resize":
		t.sizeChan <- remotecommand.TerminalSize{Width: msg.Cols, Height: msg.Rows}
		return 0, nil
	case "ping":
		return 0, nil
	default:
		klog.V(4).Infof("unknown message type: %s", msg.Operation)
		return copy(p, endOfTransmission), fmt.Errorf("unknown message type: %s", msg.Operation)
	}
}

// Write implements the io.Writer interface for TerminalSession
func (t *TerminalSession) Write(p []byte) (int, error) {
	msg := TerminalMessage{
		Operation: "stdout",
		Data:      string(p),
	}

	if err := t.wsConn.WriteJSON(msg); err != nil {
		klog.V(4).Infof("write message err: %v", err)
		return 0, err
	}
	return len(p), nil
}

// Next implements the TerminalSizeQueue interface
func (t *TerminalSession) Next() *remotecommand.TerminalSize {
	select {
	case size := <-t.sizeChan:
		return &size
	case <-t.doneChan:
		return nil
	}
}

// Done signals the session is complete
func (t *TerminalSession) Done() {
	close(t.doneChan)
}

// endOfTransmission is sent when the connection is closed
var endOfTransmission = []byte{4}

// handleTerminalConnection handles WebSocket connections for terminal access
func handleTerminalConnection(c *gin.Context) {
	klog.Infof("Terminal connection request received from %s", c.ClientIP())
	
	// Get query parameters
	namespace := c.Query("namespace")
	podName := c.Query("pod")
	containerName := c.Query("container")
	clusterName := c.Query("cluster")
	shell := c.DefaultQuery("shell", "/bin/bash")

	// Validate required parameters
	if namespace == "" || podName == "" {
		klog.Errorf("Missing required parameters: namespace=%s, pod=%s", namespace, podName)
		common.Fail(c, fmt.Errorf("namespace and pod parameters are required"))
		return
	}

	// Upgrade HTTP connection to WebSocket
	wsConn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		klog.Errorf("Failed to upgrade to websocket: %v", err)
		common.Fail(c, err)
		return
	}
	defer wsConn.Close()

	clientGone := make(chan struct{})
	session := &TerminalSession{
		wsConn:     wsConn,
		sizeChan:   make(chan remotecommand.TerminalSize, 1),
		doneChan:   make(chan struct{}),
		clientGone: clientGone,
	}
	defer session.Done()

	// Get the appropriate Kubernetes client
	var k8sClient kubernetes.Interface
	var restConfig *rest.Config

	if clusterName == "mgmt-cluster" {
		// Use management cluster client
		k8sClient = client.InClusterClient()
		restConfig, _, err = client.GetKubeConfig()
		if err != nil {
			klog.Errorf("Failed to get kube config: %v", err)
			return
		}
	} else if clusterName != "" {
		// Use member cluster client
		k8sClient = client.InClusterClientForMemberCluster(clusterName)
		if k8sClient == nil {
			klog.Errorf("Failed to get member cluster client for %s", clusterName)
			session.wsConn.WriteJSON(TerminalMessage{
				Operation: "stdout",
				Data:      fmt.Sprintf("Error: Failed to get member cluster client for %s\r\n", clusterName),
			})
			return
		}
		restConfig, _, err = client.GetKarmadaConfig()
		if err != nil {
			klog.Errorf("Failed to get karmada config: %v", err)
			return
		}
	} else {
		klog.Errorf("Invalid cluster name: %s", clusterName)
		common.Fail(c, fmt.Errorf("invalid cluster name: %s", clusterName))
		return
	}

	// Check if pod exists
	ctx := context.Background()
	pod, err := k8sClient.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		klog.Errorf("Failed to get pod %s/%s: %v", namespace, podName, err)
		session.wsConn.WriteJSON(TerminalMessage{
			Operation: "stdout",
			Data:      fmt.Sprintf("Error: Failed to get pod %s/%s: %v\r\n", namespace, podName, err),
		})
		return
	}

	// If container name is not specified, use the first container
	if containerName == "" {
		if len(pod.Spec.Containers) > 0 {
			containerName = pod.Spec.Containers[0].Name
		} else {
			klog.Errorf("Pod %s/%s has no containers", namespace, podName)
			session.wsConn.WriteJSON(TerminalMessage{
				Operation: "stdout",
				Data:      fmt.Sprintf("Error: Pod %s/%s has no containers\r\n", namespace, podName),
			})
			return
		}
	}

	// Validate container exists
	containerExists := false
	for _, container := range pod.Spec.Containers {
		if container.Name == containerName {
			containerExists = true
			break
		}
	}
	if !containerExists {
		klog.Errorf("Container %s not found in pod %s/%s", containerName, namespace, podName)
		session.wsConn.WriteJSON(TerminalMessage{
			Operation: "stdout",
			Data:      fmt.Sprintf("Error: Container %s not found in pod %s/%s\r\n", containerName, namespace, podName),
		})
		return
	}

	// Send connection success message
	session.wsConn.WriteJSON(TerminalMessage{
		Operation: "stdout",
		Data:      fmt.Sprintf("Connected to pod %s/%s, container: %s\r\n", namespace, podName, containerName),
	})

	// Create exec request
	req := k8sClient.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec")

	req.VersionedParams(&corev1.PodExecOptions{
		Container: containerName,
		Command:   []string{shell},
		Stdin:     true,
		Stdout:    true,
		Stderr:    true,
		TTY:       true,
	}, scheme.ParameterCodec)

	// Create executor
	executor, err := remotecommand.NewSPDYExecutor(restConfig, "POST", req.URL())
	if err != nil {
		klog.Errorf("Failed to create executor: %v", err)
		session.wsConn.WriteJSON(TerminalMessage{
			Operation: "stdout",
			Data:      fmt.Sprintf("Error: Failed to create executor: %v\r\n", err),
		})
		return
	}

	// Start the exec session
	err = executor.Stream(remotecommand.StreamOptions{
		Stdin:             session,
		Stdout:            session,
		Stderr:            session,
		TerminalSizeQueue: session,
		Tty:               true,
	})

	if err != nil {
		klog.Errorf("Stream error: %v", err)
		session.wsConn.WriteJSON(TerminalMessage{
			Operation: "stdout",
			Data:      fmt.Sprintf("Connection closed: %v\r\n", err),
		})
	}
}

func handleNodeTerminalConnection(c *gin.Context) {
	klog.Infof("Node terminal connection request received from %s", c.ClientIP())

	nodeName := c.Query("node")
	clusterName := c.Query("cluster")
	shell := c.DefaultQuery("shell", "/bin/bash")

	if nodeName == "" || clusterName == "" {
		klog.Errorf("Missing required parameters: node=%s, cluster=%s", nodeName, clusterName)
		common.Fail(c, fmt.Errorf("node and cluster parameters are required"))
		return
	}

	wsConn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		klog.Errorf("Failed to upgrade to websocket: %v", err)
		common.Fail(c, err)
		return
	}
	defer wsConn.Close()

	clientGone := make(chan struct{})
	session := &TerminalSession{
		wsConn:     wsConn,
		sizeChan:   make(chan remotecommand.TerminalSize, 1),
		doneChan:   make(chan struct{}),
		clientGone: clientGone,
	}
	defer session.Done()

	var k8sClient kubernetes.Interface
	var restConfig *rest.Config

	if clusterName == "mgmt-cluster" {
		k8sClient = client.InClusterClient()
		restConfig, _, err = client.GetKubeConfig()
		if err != nil {
			klog.Errorf("Failed to get kube config: %v", err)
			return
		}
	} else if clusterName != "" {
		k8sClient = client.InClusterClientForMemberCluster(clusterName)
		if k8sClient == nil {
			klog.Errorf("Failed to get member cluster client for %s", clusterName)
			session.wsConn.WriteJSON(TerminalMessage{
				Operation: "stdout",
				Data:      fmt.Sprintf("Error: Failed to get member cluster client for %s\r\n", clusterName),
			})
			return
		}
		restConfig, _, err = client.GetKarmadaConfig()
		if err != nil {
			klog.Errorf("Failed to get karmada config: %v", err)
			return
		}
	} else {
		klog.Errorf("Invalid cluster name: %s", clusterName)
		common.Fail(c, fmt.Errorf("invalid cluster name: %s", clusterName))
		return
	}

	podName := fmt.Sprintf("node-shell-%s-%s", nodeName, common.GenerateName())
	namespace := "default"
	image := "ubuntu"

	shellPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      podName,
			Namespace: namespace,
		},
		Spec: corev1.PodSpec{
			NodeName:      nodeName,
			HostPID:       true,
			HostIPC:       true,
			HostNetwork:   true,
			RestartPolicy: corev1.RestartPolicyNever,
			Tolerations: []corev1.Toleration{
				{
					Operator: corev1.TolerationOpExists,
				},
			},
			Containers: []corev1.Container{
				{
					Name:    "shell",
					Image:   image,
					Command: []string{"sleep", "3600"},
					SecurityContext: &corev1.SecurityContext{
						Privileged: &[]bool{true}[0],
					},
					Stdin: true,
					TTY:   true,
				},
			},
		},
	}

	ctx := context.Background()
	_, err = k8sClient.CoreV1().Pods(namespace).Create(ctx, shellPod, metav1.CreateOptions{})
	if err != nil {
		klog.Errorf("Failed to create shell pod: %v", err)
		session.wsConn.WriteJSON(TerminalMessage{
			Operation: "stdout",
			Data:      fmt.Sprintf("Error: Failed to create shell pod: %v\r\n", err),
		})
		return
	}

	// Use a context that is cancelled when the client disconnects
	requestCtx := c.Request.Context()

	defer func() {
		klog.Infof("Cleaning up shell pod %s", podName)
		deleteCtx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()
		err := k8sClient.CoreV1().Pods(namespace).Delete(deleteCtx, podName, metav1.DeleteOptions{})
		if err != nil {
			klog.Errorf("Failed to delete shell pod %s: %v", podName, err)
		} else {
			klog.Infof("Shell pod %s deleted successfully", podName)
		}
	}()

	err = waitForPodRunning(requestCtx, k8sClient, namespace, podName, 120)
	if err != nil {
		klog.Errorf("Pod %s not running in time: %v", podName, err)
		session.wsConn.WriteJSON(TerminalMessage{
			Operation: "stdout",
			Data:      fmt.Sprintf("Error: Pod %s not running in time: %v\r\n", podName, err),
		})
		return
	}

	session.wsConn.WriteJSON(TerminalMessage{
		Operation: "stdout",
		Data:      fmt.Sprintf("Connected to node %s, via pod %s\r\n", nodeName, podName),
	})

	req := k8sClient.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec")

	req.VersionedParams(&corev1.PodExecOptions{
		Container: "shell",
		Command: []string{
			"nsenter",
			"--target", "1",
			"--mount",
			"--uts",
			"--ipc",
			"--net",
			"--pid",
			"--",
			shell,
		},
		Stdin:     true,
		Stdout:    true,
		Stderr:    true,
		TTY:       true,
	}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(restConfig, "POST", req.URL())
	if err != nil {
		klog.Errorf("Failed to create executor: %v", err)
		session.wsConn.WriteJSON(TerminalMessage{
			Operation: "stdout",
			Data:      fmt.Sprintf("Error: Failed to create executor: %v\r\n", err),
		})
		return
	}

	streamCtx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		select {
		case <-clientGone:
			klog.Infof("Client connection lost, cancelling stream for pod %s.", podName)
			cancel()
		case <-ctx.Done():
			klog.Infof("Request context cancelled, cancelling stream for pod %s.", podName)
			cancel()
		}
	}()

	err = executor.StreamWithContext(streamCtx, remotecommand.StreamOptions{
		Stdin:             session,
		Stdout:            session,
		Stderr:            session,
		TerminalSizeQueue: session,
		Tty:               true,
	})
	if err != nil {
		klog.Errorf("Stream error: %v", err)
		session.wsConn.WriteJSON(TerminalMessage{
			Operation: "stdout",
			Data:      fmt.Sprintf("Connection closed: %v\r\n", err),
		})
	}
}

func waitForPodRunning(ctx context.Context, clientset kubernetes.Interface, namespace, podName string, timeoutSeconds int) error {
	watcher, err := clientset.CoreV1().Pods(namespace).Watch(ctx, metav1.ListOptions{
		FieldSelector: "metadata.name=" + podName,
	})
	if err != nil {
		return err
	}
	defer watcher.Stop()

	var timeout <-chan time.Time
	if timeoutSeconds > 0 {
		timeout = time.After(time.Duration(timeoutSeconds) * time.Second)
	}

	for {
		select {
		case event := <-watcher.ResultChan():
			pod, ok := event.Object.(*corev1.Pod)
			if !ok {
				continue
			}
			if pod.Status.Phase == corev1.PodRunning {
				// Check if container is ready
				for _, status := range pod.Status.ContainerStatuses {
					if status.Name == "shell" && status.Ready {
						return nil
					}
				}
			}
			if pod.Status.Phase == corev1.PodFailed || pod.Status.Phase == corev1.PodSucceeded {
				return fmt.Errorf("pod terminated with phase %s", pod.Status.Phase)
			}
		case <-timeout:
			return fmt.Errorf("timed out waiting for pod to be running")
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func init() {
	r := router.V1()
	r.GET("/terminal", handleTerminalConnection)
	r.GET("/node-terminal", handleNodeTerminalConnection)
}
