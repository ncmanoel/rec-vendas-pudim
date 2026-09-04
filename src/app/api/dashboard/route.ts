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

    // Pega os ltimos 30 dias
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    const sinceStr = thirtyDaysAgo.toISOString().split('T')[0];
    const untilStr = today.toISOString().split('T')[0];

    // 1. Buscar Vendas do Supabase
    const { data: vendas, error: dbError } = await supabase
      .from('vendas')
      .select('*')
      .gte('data_venda', `${sinceStr}T00:00:00Z`)
      .order('data_venda', { ascending: false });

    if (dbError) throw dbError;

    // 2. Buscar Gastos do Meta Ads
    const metaToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    
    let metaData = [];
    if (metaToken && adAccountId) {
      const fbUrl = `https://graph.facebook.com/v20.0/${adAccountId}/insights?time_range={'since':'${sinceStr}','until':'${untilStr}'}&time_increment=1&access_token=${metaToken}`;
      const fbRes = await fetch(fbUrl);
      const fbJson = await fbRes.json();
      if (fbJson.data) {
        metaData = fbJson.data;
      }
    }

    // 3. Consolidar Dados por Dia
    const dailyStats: Record<string, any> = {};

    // Popula com dados do Meta
    metaData.forEach((day: any) => {
      const date = day.date_start; // YYYY-MM-DD
      const gastoBruto = parseFloat(day.spend || '0');
      const gastoComImposto = gastoBruto * 1.1383; // +13,83%
      
      dailyStats[date] = {
        date,
        gasto: gastoComImposto,
        receita: 0,
        vendas: 0,
        orderBumps: 0
      };
    });

    // Popula com dados das Vendas
    vendas?.forEach((venda: any) => {
      // ajusta timezone se precisar, usando substring simples
      const date = venda.data_venda.split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { date, gasto: 0, receita: 0, vendas: 0, orderBumps: 0 };
      }
      
      dailyStats[date].receita += parseFloat(venda.valor || '0');
      dailyStats[date].vendas += 1;
      
      if (parseFloat(venda.valor) > 10.00) {
        dailyStats[date].orderBumps += 1;
      }
    });

    // Converter para array e calcular Lucro/ROI
    const result = Object.values(dailyStats).map((stat: any) => {
      stat.lucro = stat.receita - stat.gasto;
      stat.roi = stat.gasto > 0 ? (stat.receita / stat.gasto) : 0;
      stat.cpa = stat.vendas > 0 ? (stat.gasto / stat.vendas) : 0;
      return stat;
    });

    // Ordenar do mais recente pro mais antigo
    result.sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ success: true, data: result });

  } catch (error: any) {
    console.error('Dashboard Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
export const maxDuration = 60;
