import { supabase } from '@/integrations/supabase/client'

export interface UpdateProfileInput {
  display_name?: string
  accent_color?: string
  avatar_url?: string
  tier?: string
}

export async function updateProfile(
  userId: string,
  data: UpdateProfileInput
): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update(data)
    .eq('id', userId)

  if (error) throw error
  return true
}