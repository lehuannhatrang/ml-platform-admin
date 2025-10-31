# ML Platform Admin
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/kubernetes/dashboard/blob/master/LICENSE)

ML Platform Admin is a web-based control panel for Admin of ML Platform to management Infra, Quota and Users.
![image](docs/images/readme-dcn_dashboard.png)

## 🚀QuickStart

### Prerequisites
You need to have a Karmada installed on Kubernetes(aka. `host cluster`) and the [karmadactl](https://karmada.io/docs/installation/install-cli-tools#install-karmadactl) or
kubectl command-line tool must be configured to communicate with your host cluster and Karmada control plane.

If you don't already have the Karmada, you can launch one by following this [tutorial](https://karmada.io/docs/installation/#install-karmada-for-development-environment).


---
### Install ML Platform Admin
In the following steps, we are going to install ML Platform Admin Dashboard on the `mgmt-cluster` where running the Karmada
control plane components. We assume that Karmada was installed in namespace `karmada-system` and mgmt-cluster config is 
located at `$HOME/.kube/config`, if this differs from your environment, please modify the following commands 
accordingly. 

1. Switch user-context of your mgmt-cluster config to `mgmt-cluster`.

```bash
export KUBECONFIG="$HOME/.kube/config"
kubectl config use-context kubernetes
```

2. Deploy ML Platform Admin

Clone this repo to your machine:
```
git clone https://github.com/lehuannhatrang/ml-platform-admin
```

Change to the dashboard directory:
```
cd ml-platform-admin
```

Create persistent volumes required for etcd and OpenFGA:
```bash
# Create directories for persistent data
sudo mkdir -p /mnt/data/etcd /mnt/data/postgresql
sudo chmod -R 777 /mnt/data

# Apply persistent volume configurations
kubectl apply -f artifacts/persistent-volume/etcd-pv.yaml
kubectl apply -f artifacts/persistent-volume/openfga-pv.yaml
```

Run this script to deploy ML Platform Admin:
```bash
sudo ./setup-nodeport-mode.sh
```

It should print results like this, this is the jwt token you need to login the 1st time to the dashboard:
```bash
JWT Token for authentication:
eyJhbGciOiJSUzI1NiIsImtpZCI6InZLdkRNclVZSFB6SUVXczBIRm8zMDBxOHFOanQxbWU4WUk1VVVpUzZwMG8ifQ.eyJpc3MiOiJrdWJlcm5ldGVzL3NlcnZpY2VhY2NvdW50Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9uYW1lc3BhY2UiOiJrYXJtYWRhLXN5c3RlbSIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VjcmV0Lm5hbWUiOiJrYXJtYWRhLWRhc2hib2FyZC10b2tlbi14NnhzcCIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VydmljZS1hY2NvdW50Lm5hbWUiOiJrYXJtYWRhLWRhc2hib2FyZCIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VydmljZS1hY2NvdW50LnVpZCI6ImE5Y2RkZDc3LTkyOWYtNGM0MS1iZDY4LWIzYWVhY2E0NGJiYiIsInN1YiI6InN5c3RlbTpzZXJ2aWNlYWNjb3VudDprYXJtYWRhLXN5c3RlbTprYXJtYWRhLWRhc2hib2FyZCJ9.F0BqSxl0GVGvJZ_WNwcEFtChE7joMdIPGhv8--eN22AFTX34IzJ_2akjZcWQ63mbgr1mVY4WjYdl7KRS6w4fEQpqWkWx2Dfp3pylIcMslYRrUPirHE2YN13JDxvjtYyhBVPlbYHSj7y0rvxtfTr7iFaVRMFFiUbC3kVKNhuZtgk_tBHg4UDCQQKFALGc8xndU5nz-BF1gHgzEfLcf9Zyvxj1xLy9mEkLotZjIcnZhwiHKFYtjvCnGXxGyrTvQ5rgilAxBKv0TcmjQep_TG_Q5M9r0u8wmxhDnYd2a7wsJ3P3OnDw7smk6ikY8UzMxVoEPG7XoRcmNqhhAEutvcJoyw
```


Then you will be able to access the ML Platform Admin by `http://your-portal-host:32000`.
Note that, the ML Platform Admin service type is `NodePort`, this exposes the dashboard on a specific port on each node
of your `host cluster`, allowing you to access it via any node's IP address and that port.

You also can use `kubectl port-forward` to forward a local port to the Dashboard's backend pod:
```
kubectl port-forward -n ml-platform-system services/ML Platform Admin-web --address 0.0.0.0 8000:8000
```
Then you can access it via `http://localhost:8000`.

You still need the credentials and jwt token to login to the dashboard.



### Login Dashboard
Now open Admin portal with url [http://your-portal-host:32000 ]()

Login to the dashboard with username and password:

Default username and password:
```
- username: admin
- password: admin123
```

![image](docs/images/dashboard-login.png)


The 1st time you login, you need to copy the token you just generated and paste it into the Enter token field on the login page. 
![image](docs/images/readme-login-en.png)
Once the process of authentication passed, you can use Admin Portal freely. You can follow the Usage of ml-platform-admin to have a quick experience of Admin dashboard.

Note: You may need to refresh the page after submitting the token.

### Uninstall

You can uninstall the dashboard and openfga by running the following command:
```
./setup-nodeport-mode.sh --uninstall
```

## 🤖 AI Agent Setup

To enable AI agent functionality in Admin Dashboard, you need to deploy n8n workflows and MCP servers.

### Prerequisites
- n8n server with production webhook capabilities
- MCP (Model Context Protocol) servers

### Setup Instructions

1. **Deploy n8n and MCP servers**

   Follow the setup guide from this repository:
   ```
   https://github.com/lehuannhatrang/n8n-deployment
   ```

2. **Get the n8n webhook URL**

   After completing the n8n setup, copy your production webhook URL from n8n dashboard.

3. **Update Admin Dashboard configuration**

   Add the webhook URL to the configmap by updating the `ai_agent_chat_webhook` field:
   ```yaml
   ai_agent_chat_webhook: 'https://n8n.my-domain.com/webhook/abcxyz....'
   ```

4. **Restart the API deployment**

   Apply the configmap changes and restart the API deployment:
   ```bash
   kubectl rollout restart deployment/ml-platform-system-admin-api -n ml-platform-system
   ```

The AI agent functionality will be available in the dashboard once the deployment is successfully restarted.

![image](docs/images/dashboard-chatbot.png)

## License

ML Platform Admin Dashboard is under the Apache 2.0 license. See the [LICENSE](LICENSE) file for details.
