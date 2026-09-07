/*
      # Remove session logging triggers and clean up entry/exit logs

      1. Changes
        - Drop any triggers or functions that automatically log `admin_session_enter` or `admin_session_exit`
        - Delete existing session enter/exit logs from `admin_audit_logs` to prevent database bloat
      2. Security
        - Maintains existing RLS policies on `admin_audit_logs`
    */

    -- Clean up existing session enter/exit audit logs to prevent DB bloat
    DELETE FROM public.admin_audit_logs
    WHERE action IN ('admin_session_enter', 'admin_session_exit');

    -- Drop any potential triggers related to session logging if they exist
    DROP TRIGGER IF EXISTS tr_admin_session_enter ON public.admin_audit_logs;
    DROP TRIGGER IF EXISTS tr_admin_session_exit ON public.admin_audit_logs;

    -- Drop functions if they were created specifically for auto-logging sessions
    DROP FUNCTION IF EXISTS public.log_admin_session_enter() CASCADE;
    DROP FUNCTION IF EXISTS public.log_admin_session_exit() CASCADE;