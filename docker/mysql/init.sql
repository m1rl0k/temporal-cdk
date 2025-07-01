-- MySQL initialization script for Temporal
-- Create the visibility database
CREATE DATABASE IF NOT EXISTS temporal_visibility;

-- Grant permissions to temporal user for both databases
GRANT ALL PRIVILEGES ON temporal.* TO 'temporal'@'%';
GRANT ALL PRIVILEGES ON temporal_visibility.* TO 'temporal'@'%';
FLUSH PRIVILEGES;

-- Set MySQL 8.0 compatibility settings
SET GLOBAL transaction_isolation = 'READ-COMMITTED';
SET GLOBAL binlog_format = 'ROW';
