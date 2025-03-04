package replicaset

import (
	"github.com/karmada-io/dashboard/pkg/common/types"
	"github.com/karmada-io/dashboard/pkg/resource/common"
	apps "k8s.io/api/apps/v1"
	v1 "k8s.io/api/core/v1"
)

// ReplicaSetList contains a list of Replica Sets.
type ReplicaSetList struct {
	ListMeta types.ListMeta `json:"listMeta"`
	Items    []ReplicaSet   `json:"items"`
	// Errors that occurred during resource retrieval.
	Errors []error `json:"errors"`
}

// ReplicaSet is a presentation layer view of Kubernetes Replica Set resource.
type ReplicaSet struct {
	ObjectMeta types.ObjectMeta `json:"objectMeta"`
	TypeMeta   types.TypeMeta   `json:"typeMeta"`

	// Aggregate information about pods belonging to this Replica Set.
	PodInfo common.PodInfo `json:"podInfo"`

	// Container images of the Replica Set.
	ContainerImages []string `json:"containerImages"`

	// Init Container images of the Replica Set.
	InitContainerImages []string `json:"initContainerImages"`

	// Conditions attached to this ReplicaSet
	Conditions []common.Condition `json:"conditions"`
}

// ReplicaSetDetail is a presentation layer view of Kubernetes Replica Set resource.
type ReplicaSetDetail struct {
	// Extends list item structure.
	ReplicaSet `json:",inline"`

	// Containers of the replica set.
	Containers []v1.Container `json:"containers"`

	// Init Containers of the replica set.
	InitContainers []v1.Container `json:"initContainers"`

	// Selector of this replica set.
	Selector *apps.ReplicaSetSpec `json:"selector"`

	// List of non-critical errors, that occurred during resource retrieval.
	Errors []error `json:"errors"`
}
