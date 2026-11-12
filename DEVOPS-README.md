# Jenkins and Kubernetes deployment

This guide adds CI/CD and Minikube deployment to the existing React/Vite, Express, and MySQL application. It does not replace Docker Compose; Compose remains available for local development.

## What is already in this repository

- `frontend/` contains the Vite app and Nginx image. Nginx forwards `/api/` requests to `backend:5000`; Kubernetes provides that DNS name through the internal `backend` Service.
- `backend/` contains the Express API. It reads MySQL connection settings from environment variables, and `/api/health` checks the database connection.
- `database/init.sql` creates the tables and demo data. Kubernetes mounts it into MySQL's initialization directory on the first database start.
- The Compose image names are `<DOCKERHUB_USERNAME>/hostel-frontend` and `<DOCKERHUB_USERNAME>/hostel-backend`. Replace the username placeholder with the Docker Hub account or organization that owns those repositories.
- Both packages have `package-lock.json` files, which the existing Dockerfiles use with `npm ci` for reproducible installs.
- The root repository tracks `backend/` as a Git submodule. `.gitmodules` now maps it to the existing GitHub repository, and the Jenkins Checkout stage initializes it before building. If you change backend files, commit and push that submodule revision to a remotely fetchable commit, then update the root repository's `backend` gitlink; Jenkins can only build the revision recorded by the root commit.

## A. Jenkins

Jenkins checks out the source, installs dependencies, runs available tests and build checks, builds Docker images, pushes commit-tagged images, and deploys them. The pipeline uses `checkout scm`, so configure the Jenkins job to use this GitHub repository:

`https://github.com/Mizeroit/Hostel_Management_System_new_version`

### Start or install Jenkins

Jenkins runs separately from the Hostel Management System containers. If Jenkins is already installed on Ubuntu:

```bash
sudo systemctl enable --now jenkins
sudo systemctl status jenkins
```

Open `http://localhost:8080` (or the configured Jenkins URL) and install the suggested plugins, including Pipeline, Git, Credentials Binding, and the Docker Pipeline plugin if you use it elsewhere. The included Jenkinsfile calls the Docker and kubectl CLIs directly. If Jenkins is not installed, follow the official [Jenkins Linux installation instructions](https://www.jenkins.io/doc/book/installing/linux/); this repository does not install software or change system permissions.

The Jenkins agent that runs this pipeline must have Git, Node.js/npm, Docker CLI connected to a working Docker daemon, and kubectl. Check these as the Jenkins service account:

```bash
sudo -u jenkins git --version
sudo -u jenkins node --version
sudo -u jenkins npm --version
sudo -u jenkins docker info
sudo -u jenkins kubectl version --client
```

If `docker info` reports a permission error, verify the daemon is running (`sudo systemctl status docker`) and choose an approved Docker access method. Adding `jenkins` to the `docker` group (`sudo usermod -aG docker jenkins`) grants root-equivalent host access; do so only if that security risk is acceptable, then restart Jenkins and retest `docker info`. Do not assume Jenkins has Docker access.

### Add Jenkins credentials

In **Manage Jenkins → Credentials**, create:

| Credential ID | Kind | Value |
|---|---|---|
| `dockerhub-credentials` | Username with password | Docker Hub username and preferably a Docker Hub access token with push permission |
| `kubernetes-config` | Secret file | Kubeconfig for the target cluster |
| `mysql-root-password` | Secret text | Unique MySQL root password |
| `mysql-app-password` | Secret text | Unique password for the `hostel_app` MySQL user |
| `hostel-jwt-secret` | Secret text | Random JWT signing secret of at least 32 characters |
| `hostel-admin-password` | Secret text | Initial administrator password |

The first two IDs are consumed directly as requested; the additional secret-text credentials allow the pipeline to create the Kubernetes Secret without storing real credentials in Git. For Minikube, use a kubeconfig that works from the Jenkins agent. For example, on the account that owns Minikube:

```bash
kubectl config view --raw --flatten --minify > /tmp/hostel-kubeconfig
chmod 600 /tmp/hostel-kubeconfig
```

Upload that file as the `kubernetes-config` **Secret file** credential, then securely remove the temporary copy. Check connectivity on the Jenkins agent with the same kubeconfig:

```bash
KUBECONFIG=/path/to/hostel-kubeconfig kubectl get nodes
KUBECONFIG=/path/to/hostel-kubeconfig kubectl auth can-i create deployments --namespace hostel-management
KUBECONFIG=/path/to/hostel-kubeconfig kubectl auth can-i create secrets --namespace hostel-management
```

The deployment identity needs permission to manage the namespace's Deployments, Services, ConfigMaps, Secrets, and PVCs, and to read pods and check rollout status. A Minikube admin kubeconfig is convenient for a local lab but grants broad access; use a least-privilege service account for a shared or remote cluster. Never commit kubeconfig or application secrets.

### Connect GitHub and run the pipeline

Create a **Multibranch Pipeline** job or a Pipeline job with **Pipeline script from SCM**. Select Git, set the repository URL above, use branch `master` (the current repository branch), and set the script path to `Jenkinsfile`. Enable recursive submodule checkout if offered by the Git plugin; the pipeline also runs `git submodule update --init --recursive`. For automatic builds on pushes, configure a GitHub webhook to Jenkins or enable periodic SCM polling. A private GitHub repository also needs an appropriate GitHub credential in the Jenkins SCM configuration.

Run **Build Now**. Set the `DOCKERHUB_NAMESPACE` build parameter to the Docker Hub account or organization that owns the two image repositories. The pipeline uses the full Git commit hash as each image tag, not `latest`; it stops on failed tests, builds, pushes, or Kubernetes rollouts. There are no test scripts in the current package manifests, so `npm test --if-present` is a no-op until tests are added; the pipeline still runs the frontend production build and checks backend JavaScript syntax.

## B. Docker images

The pipeline builds:

```text
docker.io/<DOCKERHUB_NAMESPACE>/hostel-frontend:<full-git-commit>
docker.io/<DOCKERHUB_NAMESPACE>/hostel-backend:<full-git-commit>
```

It logs in using `dockerhub-credentials`, sends the token over stdin, and pushes both images. Images use a unique commit identifier so a deployment can be traced or rolled back. To pull a particular build manually:

```bash
docker pull DOCKERHUB_NAMESPACE/hostel-frontend:COMMIT_SHA
docker pull DOCKERHUB_NAMESPACE/hostel-backend:COMMIT_SHA
```

Replace `DOCKERHUB_NAMESPACE` and `COMMIT_SHA` with the values from the Jenkins build. The Docker Hub repositories must already exist and be accessible to the cluster.

## C. Kubernetes concepts and this app

- A **Pod** runs one or more application containers. Kubernetes replaces unhealthy Pods.
- A **Deployment** keeps a chosen number of Pods running and rolls out image updates. The frontend and backend each start with two replicas; MySQL uses one replica.
- A **Service** gives Pods a stable network name. `mysql` and `backend` are internal ClusterIP Services; the frontend's NodePort Service is reachable from Minikube.
- A **Namespace** groups this app's Kubernetes resources under `hostel-management`.
- A **Persistent Volume Claim (PVC)** requests storage for MySQL. The `mysql-data` claim keeps database files when the MySQL Pod restarts. It does not replace backups.

The frontend container's existing Nginx configuration calls `backend:5000`; Kubernetes resolves that name to the backend Service. The backend connects to the `mysql` Service on port 3306. MySQL has no public Service. Kubernetes ConfigMaps hold normal settings; Jenkins creates `hostel-runtime-secrets` from Jenkins credentials. `k8s/backend-secret.yaml` is an empty reference template and is intentionally excluded from Kustomize so applying it cannot overwrite the runtime Secret with empty values. The SQL initialization ConfigMap is generated from `database/init.sql` by the deployment pipeline (or the manual commands below).

## D. Deploy and operate on Minikube

Install Docker, kubectl, and Minikube using their official Ubuntu instructions if missing; this guide does not install them. Start a cluster with enough resources for MySQL and the app:

```bash
minikube start --driver=docker --cpus=4 --memory=6144
kubectl get nodes
```

Before a manual deploy, create a namespace, the runtime Secret, and the SQL ConfigMap. Enter the actual values in your terminal; never put real values in the repository:

```bash
kubectl apply -f k8s/namespace.yaml
umask 077
secret_file="$(mktemp)"
read -rsp 'MySQL root password: ' DB_ROOT_PASSWORD; printf '\n'
read -rsp 'MySQL app password: ' DB_PASSWORD; printf '\n'
read -rsp 'JWT secret (at least 32 characters): ' JWT_SECRET; printf '\n'
read -rsp 'Initial admin password: ' ADMIN_PASSWORD; printf '\n'
printf 'DB_ROOT_PASSWORD=%s\nDB_PASSWORD=%s\nJWT_SECRET=%s\nADMIN_PASSWORD=%s\n' \
  "$DB_ROOT_PASSWORD" "$DB_PASSWORD" "$JWT_SECRET" "$ADMIN_PASSWORD" > "$secret_file"
kubectl create secret generic hostel-runtime-secrets -n hostel-management \
  --from-env-file="$secret_file"
rm -f "$secret_file"
unset DB_ROOT_PASSWORD DB_PASSWORD JWT_SECRET ADMIN_PASSWORD
kubectl create configmap mysql-init -n hostel-management \
  --from-file=001_init.sql=database/init.sql
```

Before applying, replace `your-dockerhub-username` in both image references in `k8s/backend-deployment.yaml` and `k8s/frontend-deployment.yaml`, and set the image tag to a tag that exists in Docker Hub. Do not use `latest` as the only deployment identifier. Then apply the resources:

```bash
kubectl apply -k k8s
kubectl rollout status deployment/mysql -n hostel-management --timeout=5m
kubectl rollout status deployment/backend -n hostel-management --timeout=5m
kubectl rollout status deployment/frontend -n hostel-management --timeout=5m
```

Common inspection and maintenance commands:

```bash
kubectl get pods -n hostel-management -o wide
kubectl get deployments -n hostel-management
kubectl get services -n hostel-management
kubectl logs deployment/backend -n hostel-management
kubectl logs deployment/mysql -n hostel-management
kubectl rollout restart deployment/backend -n hostel-management
kubectl scale deployment/frontend --replicas=3 -n hostel-management
kubectl scale deployment/backend --replicas=3 -n hostel-management
kubectl rollout undo deployment/frontend -n hostel-management
kubectl rollout undo deployment/backend -n hostel-management
```

Open the app using the URL printed by:

```bash
minikube service frontend -n hostel-management --url
```

The frontend also proxies API requests, so health can be checked through the same URL:

```bash
curl "$(minikube service frontend -n hostel-management --url)/api/health"
```

To delete the application resources, including the PVC (and therefore the database data), run:

```bash
kubectl delete namespace hostel-management
```

Deleting the namespace also deletes its PVC; Kubernetes storage reclaim behavior is cluster-specific. Do not delete the namespace if you need to preserve data.

## E. Troubleshooting

- **ImagePullBackOff:** Check the image name/tag (`kubectl describe pod -n hostel-management POD`), Docker Hub repository visibility, and cluster internet access. For private repositories configure a Kubernetes `imagePullSecret`; Jenkins Docker login does not authenticate Kubernetes image pulls.
- **CrashLoopBackOff:** Inspect `kubectl logs -n hostel-management POD --previous` and `kubectl describe pod -n hostel-management POD`. Check that required secret keys exist and that environment values are valid.
- **CreateContainerConfigError:** The runtime Secret or a required key is missing. Check `kubectl get secret hostel-runtime-secrets -n hostel-management` and recreate it with the exact keys in the manual deployment commands.
- **Database connection errors:** Check `kubectl get pods,svc,pvc -n hostel-management`, `kubectl logs deployment/mysql -n hostel-management`, that the PVC is Bound, and that backend `DB_HOST=mysql`, DB name/user/password match the MySQL configuration. MySQL initialization SQL only runs on a fresh data directory.
- **Jenkins Docker permission errors:** Confirm Docker is running and `sudo -u jenkins docker info` succeeds. The `docker` group grants root-equivalent access; get approval before adding Jenkins to it.
- **Kubernetes authentication errors:** Verify the `kubernetes-config` Secret File, its cluster endpoint and certificate, and `kubectl auth can-i` checks as the Jenkins identity. A kubeconfig pointing to `127.0.0.1` may not be reachable from an agent in another host/container.
- **Frontend cannot communicate with backend:** Confirm `kubectl get endpoints backend -n hostel-management` lists ready Pod IPs; the frontend and backend must be in the same namespace. Keep the Nginx upstream name `backend:5000`; do not set it to `localhost`.
- **PVC Pending:** Minikube needs a default storage provisioner. Check `kubectl get storageclass` and `kubectl describe pvc mysql-data -n hostel-management`.

## Verification plan

Use the following commands to verify the whole flow. Commands that use `$BUILD_NUMBER`, `$DOCKERHUB_NAMESPACE`, or `$COMMIT_SHA` need values from the Jenkins job/build.

1. **Jenkins checks out GitHub:** The pipeline Checkout stage must succeed. From the Jenkins agent, verify the repository is reachable:

   ```bash
   git ls-remote --heads https://github.com/Mizeroit/Hostel_Management_System_new_version.git master
   ```

2. **Frontend image builds:** Confirm the Jenkins `Build Docker Images` stage succeeds, then check the agent's image list:

   ```bash
   docker image inspect "DOCKERHUB_NAMESPACE/hostel-frontend:COMMIT_SHA"
   ```

3. **Backend image builds:**

   ```bash
   docker image inspect "DOCKERHUB_NAMESPACE/hostel-backend:COMMIT_SHA"
   ```

4. **Both images push:** Confirm the `Push to Docker Hub` stage succeeds and the tags appear in Docker Hub. From an authenticated machine:

   ```bash
   docker manifest inspect "DOCKERHUB_NAMESPACE/hostel-frontend:COMMIT_SHA"
   docker manifest inspect "DOCKERHUB_NAMESPACE/hostel-backend:COMMIT_SHA"
   ```

5. **Kubernetes pulls the images:** The deployment must report the commit-tagged image and the Pods must become Ready:

   ```bash
   kubectl get pods -n hostel-management
   kubectl describe pods -n hostel-management
   ```

6. **MySQL starts:**

   ```bash
   kubectl rollout status deployment/mysql -n hostel-management --timeout=5m
   kubectl get pvc mysql-data -n hostel-management
   ```

7. **Backend connects to MySQL:** The app health endpoint must return `status: ok` and `database: connected`:

   ```bash
   kubectl port-forward service/backend 5000:5000 -n hostel-management
   ```

   In another terminal run `curl http://127.0.0.1:5000/api/health`.

8. **Frontend reaches backend:** `curl "$(minikube service frontend -n hostel-management --url)/api/health"` must return the same successful health JSON. This confirms the frontend Nginx proxy and in-cluster backend Service path.

9. **Browser access:** Run `minikube service frontend -n hostel-management --url` and open the printed URL in a browser. Sign in with the configured initial admin email/password.

10. **MySQL data persists after restart:** Record the current row count, restart MySQL, wait for rollout, then check the count again. They should match:

    ```bash
    kubectl exec deployment/mysql -n hostel-management -- sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -Nse "SELECT COUNT(*) FROM students"'
    kubectl rollout restart deployment/mysql -n hostel-management
    kubectl rollout status deployment/mysql -n hostel-management --timeout=5m
    kubectl exec deployment/mysql -n hostel-management -- sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -Nse "SELECT COUNT(*) FROM students"'
    ```

11. **Scale frontend and backend:** Set a larger replica count and confirm the corresponding Pods are ready:

    ```bash
    kubectl scale deployment/frontend --replicas=3 -n hostel-management
    kubectl scale deployment/backend --replicas=3 -n hostel-management
    kubectl get deployments,pods -n hostel-management
    ```

12. **Jenkins deploys an update:** Push a change to the configured branch and run/await its Jenkins build. Verify the deployment uses that build's full commit ID and completes rollout:

    ```bash
    kubectl get deployments frontend backend -n hostel-management -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.template.spec.containers[0].image}{"\n"}{end}'
    kubectl rollout status deployment/frontend -n hostel-management
    kubectl rollout status deployment/backend -n hostel-management
    ```
