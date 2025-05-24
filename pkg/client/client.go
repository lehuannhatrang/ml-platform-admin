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

package client

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	karmadaclientset "github.com/karmada-io/karmada/pkg/generated/clientset/versioned"
	"k8s.io/client-go/dynamic"
	kubeclient "k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	"k8s.io/klog/v2"

	// Added for user extraction and FGA
	"github.com/karmada-io/dashboard/pkg/auth"
	"github.com/karmada-io/dashboard/pkg/auth/fga"
	v1 "k8s.io/api/authentication/v1"
)

// LoadRestConfig creates a rest.Config using the passed kubeconfig. If context is empty, current context in kubeconfig will be used.
func LoadRestConfig(kubeconfig string, context string) (*rest.Config, error) {
	loader := &clientcmd.ClientConfigLoadingRules{ExplicitPath: kubeconfig}
	loadedConfig, err := loader.Load()
	if err != nil {
		return nil, err
	}

	if context == "" {
		context = loadedConfig.CurrentContext
	}
	klog.Infof("Use context %v", context)

	return clientcmd.NewNonInteractiveClientConfig(
		*loadedConfig,
		context,
		&clientcmd.ConfigOverrides{},
		loader,
	).ClientConfig()
}

// LoadAPIConfig creates a clientcmdapi.Config using the passed kubeconfig. If currentContext is empty, current context in kubeconfig will be used.
func LoadAPIConfig(kubeconfig string, currentContext string) (*clientcmdapi.Config, error) {
	config, err := clientcmd.LoadFromFile(kubeconfig)
	if err != nil {
		return nil, err
	}
	if currentContext == "" {
		currentContext = config.CurrentContext
	}
	context, exist := config.Contexts[currentContext]
	if !exist {
		return nil, fmt.Errorf("context:%s not exist", currentContext)
	}
	clusterName := context.Cluster
	authInfoName := context.AuthInfo
	cluster := config.Clusters[clusterName]
	authInfo := config.AuthInfos[authInfoName]

	apiConfig := &clientcmdapi.Config{
		Clusters: map[string]*clientcmdapi.Cluster{
			clusterName: cluster,
		},
		AuthInfos: map[string]*clientcmdapi.AuthInfo{
			authInfoName: authInfo,
		},
		Contexts: map[string]*clientcmdapi.Context{
			currentContext: {
				Cluster:  clusterName,
				AuthInfo: authInfoName,
			},
		},
		CurrentContext: currentContext,
	}
	return apiConfig, nil
}

// LoadeRestConfigFromKubeConfig creates a rest.Config from a kubeconfig string.
func LoadeRestConfigFromKubeConfig(kubeconfig string) (*rest.Config, error) {
	apiConfig, err := clientcmd.Load([]byte(kubeconfig))
	if err != nil {
		return nil, err
	}
	clientConfig := clientcmd.NewDefaultClientConfig(*apiConfig, &clientcmd.ConfigOverrides{})
	restConfig, err := clientConfig.ClientConfig()
	if err != nil {
		return nil, err
	}
	return restConfig, nil
}

// KubeClientSetFromKubeConfig creates a Kubernetes clientset from a kubeconfig string.
func KubeClientSetFromKubeConfig(kubeconfig string) (*kubeclient.Clientset, error) {
	restConfig, err := LoadeRestConfigFromKubeConfig(kubeconfig)
	if err != nil {
		return nil, err
	}
	kubeClient := kubeclient.NewForConfigOrDie(restConfig)
	return kubeClient, nil
}

// GetKarmadaClientFromRequest creates a Karmada clientset from an HTTP request.
func GetKarmadaClientFromRequest(request *http.Request) (karmadaclientset.Interface, error) {
	if !isKarmadaInitialized() {
		return nil, fmt.Errorf("client package not initialized")
	}
	return karmadaClientFromRequest(request)
}

func karmadaClientFromRequest(request *http.Request) (karmadaclientset.Interface, error) {
	config, err := karmadaConfigFromRequest(request)

	if err != nil {
		return nil, err
	}

	return karmadaclientset.NewForConfig(config)
}

// GetDynamicClient returns a dynamic client for the management cluster.
func GetDynamicClient() (dynamic.Interface, error) {
	// Create the REST config for the management cluster
	restConfig, _, err := GetKubeConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to get REST config: %v", err)
	}

	// Create a dynamic client using the REST config
	dynamicClient, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %v", err)
	}

	return dynamicClient, nil
}

// GetDynamicClientForMember returns a dynamic client for a member cluster.
//
// If clusterName is provided, it will configure the client to use the Karmada proxy to access the member cluster.
// If clusterName is empty, it will return a regular dynamic client for the member cluster.
func GetDynamicClientForMember(ctx *gin.Context, clusterName string) (dynamic.Interface, error) {
	// Get the authenticated username using a comprehensive approach that checks:
	// 1. User object in context (set by middleware)
	// 2. JWT claims in context
	// 3. Authorization header (Bearer token)
	usernameRaw, exists := ctx.Get("user")
	var username string
	if exists {
		if userObj, ok := usernameRaw.(*v1.UserInfo); ok {
			username = userObj.Username
		}
	}
	if username == "" {
		// fallback: check JWT claims or other context fields as in getAuthenticatedUser
		claimsRaw, exists := ctx.Get("claims")
		if exists {
			if claims, ok := claimsRaw.(map[string]interface{}); ok {
				if uname, ok := claims["username"].(string); ok {
					username = uname
				}
			}
		}
	}
	// If still no username, try getting it from the Authorization header
	if username == "" {
		// Avoid nil pointer dereference if ctx.Request is nil (happens with empty contexts)
		if ctx != nil && ctx.Request != nil {
			authHeader := ctx.GetHeader("Authorization")
			if authHeader != "" {
				// The header format should be "Bearer <token>"
				const prefix = "Bearer "
				if len(authHeader) > len(prefix) && strings.HasPrefix(authHeader, prefix) {
					tokenString := authHeader[len(prefix):]

					// Validate the token
					claims, err := auth.ValidateToken(tokenString)
					if err == nil && claims != nil {
						username = claims.Username
					}
				}
			}
		}
	}

	// Check cluster access permission if clusterName is provided and username is available
	if clusterName != "" && username != "" {
		fgaServiceRaw, exists := ctx.Get("fgaService")
		var fgaClient fga.Client
		if exists {
			if svc, ok := fgaServiceRaw.(*fga.Service); ok {
				fgaClient = svc.GetClient()
			}
		}
		// Fallback to global FGA service if available
		if fgaClient == nil && fga.FGAService != nil && fga.FGAService.GetClient() != nil {
			fgaClient = fga.FGAService.GetClient()
		}
		if fgaClient == nil {
			klog.Warning("OpenFGA client is not initialized, skipping permission check")
			// Continue without permission check if OpenFGA is not available
			// This is a fallback to maintain backward compatibility
		} else {
			// Only check permissions if we have an FGA client
			allowed, err := fga.HasClusterAccess(ctx, fgaClient, username, clusterName)
			if err != nil {
				return nil, fmt.Errorf("failed to check cluster access: %w", err)
			}
			if !allowed {
				return nil, fmt.Errorf("user %s does not have access to cluster %s", username, clusterName)
			}
		}
	}

	memberConfig, err := GetMemberConfig()
	if err != nil {
		klog.ErrorS(err, "Failed to get member config")
		return nil, fmt.Errorf("failed to get member config: %w", err)
	}

	// If a cluster name is provided, configure the client to use the Karmada proxy
	if clusterName != "" {
		karmadaConfig, _, err := GetKarmadaConfig()
		if err != nil {
			klog.ErrorS(err, "Failed to get karmada config")
			return nil, fmt.Errorf("failed to get karmada config: %w", err)
		}

		memberConfig.Host = karmadaConfig.Host + fmt.Sprintf("/apis/cluster.karmada.io/v1alpha1/clusters/%s/proxy/", clusterName)
		klog.V(4).InfoS("Using member config with proxy", "host", memberConfig.Host)
	}

	return dynamic.NewForConfig(memberConfig)
}
