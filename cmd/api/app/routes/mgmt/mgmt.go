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

package mgmt

import (
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/argocd"      // Import ArgoCD management routes
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/configmap"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/cronjob"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/customresource"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/daemonset"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/deployment"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/ingress"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/job"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/namespace"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/node"     // Importing mgmt route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/overview" // Importing mgmt route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/package"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/persistentvolume"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/pod" // Importing mgmt route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/replicaset"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/secret"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/service"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/statefulset"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/unstructured"
)
