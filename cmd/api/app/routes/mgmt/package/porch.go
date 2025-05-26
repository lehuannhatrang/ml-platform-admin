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

package packagemgmt

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	authv1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/options"
	"github.com/karmada-io/dashboard/cmd/api/app/router"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/common/errors"
)

var (
	porchOptions *options.Options

	// tokenCache stores service account tokens with their expiration time
	tokenCache      = make(map[string]cachedToken)
	tokenCacheMutex sync.RWMutex
)

// cachedToken holds a token and its expiration time
type cachedToken struct {
	Token      string
	Expiration time.Time
}

// Initialize stores the options for later use
func Initialize(o *options.Options) {
	porchOptions = o
}

// HandlePorchListRepositories handles GET requests for repositories from the Porch server
func HandlePorchListRepositories(c *gin.Context) {
	proxyToPorch(c, "/apis/porch.kpt.dev/v1alpha1/namespaces/default/repositories")
}

// HandlePorchGetRepository handles GET requests for a specific repository from the Porch server
func HandlePorchGetRepository(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		klog.Error("Repository name is required")
		common.Fail(c, errors.NewBadRequest("repository name is required"))
		return
	}

	proxyToPorch(c, fmt.Sprintf("/apis/porch.kpt.dev/v1alpha1/namespaces/default/repositories/%s", name))
}

// HandlePorchCreateRepository handles POST requests to create a repository in the Porch server
func HandlePorchCreateRepository(c *gin.Context) {
	proxyToPorch(c, "/apis/porch.kpt.dev/v1alpha1/namespaces/default/repositories")
}

// HandlePorchUpdateRepository handles PUT requests to update a repository in the Porch server
func HandlePorchUpdateRepository(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		klog.Error("Repository name is required")
		common.Fail(c, errors.NewBadRequest("repository name is required"))
		return
	}

	proxyToPorch(c, fmt.Sprintf("/apis/porch.kpt.dev/v1alpha1/namespaces/default/repositories/%s", name))
}

// HandlePorchDeleteRepository handles DELETE requests to delete a repository from the Porch server
func HandlePorchDeleteRepository(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		klog.Error("Repository name is required")
		common.Fail(c, errors.NewBadRequest("repository name is required"))
		return
	}

	proxyToPorch(c, fmt.Sprintf("/apis/porch.kpt.dev/v1alpha1/namespaces/default/repositories/%s", name))
}

// HandlePorchListPackageRevisions handles GET requests for package revisions from the Porch server
func HandlePorchListPackageRevisions(c *gin.Context) {
	proxyToPorch(c, "/apis/porch.kpt.dev/v1alpha1/namespaces/default/packagerevisions")
}

// HandlePorchGetPackageRevision handles GET requests for a specific package revision from the Porch server
func HandlePorchGetPackageRevision(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		klog.Error("PackageRevision name is required")
		common.Fail(c, errors.NewBadRequest("packagerevision name is required"))
		return
	}

	proxyToPorch(c, fmt.Sprintf("/apis/porch.kpt.dev/v1alpha1/namespaces/default/packagerevisions/%s", name))
}

// HandlePorchCreatePackageRevision handles POST requests to create a package revision in the Porch server
func HandlePorchCreatePackageRevision(c *gin.Context) {
	proxyToPorch(c, "/apis/porch.kpt.dev/v1alpha1/namespaces/default/packagerevisions")
}

// HandlePorchUpdatePackageRevision handles PUT requests to update a package revision in the Porch server
func HandlePorchUpdatePackageRevision(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		klog.Error("PackageRevision name is required")
		common.Fail(c, errors.NewBadRequest("packagerevision name is required"))
		return
	}

	proxyToPorch(c, fmt.Sprintf("/apis/porch.kpt.dev/v1alpha1/namespaces/default/packagerevisions/%s", name))
}

// HandlePorchDeletePackageRevision handles DELETE requests to delete a package revision from the Porch server
func HandlePorchDeletePackageRevision(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		klog.Error("PackageRevision name is required")
		common.Fail(c, errors.NewBadRequest("packagerevision name is required"))
		return
	}

	proxyToPorch(c, fmt.Sprintf("/apis/porch.kpt.dev/v1alpha1/namespaces/default/packagerevisions/%s", name))
}

// proxyToPorch proxies the request to the Porch server
func proxyToPorch(c *gin.Context, path string) {
	if porchOptions == nil || porchOptions.PorchAPIURL == "" {
		klog.Error("Porch API URL is not configured")
		common.Fail(c, errors.NewInternal("Porch API is not configured"))
		return
	}

	// Get service account token for the porch-server service account
	// token, err := getServiceAccountToken(c.Request.Context(), "porch-server", "porch-system")
	token, err := getServiceAccountToken(c.Request.Context(), "karmada-dashboard", "karmada-system")

	if err != nil {
		klog.ErrorS(err, "Failed to get service account token")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to get service account token: %v", err)))
		return
	}

	// Create URL for the Porch API
	porchURL := porchOptions.PorchAPIURL + path

	// Create a new request
	req, err := http.NewRequestWithContext(context.Background(), c.Request.Method, porchURL, c.Request.Body)
	if err != nil {
		klog.ErrorS(err, "Failed to create request to Porch API")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to create request to Porch API: %v", err)))
		return
	}

	// Copy headers from original request
	for k, v := range c.Request.Header {
		if k != "Authorization" { // Skip Authorization header, we'll set it ourselves
			req.Header[k] = v
		}
	}

	// Set Authorization header with service account token
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))

	// Copy query parameters
	q := req.URL.Query()
	for k, v := range c.Request.URL.Query() {
		for _, vv := range v {
			q.Add(k, vv)
		}
	}
	req.URL.RawQuery = q.Encode()

	// Create HTTP client with optional TLS skip verification
	transport := &http.Transport{}

	// Skip TLS verification if configured
	if porchOptions.SkipPorchTLSVerify {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}

	// Make the request to the Porch API
	client := &http.Client{Transport: transport}
	resp, err := client.Do(req)
	if err != nil {
		klog.ErrorS(err, "Failed to call Porch API")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to call Porch API: %v", err)))
		return
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		klog.ErrorS(err, "Failed to read response from Porch API")
		common.Fail(c, errors.NewInternal(fmt.Sprintf("Failed to read response from Porch API: %v", err)))
		return
	}

	// Copy response headers
	for k, v := range resp.Header {
		for _, vv := range v {
			c.Header(k, vv)
		}
	}

	// Set status code and return response
	c.Status(resp.StatusCode)
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), body)
}

// getServiceAccountToken creates a token for the specified service account or returns a cached token if valid
func getServiceAccountToken(ctx context.Context, saName, saNamespace string) (string, error) {
	// Create cache key
	cacheKey := fmt.Sprintf("%s/%s", saNamespace, saName)

	// Check if we have a valid cached token
	tokenCacheMutex.RLock()
	cachedData, exists := tokenCache[cacheKey]
	tokenCacheMutex.RUnlock()

	// Return cached token if it exists and is not expired (with 5 minute buffer)
	if exists && time.Now().Add(5*time.Minute).Before(cachedData.Expiration) {
		klog.V(4).InfoS("Using cached service account token", "serviceAccount", cacheKey, "expiresAt", cachedData.Expiration)
		return cachedData.Token, nil
	}

	klog.V(4).InfoS("Generating new service account token", "serviceAccount", cacheKey)

	// Get the kubernetes client from the management cluster
	clientset := client.InClusterClient()
	if clientset == nil {
		return "", fmt.Errorf("failed to get kubernetes client: client is nil")
	}

	// Token lifetime in seconds (1 hour)
	tokenLifetime := int64(3600)

	// Create a token request for the service account
	tr, err := clientset.CoreV1().ServiceAccounts(saNamespace).CreateToken(
		ctx,
		saName,
		&authv1.TokenRequest{
			Spec: authv1.TokenRequestSpec{
				ExpirationSeconds: ptr(tokenLifetime),
				Audiences:         []string{"https://kubernetes.default.svc.cluster.local"},
			},
		},
		metav1.CreateOptions{},
	)
	if err != nil {
		return "", fmt.Errorf("failed to create token for service account %s/%s: %v", saNamespace, saName, err)
	}

	// Calculate expiration time
	expirationTime := time.Now().Add(time.Duration(tokenLifetime) * time.Second)

	// Cache the token
	tokenCacheMutex.Lock()
	tokenCache[cacheKey] = cachedToken{
		Token:      tr.Status.Token,
		Expiration: expirationTime,
	}
	tokenCacheMutex.Unlock()

	klog.InfoS("Cached new service account token", "serviceAccount", cacheKey, "expiresAt", expirationTime)
	return tr.Status.Token, nil
}

// ptr returns a pointer to the provided value
func ptr(i int64) *int64 {
	return &i
}

// HandlePorchGetPackageRevisionResources handles GET requests for package revision resources
func HandlePorchGetPackageRevisionResources(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		klog.Error("Package revision name is required")
		common.Fail(c, errors.NewBadRequest("package revision name is required"))
		return
	}

	proxyToPorch(c, fmt.Sprintf("/apis/porch.kpt.dev/v1alpha1/namespaces/default/packagerevisionresources/%s", name))
}

// RegisterPorchRoutes registers all routes for Porch API
func RegisterPorchRoutes() {
	porchRouter := router.Mgmt()
	{
		// Repository routes
		porchRouter.GET("/porch/repository", HandlePorchListRepositories)
		porchRouter.GET("/porch/repository/:name", HandlePorchGetRepository)
		porchRouter.POST("/porch/repository", HandlePorchCreateRepository)
		porchRouter.PUT("/porch/repository/:name", HandlePorchUpdateRepository)
		porchRouter.DELETE("/porch/repository/:name", HandlePorchDeleteRepository)

		// PackageRevision routes
		porchRouter.GET("/porch/packagerevision", HandlePorchListPackageRevisions)
		porchRouter.GET("/porch/packagerevision/:name", HandlePorchGetPackageRevision)
		porchRouter.POST("/porch/packagerevision", HandlePorchCreatePackageRevision)
		porchRouter.PUT("/porch/packagerevision/:name", HandlePorchUpdatePackageRevision)
		porchRouter.DELETE("/porch/packagerevision/:name", HandlePorchDeletePackageRevision)

		// PackageRevisionResources routes
		porchRouter.GET("/porch/packagerevisionresources/:name", HandlePorchGetPackageRevisionResources)
	}
	klog.InfoS("Registered package management routes for Porch API")
}

// init registers Porch API routes when the package is imported
func init() {
	// Register Porch routes
	RegisterPorchRoutes()
	klog.InfoS("Initialized Porch API integration")
}
