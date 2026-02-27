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

package common

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/dataselect"
	"github.com/karmada-io/dashboard/pkg/resource/common"
)

func parsePaginationPathParameter(request *gin.Context) *dataselect.PaginationQuery {
	itemsPerPage, err := strconv.ParseInt(request.Query("itemsPerPage"), 10, 0)
	if err != nil {
		return dataselect.NoPagination
	}

	page, err := strconv.ParseInt(request.Query("page"), 10, 0)
	if err != nil {
		return dataselect.NoPagination
	}

	// Frontend pages start from 1 and backend starts from 0
	return dataselect.NewPaginationQuery(int(itemsPerPage), int(page-1))
}

func parseFilterPathParameter(request *gin.Context) *dataselect.FilterQuery {
	return dataselect.NewFilterQuery(strings.Split(request.Query("filterBy"), ","))
}

// Parses query parameters of the request and returns a SortQuery object
func parseSortPathParameter(request *gin.Context) *dataselect.SortQuery {
	return dataselect.NewSortQuery(strings.Split(request.Query("sortBy"), ","))
}

// ParseDataSelectPathParameter parses query parameters of the request and returns a DataSelectQuery object
func ParseDataSelectPathParameter(request *gin.Context) *dataselect.DataSelectQuery {
	paginationQuery := parsePaginationPathParameter(request)
	sortQuery := parseSortPathParameter(request)
	filterQuery := parseFilterPathParameter(request)
	return dataselect.NewDataSelectQuery(paginationQuery, sortQuery, filterQuery)
}

// ParseNamespacePathParameter parses namespace selector for list pages in path parameter.
// The namespace selector is a comma separated list of namespaces that are trimmed.
// No namespaces mean "view all user namespaces", i.e., everything except kube-system.
func ParseNamespacePathParameter(request *gin.Context) *common.NamespaceQuery {
	namespace := request.Param("namespace")
	namespaces := strings.Split(namespace, ",")
	var nonEmptyNamespaces []string
	for _, n := range namespaces {
		n = strings.Trim(n, " ")
		if len(n) > 0 {
			nonEmptyNamespaces = append(nonEmptyNamespaces, n)
		}
	}
	return common.NewNamespaceQuery(nonEmptyNamespaces)
}

// GetResolvedClusterName retrieves the resolved cluster name from the Gin context.
// The cluster name is resolved by the EnsureMemberClusterMiddleware.
// If not set in context, it falls back to the clustername path parameter.
// If Karmada is not enabled, it always returns the configured local cluster name.
func GetResolvedClusterName(c *gin.Context) string {
	// Check if resolved cluster name is in context (set by middleware)
	if resolvedCluster, exists := c.Get("resolvedClusterName"); exists {
		if clusterStr, ok := resolvedCluster.(string); ok {
			return clusterStr
		}
	}
	
	// Fallback to the path parameter
	clusterName := c.Param("clustername")
	
	// If Karmada is not enabled, always return local cluster
	if !client.IsKarmadaEnabled() {
		return client.GetLocalClusterName()
	}
	
	// Check for local cluster aliases
	if client.IsLocalClusterName(clusterName) {
		return client.GetLocalClusterName()
	}
	
	return clusterName
}

// IsLocalClusterRequest checks if the current request is for the local cluster.
// This considers both single-cluster mode (Karmada disabled) and explicit local cluster names.
func IsLocalClusterRequest(c *gin.Context) bool {
	// Check if already resolved by middleware
	if isLocal, exists := c.Get("isLocalCluster"); exists {
		if isLocalBool, ok := isLocal.(bool); ok {
			return isLocalBool
		}
	}
	
	// If Karmada is not enabled, all requests are local
	if !client.IsKarmadaEnabled() {
		return true
	}
	
	// Check the cluster name using the centralized helper
	clusterName := c.Param("clustername")
	return client.IsLocalClusterName(clusterName)
}
