#!/bin/bash
set -e

echo "Setting up Temporal database schemas..."

# Wait for MySQL to be ready
until mysql -h mysql -P 3306 -u temporal -ptemporal --ssl=0 -e "SELECT 1" > /dev/null 2>&1; do
  echo "Waiting for MySQL to be ready..."
  sleep 2
done

echo "MySQL is ready. Creating databases and schemas..."

# Setup main temporal database
temporal-sql-tool --plugin mysql8 --ep mysql -p 3306 --u temporal --pw temporal create-database temporal
temporal-sql-tool --plugin mysql8 --ep mysql -p 3306 --u temporal --pw temporal --db temporal setup-schema -v 0.0
temporal-sql-tool --plugin mysql8 --ep mysql -p 3306 --u temporal --pw temporal --db temporal update-schema -d /etc/temporal/schema/mysql/v8/temporal/versioned

# Setup visibility database
temporal-sql-tool --plugin mysql8 --ep mysql -p 3306 --u temporal --pw temporal create-database temporal_visibility
temporal-sql-tool --plugin mysql8 --ep mysql -p 3306 --u temporal --pw temporal --db temporal_visibility setup-schema -v 0.0
temporal-sql-tool --plugin mysql8 --ep mysql -p 3306 --u temporal --pw temporal --db temporal_visibility update-schema -d /etc/temporal/schema/mysql/v8/visibility/versioned

echo "Schema setup completed successfully!"
