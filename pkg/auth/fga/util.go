package fga

import (
	"context"
	"k8s.io/klog/v2"
)

// HasClusterAccess checks if the user is an admin or has any role on the given cluster.
// Returns true if the user is an admin or has a role (owner/member) on the cluster.
func HasClusterAccess(ctx context.Context, fgaClient Client, username, clusterName string) (bool, error) {
	// Check if user is admin
	isAdmin, err := fgaClient.Check(ctx, username, "admin", "dashboard", "dashboard")
	if err != nil {
		klog.ErrorS(err, "Failed to check admin role in OpenFGA", "user", username)
		return false, err
	}
	if isAdmin {
		return true, nil
	}

	// Check if user is owner or member of the cluster
	isOwner, err := fgaClient.Check(ctx, username, "owner", "cluster", clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to check owner role in OpenFGA", "user", username, "cluster", clusterName)
		return false, err
	}
	if isOwner {
		return true, nil
	}

	isMember, err := fgaClient.Check(ctx, username, "member", "cluster", clusterName)
	if err != nil {
		klog.ErrorS(err, "Failed to check member role in OpenFGA", "user", username, "cluster", clusterName)
		return false, err
	}
	if isMember {
		return true, nil
	}

	return false, nil
}
