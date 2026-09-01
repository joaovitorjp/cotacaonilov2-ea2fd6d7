import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MP_API = 'https://api.mercadopago.com'
const PRICE = 49.99

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const mpToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')?.trim()
    if (!mpToken) throw new Error('MERCADO_PAGO_ACCESS_TOKEN nao configurado')

    // Valida o JWT do usuario logado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nao autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Sessao invalida' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const origin = typeof body.origin === 'string' && body.origin.startsWith('http')
      ? body.origin
      : 'https://cotacaonilov2.lovable.app'

    // Webhook registrado por assinatura (dispensa cadastro manual no painel do MP)
    const notificationUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`

    // Cria a assinatura (preapproval) no Mercado Pago
    const mpRes = await fetch(`${MP_API}/preapproval`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason: 'COTARME - Assinatura Mensal',
        external_reference: user.id,
        payer_email: user.email,
        notification_url: notificationUrl,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: PRICE,
          currency_id: 'BRL',
        },
        back_url: `${origin}/assinatura`,
        status: 'pending',
      }),
    })

    const mpData = await mpRes.json()
    if (!mpRes.ok) {
      console.error('MP error', mpRes.status, mpData)
      const detalhe = mpData?.message || mpData?.error || 'erro desconhecido'
      const dica = mpRes.status === 401
        ? 'Token do Mercado Pago invalido ou sem permissao para assinaturas (preapproval). Gere um Access Token de producao em Suas Integracoes > Credenciais e atualize o segredo.'
        : undefined
      return new Response(JSON.stringify({ error: `Falha ao criar assinatura no Mercado Pago: ${detalhe}`, dica, mp_status: mpRes.status }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    }

    // Vincula o preapproval ao usuario
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    await admin
      .from('assinaturas')
      .upsert({ user_id: user.id, mp_preapproval_id: mpData.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

    return new Response(JSON.stringify({ init_point: mpData.init_point }), {
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
