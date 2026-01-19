#!/bin/bash

# Function to display an error message and exit.
error_exit() {
  echo "Error: $1"
  exit 1
}

# Get the current git branch name and format it for Docker tag
# Replace slashes with dashes, remove special characters
get_branch_tag() {
  local branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ -z "$branch" ]; then
    echo "main"
  else
    # Replace / with - and remove any characters not allowed in Docker tags
    echo "$branch" | sed 's/\//-/g' | sed 's/[^a-zA-Z0-9._-]//g'
  fi
}

# Get the source image tag from current branch
SOURCE_TAG=$(get_branch_tag)
echo "Detected source image tag from branch: $SOURCE_TAG"

# Prompt for the previous version; default to "0.8" if none provided.
read -p "Enter previous version (e.g. 0.14) [default: 0.14]: " prev_version
prev_version=${prev_version:-0.14}

# Validate version format (expects something like X.Y)
if [[ ! $prev_version =~ ^[0-9]+\.[0-9]+$ ]]; then
  error_exit "Version must be in the format X.Y (for example: 0.14)"
fi

# Split the version into major and minor parts.
major=$(echo "$prev_version" | cut -d. -f1)
minor=$(echo "$prev_version" | cut -d. -f2)

# Auto-increment the minor version.
new_minor=$((minor + 1))
new_version="$major.$new_minor"

echo "Tagging images with version: v$new_version"
echo "Source tag: $SOURCE_TAG -> Target tag: v$new_version"

# Tag and push the 'web' image.
echo "Tagging ml-platform-admin-web..."
docker tag karmada/ml-platform-admin-web:$SOURCE_TAG lehuannhatrang/ml-platform-admin-web:v$new_version || error_exit "Failed to tag ml-platform-admin-web image. Make sure the source image 'karmada/ml-platform-admin-web:$SOURCE_TAG' exists."
docker image push lehuannhatrang/ml-platform-admin-web:v$new_version || error_exit "Failed to push ml-platform-admin-web image"

# Tag and push the 'api' image.
echo "Tagging ml-platform-admin-api..."
docker tag karmada/ml-platform-admin-api:$SOURCE_TAG lehuannhatrang/ml-platform-admin-api:v$new_version || error_exit "Failed to tag ml-platform-admin-api image. Make sure the source image 'karmada/ml-platform-admin-api:$SOURCE_TAG' exists."
docker image push lehuannhatrang/ml-platform-admin-api:v$new_version || error_exit "Failed to push ml-platform-admin-api image"

echo ""
echo "=== Images tagged and pushed successfully ==="
echo "Web: lehuannhatrang/ml-platform-admin-web:v$new_version"
echo "API: lehuannhatrang/ml-platform-admin-api:v$new_version"
