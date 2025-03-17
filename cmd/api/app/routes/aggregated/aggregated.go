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

package aggregated

import (
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/argocd"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/configmap"    // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/cronjob"     // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/daemonset"   // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/deployment"  // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/ingress"     // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/job"         // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/namespace"   // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/node"        // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/pod"         // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/replicaset"  // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/secret"      // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/service"     // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/statefulset" // Importing member route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated/customresource" // Importing member route packages forces route registration
)
