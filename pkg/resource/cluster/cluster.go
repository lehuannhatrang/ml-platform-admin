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

	"github.com/karmada-io/karmada/pkg/apis/cluster/v1alpha1"
	karmadaclientset "github.com/karmada-io/karmada/pkg/generated/clientset/versioned"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/pkg/auth/fga"
	"github.com/karmada-io/dashboard/pkg/common/errors"
	"github.com/karmada-io/dashboard/pkg/common/helpers"
	"github.com/karmada-io/dashboard/pkg/common/types"
	"github.com/karmada-io/dashboard/pkg/dataselect"
)

// Cluster the definition of a cluster.
type Cluster struct {
	ObjectMeta         types.ObjectMeta          `json:"objectMeta"`
	TypeMeta           types.TypeMeta            `json:"typeMeta"`
	Ready              metav1.ConditionStatus    `json:"ready"`
	KubernetesVersion  string                    `json:"kubernetesVersion,omitempty"`
	SyncMode           v1alpha1.ClusterSyncMode  `json:"syncMode"`
	NodeSummary        *v1alpha1.NodeSummary     `json:"nodeSummary,omitempty"`
	AllocatedResources ClusterAllocatedResources `json:"allocatedResources"`
}

// ClusterList contains a list of clusters.
type ClusterList struct {
	ListMeta types.ListMeta `json:"listMeta"`
	Clusters []Cluster      `json:"clusters"`
	// List of non-critical errors, that occurred during resource retrieval.
	Errors []error `json:"errors"`
}

// GetClusterList returns a list of clusters that the user has permission to access.
// If username is empty, all clusters are returned.
func GetClusterList(client karmadaclientset.Interface, dsQuery *dataselect.DataSelectQuery, username ...string) (*ClusterList, error) {
	// Get all clusters first
	clusters, err := client.ClusterV1alpha1().Clusters().List(context.TODO(), helpers.ListEverything)
	nonCriticalErrors, criticalError := errors.ExtractErrors(err)
	if criticalError != nil {
		return nil, criticalError
	}

	// Extract username if provided, otherwise use empty string
	user := ""
	if len(username) > 0 && username[0] != "" {
		user = username[0]
	}

	// If no username provided or username is empty, return all clusters
	if user == "" {
		klog.V(4).InfoS("No username provided, returning all clusters")
		return toClusterList(client, clusters.Items, nonCriticalErrors, dsQuery), nil
	}

	// Filter clusters based on user permissions
	klog.V(4).InfoS("Filtering clusters by user permissions", "username", user)
	var authorizedClusters []v1alpha1.Cluster
	
	// Get the FGA service
	fgaService := fga.FGAService
	if fgaService == nil {
		klog.V(4).InfoS("OpenFGA service not initialized, returning all clusters", "username", user)
		return toClusterList(client, clusters.Items, nonCriticalErrors, dsQuery), nil
	}

	// Check the user's role, if admin, return all clusters
	// First, check if user has admin relation with dashboard
	isAdmin, err := fgaService.GetClient().Check(context.TODO(), user, "admin", "dashboard", "dashboard")
	if err != nil {
		klog.ErrorS(err, "Failed to check if user is admin", "username", user)
		// Continue with cluster-specific checks in case of error
	} else if isAdmin {
		klog.V(4).InfoS("User is admin, returning all clusters", "username", user)
		return toClusterList(client, clusters.Items, nonCriticalErrors, dsQuery), nil
	}

	// If not admin, check cluster-specific permissions
	for _, cluster := range clusters.Items {
		// Check if user has either owner or member relation with the cluster
		isOwner, err := fgaService.GetClient().Check(context.TODO(), user, "owner", "cluster", cluster.Name)
		if err != nil {
			klog.ErrorS(err, "Failed to check owner permission", "username", user, "cluster", cluster.Name)
			// Skip this cluster on error to be safe
			continue
		}
		
		if isOwner {
			authorizedClusters = append(authorizedClusters, cluster)
			continue
		}
		
		isMember, err := fgaService.GetClient().Check(context.TODO(), user, "member", "cluster", cluster.Name)
		if err != nil {
			klog.ErrorS(err, "Failed to check member permission", "username", user, "cluster", cluster.Name)
			// Skip this cluster on error to be safe
			continue
		}
		
		if isMember {
			authorizedClusters = append(authorizedClusters, cluster)
		}
	}

	klog.V(4).InfoS("Filtered clusters by permissions", 
		"username", user, 
		"totalClusters", len(clusters.Items), 
		"authorizedClusters", len(authorizedClusters))
	
	return toClusterList(client, authorizedClusters, nonCriticalErrors, dsQuery), nil
}

func toClusterList(_ karmadaclientset.Interface, clusters []v1alpha1.Cluster, nonCriticalErrors []error, dsQuery *dataselect.DataSelectQuery) *ClusterList {
	clusterList := &ClusterList{
		Clusters: make([]Cluster, 0),
		ListMeta: types.ListMeta{TotalItems: len(clusters)},
		Errors:   nonCriticalErrors,
	}
	clusterCells, filteredTotal := dataselect.GenericDataSelectWithFilter(
		toCells(clusters),
		dsQuery,
	)
	clusters = fromCells(clusterCells)
	clusterList.ListMeta = types.ListMeta{TotalItems: filteredTotal}
	for _, cluster := range clusters {
		clusterList.Clusters = append(clusterList.Clusters, toCluster(&cluster))
	}
	return clusterList
}

func toCluster(cluster *v1alpha1.Cluster) Cluster {
	allocatedResources, err := getclusterAllocatedResources(cluster)
	if err != nil {
		log.Printf("Couldn't get allocated resources of %s cluster: %s\n", cluster.Name, err)
	}

	return Cluster{
		ObjectMeta:         types.NewObjectMeta(cluster.ObjectMeta),
		TypeMeta:           types.NewTypeMeta(types.ResourceKindCluster),
		Ready:              getClusterConditionStatus(cluster, metav1.ConditionTrue),
		KubernetesVersion:  cluster.Status.KubernetesVersion,
		AllocatedResources: allocatedResources,
		SyncMode:           cluster.Spec.SyncMode,
		NodeSummary:        cluster.Status.NodeSummary,
	}
}

func getClusterConditionStatus(cluster *v1alpha1.Cluster, conditionType metav1.ConditionStatus) metav1.ConditionStatus {
	for _, condition := range cluster.Status.Conditions {
		if condition.Status == conditionType {
			return condition.Status
		}
	}
	return metav1.ConditionUnknown
}
