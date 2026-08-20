import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { qstashClient } from '@/lib/qstash';
import { sendWameText, sendWameDocument } from '@/lib/wame';

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
    const productName = payload.lostSaleData?.Product?.Name || payload.items?.[0]?.name || 'Produto';

    // 2. Tratar o telefone
    let phone = rawPhone.replace(/\D/g, ''); // Remove tudo que não for número
    // Remove o zero à esquerda do DDD se o usuário digitou (ex: 041988034297)
    if (phone.startsWith('0') && (phone.length === 11 || phone.length === 12)) {
      phone = phone.substring(1);
    }
    if (phone.length === 10 || phone.length === 11) {
      phone = `55${phone}`;
    }

    // 3. Pegar apenas o primeiro nome
    const firstName = fullName.split(' ')[0];
    const eventName = payload.event_name;

    // NOVIDADE: Cancelamento de fluxo se a venda for aprovada (Pix pago, Cartão aprovado, etc)
    if (eventName === 'Make_Aprovada' || eventName === 'Compra aprovada' || payload.status === 'approved' || payload.status === 'Pago' || eventName === 'Make_Aprovadas') {
      console.log(`[Celetus Webhook] Recebido aviso de pagamento APROVADO para: ${phone}`);
      
      // Busca o lead no Supabase
      const { data: leadData } = await supabase.from('leads').select('qstash_reminder_id, status').eq('phone', phone).single();
      
      if (leadData) {
        // Se houver uma mensagem agendada no QStash, vamos cancelar
        if (leadData.qstash_reminder_id) {
          try {
            await qstashClient.messages.delete(leadData.qstash_reminder_id);
            console.log(`[Celetus Webhook] Mensagem agendada cancelada no QStash para: ${phone}`);
          } catch (e) {
            console.error(`[Celetus Webhook] Erro ao tentar cancelar mensagem no QStash:`, e);
          }
        }
        
        // Verifica se comprou o Order Bump baseado no totalPrice
        const totalPrice = payload.commission?.totalPrice || parseFloat(payload.charge?.amount || "0");

        if (totalPrice <= 10.00) {
          console.log(`[Celetus Webhook] Lead aprovado SEM order bump (Total: ${totalPrice}). Iniciando Upsell via WhatsApp para: ${phone}`);
          
          // Atualiza o status primeiro para garantir que o cliente vá para a próxima etapa mesmo se o Vercel matar o script por timeout
          await supabase.from('leads').update({ status: 'AGUARDANDO_RESPOSTA_UPSELL' }).eq('phone', phone);

          // 1. Envia os dois PDFs
          await sendWameDocument(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Receitas%20de%20Pudim%20Sem%20Forno.pdf", "Receitas de Pudim Sem Forno.pdf");
          await new Promise(r => setTimeout(r, 2000));
          
          await sendWameDocument(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Caldas%20que%20Vendem.pdf", "Caldas que Vendem.pdf");
          await new Promise(r => setTimeout(r, 2000));
          
          // 2. Envia a mensagem de justificativa/bônus
          const msg12 = `{Olá|Oi|Oie} ${firstName}! Parabéns pela compra do método. Como um bônus de agilidade, acabei de te enviar o seu material por aqui também para facilitar o seu acesso! ☝️`;
          await sendWameText(phone, msg12);
          await new Promise(r => setTimeout(r, 1500));
          
          // 3. Dispara o Upsell
          const msgUpsell = `Aproveitando, deixa eu te fazer uma pergunta rápida...\n\nMuitas meninas têm dificuldade em calcular o preço das receitas e acabam perdendo dinheiro no final do mês.\n\nEu tenho o *Pack Lucratividade Garantida* (com Guias e Checklists) que resolve isso na hora. Ele custa originalmente *R$ 47,00*, mas como você acabou de se tornar aluna, posso liberar o acesso para você agora por apenas *+ R$ 11,90*.\n\nQuer aproveitar esse mega desconto e fazer um Pix de R$ 11,90 para levar o Pack também?\nDigite 1 para SIM\nDigite 2 para NÃO`;
          await sendWameText(phone, msgUpsell);

          return NextResponse.json({ success: true, message: 'Upsell via WA disparado.' }, { status: 200 });

        } else {
          // Comprou com Order Bump (Valor > 10.00)
          console.log(`[Celetus Webhook] Lead aprovado COM order bump (Total: ${totalPrice}). Apenas concluindo funil: ${phone}`);
          // Atualiza o status para CONCLUIDO_CELETUS para travar novos envios e identificar a origem
          await supabase.from('leads').update({ status: 'CONCLUIDO_CELETUS' }).eq('phone', phone);
          return NextResponse.json({ success: true, message: 'Pagamento reconhecido. Funil cancelado.' }, { status: 200 });
        }
      } else {
        // O lead pagou tão rápido (ou comprou direto) que nem entrou no funil de abandono
        return NextResponse.json({ success: true, message: 'Pagamento aprovado, mas lead não estava no funil.' }, { status: 200 });
      }
    }

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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sua-url-na-vercel.vercel.app';
    
    // Temporariamente (pedido de 10/08): Todos recebem o fluxo completo de abandono (START_FUNNEL)
    // independentemente de ser abandono ou boleto/pix gerado.
    const actionToTrigger = 'START_FUNNEL';
    
    // Extraímos o pixCode caso no futuro queira voltar a usar
    const pixCode = payload.charge?.pix_data?.pix_qr_code;

    await qstashClient.publishJSON({
      url: `${baseUrl}/api/qstash/worker`,
      body: {
        action: actionToTrigger,
        phone: phone,
        firstName: firstName,
        productName: productName,
        pixCode: pixCode
      },
    });

    console.log(`[Celetus Webhook] Novo lead cadastrado e funil iniciado para: ${phone}`);
    return NextResponse.json({ success: true, message: 'Lead processado com sucesso' }, { status: 200 });

  } catch (error) {
    console.error('[Celetus Webhook] Erro interno:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}

export const maxDuration = 60;
