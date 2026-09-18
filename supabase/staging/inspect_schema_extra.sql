-- SOLA LETTURA. Completa inspect_schema.sql con ciò che non copriva:
-- tipi enumerati, funzioni dello schema "private" (usate dalle regole di accesso),
-- nomi e superfici dei campi (dati non personali: servono per replicarli in staging).
--
-- Uso: SQL Editor del progetto di PRODUZIONE → incolla ed esegui → esporta/copia il risultato.

SELECT jsonb_pretty(jsonb_build_object(
  'enums', (
    SELECT jsonb_agg(jsonb_build_object('schema', n.nspname, 'type', t.typname,
             'values', (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid)))
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typtype = 'e' AND n.nspname = 'public'
  ),
  'private_functions', (
    SELECT jsonb_agg(jsonb_build_object('name', p.proname, 'def', pg_get_functiondef(p.oid)) ORDER BY p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.prokind IN ('f', 'p')
  ),
  'private_grants', (
    SELECT jsonb_agg(jsonb_build_object('function', routine_name, 'grantee', grantee, 'privilege', privilege_type))
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'private' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  ),
  'schema_private_usage', (
    SELECT jsonb_agg(jsonb_build_object('role', r.rolname,
             'usage', has_schema_privilege(r.rolname, 'private', 'USAGE')))
    FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated')
  ),
  'courts', (
    SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'surface', surface, 'is_active', is_active) ORDER BY id)
    FROM public.courts
  )
)) AS schema_extra;
