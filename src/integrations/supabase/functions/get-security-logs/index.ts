import { supabase } from '@/integrations/supabase/client'

export interface SecurityLogEntry {
  id: string
  event_type: string
  user_id: string | null
  details: Record<string, any> | null
  created_at: string
}

export async function getSecurityLogs(
  options?: {
    limit?: number
    eventType?: string
    startDate?: string
    endDate?: string
  }
): Promise<SecurityLogEntry[]> {
  let query = supabase.from('security_logs').select('*')

  if (options?.eventType) {
    query = query.eq('event_type', options.eventType)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.startDate) {
    query = query.gte('created_at', options.startDate)
  }

  if (options?.endDate) {
    query = query.lte('created_at', options.endDate)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw error
  return data
}