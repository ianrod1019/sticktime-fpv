import { supabase } from '@/integrations/supabase/client'

export interface PilotSettings {
  id: string
  user_id: string
  accent_color: string | null
  avatar_url: string | null
  display_name: string | null
  role: string
  tier: string | null
  created_at: string
}

export async function getPilotSettings(userId: string): Promise<PilotSettings | null> {
  const { data, error } = await supabase
    .from('pilot_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}