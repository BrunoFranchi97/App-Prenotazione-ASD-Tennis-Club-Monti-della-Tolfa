-- SOLA LETTURA. Descrive la STRUTTURA del database (tabelle, colonne, vincoli, indici,
-- regole di accesso RLS, funzioni, trigger, viste, permessi). NON legge i dati dei soci.
--
-- Uso: SQL Editor del progetto di PRODUZIONE → incolla ed esegui → copia il risultato (un JSON).
-- Serve a ricreare lo stesso schema sul progetto di staging (vedi docs/wallet-staging.md).
-- Prima di condividerlo, controlla che nelle definizioni delle funzioni non ci siano chiavi o password.

SELECT jsonb_pretty(jsonb_build_object(
  'tables', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', t.table_name,
      'columns', (
        SELECT jsonb_agg(jsonb_build_object(
          'name', c.column_name, 'type', c.data_type, 'udt', c.udt_name,
          'nullable', c.is_nullable, 'default', c.column_default, 'identity', c.is_identity
        ) ORDER BY c.ordinal_position)
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = t.table_name
      )
    ) ORDER BY t.table_name)
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  ),
  'constraints', (
    SELECT jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'name', conname, 'def', pg_get_constraintdef(oid))
                     ORDER BY conrelid::regclass::text, conname)
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace AND conrelid <> 0
  ),
  'indexes', (
    SELECT jsonb_agg(jsonb_build_object('table', tablename, 'name', indexname, 'def', indexdef) ORDER BY tablename, indexname)
    FROM pg_indexes WHERE schemaname = 'public'
  ),
  'rls_enabled', (
    SELECT jsonb_agg(jsonb_build_object('table', relname, 'enabled', relrowsecurity, 'forced', relforcerowsecurity) ORDER BY relname)
    FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
  ),
  'policies', (
    SELECT jsonb_agg(jsonb_build_object(
      'schema', schemaname, 'table', tablename, 'name', policyname, 'permissive', permissive,
      'roles', roles, 'cmd', cmd, 'using', qual, 'with_check', with_check
    ) ORDER BY schemaname, tablename, policyname)
    FROM pg_policies WHERE schemaname IN ('public', 'storage')
  ),
  'functions', (
    SELECT jsonb_agg(jsonb_build_object('name', p.proname, 'def', pg_get_functiondef(p.oid)) ORDER BY p.proname)
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p')
  ),
  'triggers', (
    SELECT jsonb_agg(jsonb_build_object('table', t.tgrelid::regclass::text, 'def', pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid::regclass::text)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relnamespace IN ('public'::regnamespace, 'auth'::regnamespace)
  ),
  'views', (
    SELECT jsonb_agg(jsonb_build_object('name', viewname, 'def', definition) ORDER BY viewname)
    FROM pg_views WHERE schemaname = 'public'
  ),
  'sequences', (
    SELECT jsonb_agg(sequence_name ORDER BY sequence_name)
    FROM information_schema.sequences WHERE sequence_schema = 'public'
  ),
  'grants', (
    SELECT jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'privilege', privilege_type)
                     ORDER BY table_name, grantee, privilege_type)
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
  ),
  'storage_buckets', (
    SELECT jsonb_agg(jsonb_build_object('id', id, 'public', public) ORDER BY id) FROM storage.buckets
  ),
  'extensions', (
    SELECT jsonb_agg(extname ORDER BY extname) FROM pg_extension
  )
)) AS schema_produzione;
