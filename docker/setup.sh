#!/bin/bash

# Setup script for local Temporal development environment
# This mimics your AWS CDK deployment locally

set -euo pipefail

echo "🚀 Setting up local Temporal cluster..."

# Create SSL certificates for nginx (self-signed for local development)
if [ ! -f docker/nginx/ssl/temporal.crt ]; then
    echo "📜 Creating SSL certificates..."
    mkdir -p docker/nginx/ssl
    
    # Generate private key
    openssl genrsa -out docker/nginx/ssl/temporal.key 2048
    
    # Generate certificate signing request
    openssl req -new -key docker/nginx/ssl/temporal.key -out docker/nginx/ssl/temporal.csr -subj "/C=US/ST=CA/L=San Francisco/O=Temporal/CN=temporal.local"
    
    # Generate self-signed certificate
    openssl x509 -req -days 365 -in docker/nginx/ssl/temporal.csr -signkey docker/nginx/ssl/temporal.key -out docker/nginx/ssl/temporal.crt
    
    # Clean up CSR
    rm docker/nginx/ssl/temporal.csr
    
    echo "✅ SSL certificates created"
fi

# Start the infrastructure services first
echo "🐳 Starting MySQL and infrastructure..."
docker-compose up -d mysql

# Wait for MySQL to be ready
echo "⏳ Waiting for MySQL to be ready..."
until docker-compose exec mysql mysqladmin ping -h localhost --silent; do
    echo "MySQL is unavailable - sleeping"
    sleep 2
done
echo "✅ MySQL is ready"

# Setup database schemas
echo "🗄️ Setting up database schemas..."
docker-compose run --rm temporal-admin-tools bash -c "
    # Wait for MySQL to accept connections
    until mysql -h mysql -u temporal -ptemporal -e 'SELECT 1' >/dev/null 2>&1; do
        echo 'Waiting for MySQL...'
        sleep 2
    done
    
    echo 'Setting up main database schema...'
    temporal-sql-tool --plugin mysql8 --ep mysql -p 3306 -u temporal --db temporal --connect-attributes transaction_isolation=READ-COMMITTED create
    temporal-sql-tool --plugin mysql8 --ep mysql -p 3306 -u temporal --db temporal --connect-attributes transaction_isolation=READ-COMMITTED setup-schema -v 0.0
    
    echo 'Setting up visibility database schema...'
    temporal-sql-tool --plugin mysql8 --ep mysql -p 3306 -u temporal --db temporal_visibility --connect-attributes transaction_isolation=READ-COMMITTED create
    temporal-sql-tool --plugin mysql8 --ep mysql -p 3306 -u temporal --db temporal_visibility --connect-attributes transaction_isolation=READ-COMMITTED setup-schema -v 0.0
    
    echo 'Database schemas setup completed!'
"

# Start all Temporal services
echo "🏗️ Starting Temporal services..."
docker-compose up -d temporal-frontend temporal-history temporal-matching temporal-worker

# Wait for frontend to be ready
echo "⏳ Waiting for Temporal frontend to be ready..."
sleep 10

# Start Web UI and Nginx
echo "🌐 Starting Web UI and load balancer..."
docker-compose up -d temporal-web nginx

# Create default namespace (mimics your CDK setup)
echo "📁 Creating default namespace..."
sleep 5
docker-compose exec temporal-frontend tctl --address temporal-frontend:7233 namespace register --name default --description "Default namespace for local development"

echo ""
echo "🎉 Local Temporal cluster is ready!"
echo ""
echo "📍 Access Points:"
echo "   • Temporal Web UI: http://localhost:8088"
echo "   • Temporal Web UI (HTTPS): https://localhost (accept self-signed cert)"
echo "   • Temporal Frontend gRPC: localhost:7233"
echo "   • MySQL Database: localhost:3306 (user: temporal, pass: temporal)"
echo ""
echo "🔧 Useful Commands:"
echo "   • View logs: docker-compose logs -f [service-name]"
echo "   • Stop cluster: docker-compose down"
echo "   • Reset data: docker-compose down -v"
echo "   • Connect to tctl: docker-compose exec temporal-frontend tctl --address temporal-frontend:7233"
echo ""
echo "📚 Services Running:"
docker-compose ps

echo ""
echo "✨ Your local Temporal cluster matches your AWS production setup!"
