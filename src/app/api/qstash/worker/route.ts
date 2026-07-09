import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { qstashClient } from '@/lib/qstash';
import { sendWameText, sendWameAudio, sendWameImage, sendWameDocument } from '@/lib/wame';

// O QStash envia um POST para cá quando for a hora de processar uma tarefa
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { action, phone, firstName, productName } = payload;

    console.log(`[Worker] Executando ação: ${action} para o número: ${phone}`);

    if (action === 'START_FUNNEL') {
      // 1. Mensagem 1 - Imediata
      await sendWameText(phone, `Oi, ${firstName}! Espero que esteja tudo bem! 💛`);
      
      // 2. Agenda a Mensagem 2 (Áudio) para daqui 5 segundos
      await scheduleNextStep(phone, 'SEND_MSG_2_AUDIO', 5, { firstName, productName });
    }
    else if (action === 'SEND_MSG_2_AUDIO') {
      await sendWameAudio(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Audio%20Pudim.ogg");
      
      // Agenda a Mensagem 3 para daqui 5 segundos
      await scheduleNextStep(phone, 'SEND_MSG_3_OFFER', 5, { firstName, productName });
    }
    else if (action === 'SEND_MSG_3_OFFER') {
      const msg3 = `No método *Pudim sem Forno*, você terá acesso a:\n✅ São 30 receitas super testadas e adoradas pelos clientes!\n\n*Bônus Especial:*\n✅ 11 caldas irresistíveis para você fazer e vender muito 🤩\n\nE tudo isso só por:\n👉 *R$ 10,00* reais no *PIX* 💠`;
      await sendWameText(phone, msg3);
      
      // Agenda a Mensagem 4 para daqui 5 segundos
      await scheduleNextStep(phone, 'SEND_MSG_4_TRUST', 5, { firstName, productName });
    }
    else if (action === 'SEND_MSG_4_TRUST') {
      const msg4 = `O melhor?\nEu *acredito e confio* em você!\n*Vou te enviar* o PDF aqui no WhatsApp agora e você *faz o Pix depois*, combinado?\nTenho certeza de que vai amar!`;
      await sendWameText(phone, msg4);
      
      // Agenda a Mensagem 5 (Imagem) para daqui 3 segundos
      await scheduleNextStep(phone, 'SEND_MSG_5_IMAGE', 3, { firstName, productName });
    }
    else if (action === 'SEND_MSG_5_IMAGE') {
      await sendWameImage(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Imagem%20Pudim.jpeg", "");
      
      // Agenda a Mensagem 6 para daqui 3 segundos
      await scheduleNextStep(phone, 'SEND_MSG_6_QUESTION', 3, { firstName, productName });
    }
    else if (action === 'SEND_MSG_6_QUESTION') {
      const msg6 = `Posso te mandar o Material das Caldas?\nPara *Sim* digite 1\nPara *Não* digite 2`;
      await sendWameText(phone, msg6);
      
      // Atualiza o estado no Supabase para AGUARDANDO_RESPOSTA_1_2
      await supabase.from('leads').update({ status: 'AGUARDANDO_RESPOSTA_1_2' }).eq('phone', phone);
      
      // Agenda o primeiro lembrete para daqui 24 horas!
      const { messageId } = await scheduleNextStep(phone, 'REMINDER_1_QUESTION', 24 * 60 * 60, { firstName });
      
      // Salva o ID do lembrete no banco, para podermos cancelar se o usuário responder antes
      await supabase.from('leads').update({ qstash_reminder_id: messageId }).eq('phone', phone);
    }
    else if (action === 'SEND_PIX_SEQUENCE') {
      // Mensagem 9 - O próprio código do PIX puro
      await sendWameText(phone, "83647139904");
      
      // Mensagem 10 - Enviar o Material 1 logo em seguida (0 delay)
      await sendWameDocument(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Receitas%20de%20Pudim%20Sem%20Forno.pdf", "Receitas de Pudim Sem Forno.pdf");
      
      // Agenda Mensagem 11 para daqui 6 segundos
      await scheduleNextStep(phone, 'SEND_MSG_11_RECEIPT', 6, { firstName });
    }
    else if (action === 'SEND_MSG_11_RECEIPT') {
      const msg11 = `${firstName}, fico muito feliz que tenha decidido acessar o meu material.\n\nAssim que você realizar o pagamento é só me encaminhar o comprovante por aqui que já libero o restante do conteúdo, tá bem? 🍮\n\nTenho certeza que esse material vai te ajudar muito na sua jornada! 💛`;
      await sendWameText(phone, msg11);
      
      // Atualiza o estado para aguardar o comprovante
      await supabase.from('leads').update({ status: 'AGUARDANDO_COMPROVANTE' }).eq('phone', phone);
      
      // Agenda o primeiro lembrete de comprovante para daqui 1 hora
      const { messageId } = await scheduleNextStep(phone, 'REMINDER_1_RECEIPT', 60 * 60, { firstName });
      
      // Salva o novo ID do lembrete no banco
      await supabase.from('leads').update({ qstash_reminder_id: messageId }).eq('phone', phone);
    }
    // Lógica para envio real dos lembretes (quando der o tempo do QStash)
    else if (action === 'REMINDER_1_QUESTION') {
      await sendWameText(phone, `Olá ${firstName}, ainda tem interesse?`);
      
      // Agenda o segundo lembrete para 24h
      const { messageId } = await scheduleNextStep(phone, 'REMINDER_2_QUESTION', 24 * 60 * 60, { firstName });
      await supabase.from('leads').update({ qstash_reminder_id: messageId, reminder_count: 1 }).eq('phone', phone);
    }
    else if (action === 'REMINDER_2_QUESTION') {
      const lembrete = `Olá ${firstName}...\n\nPassando pra confirmar se posso te enviar o Livro agora e contar com a sua Honestidade e você paga depois?\n\nPara Sim digite 1\nPara Não digite 2`;
      await sendWameText(phone, lembrete);
      await supabase.from('leads').update({ reminder_count: 2 }).eq('phone', phone);
    }
    else if (action === 'REMINDER_1_RECEIPT') {
      const lembrete = `Olá!\n\nEstou passando só para conferir se conseguiu fazer o pagamento. 😊\n\nSe já enviou o Pix, pode só me encaminhar o comprovante aqui por gentileza, que já libero o restante do material. 🍮\n\nSe tiver alguma dúvida ou dificuldade para concluir, me avisa, tá bem?\n\nEstou aqui pra te ajudar! 💛`;
      await sendWameText(phone, lembrete);
      
      const { messageId } = await scheduleNextStep(phone, 'REMINDER_2_RECEIPT', 24 * 60 * 60, { firstName });
      await supabase.from('leads').update({ qstash_reminder_id: messageId, reminder_count: 1 }).eq('phone', phone);
    }
    else if (action === 'REMINDER_2_RECEIPT') {
      const lembrete = `Olá!\n\nEstou passando só para conferir se conseguiu fazer o pagamento. 😊\n\nSe já enviou o Pix, pode só me encaminhar o comprovante aqui por gentileza, que já libero o restante do material. 🍮\n\nSe tiver alguma dúvida ou dificuldade para concluir, me avisa, tá bem?\n\nEstou aqui pra te ajudar! 💛`;
      await sendWameText(phone, lembrete);
      await supabase.from('leads').update({ reminder_count: 2 }).eq('phone', phone);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Worker] Erro:', error);
    return NextResponse.json({ error: 'Worker error' }, { status: 500 });
  }
}

async function scheduleNextStep(phone: string, action: string, delaySeconds: number, extraData: any = {}): Promise<{ messageId: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sua-url-na-vercel.vercel.app';
  
  const res = await qstashClient.publishJSON({
    url: `${baseUrl}/api/qstash/worker`,
    body: { action, phone, ...extraData },
    delay: delaySeconds > 0 ? delaySeconds : undefined,
  });
  
  return res as any;
}
