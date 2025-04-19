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

package persistentvolume

import (
	"context"
	"fmt"

	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/karmada-io/dashboard/pkg/common/types"
	"github.com/karmada-io/dashboard/pkg/dataselect"
)

// PersistentVolume provides the simplified version of kubernetes persistentvolume object.
type PersistentVolume struct {
	types.ObjectMeta `json:"objectMeta"`
	types.TypeMeta   `json:"typeMeta"`
	Status           v1.PersistentVolumeStatus `json:"status"`
	Spec             v1.PersistentVolumeSpec   `json:"spec"`
}

// PersistentVolumeList contains a list of persistentvolumes.
type PersistentVolumeList struct {
	types.ListMeta    `json:"listMeta"`
	PersistentVolumes []PersistentVolume `json:"persistentVolumes"`
	Errors            []error            `json:"errors"`
}

// PersistentVolumeDetail provides the detailed information about a specific persistentvolume.
type PersistentVolumeDetail struct {
	types.ObjectMeta `json:"objectMeta"`
	types.TypeMeta   `json:"typeMeta"`
	Status           v1.PersistentVolumeStatus `json:"status"`
	Spec             v1.PersistentVolumeSpec   `json:"spec"`
}

// GetPersistentVolumeList returns a list of all persistentvolumes in the cluster.
func GetPersistentVolumeList(client kubernetes.Interface, dsQuery *dataselect.DataSelectQuery) (*PersistentVolumeList, error) {
	// Handle nil client to prevent panic
	if client == nil {
		return nil, fmt.Errorf("kubernetes client is nil")
	}
	
	pvcList, err := client.CoreV1().PersistentVolumes().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	return toPersistentVolumeList(pvcList.Items), nil
}

// GetPersistentVolumeDetail returns detailed information about a persistentvolume.
func GetPersistentVolumeDetail(client kubernetes.Interface, name string) (*PersistentVolumeDetail, error) {
	// Handle nil client to prevent panic
	if client == nil {
		return nil, fmt.Errorf("kubernetes client is nil")
	}
	
	pv, err := client.CoreV1().PersistentVolumes().Get(context.TODO(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	return toPersistentVolumeDetail(pv), nil
}

func toPersistentVolumeList(pvs []v1.PersistentVolume) *PersistentVolumeList {
	result := &PersistentVolumeList{
		PersistentVolumes: make([]PersistentVolume, 0),
		ListMeta:          types.ListMeta{TotalItems: len(pvs)},
	}

	for _, pv := range pvs {
		result.PersistentVolumes = append(result.PersistentVolumes, toPersistentVolume(pv))
	}

	return result
}

func toPersistentVolume(pv v1.PersistentVolume) PersistentVolume {
	objectMeta := types.NewObjectMeta(pv.ObjectMeta)
	
	// Set a default empty namespace since PVs are cluster-scoped
	// This ensures consistent object structure for the frontend
	objectMeta.Namespace = ""
	
	// If this PV is bound to a PVC, we can get the namespace from the claimRef
	if pv.Spec.ClaimRef != nil && pv.Spec.ClaimRef.Namespace != "" {
		objectMeta.Namespace = pv.Spec.ClaimRef.Namespace
	}
	
	return PersistentVolume{
		ObjectMeta: objectMeta,
		TypeMeta:   types.NewTypeMeta("PersistentVolume"),
		Status:     pv.Status,
		Spec:       pv.Spec,
	}
}

func toPersistentVolumeDetail(pv *v1.PersistentVolume) *PersistentVolumeDetail {
	objectMeta := types.NewObjectMeta(pv.ObjectMeta)
	
	// Set a default empty namespace since PVs are cluster-scoped
	// This ensures consistent object structure for the frontend
	objectMeta.Namespace = ""
	
	// If this PV is bound to a PVC, we can get the namespace from the claimRef
	if pv.Spec.ClaimRef != nil && pv.Spec.ClaimRef.Namespace != "" {
		objectMeta.Namespace = pv.Spec.ClaimRef.Namespace
	}
	
	return &PersistentVolumeDetail{
		ObjectMeta: objectMeta,
		TypeMeta:   types.NewTypeMeta("PersistentVolume"),
		Status:     pv.Status,
		Spec:       pv.Spec,
	}
}
