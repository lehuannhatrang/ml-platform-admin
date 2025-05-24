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

package app

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/karmada-io/karmada/pkg/sharedcli/klogflag"
	"github.com/spf13/cobra"
	cliflag "k8s.io/component-base/cli/flag"
	"k8s.io/klog/v2"

	packagemgmt "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt/package"

	"github.com/karmada-io/dashboard/cmd/api/app/options"
	"github.com/karmada-io/dashboard/cmd/api/app/router"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/aggregated"               // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/auth"                     // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/cluster"                  // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/clusteroverridepolicy"    // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/clusterpropagationpolicy" // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/config"                   // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/configmap"                // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/cronjob"                  // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/daemonset"                // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/deployment"               // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/ingress"                  // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/job"                      // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/karmadaconfig"
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/member"             // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/mgmt"               // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/namespace"          // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/overridepolicy"     // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/overview"           // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/propagationpolicy"  // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/secret"             // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/service"            // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/setting/monitoring" // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/setting/user"       // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/statefulset"        // Importing route packages forces route registration
	_ "github.com/karmada-io/dashboard/cmd/api/app/routes/unstructured"       // Importing route packages forces route registration
	"github.com/karmada-io/dashboard/pkg/auth"
	"github.com/karmada-io/dashboard/pkg/auth/fga"
	"github.com/karmada-io/dashboard/pkg/client"
	"github.com/karmada-io/dashboard/pkg/config"
	"github.com/karmada-io/dashboard/pkg/environment"
	"github.com/karmada-io/dashboard/pkg/etcd"
)

// NewAPICommand creates a *cobra.Command object with default parameters
func NewAPICommand(ctx context.Context) *cobra.Command {
	opts := options.NewOptions()
	cmd := &cobra.Command{
		Use:  "karmada-dashboard-api",
		Long: `The karmada-dashboard-api provide api for karmada-dashboard web ui. It need to access host cluster apiserver and karmada apiserver internally, it will access host cluster apiserver for creating some resource like configmap in host cluster, meanwhile it will access karmada apiserver for interactiving for purpose of managing karmada-specific resources, like cluster、override policy、propagation policy and so on.`,
		RunE: func(_ *cobra.Command, _ []string) error {
			// validate options
			//if errs := opts.Validate(); len(errs) != 0 {
			//	return errs.ToAggregate()
			//}
			if err := run(ctx, opts); err != nil {
				return err
			}
			return nil
		},
		Args: func(cmd *cobra.Command, args []string) error {
			for _, arg := range args {
				if len(arg) > 0 {
					return fmt.Errorf("%q does not take any arguments, got %q", cmd.CommandPath(), args)
				}
			}
			return nil
		},
	}
	fss := cliflag.NamedFlagSets{}

	genericFlagSet := fss.FlagSet("generic")
	opts.AddFlags(genericFlagSet)

	// Set klog flags
	logsFlagSet := fss.FlagSet("logs")
	klogflag.Add(logsFlagSet)

	cmd.Flags().AddFlagSet(genericFlagSet)
	cmd.Flags().AddFlagSet(logsFlagSet)
	return cmd
}

func run(ctx context.Context, opts *options.Options) error {
	klog.InfoS("Starting Karmada Dashboard API", "version", environment.Version)

	client.InitKarmadaConfig(
		client.WithUserAgent(environment.UserAgent()),
		client.WithKubeconfig(opts.KarmadaKubeConfig),
		client.WithKubeContext(opts.KarmadaContext),
		client.WithInsecureTLSSkipVerify(opts.SkipKarmadaApiserverTLSVerify),
	)

	client.InitKubeConfig(
		client.WithUserAgent(environment.UserAgent()),
		client.WithKubeconfig(opts.KubeConfig),
		client.WithKubeContext(opts.KubeContext),
		client.WithInsecureTLSSkipVerify(opts.SkipKubeApiserverTLSVerify),
	)

	// Initialize OpenFGA service
	if err := fga.InitFGAService(opts.OpenFGAAPIURL); err != nil {
		klog.ErrorS(err, "Failed to initialize OpenFGA service")
		return err
	}
	klog.InfoS("OpenFGA service initialized", "apiURL", opts.OpenFGAAPIURL)

	// Initialize etcd client for user management
	initEtcdClient(ctx, opts)

	// Initialize Porch API options
	if err := initPorchAPI(opts); err != nil {
		klog.ErrorS(err, "Failed to initialize Porch API")
		return err
	}

	ensureAPIServerConnectionOrDie()
	serve(opts)
	config.InitDashboardConfig(client.InClusterClient(), ctx.Done())
	<-ctx.Done()
	os.Exit(0)
	return nil
}

func initPorchAPI(opts *options.Options) error {
	// Initialize package management for Porch API
	packagemgmt.Initialize(opts)

	// Log whether Porch API is configured
	if opts.PorchAPIURL == "" {
		klog.InfoS("Porch API URL is not configured. Porch API calls will not work")
	} else {
		klog.InfoS("Porch API initialized", "apiURL", opts.PorchAPIURL)
	}

	return nil
}

func initEtcdClient(ctx context.Context, opts *options.Options) {
	// Get admin password for etcd setup
	adminPassword := os.Getenv("KARMADA_DASHBOARD_ADMIN_PASSWORD")
	if adminPassword == "" {
		adminPassword = "admin123" // Default admin password if not specified
		klog.InfoS("Using default admin password for initialization")
	}

	// Get etcd host and port from command line flags
	etcdHost := opts.EtcdHost
	etcdPort := opts.EtcdPort

	// Determine primary endpoint from environment variable or use the flag values
	primaryEndpoint := os.Getenv("ETCD_ENDPOINT")
	if primaryEndpoint == "" {
		// Use the etcd-host and etcd-port flags to construct the primary endpoint
		primaryEndpoint = fmt.Sprintf("http://%s:%d", etcdHost, etcdPort)
		klog.InfoS("Using etcd endpoint from command line flags", "etcdHost", etcdHost, "etcdPort", etcdPort, "endpoint", primaryEndpoint)
	} else {
		klog.InfoS("Using etcd endpoint from environment variable", "endpoint", primaryEndpoint)
	}

	// Create a list of all endpoints to try
	allEndpoints := []string{
		primaryEndpoint,
		fmt.Sprintf("http://%s.svc:%d", etcdHost, etcdPort), // With .svc suffix
		fmt.Sprintf("http://%s:%d", etcdHost, etcdPort),     // Without namespace part
		fmt.Sprintf("http://localhost:%d", etcdPort),        // Local connection with specified port
	}

	// Make the list unique
	uniqueEndpoints := make([]string, 0, len(allEndpoints))
	endpointMap := make(map[string]bool)

	for _, endpoint := range allEndpoints {
		if _, exists := endpointMap[endpoint]; !exists {
			uniqueEndpoints = append(uniqueEndpoints, endpoint)
			endpointMap[endpoint] = true
		}
	}

	klog.InfoS("Attempting to connect to etcd endpoints", "endpoints", uniqueEndpoints)

	// Try each endpoint
	var lastError error
	maxRetries := 3 // Retry each endpoint up to 3 times

	for _, endpoint := range uniqueEndpoints {
		for attempt := 1; attempt <= maxRetries; attempt++ {
			klog.InfoS("Connecting to etcd endpoint", "endpoint", endpoint, "attempt", attempt)

			etcdOpts := etcd.NewDefaultOptions().
				WithEndpoints([]string{endpoint}).
				WithDialTimeout(5 * time.Second).
				WithRequestTimeout(5 * time.Second)

			err := auth.InitUserManager(etcdOpts)
			if err == nil {
				klog.InfoS("Successfully connected to etcd endpoint", "endpoint", endpoint)

				// Ensure admin user creation
				ensureAdminUserCreated(ctx, adminPassword)
				return
			}

			lastError = err
			klog.ErrorS(err, "Failed to connect to etcd endpoint", "endpoint", endpoint, "attempt", attempt)

			// Add backoff between retries
			if attempt < maxRetries {
				time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
			}
		}
	}

	if lastError != nil {
		klog.ErrorS(lastError, "Failed to initialize etcd client for user management, password authentication will be disabled")
		klog.Info("Using only token-based authentication")
	}
}

// ensureAdminUserCreated ensures the admin user is created
func ensureAdminUserCreated(ctx context.Context, adminPassword string) {
	userManager := auth.GetUserManager()
	if userManager == nil {
		klog.Error("User manager is nil, cannot create admin user. Authentication with username/password will not work.")
		return
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// First check if admin user exists
	exists, err := userManager.UserExists(ctx, "admin")
	if err != nil {
		klog.ErrorS(err, "Failed to check if admin user exists")
		return
	}

	if exists {
		klog.InfoS("Admin user already exists, not creating")
		return
	}

	// Admin user doesn't exist, create it
	klog.InfoS("Creating admin user with provided password")
	err = userManager.CreateUser(ctx, "admin", adminPassword, "admin@example.com", "admin")
	if err != nil {
		klog.ErrorS(err, "Failed to create admin user")
		return
	}

	klog.InfoS("Admin user created successfully")
}

func ensureAPIServerConnectionOrDie() {
	versionInfo, err := client.InClusterClient().Discovery().ServerVersion()
	if err != nil {
		klog.Fatalf("Error while initializing connection to Kubernetes apiserver. "+
			"This most likely means that the cluster is misconfigured. Reason: %s\n", err)
		os.Exit(1)
	}
	klog.InfoS("Successful initial request to the Kubernetes apiserver", "version", versionInfo.String())

	karmadaVersionInfo, err := client.InClusterKarmadaClient().Discovery().ServerVersion()
	if err != nil {
		klog.Fatalf("Error while initializing connection to Karmada apiserver. "+
			"This most likely means that the cluster is misconfigured. Reason: %s\n", err)
		os.Exit(1)
	}
	klog.InfoS("Successful initial request to the Karmada apiserver", "version", karmadaVersionInfo.String())
}

func serve(opts *options.Options) {
	insecureAddress := fmt.Sprintf("%s:%d", opts.InsecureBindAddress, opts.InsecurePort)
	klog.V(1).InfoS("Listening and serving on", "address", insecureAddress)
	go func() {
		klog.Fatal(router.Router().Run(insecureAddress))
	}()
}
