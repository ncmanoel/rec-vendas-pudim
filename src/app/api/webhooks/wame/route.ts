import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { qstashClient } from '@/lib/qstash';
import { sendWameText, sendWameDocument } from '@/lib/wame';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('[Wame Webhook] Payload Recebido:', JSON.stringify(payload, null, 2));

    // A estrutura exata do Webhook do Wame pode variar, geralmente vem em algo como:
    // payload.data.message.extendedTextMessage.text ou payload.message.text
    // Vamos tentar extrair o texto e o telefone de forma genérica baseada na doc REST
    
    // O Wame manda um payload específico
    const fromMe = payload.data?.me || payload.data?.key?.fromMe || false;
    if (fromMe) return NextResponse.json({ success: true }); // Ignora mensagens enviadas pelo próprio robô

    let phone = payload.data?.phoneNumber || '';
    if (!phone) return NextResponse.json({ success: true });

    // Extrair o texto recebido
    const textMessage = 
      payload.data?.msgContent?.conversation || 
      payload.data?.msgContent?.extendedTextMessage?.text ||
      payload.data?.message?.extendedTextMessage?.text || 
      payload.data?.message?.conversation || 
      payload.message?.extendedTextMessage?.text ||
      payload.message?.conversation || 
      '';

    const normalizedText = textMessage.trim().toLowerCase();

    // Extrair se tem mídia (imagem ou documento) para a etapa de comprovante
    const hasMedia = payload.data?.isMedia === true || payload.data?.urlMedia != null || !!payload.data?.fileBase64;

    // 1. Buscar o Lead no banco de dados para ver em qual etapa ele está
    // Como o WhatsApp pode remover o 9o dígito (ex: manda 5541880... e nós salvamos 55419880...),
    // vamos buscar pelos últimos 8 dígitos do telefone para garantir que ache o lead.
    const last8Digits = phone.slice(-8);

    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .like('phone', `%${last8Digits}`);

    if (!leads || leads.length === 0) {
      // Número desconhecido, ignorar
      return NextResponse.json({ success: true });
    }

    const lead = leads[0]; // Pega o primeiro correspondente
    const { status, name: firstName, qstash_reminder_id, phone: dbPhone } = lead;

    // 2. Lógica Baseada no Estado Atual do Lead

    // -------------------------------------------------------------
    // ETAPA 1: Aguardando resposta (1 para SIM, 2 para NÃO)
    // -------------------------------------------------------------
    if (status === 'AGUARDANDO_RESPOSTA_1_2') {
      // Reconhecimento inteligente de intenção
      // Verifica primeiro se é um NÃO
      const isNao = normalizedText === '2' || /\b(n[ãa]o|nunca|jamais|deixa pra l[aá]|cancelar)\b/.test(normalizedText);
      // Se não for NÃO, verifica se é um SIM (assim evita que "não quero" caia no "quero")
      const isSim = !isNao && (normalizedText === '1' || /\b(sim|quero|claro|pode|manda|com certeza|bora)\b/.test(normalizedText));

      if (isSim) {
        
        // Cancela o lembrete de 24h que estava agendado!
        if (qstash_reminder_id) {
          try { await qstashClient.messages.delete(qstash_reminder_id); } catch (e) {}
        }

        // Manda Mensagem 8
        const msg8 = `Parabéns pela sua postura! 🎉\nA Chave Pix para pagamento é:\n*CPF:* 83647139904\n*Nome:* Ney Carlos Manoel (meu marido 🥰)\n*Valor:* R$ 10,00`;
        await sendWameText(phone, msg8);

        // Agenda Msg 9, 10, 11 (Pix e Arquivo 1)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sua-url.vercel.app';
        await qstashClient.publishJSON({
          url: `${baseUrl}/api/qstash/worker`,
          body: { action: 'SEND_PIX_SEQUENCE', phone: dbPhone, firstName },
          delay: '5s'
        });

      } 
      // Se ele mandou 2, não, sair
      else if (isNao) {
        
        if (qstash_reminder_id) {
          try { await qstashClient.messages.delete(qstash_reminder_id); } catch (e) {}
        }

        const msgDespedida = `Tudo bem, sem problemas.\n\nDesejo a você muito sucesso em sua jornada e fico à disposição, tá bom!\n\nUm abraço,\n\nAna`;
        await sendWameText(phone, msgDespedida);
        await supabase.from('leads').update({ status: 'CANCELADO' }).eq('phone', dbPhone);
      } 
      // Mandou algo nada a ver
      else {
        const msgErro = `Desculpe 😊\n\nPara continuar preciso apenas que responda:\n\nDigite 1 para SIM\nDigite 2 para NÃO`;
        await sendWameText(phone, msgErro);
      }
    }

    // -------------------------------------------------------------
    // ETAPA 2: Aguardando Comprovante (Imagem ou PDF)
    // -------------------------------------------------------------
    else if (status === 'AGUARDANDO_COMPROVANTE') {
      if (hasMedia) {
        // Recebeu o comprovante! 
        if (qstash_reminder_id) {
          try { await qstashClient.messages.delete(qstash_reminder_id); } catch (e) {}
        }

        const msg12 = `Parabéns pela sua decisão!\n\nSegue seu guia com as *Caldas que mais Vendem*!\n\nDesejo muito sucesso em sua operação e fico à disposição!\n\nCom carinho,\n*Ana*`;
        await sendWameText(phone, msg12);
        
        // Envia Material 2
        await sendWameDocument(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Caldas%20que%20Vendem.pdf", "Caldas que Vendem.pdf");

        // Conclui o Funil
        await supabase.from('leads').update({ status: 'CONCLUIDO' }).eq('phone', dbPhone);
      } else {
        // Recebeu só texto
        const msgErroComp = `Perfeito 😊\n\nAssim que você enviar uma imagem ou um PDF do comprovante eu libero imediatamente o restante do material.`;
        await sendWameText(phone, msgErroComp);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Wame Webhook] Erro Interno:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
