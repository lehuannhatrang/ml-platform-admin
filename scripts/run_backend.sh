#! /bin/bash

# Set environment variables for dev
export ENV_NAME=dev
export FRONTEND_URL=http://192.168.40.248:5173
export KEYCLOAK_CLIENT_SECRET="UguPzb0WkCp3FDrnQ3BwY48Epm3Xp1i5"

_output/bin/linux/amd64/ml-platform-admin-api   \
    --kubeconfig=/home/ubuntu/config/huan_cluster/cluster-gpu-1.conf   \
    --insecure-port=8000 \
    --etcd-host=192.168.40.248 \
    --etcd-port=32380 \
    --use-keycloak=true \
    --keycloak-realm=ml-platform-dev \
    --keycloak-url=http://192.168.40.248:32008
    # --kubeconfig=/home/ubuntu/config/huan_cluster/karmada-host.txt   \
    # --karmada-kubeconfig=/home/ubuntu/config/huan_cluster/karmada-apiserver.txt --karmada-context=karmada-apiserver \
    # --context=mgmt-cluster   \
    # --openfga-api-url=http://192.168.40.248:30080 \