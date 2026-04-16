import { getSupabase } from '../supabase.js';

export interface GoalRow {
  horizon_id: string;
  user_id: string;
  goal_name: string;
  target_amount: number;
  target_asset: string;
  target_date: string | null;
  current_amount: number;
  contributions: number;
  yield_earned: number;
  on_track: boolean | null;
  projected_date: string | null;
  required_monthly: number | null;
  is_active: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getActiveGoals(userId: string): Promise<GoalRow[]> {
  const { data, error } = await getSupabase()
    .from('life_horizons')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[goals] getActiveGoals: ${error.message}`);
  return (data ?? []) as GoalRow[];
}

export async function createGoal(
  goal: Omit<GoalRow, 'horizon_id' | 'created_at' | 'updated_at' | 'completed_at' | 'on_track' | 'projected_date' | 'required_monthly'>,
): Promise<GoalRow> {
  const { data, error } = await getSupabase()
    .from('life_horizons')
    .insert(goal)
    .select()
    .single();

  if (error) throw new Error(`[goals] createGoal: ${error.message}`);
  return data as GoalRow;
}

export async function updateGoalBalance(horizonId: string, currentAmount: number): Promise<void> {
  const { error } = await getSupabase()
    .from('life_horizons')
    .update({ current_amount: currentAmount })
    .eq('horizon_id', horizonId);

  if (error) throw new Error(`[goals] updateGoalBalance: ${error.message}`);
}
