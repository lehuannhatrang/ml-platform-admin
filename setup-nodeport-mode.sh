#!/bin/bash
set -e

# Parse command line arguments
UNINSTALL=false

for arg in "$@"; do
  case $arg in
    --uninstall)
      UNINSTALL=true
      shift
      ;;
    *)
      # Unknown option
      ;;
  esac
done

# Function to install all components
install_all() {
  echo "=== DCN Dashboard NodePort Mode Setup ==="
  echo "This script will install DCN Dashboard in NodePort mode and set up OpenFGA"
  echo ""
  
  # Set the working directory to the script's directory
  cd "$(dirname "$0")"
  
  # Check if Karmada is installed
  echo "Checking if Karmada is installed..."
  karmada_check=$(kubectl get deployments.apps -n karmada-system 2>&1)
  if [[ $karmada_check == *"No resources found"* ]] || [[ $karmada_check == *"not found"* ]]; then
    echo "Karmada is not installed on this cluster."
    read -p "Do you want to install Karmada now? [y/n]: " install_karmada
    
    if [ "$install_karmada" == "y" ] || [ "$install_karmada" == "Y" ]; then
      echo "Installing Karmada..."
      
      # Install Karmada kubectl
      echo "Installing Karmada kubectl..."
      curl -s https://raw.githubusercontent.com/karmada-io/karmada/master/hack/install-cli.sh | sudo bash -s kubectl-karmada
      
      # Install karmadactl
      echo "Installing karmadactl..."
      curl -s https://raw.githubusercontent.com/karmada-io/karmada/master/hack/install-cli.sh | sudo bash
      
      # Ask for Karmada output path
      echo "Please enter the Karmada output path (default: /etc/karmada): "
      read -p "> " karmada_path
      
      # Set the default path if not provided
      if [ -z "$karmada_path" ]; then
        karmada_path="/etc/karmada"
        echo "Using default path: $karmada_path"
      else
        echo "Using custom path: $karmada_path"
      fi
      
      # Initialize Karmada
      echo "Initializing Karmada (this may take up to 5 minutes)..."
      if [ "$karmada_path" = "/etc/karmada" ]; then
        kubectl karmada init
      else
        kubectl karmada init --karmada-data "$karmada_path"
      fi
      
      # Export the karmada_path variable for later use
      export KARMADA_DATA_PATH="$karmada_path"
      
      # Wait for Karmada components to be ready
      echo "Waiting for Karmada components to be ready..."
      timeout=300  # 5 minutes
      elapsed=0
      while [ $elapsed -lt $timeout ]; do
        karmada_check=$(kubectl get deployments.apps -n karmada-system 2>&1)
        if [[ ! $karmada_check == *"No resources found"* ]] && [[ ! $karmada_check == *"not found"* ]]; then
          # Found deployments, break the loop
          break
        fi
        echo "Waiting for Karmada deployments... ($elapsed seconds elapsed)"
        sleep 10
        elapsed=$((elapsed + 10))
      done
      
      if [ $elapsed -ge $timeout ]; then
        echo "Timeout waiting for Karmada to be ready. Please check the Karmada installation manually and re-run this script."
        exit 1
      fi
      
      echo "Karmada installation completed successfully."
      
      # Check if karmada-apiserver.config exists
      echo "Checking for karmada-apiserver.config..."
      if [ ! -f "$HOME/.kube/karmada-apiserver.config" ]; then
        echo "karmada-apiserver.config not found in $HOME/.kube directory. Creating it..."
        
        # If KARMADA_DATA_PATH was set during installation, use that path
        if [ ! -z "${KARMADA_DATA_PATH}" ] && [ -f "${KARMADA_DATA_PATH}/karmada-apiserver.config" ]; then
          mkdir -p "$HOME/.kube"
          cp "${KARMADA_DATA_PATH}/karmada-apiserver.config" "$HOME/.kube/karmada-apiserver.config"
          echo "karmada-apiserver.config has been copied from ${KARMADA_DATA_PATH} to $HOME/.kube directory."
        # Fallback to standard location
        elif [ -f "/etc/karmada/karmada-apiserver.config" ]; then
          mkdir -p "$HOME/.kube"
          cp /etc/karmada/karmada-apiserver.config "$HOME/.kube/karmada-apiserver.config"
          echo "karmada-apiserver.config has been copied from /etc/karmada to $HOME/.kube directory."
        else
          echo "WARNING: Could not find karmada-apiserver.config in /etc/karmada. Please manually create this file."
          echo "The dashboard may not function properly without this configuration."
        fi
      else
        echo "karmada-apiserver.config already exists in $HOME/.kube directory."
      fi
    else
      echo "Karmada installation skipped. Exiting..."
      exit 0
    fi
  else
    echo "Karmada is already installed on this cluster."
    
    # Check if karmada-apiserver.config exists
    echo "Checking for karmada-apiserver.config..."
    if [ ! -f "$HOME/.kube/karmada-apiserver.config" ]; then
      echo "karmada-apiserver.config not found in $HOME/.kube directory. Creating it..."
      if [ -f "/etc/karmada/karmada-apiserver.config" ]; then
        mkdir -p "$HOME/.kube"
        cp /etc/karmada/karmada-apiserver.config "$HOME/.kube/karmada-apiserver.config"
        echo "karmada-apiserver.config has been created in $HOME/.kube directory."
        
        # Update KUBECONFIG to include both configs
        echo "Updating KUBECONFIG environment variable..."
        export KUBECONFIG="$HOME/.kube/config:$HOME/.kube/karmada-apiserver.config"
        echo "KUBECONFIG updated to include both regular Kubernetes config and Karmada API server config."
      else
        echo "WARNING: Could not find karmada-apiserver.config in /etc/karmada. Please manually create this file."
        echo "The dashboard may not function properly without this configuration."
      fi
    else
      echo "karmada-apiserver.config already exists in $HOME/.kube directory."
      
      # Update KUBECONFIG to include both configs
      echo "Updating KUBECONFIG environment variable..."
      export KUBECONFIG="$HOME/.kube/config:$HOME/.kube/karmada-apiserver.config"
      echo "KUBECONFIG updated to include both regular Kubernetes config and Karmada API server config."
    fi
  fi
  echo ""
  
  # Check if Helm is installed
  echo "Checking if Helm is installed..."
  if ! command -v helm &> /dev/null; then
    echo "Helm is not installed on this system."
    read -p "Do you want to install Helm now? [y/n]: " install_helm
    
    if [ "$install_helm" == "y" ] || [ "$install_helm" == "Y" ]; then
      echo "Installing Helm..."
      curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
      chmod 700 get_helm.sh
      ./get_helm.sh
      rm get_helm.sh
      echo "Helm installation completed."
    else
      echo "Helm installation skipped. This script requires Helm to continue. Exiting..."
      exit 1
    fi
  else
    echo "Helm is already installed."
  fi
  echo ""
  
  # Create secrets for dashboard if they don't exist
  echo "Checking and creating required secrets for dashboard..."
  
  # Check if kubeconfig-mgmt-cluster secret exists
  if kubectl get secret kubeconfig -n ml-platform-system &>/dev/null; then
    echo "Secret 'kubeconfig' already exists. Skipping creation."
  else
    echo "Creating 'kubeconfig' secret..."
    kubectl create secret generic kubeconfig --from-file=kubeconfig=$HOME/.kube/config -n ml-platform-system
    echo "Management cluster config secret created."
  fi
  
  # Check if kubeconfig-karmada-apiserver secret exists
  if kubectl get secret kubeconfig-karmada-apiserver -n ml-platform-system &>/dev/null; then
    echo "Secret 'kubeconfig-karmada-apiserver' already exists. Skipping creation."
  else
    echo "Creating 'kubeconfig-karmada-apiserver' secret..."
    kubectl create secret generic kubeconfig-karmada-apiserver --from-file=kubeconfig=$HOME/.kube/karmada-apiserver.config -n ml-platform-system
    echo "Karmada API server config secret created."
  fi
  echo ""

  # Step 0: Create namespace ml-platform-system if it doesn't exist
  echo "Step 0: Creating namespace ml-platform-system if it doesn't exist..."
  kubectl create namespace ml-platform-system --dry-run=client -o yaml | kubectl apply -f -
  echo "Namespace ml-platform-system created."
  
  # Step 1: Check and Install OpenFGA using Helm
  echo "Step 1: Checking if OpenFGA is already installed..."
  
  # Check if OpenFGA is already installed
  set +e  # Don't exit on error
  openfga_check=$(kubectl get deployment openfga -n ml-platform-system 2>&1)
  check_exit_code=$?
  set -e  # Re-enable exit on error
  
  echo "Debug: OpenFGA check result: $check_exit_code"
  echo "Debug: OpenFGA check output: $openfga_check"
  
  if [ $check_exit_code -eq 0 ]; then
    echo "OpenFGA is already installed in the ml-platform-system namespace. Skipping installation."
  else
    echo "OpenFGA is not installed. Proceeding with installation..."
    
    # Add OpenFGA Helm repository if not already added
    if ! helm repo list | grep -q "openfga"; then
      echo "Adding OpenFGA Helm repository..."
      helm repo add openfga https://openfga.github.io/helm-charts
      helm repo update
    fi

    # Install OpenFGA with Helm
    echo "Installing OpenFGA with PostgreSQL..."
    helm install --namespace ml-platform-system openfga openfga/openfga \
      --set datastore.engine=postgres \
      --set datastore.uri="postgres://postgres:password@openfga-postgresql.ml-platform-system.svc.cluster.local:5432/postgres?sslmode=disable" \
      --set postgresql.enabled=true \
      --set postgresql.auth.postgresPassword=password \
      --set postgresql.auth.database=postgres \
      --set postgresql.image.repository=bitnamilegacy/postgresql \
      --set postgresql.image.tag=15.4.0-debian-11-r45
    echo "OpenFGA installed via Helm."
  fi
  echo ""

  # Check for OpenFGA installation status for later steps
  OPENFGA_INSTALLED=false
  set +e  # Don't exit on error
  openfga_check=$(kubectl get deployment openfga -n ml-platform-system 2>&1)
  check_exit_code=$?
  set -e  # Re-enable exit on error
  
  if [ $check_exit_code -eq 0 ]; then
    OPENFGA_INSTALLED=true
  fi
  
  # Step 2: Apply the OpenFGA service configuration if OpenFGA was just installed
  if [ "$OPENFGA_INSTALLED" = true ]; then
    echo "Step 2: OpenFGA service configuration already exists. Skipping."
  else
    echo "Step 2: Applying OpenFGA service configuration..."
    kubectl apply -k artifacts/openfga
    echo "OpenFGA service configuration applied."
  fi
  echo ""

  # Step 3: Wait for OpenFGA to be ready (only if we just installed it)
  if [ "$OPENFGA_INSTALLED" = true ]; then
    echo "Step 3: OpenFGA is already running. Skipping wait."
  else
    echo "Step 3: Waiting for OpenFGA deployment to become ready..."
    kubectl -n ml-platform-system wait --for=condition=available --timeout=300s deployment/openfga
    echo "OpenFGA deployment is ready."
  fi
  echo ""

  # Step 4: Verify OpenFGA installation
  echo "Step 4: Verifying OpenFGA installation..."
  ./artifacts/openfga/setup-openfga.sh || echo "OpenFGA verification had issues but continuing with installation..."
  echo ""

  # Step 5: Apply the NodePort overlay kustomization
  echo "Step 5: Installing DCN Dashboard with NodePort configuration..."
  kubectl apply -k artifacts/overlays/nodeport-mode
  echo "NodePort overlay applied successfully."
  echo ""

  # Step 6: Wait for dashboard deployments to be ready
  echo "Step 6: Waiting for dashboard deployments to become ready..."
  kubectl -n ml-platform-system wait --for=condition=available --timeout=300s deployment/ml-platform-admin-api
  kubectl -n ml-platform-system wait --for=condition=available --timeout=300s deployment/ml-platform-admin-web
  echo "Dashboard deployments are ready."
  echo ""

  # Get NodePort for dashboard web
  WEB_NODEPORT=$(kubectl get svc -n ml-platform-system admin-dashboard-web -o jsonpath='{.spec.ports[0].nodePort}')

  # Step 7: Switch to karmada-apiserver context
  echo "Step 7: Switching to karmada-apiserver context..."
  kubectl config use-context karmada-apiserver
  echo "Switched to karmada-apiserver context."
  echo ""

  # Step 8: Create Service Account
  echo "Step 8: Creating dashboard service account..."
  kubectl apply -f artifacts/dashboard/karmada-dashboard-sa.yaml
  echo "Service account created."
  echo ""

  # Step 9: Get JWT token
  echo "Step 9: Retrieving JWT token..."
  JWT_TOKEN=$(kubectl -n karmada-system get secret/karmada-dashboard-secret -o go-template="{{.data.token | base64decode}}")
  echo "JWT token retrieved."
  echo ""

  echo ""
  echo "=== DCN Dashboard Setup Complete ==="
  echo "Dashboard Web UI is available at: http://<node-ip>:${WEB_NODEPORT}"
  echo "Default credentials: admin / admin123"
  echo ""
  echo "JWT Token for authentication:"
  echo "${JWT_TOKEN}"
  echo ""
  echo "NOTE: Replace <node-ip> with your Kubernetes node's external IP address."
}

# Function to uninstall all components
uninstall_all() {
  echo "=== DCN Dashboard NodePort Mode Uninstall ==="
  echo "This will uninstall DCN Dashboard in NodePort mode and OpenFGA"
  echo ""
  
  # Set the working directory to the script's directory
  cd "$(dirname "$0")"
  
  # Step 1: Uninstall DCN Dashboard NodePort overlay
  echo "Step 1: Uninstalling DCN Dashboard NodePort configuration..."
  kubectl delete -k artifacts/overlays/nodeport-mode --ignore-not-found=true
  echo "NodePort overlay removed."
  echo ""
  
  # Step 2: Uninstall OpenFGA service configuration
  echo "Step 2: Removing OpenFGA service configuration..."
  kubectl delete -k artifacts/openfga --ignore-not-found=true
  echo "OpenFGA service configuration removed."
  echo ""
  
  # Step 3: Uninstall OpenFGA Helm release
  echo "Step 3: Uninstalling OpenFGA Helm release..."
  helm uninstall -n ml-platform-system openfga --wait
  echo "OpenFGA Helm release uninstalled."
  echo ""
  
  echo "=== DCN Dashboard Uninstall Complete ==="
  echo "All components have been successfully removed."
}

# Main execution logic
if [ "$UNINSTALL" = true ]; then
  uninstall_all
else
  install_all
fi
