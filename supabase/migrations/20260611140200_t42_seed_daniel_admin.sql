-- T42 (#72): seeda Daniel som ENDA admin i allowlisten.
--
-- VARFÖR id:t är stabilt över e-post-uppgraderingen (gissas inte, källverifierat
-- mot Supabase-dokumentationen): admin-inloggningen sker via
-- `supabase.auth.updateUser({ email })` på Daniels BEFINTLIGA anonyma session.
-- updateUser LÄNKAR en e-postidentitet till SAMMA user-rad, den skapar ingen ny
-- användare. user_id (PK i auth.users) ändras därför INTE, och Daniels 85 tips i
-- ewrmdt (FK user_id) följer med. Källa: Supabase "Anonymous Sign-Ins" ->
-- "Convert an anonymous user to a permanent user"
-- (https://supabase.com/docs/guides/auth/auth-anonymous): "you can convert an
-- anonymous user to a permanent user by linking ... using updateUser()".
--
-- Daniels nuvarande user_id (verifierat mot auth.users 2026-06-11, samma id som
-- issue #72 anger): f4ab8398-d061-47ff-b152-4ed1eebbaf2e. Eftersom id:t inte
-- ändras av e-post-länkningen kan vi seeda admin-rollen REDAN nu (på det anonyma
-- id:t), så facit-skrivningen funkar så snart han loggat in via magic-link.
--
-- IDEMPOTENT (on conflict do nothing): migrationen kan köras om utan dubblettfel.
-- Skulle Daniel mot förmodan få ett NYTT id (t.ex. om han loggar in på en helt ny
-- enhet UTAN sin anon-session och därmed skapar en fristående e-post-användare),
-- lägg in det nya id:t via MCP/en uppföljande migration, se docs/decisions.md T42.
insert into public.app_admins (user_id)
values ('f4ab8398-d061-47ff-b152-4ed1eebbaf2e')
on conflict (user_id) do nothing;
