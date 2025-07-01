#!/bin/bash
set -e

echo "Setting up Temporal PostgreSQL database schemas..."

# Wait for PostgreSQL to be ready
until pg_isready -h postgres -p 5432 -U postgres > /dev/null 2>&1; do
  echo "Waiting for PostgreSQL to be ready..."
  sleep 2
done

echo "PostgreSQL is ready. Creating databases and schemas..."

# Function to create database with error handling (mimics Lambda function logic)
create_database_safe() {
    local db_name=$1
    echo "Creating $db_name database..."

    # Capture both stdout and stderr
    local output
    local exit_code

    if output=$(temporal-sql-tool --plugin postgres12 --ep postgres -p 5432 -u postgres --pw temporal create-database "$db_name" 2>&1); then
        echo "Database $db_name created successfully"
        return 0
    else
        exit_code=$?
        echo "Database creation failed with exit code: $exit_code"
        echo "Error output: $output"

        # Convert to lowercase for case-insensitive matching
        local error_text=$(echo "$output" | tr '[:upper:]' '[:lower:]')

        # ONLY ignore if it's specifically a "database already exists" error
        # We MUST create the database if it doesn't exist
        if [[ "$error_text" == *"duplicate key value violates unique constraint"* && "$error_text" == *"pg_database_datname_index"* ]]; then
            echo "Database $db_name already exists (duplicate key constraint), continuing..."
            return 0
        elif [[ "$error_text" == *"already exists"* && "$error_text" == *"database"* ]]; then
            echo "Database $db_name already exists (direct message), continuing..."
            return 0
        else
            echo "CRITICAL: Failed to create database $db_name. This will cause schema setup to fail."
            echo "Full error details: $output"
            return 1
        fi
    fi
}

# Function to setup schema with error handling (mimics Lambda function logic)
setup_schema_safe() {
    local db_name=$1
    echo "Setting up $db_name schema..."

    # Wait for database to be available
    echo "Waiting 2 seconds for database $db_name to be available..."
    sleep 2

    # Test connection to the database first
    echo "Testing connection to database $db_name..."
    if ! pg_isready -h postgres -p 5432 -U postgres -d "$db_name" > /dev/null 2>&1; then
        echo "ERROR: Cannot connect to database $db_name - it may not exist!"
        return 1
    fi
    echo "Successfully connected to database $db_name"

    # Setup initial schema
    local output
    local exit_code

    if output=$(temporal-sql-tool --plugin postgres12 --ep postgres -p 5432 -u postgres --pw temporal --db "$db_name" setup-schema -v 0.0 2>&1); then
        echo "Schema setup completed for $db_name"
    else
        exit_code=$?
        echo "Schema setup failed with exit code: $exit_code"
        echo "Error output: $output"

        # Convert to lowercase for case-insensitive matching
        local error_text=$(echo "$output" | tr '[:upper:]' '[:lower:]')

        # Only ignore if schema actually already exists
        if [[ "$error_text" == *"already exists"* ]] || [[ "$error_text" == *"relation"* && "$error_text" == *"already exists"* ]] || [[ "$error_text" == *"table"* && "$error_text" == *"already exists"* ]]; then
            echo "Schema for $db_name already exists, continuing..."
        else
            echo "CRITICAL: Failed to setup schema for $db_name"
            echo "Full error details: $output"
            return 1
        fi
    fi

    # Update schema to latest version
    local schema_dir="/etc/temporal/schema/postgresql/v12"
    if [[ "$db_name" == "temporal_visibility" ]]; then
        schema_dir="$schema_dir/visibility/versioned"
    else
        schema_dir="$schema_dir/temporal/versioned"
    fi

    echo "Updating schema for $db_name using directory: $schema_dir"
    if output=$(temporal-sql-tool --plugin postgres12 --ep postgres -p 5432 -u postgres --pw temporal --db "$db_name" update-schema -d "$schema_dir" 2>&1); then
        echo "Schema update completed for $db_name"
    else
        exit_code=$?
        echo "Schema update failed with exit code: $exit_code"
        echo "Error output: $output"

        # Convert to lowercase for case-insensitive matching
        local error_text=$(echo "$output" | tr '[:upper:]' '[:lower:]')

        # Check if schema is already up to date
        if [[ "$error_text" == *"already exists"* ]] || [[ "$error_text" == *"up to date"* ]] || [[ "$error_text" == *"no migration"* ]]; then
            echo "Schema for $db_name is already up to date, continuing..."
        else
            echo "CRITICAL: Failed to update schema for $db_name"
            echo "Full error details: $output"
            return 1
        fi
    fi
}

# Main execution (mimics our Lambda function exactly)
echo "=== TESTING LAMBDA FUNCTION LOGIC ==="
echo "This script mimics the exact logic from our TemporalDatabaseHandler.ts"

echo "=== CREATING TEMPORAL DATABASE ==="
if ! create_database_safe "temporal"; then
    echo "FAILED: Could not create temporal database"
    exit 1
fi

if ! setup_schema_safe "temporal"; then
    echo "FAILED: Could not setup schema for temporal database"
    exit 1
fi

echo "=== CREATING TEMPORAL_VISIBILITY DATABASE ==="
if ! create_database_safe "temporal_visibility"; then
    echo "FAILED: Could not create temporal_visibility database"
    exit 1
fi

if ! setup_schema_safe "temporal_visibility"; then
    echo "FAILED: Could not setup schema for temporal_visibility database"
    exit 1
fi

echo "=== DATABASE SETUP TEST COMPLETE ==="
echo "SUCCESS: Both databases created and configured successfully!"
echo "Main database: temporal"
echo "Visibility database: temporal_visibility"
echo "Lambda function logic test: PASSED"
