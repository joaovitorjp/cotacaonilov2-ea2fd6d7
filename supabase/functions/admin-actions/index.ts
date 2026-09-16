import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const caller = userData?.user;
  if (!caller) return json({ error: "Não autenticado" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .eq("role", "admin");
  if (!roles || roles.length === 0) return json({ error: "Acesso negado" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo inválido" }, 400);
  }

  const { action, user_id, password, email, nome, network_id } = body ?? {};

  try {
    switch (action) {
      case "reset_password": {
        if (!user_id || !password || String(password).length < 6) {
          return json({ error: "Senha inválida" }, 400);
        }
        const { error } = await admin.auth.admin.updateUserById(user_id, { password });
        if (error) throw error;
        break;
      }
      case "sign_out": {
        if (!user_id) return json({ error: "Usuário obrigatório" }, 400);
        const { error } = await admin.auth.admin.signOut?.(user_id as string) ?? { error: null };
        if (error) throw error;
        break;
      }
      case "create_user": {
        if (!email || !password) return json({ error: "Email e senha obrigatórios" }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { nome: nome ?? "" },
        });
        if (error) throw error;
        if (network_id && data.user) {
          await admin.from("profiles").update({ network_id }).eq("user_id", data.user.id);
        }
        break;
      }
      case "delete_user": {
        if (!user_id) return json({ error: "Usuário obrigatório" }, 400);
        if (user_id === caller.id) return json({ error: "Não é possível excluir a si mesmo" }, 400);
        const { error } = await admin.auth.admin.deleteUser(user_id);
        if (error) throw error;
        break;
      }
      default:
        return json({ error: "Ação desconhecida" }, 400);
    }

    await admin.from("master_audit_logs").insert({
      performed_by: caller.id,
      action_type: action,
      entity_type: "user",
      entity_id: user_id ?? caller.id,
      details: { email: email ?? null, nome: nome ?? null },
    });

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
