-- Multiply existing buffer values by 100 to convert from ratio to percentage

-- Update segment_settings
UPDATE public.segment_settings
SET 
  entry_buffer = entry_buffer * 100,
  bid_buffer = bid_buffer * 100,
  exit_buffer = exit_buffer * 100;

-- Update scalper_segment_settings
UPDATE public.scalper_segment_settings
SET 
  entry_buffer = entry_buffer * 100,
  bid_buffer = bid_buffer * 100,
  exit_buffer = exit_buffer * 100;
