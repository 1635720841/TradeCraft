-- Add PAUSED status for article job workflow control.
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
