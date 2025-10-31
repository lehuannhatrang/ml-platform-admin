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

package etcd

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"sync"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
	"k8s.io/klog/v2"
)

const (
	// DefaultDialTimeout is the default dial timeout for the etcd client
	DefaultDialTimeout = 5 * time.Second
	// DefaultRequestTimeout is the default request timeout for the etcd client
	DefaultRequestTimeout = 5 * time.Second
	// DefaultEndpoint is the default endpoint for the etcd client
	DefaultEndpoint = "http://ml-platform-admin-etcd:2379"
)

var (
	etcdClient      *clientv3.Client
	etcdClientOnce  sync.Once
	etcdClientMutex sync.Mutex
)

// Options holds the etcd client configuration options
type Options struct {
	Endpoints      []string
	DialTimeout    time.Duration
	RequestTimeout time.Duration
	CertFile       string
	KeyFile        string
	TrustedCAFile  string
	SkipTLSVerify  bool
	UseTLS         bool
}

// NewDefaultOptions returns a new Options with default values
func NewDefaultOptions() *Options {
	return &Options{
		Endpoints:      []string{DefaultEndpoint},
		DialTimeout:    DefaultDialTimeout,
		RequestTimeout: DefaultRequestTimeout,
		UseTLS:         false,
	}
}

// WithEndpoints sets the endpoints for the etcd client
func (o *Options) WithEndpoints(endpoints []string) *Options {
	o.Endpoints = endpoints
	return o
}

// WithDialTimeout sets the dial timeout for the etcd client
func (o *Options) WithDialTimeout(timeout time.Duration) *Options {
	o.DialTimeout = timeout
	return o
}

// WithRequestTimeout sets the request timeout for the etcd client
func (o *Options) WithRequestTimeout(timeout time.Duration) *Options {
	o.RequestTimeout = timeout
	return o
}

// WithTLSConfig sets the TLS configuration for the etcd client
func (o *Options) WithTLSConfig(certFile, keyFile, caFile string) *Options {
	o.CertFile = certFile
	o.KeyFile = keyFile
	o.TrustedCAFile = caFile
	o.UseTLS = true
	return o
}

// WithSkipTLSVerify sets whether to skip TLS verification
func (o *Options) WithSkipTLSVerify(skip bool) *Options {
	o.SkipTLSVerify = skip
	return o
}

// GetEtcdClient returns an etcd client
func GetEtcdClient(opts *Options) (*clientv3.Client, error) {
	// Protect access to the client
	etcdClientMutex.Lock()
	defer etcdClientMutex.Unlock()

	// Check if we already have a working client
	if etcdClient != nil {
		// Test if the existing client is still working
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		_, err := etcdClient.Get(ctx, "connection_test")
		if err == nil {
			// Client is still working, return it
			return etcdClient, nil
		}

		// Client is not working, close it and create a new one
		klog.ErrorS(err, "Existing etcd client is not working, creating a new one")
		etcdClient.Close()
		etcdClient = nil
	}

	// Create a new client
	var err error
	etcdClient, err = newEtcdClient(opts)
	return etcdClient, err
}

// newEtcdClient creates a new etcd client
func newEtcdClient(opts *Options) (*clientv3.Client, error) {
	if opts == nil {
		opts = NewDefaultOptions()
	}

	// Set reasonable defaults if not provided
	if len(opts.Endpoints) == 0 {
		opts.Endpoints = []string{DefaultEndpoint}
	}

	if opts.DialTimeout == 0 {
		opts.DialTimeout = DefaultDialTimeout
	}

	if opts.RequestTimeout == 0 {
		opts.RequestTimeout = DefaultRequestTimeout
	}

	klog.InfoS("Creating new etcd client", "endpoints", opts.Endpoints, "dialTimeout", opts.DialTimeout)

	config := clientv3.Config{
		Endpoints:   opts.Endpoints,
		DialTimeout: opts.DialTimeout,
	}

	// Configure TLS if required and certificates are provided
	if opts.UseTLS && opts.CertFile != "" && opts.KeyFile != "" && opts.TrustedCAFile != "" {
		tlsConfig, err := setupTLS(opts.CertFile, opts.KeyFile, opts.TrustedCAFile, opts.SkipTLSVerify)
		if err != nil {
			klog.ErrorS(err, "Failed to setup TLS for etcd")
			return nil, fmt.Errorf("failed to setup TLS: %v", err)
		}
		config.TLS = tlsConfig
		klog.InfoS("Using TLS for etcd connection")
	} else {
		klog.InfoS("Using non-TLS etcd connection")
	}

	// Try to create client with retries
	var client *clientv3.Client
	var err error

	maxRetries := 3
	for attempt := 1; attempt <= maxRetries; attempt++ {
		client, err = clientv3.New(config)
		if err == nil {
			break
		}

		if attempt < maxRetries {
			klog.ErrorS(err, "Failed to create etcd client, retrying", "attempt", attempt, "maxRetries", maxRetries)
			time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
		} else {
			klog.ErrorS(err, "Failed to create etcd client after all attempts")
			return nil, fmt.Errorf("failed to create etcd client: %v", err)
		}
	}

	if client == nil {
		return nil, fmt.Errorf("failed to create etcd client: unknown error")
	}

	// Test connection with shorter timeout for quicker feedback
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, err = client.Get(ctx, "test_connection")
	if err != nil {
		klog.ErrorS(err, "Failed to connect to etcd", "endpoints", opts.Endpoints)
		client.Close()
		return nil, fmt.Errorf("failed to connect to etcd: %v", err)
	}

	klog.InfoS("Successfully connected to etcd", "endpoints", opts.Endpoints)
	return client, nil
}

// setupTLS sets up a TLS configuration for the etcd client
func setupTLS(certFile, keyFile, caFile string, skipVerify bool) (*tls.Config, error) {
	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, fmt.Errorf("failed to load client cert/key pair: %v", err)
	}

	caData, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read CA cert file: %v", err)
	}

	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(caData) {
		return nil, fmt.Errorf("failed to append CA certs from %s", caFile)
	}

	return &tls.Config{
		Certificates:       []tls.Certificate{cert},
		RootCAs:            pool,
		InsecureSkipVerify: skipVerify,
	}, nil
}
