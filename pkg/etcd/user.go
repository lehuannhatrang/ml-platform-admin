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
	"encoding/json"
	"fmt"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
	"golang.org/x/crypto/bcrypt"
	"k8s.io/klog/v2"
)

const (
	// UserKeyPrefix is the prefix for user keys in etcd
	UserKeyPrefix = "/karmada/dashboard/users/"
	// DefaultBcryptCost is the default cost for bcrypt
	DefaultBcryptCost = 10
)

// User represents a user in the system
type User struct {
	Username     string    `json:"username"`
	PasswordHash string    `json:"passwordHash"`
	Email        string    `json:"email,omitempty"`
	Role         string    `json:"role,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// UserManager handles user operations
type UserManager struct {
	client *clientv3.Client
}

// NewUserManager creates a new UserManager
func NewUserManager(client *clientv3.Client) *UserManager {
	return &UserManager{
		client: client,
	}
}

// CreateUser creates a new user with a bcrypt hashed password
func (um *UserManager) CreateUser(ctx context.Context, username, password, email, role string) error {
	// Check if user already exists
	if exists, err := um.UserExists(ctx, username); err != nil {
		return err
	} else if exists {
		return fmt.Errorf("user %s already exists", username)
	}

	// Hash the password
	passwordHash, err := hashPassword(password)
	if err != nil {
		return fmt.Errorf("failed to hash password: %v", err)
	}

	// Create the user
	now := time.Now()
	user := &User{
		Username:     username,
		PasswordHash: passwordHash,
		Email:        email,
		Role:         role,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	return um.saveUser(ctx, user)
}

// UserExists checks if a user exists
func (um *UserManager) UserExists(ctx context.Context, username string) (bool, error) {
	if um == nil {
		return false, fmt.Errorf("user manager is nil")
	}

	if um.client == nil {
		return false, fmt.Errorf("etcd client is nil")
	}

	key := UserKeyPrefix + username
	resp, err := um.client.Get(ctx, key)
	if err != nil {
		return false, fmt.Errorf("failed to check if user exists: %v", err)
	}
	return len(resp.Kvs) > 0, nil
}

// GetUser gets a user by username
func (um *UserManager) GetUser(ctx context.Context, username string) (*User, error) {
	key := UserKeyPrefix + username
	resp, err := um.client.Get(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("failed to get user from etcd: %v", err)
	}

	if len(resp.Kvs) == 0 {
		return nil, fmt.Errorf("user %s not found", username)
	}

	var user User
	if err := json.Unmarshal(resp.Kvs[0].Value, &user); err != nil {
		return nil, fmt.Errorf("failed to unmarshal user: %v", err)
	}

	return &user, nil
}

// UpdateUser updates a user
func (um *UserManager) UpdateUser(ctx context.Context, user *User) error {
	if exists, err := um.UserExists(ctx, user.Username); err != nil {
		return err
	} else if !exists {
		return fmt.Errorf("user %s not found", user.Username)
	}

	user.UpdatedAt = time.Now()
	return um.saveUser(ctx, user)
}

// UpdatePassword updates a user's password
func (um *UserManager) UpdatePassword(ctx context.Context, username, password string) error {
	user, err := um.GetUser(ctx, username)
	if err != nil {
		return err
	}

	// Hash the password
	passwordHash, err := hashPassword(password)
	if err != nil {
		return fmt.Errorf("failed to hash password: %v", err)
	}

	user.PasswordHash = passwordHash
	user.UpdatedAt = time.Now()
	return um.saveUser(ctx, user)
}

// DeleteUser deletes a user
func (um *UserManager) DeleteUser(ctx context.Context, username string) error {
	key := UserKeyPrefix + username
	_, err := um.client.Delete(ctx, key)
	if err != nil {
		return fmt.Errorf("failed to delete user: %v", err)
	}
	return nil
}

// ListUsers lists all users
func (um *UserManager) ListUsers(ctx context.Context) ([]*User, error) {
	resp, err := um.client.Get(ctx, UserKeyPrefix, clientv3.WithPrefix())
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %v", err)
	}

	users := make([]*User, 0, len(resp.Kvs))
	for _, kv := range resp.Kvs {
		user := &User{}
		if err := json.Unmarshal(kv.Value, user); err != nil {
			klog.ErrorS(err, "Failed to unmarshal user", "key", string(kv.Key))
			continue
		}
		users = append(users, user)
	}

	return users, nil
}

// VerifyPassword verifies a user's password
func (um *UserManager) VerifyPassword(ctx context.Context, username, password string) (bool, error) {
	klog.InfoS("Verifying password", "username", username)

	user, err := um.GetUser(ctx, username)
	if err != nil {
		klog.ErrorS(err, "Failed to get user for password verification", "username", username)
		return false, err
	}

	if user.PasswordHash == "" {
		klog.ErrorS(nil, "User has empty password hash", "username", username)
		return false, fmt.Errorf("user %s has no password set", username)
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password))
	if err != nil {
		klog.V(4).InfoS("Password verification failed", "username", username, "error", err.Error())
		return false, nil
	}

	klog.V(4).InfoS("Password verification successful", "username", username)
	return true, nil
}

// saveUser saves a user to etcd
func (um *UserManager) saveUser(ctx context.Context, user *User) error {
	key := UserKeyPrefix + user.Username
	userData, err := json.Marshal(user)
	if err != nil {
		return fmt.Errorf("failed to marshal user: %v", err)
	}

	_, err = um.client.Put(ctx, key, string(userData))
	if err != nil {
		return fmt.Errorf("failed to save user: %v", err)
	}
	return nil
}

// hashPassword hashes a password using bcrypt
func hashPassword(password string) (string, error) {
	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), DefaultBcryptCost)
	if err != nil {
		return "", err
	}
	return string(hashedBytes), nil
}

// InitializeRootUser initializes the root user if it doesn't exist yet
func (um *UserManager) InitializeRootUser(ctx context.Context, password string) error {
	if um == nil {
		return fmt.Errorf("user manager is nil")
	}

	if um.client == nil {
		return fmt.Errorf("etcd client is nil")
	}

	exists, err := um.UserExists(ctx, "admin")
	if err != nil {
		return fmt.Errorf("failed to check if admin user exists: %v", err)
	}

	if !exists {
		klog.InfoS("Admin user doesn't exist, creating it")
		if err := um.CreateUser(ctx, "admin", password, "admin@example.com", "admin"); err != nil {
			return fmt.Errorf("failed to create admin user: %v", err)
		}
		klog.InfoS("Admin user created successfully")
	} else {
		klog.InfoS("Admin user already exists")
	}

	return nil
}
