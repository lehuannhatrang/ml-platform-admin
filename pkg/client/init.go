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
	"context"
	"errors"
	"fmt"
	"os"
	"sync"

	"github.com/karmada-io/dashboard/pkg/auth/fga"
	karmadaclientset "github.com/karmada-io/karmada/pkg/generated/clientset/versioned"
	kubeclient "k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	"k8s.io/klog/v2"
)

const proxyURL = "/apis/cluster.karmada.io/v1alpha1/clusters/%s/proxy/"

// LocalClusterName is the default cluster name when Karmada is not enabled
const LocalClusterName = "local-cluster"

// localClusterNameOverride holds a custom local cluster name if set
var localClusterNameOverride string

// SetLocalClusterName sets a custom name for the local cluster
// This allows users to customize the cluster name via configuration
func SetLocalClusterName(name string) {
	if name != "" {
		localClusterNameOverride = name
		klog.InfoS("Local cluster name set", "name", name)
	}
}

// GetLocalClusterName returns the effective local cluster name
// It returns the configured name if set, otherwise the default "local-cluster"
func GetLocalClusterName() string {
	if localClusterNameOverride != "" {
		return localClusterNameOverride
	}
	return LocalClusterName
}

// IsLocalClusterName checks if a given cluster name refers to the local cluster
// This handles both the default name and any configured alias
func IsLocalClusterName(clusterName string) bool {
	if clusterName == "" || clusterName == LocalClusterName || clusterName == "mgmt-cluster" {
		return true
	}
	if localClusterNameOverride != "" && clusterName == localClusterNameOverride {
		return true
	}
	return false
}

var (
	kubernetesRestConfig               *rest.Config
	kubernetesAPIConfig                *clientcmdapi.Config
	inClusterClient                    kubeclient.Interface
	karmadaRestConfig                  *rest.Config
	karmadaAPIConfig                   *clientcmdapi.Config
	karmadaMemberConfig                *rest.Config
	inClusterKarmadaClient             karmadaclientset.Interface
	inClusterClientForKarmadaAPIServer kubeclient.Interface
	inClusterClientForMemberAPIServer  kubeclient.Interface
	memberClients                      sync.Map
	// CurrentUser stores the username for permission checks when context isn't available
	CurrentUser string
	// CurrentUserMutex protects concurrent access to CurrentUser
	CurrentUserMutex sync.RWMutex
	// karmadaEnabled tracks whether Karmada integration is enabled
	karmadaEnabled bool
	// karmadaEnabledMutex protects concurrent access to karmadaEnabled
	karmadaEnabledMutex sync.RWMutex
)

type configBuilder struct {
	kubeconfigPath string
	kubeContext    string
	insecure       bool
	userAgent      string
}

// Option is a function that configures a configBuilder.
type Option func(*configBuilder)

// WithUserAgent is an option to set the user agent.
func WithUserAgent(agent string) Option {
	return func(c *configBuilder) {
		c.userAgent = agent
	}
}

// WithKubeconfig is an option to set the kubeconfig path.
func WithKubeconfig(path string) Option {
	return func(c *configBuilder) {
		c.kubeconfigPath = path
	}
}

// WithKubeContext is an option to set the kubeconfig context.
func WithKubeContext(kubecontext string) Option {
	return func(c *configBuilder) {
		c.kubeContext = kubecontext
	}
}

// WithInsecureTLSSkipVerify is an option to set the insecure tls skip verify.
func WithInsecureTLSSkipVerify(insecure bool) Option {
	return func(c *configBuilder) {
		c.insecure = insecure
	}
}

func newConfigBuilder(options ...Option) *configBuilder {
	builder := &configBuilder{}

	for _, opt := range options {
		opt(builder)
	}

	return builder
}

func (in *configBuilder) buildRestConfig() (*rest.Config, error) {
	if len(in.kubeconfigPath) == 0 {
		return nil, errors.New("must specify kubeconfig path (--kubeconfig flag)")
	}
	
	// Check if kubeconfig file exists
	if _, err := os.Stat(in.kubeconfigPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("kubeconfig file not found at %s - ensure the file exists or the secret is mounted correctly", in.kubeconfigPath)
	}
	
	klog.InfoS("Using kubeconfig", "path", in.kubeconfigPath, "context", in.kubeContext)

	restConfig, err := LoadRestConfig(in.kubeconfigPath, in.kubeContext)
	if err != nil {
		return nil, fmt.Errorf("failed to load kubeconfig from %s: %w", in.kubeconfigPath, err)
	}

	restConfig.QPS = DefaultQPS
	restConfig.Burst = DefaultBurst
	// TODO: make clear that why karmada apiserver seems only can use application/json, however kubernetest apiserver can use "application/vnd.kubernetes.protobuf"
	restConfig.UserAgent = DefaultUserAgent + "/" + in.userAgent
	restConfig.TLSClientConfig.Insecure = in.insecure

	return restConfig, nil
}

func (in *configBuilder) buildAPIConfig() (*clientcmdapi.Config, error) {
	if len(in.kubeconfigPath) == 0 {
		return nil, errors.New("must specify kubeconfig path (--kubeconfig flag)")
	}
	
	// Check if kubeconfig file exists
	if _, err := os.Stat(in.kubeconfigPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("kubeconfig file not found at %s", in.kubeconfigPath)
	}
	
	klog.InfoS("Loading API config from kubeconfig", "path", in.kubeconfigPath)
	apiConfig, err := LoadAPIConfig(in.kubeconfigPath, in.kubeContext)
	if err != nil {
		return nil, err
	}
	return apiConfig, nil
}

func isKubeInitialized() bool {
	if kubernetesRestConfig == nil || kubernetesAPIConfig == nil {
		klog.Errorf(`karmada/karmada-dashboard/client' package has not been initialized properly. Run 'client.InitKubeConfig(...)' to initialize it. `)
		return false
	}
	return true
}

// GetCurrentContextFromKubeconfig reads a kubeconfig file and returns the current context name.
// If the file cannot be read or has no current context, it returns an empty string.
func GetCurrentContextFromKubeconfig(kubeconfigPath string) string {
	if kubeconfigPath == "" {
		return ""
	}
	
	loader := &clientcmd.ClientConfigLoadingRules{ExplicitPath: kubeconfigPath}
	loadedConfig, err := loader.Load()
	if err != nil {
		klog.V(4).InfoS("Could not load kubeconfig to get current context", "path", kubeconfigPath, "error", err)
		return ""
	}
	
	return loadedConfig.CurrentContext
}

// InitKubeConfig initializes the kubernetes client config.
// If context is not specified, it will use the current context from the kubeconfig file.
// The context name will also be used as the local cluster name if not already set.
//
// Configuration priority:
// 1. If running in-cluster (service account available), use InClusterConfig
// 2. If --kubeconfig is specified and file exists, use that kubeconfig
// 3. If neither works, exit with error
func InitKubeConfig(options ...Option) {
	builder := newConfigBuilder(options...)
	
	// Check if explicit kubeconfig is provided and exists
	hasExplicitKubeconfig := builder.kubeconfigPath != "" && fileExists(builder.kubeconfigPath)
	
	// Try InClusterConfig first (unless explicit kubeconfig is provided)
	if !hasExplicitKubeconfig {
		restConfig, err := rest.InClusterConfig()
		if err == nil {
			klog.InfoS("InitKubeConfig using InClusterConfig (running inside Kubernetes cluster)")
			restConfig.UserAgent = DefaultUserAgent + "/" + builder.userAgent
			restConfig.TLSClientConfig.Insecure = builder.insecure
			kubernetesRestConfig = restConfig

			apiConfig := ConvertRestConfigToAPIConfig(restConfig)
			kubernetesAPIConfig = apiConfig
			
			// When running in-cluster, use the default local cluster name
			klog.InfoS("Running in-cluster mode", "localClusterName", GetLocalClusterName())
			return
		}
		klog.InfoS("InClusterConfig not available", "error", err.Error())
	}
	
	// Fall back to explicit kubeconfig
	if builder.kubeconfigPath == "" {
		klog.ErrorS(nil, "No kubeconfig available. Either run inside a Kubernetes cluster or provide --kubeconfig flag")
		klog.InfoS("Hint: Create a kubeconfig secret and mount it, or ensure the service account token is mounted")
		os.Exit(1)
	}
	
	if !fileExists(builder.kubeconfigPath) {
		klog.ErrorS(nil, "Kubeconfig file not found", "path", builder.kubeconfigPath)
		klog.InfoS("Hint: Ensure the kubeconfig secret is created and mounted correctly")
		klog.InfoS("Create secret with: kubectl create secret generic kubeconfig --from-file=kubeconfig=~/.kube/config -n ml-platform-system")
		os.Exit(1)
	}
	
	klog.InfoS("InitKubeConfig using explicit kubeconfig file", "path", builder.kubeconfigPath)
	
	// Auto-detect context from kubeconfig if not provided
	effectiveContext := builder.kubeContext
	if effectiveContext == "" {
		effectiveContext = GetCurrentContextFromKubeconfig(builder.kubeconfigPath)
		if effectiveContext != "" {
			klog.InfoS("Using current-context from kubeconfig", "context", effectiveContext)
		} else {
			klog.InfoS("No context specified and no current-context in kubeconfig")
		}
	} else {
		klog.InfoS("Using specified context", "context", effectiveContext)
	}
	
	// Update builder with the effective context for buildRestConfig/buildAPIConfig
	builder.kubeContext = effectiveContext
	
	restConfig, err := builder.buildRestConfig()
	if err != nil {
		klog.ErrorS(err, "Could not initialize client config")
		os.Exit(1)
	}
	kubernetesRestConfig = restConfig
	
	apiConfig, err := builder.buildAPIConfig()
	if err != nil {
		klog.ErrorS(err, "Could not initialize API config")
		os.Exit(1)
	}
	kubernetesAPIConfig = apiConfig
	
	// Use the context name as the local cluster name if not already customized
	if effectiveContext != "" && localClusterNameOverride == "" {
		SetLocalClusterName(effectiveContext)
		klog.InfoS("Local cluster name set from kubeconfig context", "name", effectiveContext)
	}
}

// fileExists checks if a file exists at the given path
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// InClusterClient returns a kubernetes client.
func InClusterClient() kubeclient.Interface {
	if !isKubeInitialized() {
		return nil
	}

	if inClusterClient != nil {
		return inClusterClient
	}

	// init on-demand only
	c, err := kubeclient.NewForConfig(kubernetesRestConfig)
	if err != nil {
		klog.ErrorS(err, "Could not init kubernetes in-cluster client")
		os.Exit(1)
	}
	// initialize in-memory client
	inClusterClient = c
	return inClusterClient
}

// GetKubeConfig returns the kubernetes client config.
func GetKubeConfig() (*rest.Config, *clientcmdapi.Config, error) {
	if !isKubeInitialized() {
		return nil, nil, fmt.Errorf("client package not initialized")
	}
	return kubernetesRestConfig, kubernetesAPIConfig, nil
}

func isKarmadaInitialized() bool {
	if karmadaRestConfig == nil || karmadaAPIConfig == nil {
		klog.V(4).Infof("Karmada client is not initialized")
		return false
	}
	return true
}

// IsKarmadaEnabled returns whether Karmada integration is enabled
func IsKarmadaEnabled() bool {
	karmadaEnabledMutex.RLock()
	defer karmadaEnabledMutex.RUnlock()
	return karmadaEnabled
}

// SetKarmadaEnabled explicitly sets whether Karmada is enabled
func SetKarmadaEnabled(enabled bool) {
	karmadaEnabledMutex.Lock()
	defer karmadaEnabledMutex.Unlock()
	karmadaEnabled = enabled
	klog.InfoS("Karmada integration status", "enabled", enabled)
}

// InitKarmadaConfig initializes the karmada client config.
// If kubeconfig is not provided or invalid, Karmada will be disabled and
// the platform will operate in single-cluster mode using the local cluster.
func InitKarmadaConfig(options ...Option) error {
	builder := newConfigBuilder(options...)
	
	// If no kubeconfig path is provided, disable Karmada
	if builder.kubeconfigPath == "" {
		klog.InfoS("No Karmada kubeconfig provided, running in single-cluster mode")
		SetKarmadaEnabled(false)
		return nil
	}
	
	restConfig, err := builder.buildRestConfig()
	if err != nil {
		klog.InfoS("Could not init Karmada client config, running in single-cluster mode", "error", err)
		SetKarmadaEnabled(false)
		return nil
	}
	karmadaRestConfig = restConfig

	apiConfig, err := builder.buildAPIConfig()
	if err != nil {
		klog.InfoS("Could not init Karmada API config, running in single-cluster mode", "error", err)
		SetKarmadaEnabled(false)
		return nil
	}
	karmadaAPIConfig = apiConfig

	memberConfig, err := builder.buildRestConfig()
	if err != nil {
		klog.InfoS("Could not init Karmada member config, running in single-cluster mode", "error", err)
		SetKarmadaEnabled(false)
		return nil
	}
	karmadaMemberConfig = memberConfig
	
	// Karmada is successfully initialized
	SetKarmadaEnabled(true)
	klog.InfoS("Karmada client initialized successfully")
	return nil
}

// InClusterKarmadaClient returns a karmada client.
// Returns nil if Karmada is not enabled.
func InClusterKarmadaClient() karmadaclientset.Interface {
	if !IsKarmadaEnabled() {
		klog.V(4).InfoS("Karmada client requested but Karmada is not enabled")
		return nil
	}
	if !isKarmadaInitialized() {
		return nil
	}
	if inClusterKarmadaClient != nil {
		return inClusterKarmadaClient
	}
	// init on-demand only
	c, err := karmadaclientset.NewForConfig(karmadaRestConfig)
	if err != nil {
		klog.ErrorS(err, "Could not init karmada in-cluster client")
		return nil
	}
	// initialize in-memory client
	inClusterKarmadaClient = c
	return inClusterKarmadaClient
}

// GetKarmadaConfig returns the karmada client config.
// Returns an error if Karmada is not enabled.
func GetKarmadaConfig() (*rest.Config, *clientcmdapi.Config, error) {
	if !IsKarmadaEnabled() {
		return nil, nil, fmt.Errorf("Karmada is not enabled")
	}
	if !isKarmadaInitialized() {
		return nil, nil, fmt.Errorf("Karmada client package not initialized")
	}
	return karmadaRestConfig, karmadaAPIConfig, nil
}

// GetMemberConfig returns the member client config.
// When Karmada is not enabled, returns the local cluster config.
func GetMemberConfig() (*rest.Config, error) {
	if !IsKarmadaEnabled() {
		// In single-cluster mode, use the local kubernetes config
		if !isKubeInitialized() {
			return nil, fmt.Errorf("kubernetes client package not initialized")
		}
		// Return a copy of the local cluster config
		configCopy := *kubernetesRestConfig
		return &configCopy, nil
	}
	if !isKarmadaInitialized() {
		return nil, fmt.Errorf("Karmada client package not initialized")
	}
	return karmadaMemberConfig, nil
}

// InClusterClientForKarmadaAPIServer returns a kubernetes client for karmada apiserver.
func InClusterClientForKarmadaAPIServer() kubeclient.Interface {
	if !isKarmadaInitialized() {
		return nil
	}
	if inClusterClientForKarmadaAPIServer != nil {
		return inClusterClientForKarmadaAPIServer
	}
	restConfig, _, err := GetKarmadaConfig()
	if err != nil {
		klog.ErrorS(err, "Could not get karmada restConfig")
		return nil
	}
	c, err := kubeclient.NewForConfig(restConfig)
	if err != nil {
		klog.ErrorS(err, "Could not init kubernetes in-cluster client for karmada apiserver")
		return nil
	}
	inClusterClientForKarmadaAPIServer = c
	return inClusterClientForKarmadaAPIServer
}

// InClusterClientForMemberCluster returns a kubernetes client for member apiserver.
// When Karmada is not enabled, always returns the local cluster client.
// When Karmada is enabled but requesting local cluster, returns the direct client.
func InClusterClientForMemberCluster(clusterName string) kubeclient.Interface {
	// If Karmada is not enabled, always use the local cluster client
	// This handles the single-cluster mode where all requests go to local cluster
	if !IsKarmadaEnabled() {
		klog.V(4).InfoS("Karmada not enabled, using local cluster client", "requestedCluster", clusterName)
		return InClusterClient()
	}
	
	// If requesting the local cluster or management cluster, return the direct client
	if IsLocalClusterName(clusterName) {
		return InClusterClient()
	}

	if !isKarmadaInitialized() {
		return nil
	}

	// Check permissions if we have a cluster name and a current user
	if clusterName != "" {
		// Get current username for permission check
		CurrentUserMutex.RLock()
		username := CurrentUser
		CurrentUserMutex.RUnlock()
		if username != "" && fga.FGAService != nil && fga.FGAService.GetClient() != nil {
			// Check if the user has access to this cluster
			allowed, err := fga.HasClusterAccess(context.Background(), fga.FGAService.GetClient(), username, clusterName)
			if err != nil {
				klog.ErrorS(err, "Failed to check cluster access", "user", username, "cluster", clusterName)
				return nil
			}
			if !allowed {
				klog.InfoS("Access denied", "user", username, "cluster", clusterName)
				return nil
			}
		}
	}

	// Load and return Interface for member apiserver if already exist
	if value, ok := memberClients.Load(clusterName); ok {
		if inClusterClientForMemberAPIServer, ok = value.(kubeclient.Interface); ok {
			return inClusterClientForMemberAPIServer
		}
		klog.Error("Could not get client for member apiserver")
		return nil
	}

	// Client for new member apiserver
	restConfig, _, err := GetKarmadaConfig()
	if err != nil {
		klog.ErrorS(err, "Could not get karmada restConfig")
		return nil
	}
	memberConfig, err := GetMemberConfig()
	if err != nil {
		klog.ErrorS(err, "Could not get member restConfig")
		return nil
	}
	memberConfig.Host = restConfig.Host + fmt.Sprintf(proxyURL, clusterName)
	c, err := kubeclient.NewForConfig(memberConfig)
	if err != nil {
		klog.ErrorS(err, "Could not init kubernetes in-cluster client for member apiserver")
		return nil
	}
	inClusterClientForMemberAPIServer = c
	memberClients.Store(clusterName, inClusterClientForMemberAPIServer)
	return inClusterClientForMemberAPIServer
}

// ConvertRestConfigToAPIConfig converts a rest.Config to a clientcmdapi.Config.
func ConvertRestConfigToAPIConfig(restConfig *rest.Config) *clientcmdapi.Config {
	// 将 rest.Config 转换为 clientcmdapi.Config
	clientcmdConfig := clientcmdapi.NewConfig()
	clientcmdConfig.Clusters["clusterName"] = &clientcmdapi.Cluster{
		Server:                   restConfig.Host,
		InsecureSkipTLSVerify:    restConfig.Insecure,
		CertificateAuthorityData: restConfig.TLSClientConfig.CAData,
	}

	clientcmdConfig.AuthInfos["authInfoName"] = &clientcmdapi.AuthInfo{
		ClientCertificateData: restConfig.TLSClientConfig.CertData,
		ClientKeyData:         restConfig.TLSClientConfig.KeyData,
	}
	clientcmdConfig.Contexts["contextName"] = &clientcmdapi.Context{
		Cluster:  "clusterName",
		AuthInfo: "authInfoName",
	}
	clientcmdConfig.CurrentContext = "contextName"
	return clientcmdConfig
}

// SetCurrentUser sets the current user for permission checks
// This should be called during authentication to ensure username is available for cluster access checks
func SetCurrentUser(username string) {
	CurrentUserMutex.Lock()
	defer CurrentUserMutex.Unlock()
	CurrentUser = username
	klog.V(4).InfoS("Current user set", "username", username)
}

// GetCurrentUser returns the currently set username
func GetCurrentUser() string {
	CurrentUserMutex.RLock()
	defer CurrentUserMutex.RUnlock()
	return CurrentUser
}
