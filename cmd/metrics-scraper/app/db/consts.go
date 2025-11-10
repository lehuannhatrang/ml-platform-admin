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

package db

import (
	"os"
)

const (
	// KarmadaAgent is the name of karmada agent.
	KarmadaAgent = "karmada-agent"
	// KarmadaScheduler is the name of karmada scheduler.
	KarmadaScheduler = "karmada-scheduler"
	// KarmadaSchedulerEstimator is the name of karmada scheduler estimator.
	KarmadaSchedulerEstimator = "karmada-scheduler-estimator"
	// KarmadaControllerManager is the name of karmada controller manager.
	KarmadaControllerManager = "karmada-controller-manager"
	// SchedulerPort is the port of karmada scheduler.
	SchedulerPort = "10351"
	// ControllerManagerPort is the port of karmada controller manager.
	ControllerManagerPort = "8080"
	// DefaultNamespace is the default namespace for karmada system.
	DefaultNamespace = "ml-platform-system"
)

// Namespace returns the system namespace from environment variable or default.
// Environment variable: KARMADA_SYSTEM_NAMESPACE
// Default: ml-platform-system
var Namespace = getNamespace()

func getNamespace() string {
	return "karmada-system"
}
