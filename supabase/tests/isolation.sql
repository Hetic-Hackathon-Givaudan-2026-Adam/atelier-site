-- Run only against a disposable PostgreSQL instance, after the migrations.
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
('10000000-0000-0000-0000-000000000001', 'alice@example.test', '{"full_name":"Alice","role":"admin"}'),
('10000000-0000-0000-0000-000000000002', 'bob@example.test', '{"full_name":"Bob"}'),
('10000000-0000-0000-0000-000000000003', 'sales@example.test', '{}'),
('10000000-0000-0000-0000-000000000004', 'admin@example.test', '{}'),
('10000000-0000-0000-0000-000000000005', 'other-sales@example.test', '{}');
UPDATE public.profiles SET role = 'commercial' WHERE email IN ('sales@example.test', 'other-sales@example.test');
UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@example.test';

CREATE FUNCTION pg_temp.assert_true(condition boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Échec : %', label; END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(public.atelier_role() = 'client', 'inscription sans élévation de rôle');
SELECT pg_temp.assert_true((public.atelier_save_project('20000000-0000-0000-0000-000000000001', -1,
    '{"name":"Projet Alice","brief":{"product":"Gel douche"},"blends":[{"id":"c1","name":"Composition 1"}]}')).revision = 0, 'création');
SELECT pg_temp.assert_true((public.atelier_save_project('20000000-0000-0000-0000-000000000001', -1,
    '{"name":"Projet Alice","brief":{"product":"Gel douche"},"blends":[{"id":"c1","name":"Composition 1"}]}')).revision = 0, 'reprise idempotente');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.briefs) = 1, 'brief persisté');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.recommendations) = 1, 'recommandation persistée');
SELECT public.atelier_save_preference('orders', '[{"number":"test"}]');
SELECT public.atelier_save_preference('rejected', '["Composition 1"]');
SELECT pg_temp.assert_true((SELECT data ? 'orders' AND data ? 'rejected' FROM public.atelier_preferences), 'préférences fusionnées');
INSERT INTO public.project_messages (project_id, sender_id, sender_role, content) VALUES
('20000000-0000-0000-0000-000000000001', auth.uid(), 'client', 'Bonjour');
DO $$
BEGIN
    BEGIN
        UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
        RAISE EXCEPTION 'Élévation de rôle acceptée';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM public.atelier_assign_project('20000000-0000-0000-0000-000000000001', NULL);
        RAISE EXCEPTION 'Affectation par le client acceptée';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        INSERT INTO public.project_messages (project_id, sender_id, sender_role, content) VALUES
        ('20000000-0000-0000-0000-000000000001', auth.uid(), 'commercial', 'Usurpation');
        RAISE EXCEPTION 'Usurpation acceptée';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true((SELECT count(*) FROM public.projects) = 0, 'projets isolés');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.briefs) = 0, 'briefs isolés');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.recommendations) = 0, 'recommandations isolées');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.project_messages) = 0, 'messages isolés');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.atelier_preferences) = 0, 'préférences isolées');
DO $$
BEGIN
    BEGIN
        PERFORM public.atelier_save_project('20000000-0000-0000-0000-000000000001', 0, '{"name":"Intrusion"}');
        RAISE EXCEPTION 'Modification interclient acceptée';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    BEGIN
        INSERT INTO public.project_messages (project_id, sender_id, sender_role, content) VALUES
        ('20000000-0000-0000-0000-000000000001', auth.uid(), 'client', 'Intrusion');
        RAISE EXCEPTION 'Message interclient accepté';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
SELECT pg_temp.assert_true((SELECT count(*) FROM public.projects) = 1, 'vue administrateur');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.project_messages) = 0, 'messages réservés aux interlocuteurs');
DO $$
BEGIN
    BEGIN
        PERFORM public.atelier_assign_project('20000000-0000-0000-0000-000000000001',
                                             '10000000-0000-0000-0000-000000000002');
        RAISE EXCEPTION 'Affectation à un client acceptée';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
END;
$$;
SELECT public.atelier_assign_project('20000000-0000-0000-0000-000000000001',
                                    '10000000-0000-0000-0000-000000000003');

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
SELECT pg_temp.assert_true((SELECT count(*) FROM public.projects) = 0, 'commercial non affecté exclu');
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
SELECT pg_temp.assert_true((SELECT count(*) FROM public.projects) = 1, 'commercial affecté');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.briefs) = 1, 'brief commercial');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.recommendations) = 1, 'recommandation commerciale');
SELECT public.atelier_read_messages(ARRAY(SELECT id FROM public.project_messages));
SELECT pg_temp.assert_true((SELECT read_at IS NOT NULL FROM public.project_messages), 'lecture commerciale enregistrée');
INSERT INTO public.project_messages (project_id, sender_id, sender_role, content) VALUES
('20000000-0000-0000-0000-000000000001', auth.uid(), 'commercial', 'Réponse');

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*) FROM public.project_messages) = 2, 'échange réel client-commercial');
SELECT pg_temp.assert_true((public.atelier_save_project('20000000-0000-0000-0000-000000000001', 0,
    '{"name":"Projet Alice finalisé","status":"expert"}')).revision = 1, 'mise à jour avec révision');
DO $$
BEGIN
    BEGIN
        PERFORM public.atelier_save_project('20000000-0000-0000-0000-000000000001', 0, '{"name":"Version concurrente"}');
        RAISE EXCEPTION 'Révision périmée acceptée';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
END;
$$;
ROLLBACK;
\echo Isolation, révision, affectation et messagerie vérifiées.
