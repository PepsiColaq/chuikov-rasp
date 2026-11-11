-- Enable live updates for homework & overrides (Supabase Realtime).
-- Run once in SQL Editor.

do $$
begin
  begin
    alter publication supabase_realtime add table homework;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table overrides;
  exception when duplicate_object then null;
  end;
end $$;
