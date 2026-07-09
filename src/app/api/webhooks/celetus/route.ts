import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { qstashClient } from '@/lib/qstash';

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // 1. Extrair os dados do Payload da Celetus
    // O payload enviado mostra os dados em:
    // customer.phone, customer.name, customer.email
    // lostSaleData.Product.Name
    
    // Tratativa de segurança básica
    if (!payload || !payload.customer || !payload.customer.phone) {
      return NextResponse.json({ error: 'Payload inválido ou sem telefone' }, { status: 400 });
    }

    const rawPhone = payload.customer.phone;
    const fullName = payload.customer.name || 'Cliente';
    const email = payload.customer.email || '';
    const productName = payload.lostSaleData?.Product?.Name || 'Produto';

    // 2. Tratar o telefone (Adicionar 55 se for do Brasil e não tiver)
    let phone = rawPhone.replace(/\D/g, ''); // Remove tudo que não for número
    if (phone.length === 10 || phone.length === 11) {
      phone = `55${phone}`;
    }

    // 3. Pegar apenas o primeiro nome
    const firstName = fullName.split(' ')[0];

    // 4. Inserir no Supabase (Isso garante a regra de "Não reiniciar o fluxo para o mesmo telefone")
    // Como a coluna phone é PRIMARY KEY, se tentar inserir um repetido, vai dar erro, o que é ótimo!
    const { error: insertError } = await supabase
      .from('leads')
      .insert({
        phone: phone,
        name: firstName,
        email: email,
        product_name: productName,
        status: 'ENVIANDO_FUNIL_INICIAL'
      });

    if (insertError) {
      if (insertError.code === '23505') {
        // 23505 = Unique violation (Telefone já existe)
        // Retornamos 200 OK para a Celetus não ficar tentando reenviar, 
        // mas encerramos silenciosamente sem enviar mensagens novas.
        console.log(`[Celetus Webhook] Lead ignorado (já existe): ${phone}`);
        return NextResponse.json({ message: 'Lead já cadastrado, ignorando duplicidade.' }, { status: 200 });
      }
      
      console.error('[Celetus Webhook] Erro ao inserir no Supabase:', insertError);
      return NextResponse.json({ error: 'Erro de banco de dados' }, { status: 500 });
    }

    // 5. Se inseriu com sucesso, é um Lead Novo! 
    // Vamos chamar o QStash para disparar a primeira mensagem agora.
    // Usaremos nosso próprio endpoint "worker" que vai gerenciar as pausas.
    
    // Opcional: Pegar a URL base da aplicação
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sua-url-na-vercel.vercel.app';
    
    await qstashClient.publishJSON({
      url: `${baseUrl}/api/qstash/worker`,
      body: {
        action: 'START_FUNNEL',
        phone: phone,
        firstName: firstName,
        productName: productName
      },
    });

    console.log(`[Celetus Webhook] Novo lead cadastrado e funil iniciado para: ${phone}`);
    return NextResponse.json({ success: true, message: 'Lead processado com sucesso' }, { status: 200 });

  } catch (error) {
    console.error('[Celetus Webhook] Erro interno:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
