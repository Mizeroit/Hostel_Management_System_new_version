pipeline {
  agent any

  options {
    skipDefaultCheckout(true)
    timestamps()
  }

  parameters {
    string(
      name: 'DOCKERHUB_NAMESPACE',
      defaultValue: 'your-dockerhub-username',
      description: 'Docker Hub account or organization that owns hostel-frontend and hostel-backend'
    )
  }

  environment {
    K8S_NAMESPACE = 'hostel-management'
    K8S_SECRET_NAME = 'hostel-runtime-secrets'
    MYSQL_INIT_CONFIGMAP = 'mysql-init'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git submodule sync --recursive && git submodule update --init --recursive && test -f backend/package.json'
        script {
          if (!params.DOCKERHUB_NAMESPACE?.trim() || params.DOCKERHUB_NAMESPACE == 'your-dockerhub-username') {
            error('Set DOCKERHUB_NAMESPACE to your Docker Hub account or organization.')
          }
          env.IMAGE_TAG = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
          env.FRONTEND_IMAGE = "docker.io/${params.DOCKERHUB_NAMESPACE.trim()}/hostel-frontend"
          env.BACKEND_IMAGE = "docker.io/${params.DOCKERHUB_NAMESPACE.trim()}/hostel-backend"
          echo "Building source commit ${env.IMAGE_TAG}"
        }
      }
    }

    stage('Install Dependencies') {
      steps {
        dir('frontend') {
          sh 'npm ci --no-audit --no-fund'
        }
        dir('backend') {
          sh 'npm ci --no-audit --no-fund'
        }
      }
    }

    stage('Test') {
      parallel {
        stage('Frontend') {
          steps {
            dir('frontend') {
              sh 'npm test --if-present'
              sh 'npm run build'
            }
          }
        }
        stage('Backend') {
          steps {
            dir('backend') {
              sh 'npm test --if-present'
              sh 'node --check server.js'
            }
          }
        }
      }
    }

    stage('Build Docker Images') {
      steps {
        sh '''
          docker build --pull -t "$FRONTEND_IMAGE:$IMAGE_TAG" ./frontend
          docker build --pull -t "$BACKEND_IMAGE:$IMAGE_TAG" ./backend
        '''
      }
    }

    stage('Push to Docker Hub') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'dockerhub-credentials',
          usernameVariable: 'DOCKERHUB_USER',
          passwordVariable: 'DOCKERHUB_TOKEN'
        )]) {
          sh '''
            set +x
            printf '%s' "$DOCKERHUB_TOKEN" | docker login --username "$DOCKERHUB_USER" --password-stdin
            docker push "$FRONTEND_IMAGE:$IMAGE_TAG"
            docker push "$BACKEND_IMAGE:$IMAGE_TAG"
            docker logout
          '''
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        withCredentials([
          file(credentialsId: 'kubernetes-config', variable: 'KUBECONFIG'),
          string(credentialsId: 'mysql-root-password', variable: 'MYSQL_ROOT_PASSWORD'),
          string(credentialsId: 'mysql-app-password', variable: 'DB_PASSWORD'),
          string(credentialsId: 'hostel-jwt-secret', variable: 'JWT_SECRET'),
          string(credentialsId: 'hostel-admin-password', variable: 'ADMIN_PASSWORD')
        ]) {
          sh '''
            set +x
            kubectl apply -f k8s/namespace.yaml

            umask 077
            secret_file="$(mktemp)"
            trap 'rm -f "$secret_file"' EXIT
            printf 'DB_ROOT_PASSWORD=%s\\nDB_PASSWORD=%s\\nJWT_SECRET=%s\\nADMIN_PASSWORD=%s\\n' \\
              "$MYSQL_ROOT_PASSWORD" "$DB_PASSWORD" "$JWT_SECRET" "$ADMIN_PASSWORD" > "$secret_file"
            kubectl create secret generic "$K8S_SECRET_NAME" \\
              --namespace "$K8S_NAMESPACE" \\
              --from-env-file="$secret_file" \\
              --dry-run=client -o yaml | kubectl apply -f -

            kubectl create configmap "$MYSQL_INIT_CONFIGMAP" \\
              --namespace "$K8S_NAMESPACE" \\
              --from-file=001_init.sql=database/init.sql \\
              --dry-run=client -o yaml | kubectl apply -f -

            kubectl kustomize k8s | sed \\
              -e "s|image: docker.io/your-dockerhub-username/hostel-backend:1.0.0|image: $BACKEND_IMAGE:$IMAGE_TAG|g" \\
              -e "s|image: docker.io/your-dockerhub-username/hostel-frontend:1.0.0|image: $FRONTEND_IMAGE:$IMAGE_TAG|g" \\
              | kubectl apply -f -

            kubectl rollout status deployment/mysql --namespace "$K8S_NAMESPACE" --timeout=5m
            kubectl rollout status deployment/backend --namespace "$K8S_NAMESPACE" --timeout=5m
            kubectl rollout status deployment/frontend --namespace "$K8S_NAMESPACE" --timeout=5m
            kubectl get pods --namespace "$K8S_NAMESPACE" --output=wide
          '''
        }
      }
    }
  }

  post {
    always {
      deleteDir()
    }
  }
}
