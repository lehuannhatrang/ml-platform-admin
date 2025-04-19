package replicaset

import (
	apps "k8s.io/api/apps/v1"
	v1 "k8s.io/api/core/v1"
	client "k8s.io/client-go/kubernetes"
	"fmt"

	"github.com/karmada-io/dashboard/pkg/common/errors"
	"github.com/karmada-io/dashboard/pkg/common/types"
	"github.com/karmada-io/dashboard/pkg/dataselect"
	"github.com/karmada-io/dashboard/pkg/resource/common"
)

// GetReplicaSetList returns a list of all ReplicaSets in the cluster.
func GetReplicaSetList(client client.Interface, nsQuery *common.NamespaceQuery,
	dsQuery *dataselect.DataSelectQuery) (*ReplicaSetList, error) {
	// Handle nil client to prevent panic
	if client == nil {
		return nil, fmt.Errorf("kubernetes client is nil")
	}

	channels := &common.ResourceChannels{
		ReplicaSetList: common.GetReplicaSetListChannel(client, nsQuery, 1),
		PodList:        common.GetPodListChannel(client, nsQuery, 1),
		EventList:      common.GetEventListChannel(client, nsQuery, 1),
	}

	replicaSets := <-channels.ReplicaSetList.List
	err := <-channels.ReplicaSetList.Error
	nonCriticalErrors, criticalError := errors.ExtractErrors(err)
	if criticalError != nil {
		return nil, criticalError
	}

	pods := <-channels.PodList.List
	err = <-channels.PodList.Error
	nonCriticalErrors, criticalError = errors.AppendError(err, nonCriticalErrors)
	if criticalError != nil {
		return nil, criticalError
	}

	events := <-channels.EventList.List
	err = <-channels.EventList.Error
	nonCriticalErrors, criticalError = errors.AppendError(err, nonCriticalErrors)
	if criticalError != nil {
		return nil, criticalError
	}

	return toReplicaSetList(replicaSets.Items, pods.Items, events.Items, nonCriticalErrors, dsQuery), nil
}

func toReplicaSetList(replicaSets []apps.ReplicaSet, pods []v1.Pod, events []v1.Event,
	nonCriticalErrors []error, dsQuery *dataselect.DataSelectQuery) *ReplicaSetList {

	result := &ReplicaSetList{
		Items:    make([]ReplicaSet, 0),
		ListMeta: types.ListMeta{TotalItems: len(replicaSets)},
		Errors:   nonCriticalErrors,
	}

	for _, rs := range replicaSets {
		matchingPods := common.FilterPodsByControllerRef(&rs, pods)
		podInfo := common.GetPodInfo(rs.Status.Replicas, rs.Spec.Replicas, matchingPods)
		conditions := getConditions(rs.Status.Conditions)

		replicaSet := toReplicaSet(&rs, &podInfo, conditions)
		result.Items = append(result.Items, replicaSet)
	}

	return result
}

func toReplicaSet(replicaSet *apps.ReplicaSet, podInfo *common.PodInfo, conditions []common.Condition) ReplicaSet {
	return ReplicaSet{
		ObjectMeta:          types.NewObjectMeta(replicaSet.ObjectMeta),
		TypeMeta:            types.NewTypeMeta(types.ResourceKindReplicaSet),
		ContainerImages:     common.GetContainerImages(&replicaSet.Spec.Template.Spec),
		InitContainerImages: common.GetInitContainerImages(&replicaSet.Spec.Template.Spec),
		PodInfo:             *podInfo,
		Conditions:          conditions,
	}
}

func getConditions(conditions []apps.ReplicaSetCondition) []common.Condition {
	var result []common.Condition
	for _, condition := range conditions {
		result = append(result, common.Condition{
			Type:               string(condition.Type),
			Status:             condition.Status,
			LastProbeTime:      condition.LastTransitionTime,
			LastTransitionTime: condition.LastTransitionTime,
			Reason:             condition.Reason,
			Message:            condition.Message,
		})
	}
	return result
}
