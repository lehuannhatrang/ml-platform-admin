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

package cluster

import (
	"context"
	"log"

	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/karmada/pkg/apis/cluster/v1alpha1"
	karmadaclientset "github.com/karmada-io/karmada/pkg/generated/clientset/versioned"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ClusterAllocatedResources is the resource summary of a cluster.
type ClusterAllocatedResources struct {
	// CPUCapacity is specified node CPU capacity in milicores.
	CPUCapacity int64   `json:"cpuCapacity"`
	CPUFraction float64 `json:"cpuFraction"`

	// MemoryCapacity is specified node memory capacity in bytes.
	MemoryCapacity int64   `json:"memoryCapacity"`
	MemoryFraction float64 `json:"memoryFraction"`

	// AllocatedPods in number of currently allocated pods on the node.
	AllocatedPods int64 `json:"allocatedPods"`

	// PodCapacity is maximum number of pods, that can be allocated on the node.
	PodCapacity int64 `json:"podCapacity"`

	// PodFraction is a fraction of pods, that can be allocated on given node.
	PodFraction float64 `json:"podFraction"`
}

func getclusterAllocatedResources(cluster *v1alpha1.Cluster) (ClusterAllocatedResources, error) {
	if cluster.Status.ResourceSummary == nil {
		return ClusterAllocatedResources{}, nil
	}
	allocatableCPU := cluster.Status.ResourceSummary.Allocatable.Cpu()
	allocatedCPU := cluster.Status.ResourceSummary.Allocated.Cpu()
	var cpuCapacity int64 = allocatableCPU.Value()
	var cpuFraction float64
	if cpuCapacity > 0 {
		cpuFraction = float64(allocatedCPU.ScaledValue(resource.Micro)) / float64(allocatableCPU.ScaledValue(resource.Micro)) * 100
	}

	allocatableMemory := cluster.Status.ResourceSummary.Allocatable.Memory()
	allocatedMemory := cluster.Status.ResourceSummary.Allocated.Memory()
	var memoryCapacity int64 = allocatableMemory.Value()
	var memoryFraction float64
	if memoryCapacity > 0 {
		memoryFraction = float64(allocatedMemory.ScaledValue(resource.Micro)) / float64(allocatableMemory.ScaledValue(resource.Micro)) * 100
	}

	allocatablePod := cluster.Status.ResourceSummary.Allocatable.Pods()
	allocatedPod := cluster.Status.ResourceSummary.Allocated.Pods()

	var podCapacity int64 = allocatablePod.Value()
	var podFraction float64
	if podCapacity > 0 {
		podFraction = float64(allocatedPod.Value()) / float64(podCapacity) * 100
	}
	return ClusterAllocatedResources{
		CPUCapacity:    allocatableCPU.Value(),
		CPUFraction:    cpuFraction,
		MemoryCapacity: allocatableMemory.Value(),
		MemoryFraction: memoryFraction,
		AllocatedPods:  allocatedPod.Value(),
		PodCapacity:    podCapacity,
		PodFraction:    podFraction,
	}, nil
}

// ClusterDetail is the detailed information of a cluster.
type ClusterDetail struct {
	Cluster `json:",inline"`
	Taints  []corev1.Taint `json:"taints,omitempty"`
}

// GetClusterDetail gets details of cluster.
func GetClusterDetail(client karmadaclientset.Interface, clusterName string) (*ClusterDetail, error) {
	log.Printf("Getting details of %s cluster", clusterName)
	cluster, err := client.ClusterV1alpha1().Clusters().Get(context.TODO(), clusterName, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return &ClusterDetail{
		Cluster: toCluster(cluster),
		Taints:  cluster.Spec.Taints,
	}, nil
}

// GetLocalClusterDetail returns the details of the local cluster
// This is used when Karmada is not enabled (single-cluster mode)
func GetLocalClusterDetail() (*ClusterDetail, error) {
	log.Printf("Getting details of local cluster")
	
	// Create a local cluster entry with reasonable defaults
	nodeCount := int32(1)
	readyNodeCount := int32(1)
	cpuCapacity := int64(4000)                      // 4 cores in millicores
	memoryCapacity := int64(8 * 1024 * 1024 * 1024) // 8GB in bytes
	podCapacity := int64(110)                       // Default pod capacity

	localCluster := v1alpha1.Cluster{
		ObjectMeta: metav1.ObjectMeta{
			Name:              client.GetLocalClusterName(),
			CreationTimestamp: metav1.Now(),
			Labels: map[string]string{
				"ml-platform.io/local": "true",
			},
		},
		Spec: v1alpha1.ClusterSpec{
			SyncMode: v1alpha1.Push,
		},
		Status: v1alpha1.ClusterStatus{
			KubernetesVersion: "v1.27.0",
			Conditions: []metav1.Condition{
				{
					Type:               "Ready",
					Status:             metav1.ConditionTrue,
					LastTransitionTime: metav1.Now(),
					Reason:             "LocalClusterReady",
					Message:            "Local cluster is ready",
				},
			},
			NodeSummary: &v1alpha1.NodeSummary{
				TotalNum: nodeCount,
				ReadyNum: readyNodeCount,
			},
			ResourceSummary: &v1alpha1.ResourceSummary{
				Allocatable: corev1.ResourceList{
					corev1.ResourceCPU:    *resource.NewMilliQuantity(cpuCapacity, resource.DecimalSI),
					corev1.ResourceMemory: *resource.NewQuantity(memoryCapacity, resource.BinarySI),
					corev1.ResourcePods:   *resource.NewQuantity(podCapacity, resource.DecimalSI),
				},
				Allocated: corev1.ResourceList{
					corev1.ResourceCPU:    *resource.NewMilliQuantity(0, resource.DecimalSI),
					corev1.ResourceMemory: *resource.NewQuantity(0, resource.BinarySI),
					corev1.ResourcePods:   *resource.NewQuantity(0, resource.DecimalSI),
				},
			},
		},
	}

	return &ClusterDetail{
		Cluster: toCluster(&localCluster),
		Taints:  nil,
	}, nil
}
