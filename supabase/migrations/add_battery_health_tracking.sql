/*
  # Add Battery Health & IR Tracking Tables

  1. Changes
    - Create `battery_packs` table to track individual battery pack health metrics
    - Create `battery_health_readings` table for voltage sag curve analytics over time
    - Store internal resistance (IR) measurements, voltage under load, capacity retention
    - Add indexes for performance on time-series queries
    
  2. Security
    - Enable RLS with policies allowing users to manage their own data
    - Admins/dev can access all data
*/

-- 1. Create battery_packs table
CREATE TABLE IF NOT EXISTS public.battery_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL REFERENCES public.gear(id) ON DELETE CASCADE,
  pack_number integer NOT NULL, -- Individual pack number in a set (1, 2, 3, etc.)
  serial_number text, -- Optional: manufacturer serial number
  purchase_date timestamp with time zone, -- When the pack was acquired
  total_cycles integer DEFAULT 0, -- Number of charge/discharge cycles
  max_capacity_mah integer DEFAULT 0, -- Original rated capacity in mAh
  current_capacity_mah integer DEFAULT 0, -- Current measured capacity
  health_percentage numeric(5,2) DEFAULT 100.00, -- Capacity retention percentage
  internal_resistance_milliohm numeric(6,3) DEFAULT 0.000, -- Internal resistance in milliohms
  voltage_sag_percent numeric(5,2) DEFAULT 0.00, -- Voltage sag percentage under load
  last_analyzed timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Ensure pack_number is positive and unique per gear
  CONSTRAINT chk_pack_number_positive CHECK (pack_number > 0),
  CONSTRAINT uq_gear_pack_number UNIQUE (gear_id, pack_number)
);

-- 2. Create battery_health_readings table for time-series voltage sag data
CREATE TABLE IF NOT EXISTS public.battery_health_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  battery_pack_id uuid NOT NULL REFERENCES public.battery_packs(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  
  -- Voltage sag curve data points
  voltage_at_rest_volts numeric(4,2) NOT NULL, -- Battery voltage at rest
  voltage_under_load_volts numeric(4,2) NOT NULL, -- Voltage under load (during flight)
  current_draw_amps numeric(5,2) NOT NULL, -- Current draw in amps during measurement
  calculated_internal_resistance_milliohm numeric(6,3), -- IR calculated from V=IR
  voltage_sag_percent numeric(5,2), -- Calculated voltage sag percentage
  
  -- Environmental and operational context
  ambient_temperature_celsius numeric(4,1), -- Temperature during measurement
  flight_duration_seconds integer, -- Duration of flight session
  throttle_percent_avg numeric(5,2), -- Average throttle during measurement
  
  -- Metadata
  recorded_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  
  -- Indexes for performance on time-series queries
  CONSTRAINT chk_voltage_rest_positive CHECK (voltage_at_rest_volts > 0),
  CONSTRAINT chk_voltage_load_positive CHECK (voltage_under_load_volts > 0),
  CONSTRAINT chk_current_positive CHECK (current_draw_amps >= 0)
);

-- 3. Enable Row Level Security
ALTER TABLE public.battery_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battery_health_readings ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies

-- Battery packs policies
CREATE POLICY "Users can manage their own battery packs"
  ON public.battery_packs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all battery packs"
  ON public.battery_packs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dev')
    )
  );

-- Battery health readings policies
CREATE POLICY "Users can manage their own battery health readings"
  ON public.battery_health_readings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all battery health readings"
  ON public.battery_health_readings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dev')
    )
  );

-- 5. Create indexes for performance
CREATE INDEX idx_battery_packs_user_id ON public.battery_packs(user_id);
CREATE INDEX idx_battery_packs_gear_id ON public.battery_packs(gear_id);
CREATE INDEX idx_battery_health_readings_battery_pack_id ON public.battery_health_readings(battery_pack_id);
CREATE INDEX idx_battery_health_readings_user_id ON public.battery_health_readings(user_id);
CREATE INDEX idx_battery_health_readings_recorded_at ON public.battery_health_readings(recorded_at DESC);
CREATE INDEX idx_battery_health_readings_session_id ON public.battery_health_readings(session_id);

-- 6. Update handle_new_user trigger function to handle new tables (no action needed for these tables)
-- The trigger only affects profiles table, so no changes needed

COMMENT ON TABLE public.battery_packs IS 'Tracks individual battery pack health metrics including capacity, internal resistance, and voltage sag';
COMMENT ON TABLE public.battery_health_readings IS 'Time-series voltage sag curve analytics and health measurements for battery packs';
COMMENT ON COLUMN public.battery_packs.health_percentage IS 'Capacity retention percentage compared to original rating (100% = new pack)';
COMMENT ON COLUMN public.battery_packs.internal_resistance_milliohm IS 'Internal resistance in milliohms - higher means more degraded';
COMMENT ON COLUMN public.battery_packs.voltage_sag_percent IS 'Voltage sag percentage under load - higher means worse performance';
COMMENT ON COLUMN public.battery_health_readings.voltage_at_rest_volts IS 'Battery voltage when at rest (no load)';
COMMENT ON COLUMN public.battery_health_readings.voltage_under_load_volts IS 'Battery voltage under load (during flight/current draw)';
COMMENT ON COLUMN public.battery_health_readings.current_draw_amps IS 'Current draw in amps during the voltage measurement';
COMMENT ON COLUMN public.battery_health_readings.calculated_internal_resistance_milliohm IS 'Calculated IR using Ohms Law: (V_rest - V_load) / Current * 1000';
COMMENT ON COLUMN public.battery_health_readings.voltage_sag_percent IS 'Percentage voltage drop: ((V_rest - V_load) / V_rest) * 100';