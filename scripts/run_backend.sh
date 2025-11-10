#! /bin/bash

_output/bin/linux/amd64/ml-platform-admin-api   \
    --karmada-kubeconfig=/home/ubuntu/config/huan_cluster/karmada-apiserver.txt --karmada-context=karmada-apiserver \
    --kubeconfig=/home/ubuntu/config/huan_cluster/karmada-host.txt   \
    --context=mgmt-cluster   \
    --insecure-port=8000 \
    --etcd-host=192.168.40.248 \
    --etcd-port=32380 \
    --openfga-api-url=http://192.168.40.248:30080 \
    --porch-api=https://192.168.40.248:30443 \
    --skip-porch-tls-verify