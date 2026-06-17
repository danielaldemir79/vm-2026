-- T98 F1+F2 (SÄKERHETS-HOTFIX, slutgranskningen #188): stäng forge-officiellt-facit-hålet.
--
-- PROBLEM (granskar-fynd F1, BLOCKER): `apply_auto_facit` , SECURITY DEFINER-RPC:n som
-- SKRIVER `official_match_results` (den GLOBALA tävlings-sanningen) , var EXECUTE-bar av
-- BÅDE `anon` och `authenticated`. T80:s lås gjorde `revoke all ... from public`, men det
-- STRIPPAR INTE Supabases default-grant `grant execute ... to anon, authenticated` (de
-- grantsen sitter på ROLLERNA, inte på pseudo-rollen public). Dessutom gatar käll-låset bara
-- ON CONFLICT DO UPDATE-grenen , INSERT-grenen (en match som ännu saknar resultatrad, dvs de
-- flesta matcher före facit) var OGATAD. Följd: en anonym klient kunde POST:a
-- /rest/v1/rpc/apply_auto_facit och FORGE:a officiellt facit för vilken ej-inmatad match som
-- helst -> korrumpera allas poäng mitt under VM. (Verifierat live: has_function_privilege
-- ('anon', ..., 'EXECUTE') = true.)
--
-- F2 (LOW): `count_non_bot_rows(text)` är samma sorts anon-EXECUTE-bara SECURITY DEFINER
-- (returnerar bara ett aggregat-antal, inget användarinnehåll, men onödig yta) , tas med här.
--
-- FIX: revoke EXECUTE EXPLICIT från anon + authenticated (namngivna roller, inte public).
-- `service_role` BEHÅLLER EXECUTE , pollaren (livescore-poller) + ev. sändare anropar via
-- service-nyckeln och måste fortsätta funka. Manuellt facit gick ALDRIG via denna RPC
-- (arrangörs-inmatningen är `is_app_admin()`-gatad direkt på tabellen), så ingen legitim väg
-- bryts. admin_revealed_predictions/admin_room_stats bär samma advisor-flagga men har en
-- intern `is_app_admin()`-vakt och lämnas orörda.
--
-- VERIFIERA EFTER APPLY: has_function_privilege('anon', 'public.apply_auto_facit(...)',
-- 'EXECUTE') ska vara FALSE (likaså authenticated); service_role ska vara TRUE.

revoke execute on function public.apply_auto_facit(text, smallint, smallint, text, smallint, smallint, uuid)
  from anon, authenticated;

revoke execute on function public.count_non_bot_rows(text)
  from anon, authenticated;
