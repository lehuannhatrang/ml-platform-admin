package replicaset

import (
	"context"

	apps "k8s.io/api/apps/v1"
	metaV1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	client "k8s.io/client-go/kubernetes"

	"github.com/karmada-io/dashboard/pkg/common/errors"
	"github.com/karmada-io/dashboard/pkg/dataselect"
	"github.com/karmada-io/dashboard/pkg/resource/common"
	"github.com/karmada-io/dashboard/pkg/resource/event"
)

// GetReplicaSetDetail gets replica set details.
func GetReplicaSetDetail(client client.Interface, namespace, name string) (*ReplicaSetDetail, error) {
	replicaSetData, err := client.AppsV1().ReplicaSets(namespace).Get(context.TODO(), name, metaV1.GetOptions{})
	if err != nil {
		return nil, err
	}

	channels := &common.ResourceChannels{
		PodList: common.GetPodListChannel(client, common.NewSameNamespaceQuery(namespace), 1),
	}

	pods := <-channels.PodList.List
	err = <-channels.PodList.Error
	nonCriticalErrors, criticalError := errors.ExtractErrors(err)
	if criticalError != nil {
		return nil, criticalError
	}

	matchingPods := common.FilterPodsByControllerRef(replicaSetData, pods.Items)
	podInfo := common.GetPodInfo(replicaSetData.Status.Replicas, replicaSetData.Spec.Replicas, matchingPods)
	conditions := getConditions(replicaSetData.Status.Conditions)

	replicaSet := toReplicaSet(replicaSetData, &podInfo, conditions)
	return getReplicaSetDetail(replicaSet, replicaSetData, nonCriticalErrors), nil
}

func getReplicaSetDetail(rs ReplicaSet, replicaSet *apps.ReplicaSet, nonCriticalErrors []error) *ReplicaSetDetail {
	return &ReplicaSetDetail{
		ReplicaSet:     rs,
		Containers:     replicaSet.Spec.Template.Spec.Containers,
		InitContainers: replicaSet.Spec.Template.Spec.InitContainers,
		Selector:       &replicaSet.Spec,
		Errors:         nonCriticalErrors,
	}
}

// GetReplicaSetEvents returns events related to replica set.
func GetReplicaSetEvents(client client.Interface, dsQuery *dataselect.DataSelectQuery, namespace, name string) (*common.EventList, error) {
	channels := &common.ResourceChannels{
		EventList: common.GetEventListChannel(client, common.NewSameNamespaceQuery(namespace), 1),
	}

	events := <-channels.EventList.List
	err := <-channels.EventList.Error
	nonCriticalErrors, criticalError := errors.ExtractErrors(err)
	if criticalError != nil {
		return nil, criticalError
	}

	eventList := event.CreateEventList(events.Items, dsQuery)
	eventList.Errors = nonCriticalErrors
	return &eventList, nil
}
