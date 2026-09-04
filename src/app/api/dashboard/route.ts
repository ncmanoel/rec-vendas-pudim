import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { searchParams } = new URL(req.url);
    const password = searchParams.get('pwd');

    if (password !== 'Atletico2000') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Datas configuráveis via URL Params
    const sinceParam = searchParams.get('since');
    const untilParam = searchParams.get('until');

    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    const sinceStr = sinceParam ? sinceParam : thirtyDaysAgo.toISOString().split('T')[0];
    const untilStr = untilParam ? untilParam : today.toISOString().split('T')[0];

    // 1. Buscar Vendas do Supabase
    const { data: vendas, error: dbError } = await supabase
      .from('vendas')
      .select('*')
      .gte('data_venda', `${sinceStr}T00:00:00Z`)
      .lte('data_venda', `${untilStr}T23:59:59Z`)
      .order('data_venda', { ascending: false });

    if (dbError) throw dbError;

    // 2. Buscar Dados do Meta Ads (Nível Campanha, Agrupado por Dia para o Gráfico)
    const metaToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    
    let fbData = [];
    if (metaToken && adAccountId) {
      // Puxar nível de campanha agrupado por dia
      const fbUrl = `https://graph.facebook.com/v20.0/${adAccountId}/insights?level=campaign&fields=campaign_id,campaign_name,spend,actions,inline_link_clicks,outbound_clicks&time_range={'since':'${sinceStr}','until':'${untilStr}'}&time_increment=1&access_token=${metaToken}`;
      const fbRes = await fetch(fbUrl);
      const fbJson = await fbRes.json();
      if (fbJson.data) {
        fbData = fbJson.data;
      }
    }

    // 3. Estruturas de Agregação
    const dailyStats: Record<string, any> = {};
    const campaignStats: Record<string, any> = {};

    let totalGasto = 0;
    let totalReceita = 0;
    let totalLinkClicks = 0;
    let totalLPViews = 0;
    let totalVendasGlobais = 0;
    let totalOrderBumps = 0;

    // --- AGREGAR META ADS ---
    fbData.forEach((row: any) => {
      const date = row.date_start;
      const campId = row.campaign_id;
      const campName = row.campaign_name;
      
      const gastoBruto = parseFloat(row.spend || '0');
      const gastoReal = gastoBruto * 1.1383; // Imposto 13.83%
      totalGasto += gastoReal;

      // Pegar Link Clicks e Landing Page Views
      let linkClicks = parseInt(row.inline_link_clicks || '0');
      let lpViews = 0;

      if (row.actions) {
        const lpvAction = row.actions.find((a: any) => a.action_type === 'landing_page_view');
        if (lpvAction) lpViews = parseInt(lpvAction.value);
        
        const clickAction = row.actions.find((a: any) => a.action_type === 'link_click');
        if (clickAction && linkClicks === 0) linkClicks = parseInt(clickAction.value);
      }

      totalLinkClicks += linkClicks;
      totalLPViews += lpViews;

      // Diário
      if (!dailyStats[date]) dailyStats[date] = { date, gasto: 0, receita: 0, vendas: 0, orderBumps: 0 };
      dailyStats[date].gasto += gastoReal;

      // Campanha
      if (!campaignStats[campId]) {
        campaignStats[campId] = {
          id: campId,
          name: campName,
          gasto: 0,
          linkClicks: 0,
          lpViews: 0,
          vendasCeletus: 0,
          receitaCeletus: 0,
          orderBumps: 0
        };
      }
      campaignStats[campId].gasto += gastoReal;
      campaignStats[campId].linkClicks += linkClicks;
      campaignStats[campId].lpViews += lpViews;
    });

    // --- AGREGAR VENDAS SUPABASE ---
    vendas?.forEach((venda: any) => {
      // O banco armazena em UTC. Vamos forçar um shift de -3h para o Date e extrair a data YYYY-MM-DD
      const localDate = new Date(venda.data_venda);
      localDate.setHours(localDate.getHours() - 3);
      const date = localDate.toISOString().split('T')[0];
      
      const valor = parseFloat(venda.valor || '0');
      const isOrderBump = valor > 10.00;

      totalReceita += valor;
      totalVendasGlobais += 1;
      if (isOrderBump) totalOrderBumps += 1;

      // Diário
      if (!dailyStats[date]) dailyStats[date] = { date, gasto: 0, receita: 0, vendas: 0, orderBumps: 0 };
      dailyStats[date].receita += valor;
      dailyStats[date].vendas += 1;
      if (isOrderBump) dailyStats[date].orderBumps += 1;

      // Campanha - Extrair ID do UTM (ex: [TRK-120233677475490257])
      const utmCamp = venda.utm_campaign || '';
      const match = utmCamp.match(/\[TRK-(\d+)\]/);
      const extractedCampId = match ? match[1] : 'Desconhecida/Sem_UTM';

      if (!campaignStats[extractedCampId]) {
         campaignStats[extractedCampId] = {
           id: extractedCampId,
           name: utmCamp || 'Venda sem rastreio ou Orgânica',
           gasto: 0,
           linkClicks: 0,
           lpViews: 0,
           vendasCeletus: 0,
           receitaCeletus: 0,
           orderBumps: 0
         };
      }
      campaignStats[extractedCampId].receitaCeletus += valor;
      campaignStats[extractedCampId].vendasCeletus += 1;
      if (isOrderBump) campaignStats[extractedCampId].orderBumps += 1;
    });

    // --- FORMATAR RESULTADOS ---
    const chartData = Object.values(dailyStats).map((stat: any) => {
      stat.lucro = stat.receita - stat.gasto;
      return stat;
    });
    chartData.sort((a: any, b: any) => a.date.localeCompare(b.date)); // Ordem cronológica para gráficos

    const campaigns = Object.values(campaignStats).map((camp: any) => {
      camp.lucro = camp.receitaCeletus - camp.gasto;
      camp.roas = camp.gasto > 0 ? (camp.receitaCeletus / camp.gasto) : 0;
      camp.cpa = camp.vendasCeletus > 0 ? (camp.gasto / camp.vendasCeletus) : 0;
      camp.connectRate = camp.linkClicks > 0 ? ((camp.lpViews / camp.linkClicks) * 100) : 0;
      return camp;
    });
    // Ordenar campanhas por gasto
    campaigns.sort((a: any, b: any) => b.gasto - a.gasto);

    const summary = {
      totalGasto,
      totalReceita,
      totalLucro: totalReceita - totalGasto,
      roas: totalGasto > 0 ? (totalReceita / totalGasto) : 0,
      connectRate: totalLinkClicks > 0 ? ((totalLPViews / totalLinkClicks) * 100) : 0,
      totalVendas: totalVendasGlobais,
      orderBumps: totalOrderBumps
    };

    return NextResponse.json({ success: true, summary, chartData, campaigns, rawSales: vendas });

  } catch (error: any) {
    console.error('Dashboard Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const maxDuration = 60;
