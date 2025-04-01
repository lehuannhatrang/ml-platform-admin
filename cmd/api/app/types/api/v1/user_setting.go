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

package v1

// UserSetting represents user-specific settings in the system
type UserSetting struct {
	// Username is the unique identifier for the user
	Username string `json:"username"`
	// DisplayName is the human-readable name for the user
	DisplayName string `json:"displayName,omitempty"`
	// Theme represents the UI theme preference (e.g., "light", "dark")
	Theme string `json:"theme,omitempty"`
	// Language represents the preferred language for the UI
	Language string `json:"language,omitempty"`
	// DateFormat represents the preferred date format
	DateFormat string `json:"dateFormat,omitempty"`
	// TimeFormat represents the preferred time format
	TimeFormat string `json:"timeFormat,omitempty"`
	// Preferences contains additional user preferences as key-value pairs
	Preferences map[string]string `json:"preferences,omitempty"`
	// Dashboard contains dashboard configuration settings
	Dashboard *DashboardSettings `json:"dashboard,omitempty"`
}

// DashboardSettings represents user preferences specific to the dashboard view
type DashboardSettings struct {
	// DefaultView represents the default dashboard view (e.g., "clusters", "resources")
	DefaultView string `json:"defaultView,omitempty"`
	// RefreshInterval represents how often the dashboard should refresh data (in seconds)
	RefreshInterval int `json:"refreshInterval,omitempty"`
	// PinnedClusters contains a list of cluster names that the user has pinned
	PinnedClusters []string `json:"pinnedClusters,omitempty"`
	// HiddenWidgets contains a list of widget IDs that should be hidden
	HiddenWidgets []string `json:"hiddenWidgets,omitempty"`
	// WidgetLayout contains positioning information for dashboard widgets
	WidgetLayout map[string]WidgetPosition `json:"widgetLayout,omitempty"`
}

// WidgetPosition represents the position and size of a widget on the dashboard
type WidgetPosition struct {
	// Row represents the widget's row position
	Row int `json:"row"`
	// Column represents the widget's column position
	Column int `json:"column"`
	// Width represents the widget's width in grid units
	Width int `json:"width"`
	// Height represents the widget's height in grid units
	Height int `json:"height"`
}

// UserSettingRequest represents a request to create or update user settings
type UserSettingRequest struct {
	UserSetting
}

// UserSettingResponse represents a response containing user settings
type UserSettingResponse struct {
	UserSetting
}
