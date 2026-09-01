import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MP_API = 'https://api.mercadopago.com'

// Consulta o Mercado Pago sob demanda e sincroniza a assinatura do usuario logado.
// Serve de rede de seguranca caso o webhook nao chegue.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const mpToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
    if (!mpToken) throw new Error('MERCADO_PAGO_ACCESS_TOKEN nao configurado')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Nao autenticado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'Sessao invalida' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: atual } = await admin
      .from('assinaturas')
      .select('status, mp_preapproval_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (atual?.status === 'lifetime') return json({ status: 'lifetime' })

    // Primeiro verifica um pagamento unico do plano vitalicio
    const payRes = await fetch(
      `${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(`${user.id}|lifetime`)}&sort=date_created&criteria=desc&limit=5`,
      { headers: { Authorization: `Bearer ${mpToken}` } },
    )
    if (payRes.ok) {
      const pays = await payRes.json()
      const aprovado = (pays?.results ?? []).find((p: any) => p.status === 'approved')
      if (aprovado) {
        await admin.from('assinaturas').upsert({
          user_id: user.id,
          status: 'lifetime',
          current_period_end: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        return json({ status: 'lifetime', synced: true })
      }
    }

    // Busca o preapproval salvo ou o mais recente do usuario no MP
    let pre: any = null
    if (atual?.mp_preapproval_id) {
      const res = await fetch(`${MP_API}/preapproval/${atual.mp_preapproval_id}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      })
      if (res.ok) pre = await res.json()
    }
    if (!pre) {
      const res = await fetch(
        `${MP_API}/preapproval/search?external_reference=${encodeURIComponent(user.id)}&limit=1&sort=date_created:desc`,
        { headers: { Authorization: `Bearer ${mpToken}` } },
      )
      if (res.ok) {
        const search = await res.json()
        pre = search?.results?.[0] ?? null
      }
    }

    if (!pre) return json({ status: atual?.status ?? null, synced: false })

    let status = 'past_due'
    let periodEnd: string | null = null
    if (pre.status === 'authorized') {
      status = 'active'
      periodEnd = pre.auto_recurring?.next_payment_date
        ?? pre.next_payment_date
        ?? new Date(Date.now() + 32 * 864e5).toISOString()
    } else if (pre.status === 'cancelled' || pre.status === 'paused') {
      status = 'canceled'
    } else if (pre.status === 'pending') {
      return json({ status: atual?.status ?? null, synced: false, mp_status: 'pending' })
    }

    await admin.from('assinaturas').upsert({
      user_id: user.id,
      status,
      mp_preapproval_id: pre.id,
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return json({ status, synced: true })
  } catch (err) {
    console.error(err)
    return json({ error: (err as Error).message }, 500)
  }
})
