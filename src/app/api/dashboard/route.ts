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

    const sinceParam = searchParams.get('since');
    const untilParam = searchParams.get('until');

    // Always work in BRT (UTC-3). 
    // "since" is the START of that day in BRT = T03:00:00Z in UTC
    // "until" is the END of that day in BRT = next day T02:59:59Z in UTC
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    const sinceStr = sinceParam ? sinceParam : thirtyDaysAgo.toISOString().split('T')[0];
    const untilStr = untilParam ? untilParam : today.toISOString().split('T')[0];

    // For Supabase: compensate BRT (-3h) so day boundaries are correct
    const sinceUTC = `${sinceStr}T03:00:00Z`;   // Start of BRT day = 03:00 UTC
    const untilUTC = `${untilStr}T02:59:59Z`;   // End of BRT day = next day 02:59 UTC
    // Special case: if until is today, use end of UTC day to not miss late-night UTC sales
    const untilUTCFull = `${untilStr}T26:59:59Z`; // will be normalized, use tomorrow 02:59
    // Safer: just go until end of UTC day for "until" date + 1 day
    const untilDate = new Date(untilStr + 'T00:00:00Z');
    untilDate.setDate(untilDate.getDate() + 1);
    const untilUTCSafe = untilDate.toISOString().replace('.000Z', 'Z').split('T')[0] + 'T02:59:59Z';

    // 1. Fetch Supabase Vendas & Leads
    const [vendasRes, leadsRes] = await Promise.all([
      supabase.from('vendas')
        .select('*')
        .gte('data_venda', sinceUTC)
        .lte('data_venda', untilUTCSafe)
        .order('data_venda', { ascending: false }),
      supabase.from('leads')
        .select('phone, created_at, status')
        .gte('created_at', sinceUTC)
        .lte('created_at', untilUTCSafe)
    ]);

    if (vendasRes.error) throw vendasRes.error;
    if (leadsRes.error) {
      // leads table might not have created_at - ignore leads error gracefully
      console.warn('Leads query error (non-fatal):', leadsRes.error.message);
    }

    const vendas = vendasRes.data || [];
    const leads = leadsRes.data || [];

    // 2. Fetch Meta Ads Data
    const metaToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    
    let fbDailyData: any[] = [];
    let fbAdData: any[] = [];

    if (metaToken && adAccountId) {
      // IMPORTANT: time_range must be URL-encoded JSON, not raw object literal with single quotes
      const timeRangeJson = encodeURIComponent(JSON.stringify({ since: sinceStr, until: untilStr }));

      // 2.A Chart Data: level=account with time_increment=1
      const fbUrlDaily = `https://graph.facebook.com/v20.0/${adAccountId}/insights?level=account&fields=spend&time_range=${timeRangeJson}&time_increment=1&access_token=${metaToken}`;
      
      // 2.B Table Data: level=ad (no time_increment - Meta aggregates unique clicks correctly)
      const fbUrlAds = `https://graph.facebook.com/v20.0/${adAccountId}/insights?level=ad&fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,inline_link_clicks,unique_inline_link_clicks,actions&time_range=${timeRangeJson}&limit=1000&access_token=${metaToken}`;

      const [resDaily, resAds] = await Promise.all([
        fetch(fbUrlDaily).then(r => r.json()),
        fetch(fbUrlAds).then(r => r.json())
      ]);

      if (resDaily.error) console.error('Meta Daily API Error:', JSON.stringify(resDaily.error));
      if (resAds.error) console.error('Meta Ads API Error:', JSON.stringify(resAds.error));

      if (resDaily.data) fbDailyData = resDaily.data;
      if (resAds.data) fbAdData = resAds.data;
    }

    // 3. Process Data: Maps for O(1) Hierarchical grouping
    const dailyStats: Record<string, any> = {};
    const campaignMap = new Map();
    const adsetMap = new Map();
    const adMap = new Map();

    let totalGasto = 0;
    let totalReceita = 0;
    let totalLinkClicks = 0;
    let totalLPViews = 0;
    let totalVendasGlobais = 0;
    let totalOrderBumps = 0;

    // Build Daily Chart Base
    fbDailyData.forEach((row: any) => {
      const date = row.date_start;
      const gastoBruto = parseFloat(row.spend || '0');
      const gastoReal = gastoBruto * 1.1383; // Imposto Meta
      if (!dailyStats[date]) dailyStats[date] = { date, gasto: 0, receita: 0, vendas: 0, orderBumps: 0 };
      dailyStats[date].gasto += gastoReal;
    });

    // Process Ads Level Data
    fbAdData.forEach((row: any) => {
      const cId = row.campaign_id;
      const cName = row.campaign_name;
      const sId = row.adset_id;
      const sName = row.adset_name;
      const aId = row.ad_id;
      const aName = row.ad_name;

      const gastoBruto = parseFloat(row.spend || '0');
      const gasto = gastoBruto * 1.1383;
      totalGasto += gasto;

      const impressions = parseInt(row.impressions || '0');
      const clicks = parseInt(row.inline_link_clicks || '0');
      const uniqueClicks = parseInt(row.unique_inline_link_clicks || clicks || '0');

      let pv = 0;
      let ic = 0;
      let pur = 0;

      if (row.actions) {
        const pva = row.actions.find((a: any) => a.action_type === 'landing_page_view');
        if (pva) pv = parseInt(pva.value);
        
        const ica = row.actions.find((a: any) => a.action_type === 'initiate_checkout');
        if (ica) ic = parseInt(ica.value);

        const pura = row.actions.find((a: any) => a.action_type === 'purchase');
        if (pura) pur = parseInt(pura.value);
      }

      totalLinkClicks += uniqueClicks;
      totalLPViews += pv;

      // Base object generator
      const createMetrics = (id: string, name: string) => ({
        id, name, gasto: 0, impressions: 0, clicks: 0, uniqueClicks: 0,
        pv: 0, ic: 0, purFB: 0,
        vendasCel: 0, receitaCel: 0, orderBumps: 0,
        adsets: new Map(), ads: new Map() // Nested structures
      });

      // Insert into Maps
      if (!campaignMap.has(cId)) campaignMap.set(cId, createMetrics(cId, cName));
      if (!adsetMap.has(sId)) adsetMap.set(sId, createMetrics(sId, sName));
      if (!adMap.has(aId)) adMap.set(aId, createMetrics(aId, aName));

      const c = campaignMap.get(cId);
      const s = adsetMap.get(sId);
      const a = adMap.get(aId);

      // Accumulate
      [c, s, a].forEach(node => {
        node.gasto += gasto;
        node.impressions += impressions;
        node.clicks += clicks;
        node.uniqueClicks += uniqueClicks;
        node.pv += pv;
        node.ic += ic;
        node.purFB += pur;
      });

      // Build hierarchy links
      c.adsets.set(sId, s);
      s.ads.set(aId, a);
    });

    // Extrair ID [TRK-12345] usando regex de forma segura
    const extractTRK = (utmString: string) => {
      if (!utmString) return null;
      const match = utmString.match(/\[TRK-(\d+)\]/);
      return match ? match[1] : null;
    };

    // Tracking WhatsApp Recovery precisely
    let recoveredSalesCount = 0;
    let recoveredSalesRevenue = 0;
    let avulsoPixCount = 0;
    const leadsPhoneSet = new Set(leads.map(l => l.phone));

    // Process Celetus Vendas
    vendas.forEach((venda: any) => {
      const localDate = new Date(venda.data_venda);
      localDate.setHours(localDate.getHours() - 3);
      const date = localDate.toISOString().split('T')[0];
      
      const valor = parseFloat(venda.valor || '0');
      const isOrderBump = valor > 10.00;

      totalReceita += valor;
      totalVendasGlobais += 1;
      if (isOrderBump) totalOrderBumps += 1;

      if (!dailyStats[date]) dailyStats[date] = { date, gasto: 0, receita: 0, vendas: 0, orderBumps: 0 };
      dailyStats[date].receita += valor;
      dailyStats[date].vendas += 1;
      if (isOrderBump) dailyStats[date].orderBumps += 1;

      // UTM Extraction
      const cId = extractTRK(venda.utm_campaign);
      const sId = extractTRK(venda.utm_medium);
      const aId = extractTRK(venda.utm_content);

      // Distribute revenue to the matched nodes
      if (cId && campaignMap.has(cId)) {
        const c = campaignMap.get(cId);
        c.receitaCel += valor;
        c.vendasCel += 1;
        if (isOrderBump) c.orderBumps += 1;
      }
      
      if (sId && adsetMap.has(sId)) {
        const s = adsetMap.get(sId);
        s.receitaCel += valor;
        s.vendasCel += 1;
        if (isOrderBump) s.orderBumps += 1;
      }

      if (aId && adMap.has(aId)) {
        const a = adMap.get(aId);
        a.receitaCel += valor;
        a.vendasCel += 1;
        if (isOrderBump) a.orderBumps += 1;
      }

      // Orgânico / Desconhecido Bucket fallback se não achou campanha (para que o total da tabela bata com o geral)
      if (!cId || !campaignMap.has(cId)) {
        if (!campaignMap.has('ORGANICO')) campaignMap.set('ORGANICO', {
          id: 'ORGANICO', name: 'Orgânico / Sem Rastreio', gasto: 0, impressions: 0, clicks: 0, uniqueClicks: 0,
          pv: 0, ic: 0, purFB: 0, vendasCel: 0, receitaCel: 0, orderBumps: 0, adsets: new Map()
        });
        const org = campaignMap.get('ORGANICO');
        org.receitaCel += valor;
        org.vendasCel += 1;
        if (isOrderBump) org.orderBumps += 1;
      }

      // Recovery Logic
      if (venda.utm_medium === 'pix_direto') {
        // Did we have this lead in the abandoned carts?
        const clnPhone = venda.telefone ? venda.telefone.replace(/\D/g, '') : '';
        if (clnPhone && leadsPhoneSet.has(clnPhone)) {
          recoveredSalesCount += 1;
          recoveredSalesRevenue += valor;
        } else {
          avulsoPixCount += 1;
        }
      }
    });

    // Format Maps into nested arrays with advanced calculations
    const formatNode = (node: any): any => {
      const cpm = node.impressions > 0 ? (node.gasto / node.impressions) * 1000 : 0;
      const ctr = node.impressions > 0 ? (node.uniqueClicks / node.impressions) * 100 : 0;
      const cpc = node.uniqueClicks > 0 ? (node.gasto / node.uniqueClicks) : 0;
      const connectRate = node.uniqueClicks > 0 ? (node.pv / node.uniqueClicks) * 100 : 0;
      const icRate = node.pv > 0 ? (node.ic / node.pv) * 100 : 0;
      const checkoutConv = node.ic > 0 ? (node.vendasCel / node.ic) * 100 : 0;
      
      const lucro = node.receitaCel - node.gasto;
      const roas = node.gasto > 0 ? (node.receitaCel / node.gasto) : 0;
      const cpa = node.vendasCel > 0 ? (node.gasto / node.vendasCel) : 0;

      return {
        ...node,
        cpm, ctr, cpc, connectRate, icRate, checkoutConv, lucro, roas, cpa,
        adsets: node.adsets ? Array.from(node.adsets.values()).map(formatNode).sort((a: any,b: any)=>b.gasto - a.gasto) : undefined,
        ads: node.ads ? Array.from(node.ads.values()).map(formatNode).sort((a: any,b: any)=>b.gasto - a.gasto) : undefined
      };
    };

    const campaignsArray = Array.from(campaignMap.values())
      .map(formatNode)
      .sort((a, b) => b.gasto - a.gasto);

    const chartData = Object.values(dailyStats);
    chartData.sort((a: any, b: any) => a.date.localeCompare(b.date));
    chartData.forEach((stat: any) => stat.lucro = stat.receita - stat.gasto);

    const recoveryStats = {
      totalLeads: leads.length,
      recoveredCount: recoveredSalesCount,
      recoveredRevenue: recoveredSalesRevenue,
      recoveryRate: leads.length > 0 ? (recoveredSalesCount / leads.length) * 100 : 0,
      avulsoPixCount: avulsoPixCount
    };

    const summary = {
      totalGasto,
      totalReceita,
      totalLucro: totalReceita - totalGasto,
      roas: totalGasto > 0 ? (totalReceita / totalGasto) : 0,
      connectRate: totalLinkClicks > 0 ? ((totalLPViews / totalLinkClicks) * 100) : 0,
      totalVendas: totalVendasGlobais,
      orderBumps: totalOrderBumps
    };

    return NextResponse.json({ 
      success: true, 
      summary, 
      chartData, 
      campaigns: campaignsArray, 
      rawSales: vendas,
      recoveryStats 
    });

  } catch (error: any) {
    console.error('Dashboard Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const maxDuration = 60;
