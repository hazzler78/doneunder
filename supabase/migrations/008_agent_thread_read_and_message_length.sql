-- Users must be able to read their own Hermes threads. Nested RLS on
-- agent_messages checks agent_threads; with no SELECT policy, history always
-- looked empty and the workspace fell back to the welcome message.

drop policy if exists "users read own agent threads" on public.agent_threads;
create policy "users read own agent threads" on public.agent_threads
for select using (auth.uid() = user_id);

drop policy if exists "users insert own agent messages" on public.agent_messages;
create policy "users insert own agent messages" on public.agent_messages
for insert with check (
  exists (
    select 1
    from public.agent_threads t
    where t.id = agent_messages.thread_id
      and t.user_id = auth.uid()
  )
);

alter table public.agent_messages
  drop constraint if exists agent_messages_content_check;

alter table public.agent_messages
  add constraint agent_messages_content_check
  check (char_length(content) between 1 and 16000);
