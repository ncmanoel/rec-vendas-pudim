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
    
    // Pegando quem enviou a mensagem (ex: 5531984138751@s.whatsapp.net)
    const remoteJid = payload.data?.key?.remoteJid || payload.key?.remoteJid || '';
    if (!remoteJid || remoteJid.includes('@g.us')) {
      // Ignora mensagens de grupo ou sem remetente
      return NextResponse.json({ success: true });
    }

    // Se a mensagem foi enviada por nós mesmos, ignorar
    const fromMe = payload.data?.key?.fromMe || payload.key?.fromMe;
    if (fromMe) return NextResponse.json({ success: true });

    const phone = remoteJid.split('@')[0];

    // Extrair o texto recebido
    const textMessage = 
      payload.data?.message?.extendedTextMessage?.text || 
      payload.data?.message?.conversation || 
      payload.message?.extendedTextMessage?.text ||
      payload.message?.conversation || 
      '';

    const normalizedText = textMessage.trim().toLowerCase();

    // Extrair se tem mídia (imagem ou documento) para a etapa de comprovante
    const hasMedia = 
      !!payload.data?.message?.imageMessage || 
      !!payload.data?.message?.documentMessage ||
      !!payload.message?.imageMessage ||
      !!payload.message?.documentMessage;

    // 1. Buscar o Lead no banco de dados para ver em qual etapa ele está
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', phone)
      .single();

    if (!lead) {
      // Número desconhecido, ignorar
      return NextResponse.json({ success: true });
    }

    const { status, name: firstName, qstash_reminder_id } = lead;

    // 2. Lógica Baseada no Estado Atual do Lead

    // -------------------------------------------------------------
    // ETAPA 1: Aguardando resposta (1 para SIM, 2 para NÃO)
    // -------------------------------------------------------------
    if (status === 'AGUARDANDO_RESPOSTA_1_2') {
      // Se ele mandou 1, sim, aceito, quero
      if (normalizedText === '1' || normalizedText === 'sim' || normalizedText === 'quero') {
        
        // Cancela o lembrete de 24h que estava agendado!
        if (qstash_reminder_id) {
          try { await qstashClient.messages.delete(qstash_reminder_id); } catch (e) {}
        }

        // Manda Mensagem 8
        const msg8 = `Parabéns pela sua postura! 🎉\n\nA Chave Pix para pagamento é:\n\nCPF: 83647139904\n\nNome: Ney Carlos Manoel (meu marido 🥰)\n\nValor: R$ 10,00`;
        await sendWameText(phone, msg8);

        // Agenda Msg 9, 10, 11 (Pix e Arquivo 1)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sua-url.vercel.app';
        await qstashClient.publishJSON({
          url: `${baseUrl}/api/qstash/worker`,
          body: { action: 'SEND_PIX_SEQUENCE', phone, firstName },
          delay: '5s'
        });

      } 
      // Se ele mandou 2, não, sair
      else if (normalizedText === '2' || normalizedText === 'não' || normalizedText === 'nao') {
        
        if (qstash_reminder_id) {
          try { await qstashClient.messages.delete(qstash_reminder_id); } catch (e) {}
        }

        const msgDespedida = `Tudo bem, sem problemas.\n\nDesejo a você muito sucesso em sua jornada e fico à disposição, tá bom!\n\nUm abraço,\n\nAna`;
        await sendWameText(phone, msgDespedida);
        await supabase.from('leads').update({ status: 'CANCELADO' }).eq('phone', phone);
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

        const msg12 = `Parabéns pela sua decisão!\n\nSegue seu guia com as Caldas que mais Vendem!\n\nDesejo muito sucesso em sua operação e fico à disposição!\n\nCom carinho,\n\nAna`;
        await sendWameText(phone, msg12);
        
        // Envia Material 2
        await sendWameDocument(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Caldas%20que%20Vendem.pdf", "Caldas que Vendem.pdf");

        // Conclui o Funil
        await supabase.from('leads').update({ status: 'CONCLUIDO' }).eq('phone', phone);
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
