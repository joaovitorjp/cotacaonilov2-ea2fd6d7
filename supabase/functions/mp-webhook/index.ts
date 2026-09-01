import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MP_API = 'https://api.mercadopago.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const mpToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
    if (!mpToken) throw new Error('MERCADO_PAGO_ACCESS_TOKEN nao configurado')

    const url = new URL(req.url)
    let topic = url.searchParams.get('topic') || url.searchParams.get('type') || ''
    let id = url.searchParams.get('id') || url.searchParams.get('data.id') || ''

    // MP tambem pode mandar JSON no body
    if (!id && req.method === 'POST') {
      const body = await req.json().catch(() => null)
      if (body) {
        topic = topic || body.type || body.topic || ''
        id = id || body?.data?.id || body?.id || ''
      }
    }

    if (!id) {
      return new Response(JSON.stringify({ ok: true, ignored: 'sem id' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Assinatura (preapproval): autorizada, pausada ou cancelada
    if (topic.includes('preapproval')) {
      const mpRes = await fetch(`${MP_API}/preapproval/${id}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      })
      const pre = await mpRes.json()
      if (!mpRes.ok) {
        console.error('MP fetch error', pre)
        return new Response(JSON.stringify({ error: 'falha ao consultar preapproval' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const userId: string | undefined = pre.external_reference
      if (!userId) {
        return new Response(JSON.stringify({ ok: true, ignored: 'sem external_reference' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let status = 'past_due'
      let periodEnd: string | null = null
      if (pre.status === 'authorized') {
        status = 'active'
        const next = pre.auto_recurring?.next_payment_date
          ?? (pre.next_payment_date as string | undefined)
        periodEnd = next ?? new Date(Date.now() + 32 * 864e5).toISOString()
      } else if (pre.status === 'cancelled' || pre.status === 'paused') {
        status = 'canceled'
      }

      // Nunca rebaixa um usuario vitalicio
      const { data: atual } = await admin
        .from('assinaturas')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle()
      if (atual?.status === 'lifetime') {
        return new Response(JSON.stringify({ ok: true, ignored: 'vitalicio' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      await admin
        .from('assinaturas')
        .upsert({
          user_id: userId,
          status,
          mp_preapproval_id: pre.id,
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      return new Response(JSON.stringify({ ok: true, status }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Pagamento avulso de assinatura: renova o periodo
    if (topic.includes('payment')) {
      const mpRes = await fetch(`${MP_API}/v1/payments/${id}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      })
      const pay = await mpRes.json()
      if (mpRes.ok && pay.status === 'approved') {
        const preId = pay.preapproval_id || pay.point_of_interaction?.transaction_data?.subscription_id
        if (preId) {
          const { data: assinatura } = await admin
            .from('assinaturas')
            .select('user_id, status')
            .eq('mp_preapproval_id', preId)
            .maybeSingle()
          if (assinatura && assinatura.status !== 'lifetime') {
            await admin
              .from('assinaturas')
              .update({
                status: 'active',
                current_period_end: new Date(Date.now() + 32 * 864e5).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', assinatura.user_id)
          }
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, ignored: topic }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
