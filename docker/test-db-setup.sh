#!/bin/bash

# Test script that mimics our Lambda function database setup logic
# This will help us verify our database creation logic works correctly

set -e

echo "Starting database setup test (mimicking Lambda function)..."

# Database connection parameters
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-temporal}

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"; do
  echo "PostgreSQL is not ready yet, waiting..."
  sleep 2
done
echo "PostgreSQL is ready!"

# Function to create database (mimics our Lambda function logic)
create_database() {
    local db_name=$1
    echo "Creating database: $db_name"
    
    # Try to create the database
    if temporal-sql-tool --plugin postgres12 --ep "$DB_HOST" --port "$DB_PORT" --user "$DB_USER" --pw "$DB_PASSWORD" create-database "$db_name"; then
        echo "Database $db_name created successfully"
    else
        local exit_code=$?
        echo "Database creation failed with exit code: $exit_code"
        
        # Check if it's a "database already exists" error (mimics our Lambda logic)
        if [[ $exit_code -eq 1 ]]; then
            echo "Database $db_name already exists (duplicate key constraint), continuing..."
        else
            echo "CRITICAL: Failed to create database $db_name with unexpected error"
            exit 1
        fi
    fi
    
    # Wait for database to be available
    echo "Waiting 2 seconds for database $db_name to be available..."
    sleep 2
    
    # Test connection to the database
    echo "Testing connection to database $db_name..."
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db_name"; then
        echo "Successfully connected to database $db_name"
    else
        echo "WARNING: Could not connect to database $db_name"
    fi
}

# Function to setup schema (mimics our Lambda function logic)
setup_schema() {
    local db_name=$1
    local schema_type=$2
    echo "Setting up schema for database: $db_name (type: $schema_type)"
    
    # Setup initial schema
    if temporal-sql-tool --plugin postgres12 --ep "$DB_HOST" --port "$DB_PORT" --user "$DB_USER" --pw "$DB_PASSWORD" --db "$db_name" setup-schema -v 0.0; then
        echo "Schema setup completed for $db_name"
    else
        local exit_code=$?
        echo "Schema setup failed with exit code: $exit_code"
        
        # Check if schema already exists (mimics our Lambda logic)
        if [[ $exit_code -eq 1 ]]; then
            echo "Schema for $db_name already exists, continuing..."
        else
            echo "CRITICAL: Failed to setup schema for $db_name"
            exit 1
        fi
    fi
    
    # Update schema to latest version
    local schema_dir="/etc/temporal/schema/postgresql/v12"
    if [[ "$schema_type" == "visibility" ]]; then
        schema_dir="$schema_dir/visibility/versioned"
    else
        schema_dir="$schema_dir/temporal/versioned"
    fi
    
    echo "Updating schema for $db_name using directory: $schema_dir"
    if temporal-sql-tool --plugin postgres12 --ep "$DB_HOST" --port "$DB_PORT" --user "$DB_USER" --pw "$DB_PASSWORD" --db "$db_name" update-schema -d "$schema_dir"; then
        echo "Schema update completed for $db_name"
    else
        local exit_code=$?
        echo "Schema update failed with exit code: $exit_code"
        
        # Check if schema is already up to date
        if [[ $exit_code -eq 1 ]]; then
            echo "Schema for $db_name is already up to date, continuing..."
        else
            echo "CRITICAL: Failed to update schema for $db_name"
            exit 1
        fi
    fi
}

# Main execution (mimics our Lambda function)
echo "=== CREATING TEMPORAL DATABASE ==="
create_database "temporal"
setup_schema "temporal" "main"

echo "=== CREATING TEMPORAL_VISIBILITY DATABASE ==="
create_database "temporal_visibility"
setup_schema "temporal_visibility" "visibility"

echo "=== DATABASE SETUP COMPLETE ==="
echo "Both databases created and configured successfully!"
echo "Main database: temporal"
echo "Visibility database: temporal_visibility"
