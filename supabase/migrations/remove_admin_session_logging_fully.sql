/*
      # Remove admin session entry and exit logging completely

      1. Changes
        - Delete all existing `admin_session_enter` and `admin_session_exit` audit logs from `admin_audit_logs`.
        - Drop any database functions or triggers that automatically log session entry or exit.
        - Ensure no future session entry/exit actions are inserted into `admin_audit_logs`.
    */

    -- 1. Purge existing session enter and exit logs
    DELETE FROM public.admin_audit_logs
    WHERE action IN ('admin_session_enter', 'admin_session_exit');

    -- 2. Drop any triggers that might be auto-logging session events
    DROP TRIGGER IF EXISTS tr_admin_session_enter ON public.admin_audit_logs;
    DROP TRIGGER IF EXISTS tr_admin_session_exit ON public.admin_audit_logs;
    DROP TRIGGER IF EXISTS tr_audit_admin_session_enter ON public.admin_audit_logs;
    DROP TRIGGER IF EXISTS tr_audit_admin_session_exit ON public.admin_audit_logs;

    -- 3. Drop any stored procedures or functions related to session logging
    DROP FUNCTION IF EXISTS public.log_admin_session_enter() CASCADE;
    DROP FUNCTION IF EXISTS public.log_admin_session_exit() CASCADE;
    DROP FUNCTION IF EXISTS public.log_admin_session() CASCADE;