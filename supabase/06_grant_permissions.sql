-- Autoriser les utilisateurs authentifiés à lire leur profil

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON TABLE public.profiles TO authenticated;