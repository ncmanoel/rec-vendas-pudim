import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { password, phone, product, value, date } = body;

    if (password !== 'Atletico2000') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Convert local datetime string from HTML input (YYYY-MM-DDTHH:mm) to UTC ISO string
    // Assuming the user is entering BRT (UTC-3), we append -03:00 so Supabase parses it correctly.
    const isoDate = `${date}:00-03:00`;

    const { error: insertError } = await supabase.from('vendas').insert({
      telefone: phone ? phone.replace(/\D/g, '') : null,
      nome_produto: product,
      valor: parseFloat(value),
      data_venda: isoDate,
      utm_campaign: '[TRK-PIX_DIRETO] Pix Direto / WhatsApp', // Special tag so it groups nicely on the dashboard
      utm_source: 'manual',
      utm_medium: 'pix_direto',
    });

    if (insertError) {
      console.error('Erro ao inserir venda manual:', insertError);
      return NextResponse.json({ error: 'Erro de banco de dados' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Venda registrada com sucesso!' });

  } catch (error: any) {
    console.error('Manual Sale Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
