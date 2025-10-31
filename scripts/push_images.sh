#!/bin/bash

# Function to display an error message and exit.
error_exit() {
  echo "Error: $1"
  exit 1
}

# Prompt for the previous version; default to "0.8" if none provided.
read -p "Enter previous version (e.g. 0.8) [default: 0.8]: " prev_version
prev_version=${prev_version:-0.8}

# Validate version format (expects something like X.Y)
if [[ ! $prev_version =~ ^[0-9]+\.[0-9]+$ ]]; then
  error_exit "Version must be in the format X.Y (for example: 0.8)"
fi

# Split the version into major and minor parts.
major=$(echo "$prev_version" | cut -d. -f1)
minor=$(echo "$prev_version" | cut -d. -f2)

# Auto-increment the minor version.
new_minor=$((minor + 1))
new_version="$major.$new_minor"

echo "Tagging images with version: v$new_version"

# Tag and push the 'web' image.
docker tag karmada/ml-platform-admin-web:main lehuannhatrang/ml-platform-admin-web:v$new_version || error_exit "Failed to tag ml-platform-admin-web image"
docker image push lehuannhatrang/ml-platform-admin-web:v$new_version || error_exit "Failed to push ml-platform-admin-web image"

# Tag and push the 'api' image.
docker tag karmada/ml-platform-admin-api:main lehuannhatrang/ml-platform-admin-api:v$new_version || error_exit "Failed to tag ml-platform-admin-api image"
docker image push lehuannhatrang/ml-platform-admin-api:v$new_version || error_exit "Failed to push ml-platform-admin-api image"

echo "Images tagged and pushed successfully with version v$new_version."