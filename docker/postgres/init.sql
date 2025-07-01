-- PostgreSQL initialization script for Temporal
-- This creates the databases that will be used by Temporal

-- Create temporal database
CREATE DATABASE temporal;

-- Create temporal_visibility database  
CREATE DATABASE temporal_visibility;

-- Grant permissions (postgres user already has all permissions)
-- No additional grants needed for local development
