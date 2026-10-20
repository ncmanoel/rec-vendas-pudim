import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { qstashClient } from '@/lib/qstash';
import { sendWameText, sendWameDocument } from '@/lib/wame';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('[Wame Webhook] Payload Recebido:', JSON.stringify(payload, null, 2));

    const fromMe = payload.data?.me || payload.data?.key?.fromMe || false;
    if (fromMe) return NextResponse.json({ success: true });

    let phone = payload.data?.phoneNumber || payload.data?.key?.remoteJid || payload.data?.remoteJid || payload.phoneNumber || '';
    if (!phone) return NextResponse.json({ success: true });
    
    phone = phone.replace(/\D/g, '');

    const textMessage = 
      payload.data?.msgContent?.conversation || 
      payload.data?.msgContent?.extendedTextMessage?.text ||
      payload.data?.message?.extendedTextMessage?.text || 
      payload.data?.message?.conversation || 
      payload.message?.extendedTextMessage?.text ||
      payload.message?.conversation || 
      '';

    const normalizedText = textMessage.trim().toLowerCase();

    const msgType = payload.data?.messageType || 
                    payload.data?.msgContent?.messageType || 
                    Object.keys(payload.data?.message || {})[0] || 
                    Object.keys(payload.data?.msgContent || {})[0] || 
                    '';

    const isAudio = msgType.includes('audio') || 
                    msgType.includes('voice') || 
                    payload.data?.message?.audioMessage != null ||
                    payload.data?.msgContent?.audioMessage != null;

    const isImageOrDoc = msgType.includes('image') || 
                         msgType.includes('document') || 
                         payload.data?.message?.imageMessage != null || 
                         payload.data?.message?.documentMessage != null ||
                         payload.data?.msgContent?.imageMessage != null ||
                         payload.data?.msgContent?.documentMessage != null;

    const hasMedia = (payload.data?.isMedia === true || payload.data?.urlMedia != null || !!payload.data?.fileBase64) && !isAudio;
    const isComprovanteMedia = isImageOrDoc || hasMedia;

    if (!normalizedText && !isComprovanteMedia && !isAudio) {
      return NextResponse.json({ success: true, reason: 'empty_or_reaction' });
    }

    // Busca lead pelos últimos 8 dígitos (tolerante ao 9º dígito ausente)
    const last8Digits = phone.slice(-8);
    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .like('phone', `%${last8Digits}`);

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true });
    }

    const lead = leads[0];
    const { status, name: firstName, qstash_reminder_id, phone: dbPhone } = lead;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rec-vendas-pudim.vercel.app';

    // Helper para cancelar lembrete antigo do QStash
    const cancelExistingReminder = async () => {
      if (qstash_reminder_id) {
        try { await qstashClient.messages.delete(qstash_reminder_id); } catch (e) {}
      }
    };

    // Helper para agendar novo lembrete e salvar ID no banco
    const scheduleReminder = async (action: string, delay: any) => {
      try {
        const res: any = await qstashClient.publishJSON({
          url: `${baseUrl}/api/qstash/worker`,
          body: { action, phone: dbPhone, firstName },
          delay
        });
        return res?.messageId || null;
      } catch (e) {
        return null;
      }
    };

    // Detecção universal de intenções
    const isNao = normalizedText === '2' || /\b(n[ãa]o|nunca|jamais|deixa pra l[aá]|cancelar|agora n[ãa]o)\b/.test(normalizedText);
    const isSim = !isNao && (normalizedText === '1' || /\b(sim|quero|claro|pode|manda|com certeza|bora|aceito|fechado)\b/.test(normalizedText));
    const isJaPagou = /\b(j[aá] paguei|j[aá] fiz|j[aá] mandei|j[aá] enviei|paguei|fiz o pix|mandei o pix)\b/.test(normalizedText);

    // =========================================================================
    // ETAPA 1: Permissão inicial de envio (1 SIM / 2 NÃO) - Abandono
    // =========================================================================
    if (status === 'AGUARDANDO_RESPOSTA_1_2') {
      await cancelExistingReminder();

      if (isJaPagou) {
        const msgJaPagou = `{Que ótimo!|Maravilha!|Perfeito!} 🥰\n\nNesse caso, por favor me envie uma foto ou PDF do comprovante aqui mesmo para eu localizar e liberar o seu material imediatamente!`;
        await sendWameText(phone, msgJaPagou);
        await supabase.from('leads').update({ status: 'AGUARDANDO_COMPROVANTE' }).eq('phone', dbPhone);
      } 
      else if (isSim) {
        const msg8 = `{Parabéns pela sua postura! 🎉|Que atitude incrível! 🥰|Muito obrigada pela honestidade! 💛}\nA Chave Pix para pagamento é:\n*CPF:* 83647139904\n*Nome:* Ney Carlos Manoel (meu marido 🥰)\n*Valor:* R$ 10,00`;
        await sendWameText(phone, msg8);

        await qstashClient.publishJSON({
          url: `${baseUrl}/api/qstash/worker`,
          body: { action: 'SEND_PIX_SEQUENCE', phone: dbPhone, firstName },
          delay: '5s'
        });
        
        await supabase.from('leads').update({ status: 'AGUARDANDO_COMPROVANTE' }).eq('phone', dbPhone);
      } 
      else if (isNao) {
        const msgDespedida = `{Tudo bem|Sem problemas|Compreendo}, sem problemas.\n\nDesejo a você muito sucesso em sua jornada e fico à disposição, tá bom!\n\n{Um abraço|Um beijo|Até mais},\n\nAna`;
        await sendWameText(phone, msgDespedida);
        await supabase.from('leads').update({ status: 'CANCELADO' }).eq('phone', dbPhone);
      } 
      else {
        const msgErro = `Desculpe 😊\n\nPara continuar preciso apenas que responda:\n\nDigite 1 para SIM\nDigite 2 para NÃO`;
        await sendWameText(phone, msgErro);
      }
    }

    // =========================================================================
    // ETAPA 2: Aguardando Comprovante Principal de R$ 10 (Abandono)
    // Entrega Caldas e inicia esteira oferecendo a Planilha Mágica por R$ 9,90!
    // =========================================================================
    else if (status === 'AGUARDANDO_COMPROVANTE') {
      if (isComprovanteMedia) {
        await cancelExistingReminder();

        // 1. Envia Caldas que Vendem
        await sendWameDocument(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Caldas%20que%20Vendem.pdf", "Caldas que Vendem.pdf");
        await new Promise(r => setTimeout(r, 2000));

        const msg12 = `{Parabéns pela sua decisão!|Que maravilha!|Perfeito!} Comprovante recebido! Conforme prometido, acabei de enviar o Guia de Caldas logo acima. ☝️🥰`;
        await sendWameText(phone, msg12);
        await new Promise(r => setTimeout(r, 2000));

        // 2. Dispara Oferta da Planilha Mágica (R$ 9,90)
        const msgOfertaPlanilha = `Aproveitando, deixa eu te fazer uma pergunta rápida... 🥰\n\nMuitas alunas têm medo de errar no preço das receitas e acabar tendo prejuízo ou vendendo pudim barato demais.\n\nPara resolver isso, eu criei a *Planilha Mágica de Precificação Automática* 📊\nVocê só preenche quanto pagou nos ingredientes e ela calcula na hora o *custo exato por fatia/pudim* e o *preço de venda ideal com até 200% de lucro*!\n\nEla custa originalmente R$ 27,00, mas como você acabou de se tornar aluna, consigo liberar o acesso vitalício agora por apenas *R$ 9,90* no Pix!\n\nQuer aproveitar e garantir a sua Planilha por R$ 9,90?\nDigite 1 para SIM\nDigite 2 para NÃO`;
        await sendWameText(phone, msgOfertaPlanilha);

        const newReminderId = await scheduleReminder('REMINDER_UPSELL_PLANILHA', '2h');
        await supabase.from('leads').update({
          status: 'AGUARDANDO_RESPOSTA_UPSELL_PLANILHA',
          qstash_reminder_id: newReminderId
        }).eq('phone', dbPhone);

      } else if (isAudio) {
        await sendWameText(phone, `{Olá|Oi}! Ouvi seu áudio 🥰 Mas como nosso sistema é automatizado para conferência, preciso que você me envie uma **foto (print)** ou o arquivo **PDF** do comprovante do Pix aqui para eu poder liberar o seu material na hora, tá bom?`);
      } else {
        await sendWameText(phone, `{Perfeito|Tudo bem} 😊\n\nAssim que você enviar uma imagem ou PDF do comprovante do Pix eu libero imediatamente o restante do material!`);
      }
    }

    // =========================================================================
    // ETAPA 3: Resposta da Planilha Mágica (R$ 9,90)
    // =========================================================================
    else if (status === 'AGUARDANDO_RESPOSTA_UPSELL_PLANILHA') {
      await cancelExistingReminder();

      if (isJaPagou) {
        await sendWameText(phone, `{Que ótimo!|Maravilha!|Perfeito!} 🥰 Por favor me envie a foto ou PDF do comprovante de R$ 9,90 aqui para eu liberar o link da sua Planilha na hora!`);
        await supabase.from('leads').update({ status: 'AGUARDANDO_COMPROVANTE_UPSELL_PLANILHA' }).eq('phone', dbPhone);
      }
      else if (isSim) {
        const msgPixPlanilha = `{Maravilha!|Excelente escolha!} 🎉\nA Chave Pix para a Planilha Mágica é:\n*CPF:* 83647139904\n*Nome:* Ney Carlos Manoel\n*Valor:* R$ 9,90\n\nAssim que fizer, é só me mandar o comprovante aqui para eu liberar o seu acesso imediato! 🥰`;
        await sendWameText(phone, msgPixPlanilha);

        const reminderId = await scheduleReminder('REMINDER_RECEIPT_PLANILHA', '1h');
        await supabase.from('leads').update({
          status: 'AGUARDANDO_COMPROVANTE_UPSELL_PLANILHA',
          qstash_reminder_id: reminderId
        }).eq('phone', dbPhone);
      }
      else if (isNao) {
        // Recusou a Planilha -> Sem problemas! Oferece o Pack Lucratividade por R$ 11,90!
        const msgAvancaPack = `{Tudo bem|Sem problemas}! 💛\n\nDeixa eu te fazer só mais uma perguntinha rápida... 🥰\n\nSe você quer acelerar suas vendas e começar a faturar toda semana, eu tenho o *Pack Lucratividade Garantida* 💵\nSão *41 Vídeo Aulas Práticas (passo a passo)* + Modelos Prontos de Divulgação e Estratégias de Venda Rápida!\n\nEle custa originalmente *R$ 47,00*, mas para alunas novas consigo liberar agora por apenas *R$ 11,90* no Pix.\n\nQuer aproveitar esse mega desconto e levar as 41 Vídeo Aulas por R$ 11,90?\nDigite 1 para SIM\nDigite 2 para NÃO`;
        await sendWameText(phone, msgAvancaPack);

        const reminderId = await scheduleReminder('REMINDER_UPSELL_PACK', '2h');
        await supabase.from('leads').update({
          status: 'AGUARDANDO_RESPOSTA_UPSELL_PACK',
          qstash_reminder_id: reminderId
        }).eq('phone', dbPhone);
      }
      else {
        await sendWameText(phone, `Desculpe 😊 Para continuar preciso apenas que responda:\n\nDigite 1 para SIM\nDigite 2 para NÃO`);
      }
    }

    // =========================================================================
    // ETAPA 4: Comprovante da Planilha Mágica (R$ 9,90)
    // Entrega a Planilha e, em seguida, oferece o Pack por R$ 11,90!
    // =========================================================================
    else if (status === 'AGUARDANDO_COMPROVANTE_UPSELL_PLANILHA') {
      if (isComprovanteMedia) {
        await cancelExistingReminder();

        // 1. Entrega a Planilha
        const msgEntregaPlanilha = `{Obrigada!|Perfeito!} Comprovante de R$ 9,90 recebido com sucesso! 🥰\n\nAqui está o link de acesso seguro à sua *Planilha Mágica de Precificação* no Google Drive:\n👉 https://drive.google.com/drive/folders/11XJvsadAyyFRFxqCaF9oKTk5XK0YpIM_?usp=sharing\n\nVocê já pode abrir e começar a usar! 📊💛`;
        await sendWameText(phone, msgEntregaPlanilha);
        await new Promise(r => setTimeout(r, 2500));

        // 2. Dispara a Oferta do Pack (R$ 11,90)
        const msgOfertaPack = `Aproveitando o seu embalo de sucesso... 🥰\n\nSe você quer acelerar suas vendas e começar a faturar toda semana, eu tenho o *Pack Lucratividade Garantida* 💵\nSão *41 Vídeo Aulas Práticas (passo a passo)* + Modelos Prontos de Divulgação e Estratégias de Venda Rápida!\n\nEle custa originalmente *R$ 47,00*, mas como você acabou de garantir sua Planilha, posso liberar o acesso completo por apenas *+ R$ 11,90* no Pix.\n\nQuer aproveitar esse mega desconto e levar as 41 Vídeo Aulas por R$ 11,90?\nDigite 1 para SIM\nDigite 2 para NÃO`;
        await sendWameText(phone, msgOfertaPack);

        const reminderId = await scheduleReminder('REMINDER_UPSELL_PACK', '2h');
        await supabase.from('leads').update({
          status: 'AGUARDANDO_RESPOSTA_UPSELL_PACK',
          qstash_reminder_id: reminderId
        }).eq('phone', dbPhone);

      } else if (isAudio) {
        await sendWameText(phone, `{Olá|Oi}! Ouvi seu áudio 🥰 Mas preciso que você me envie a foto (print) ou PDF do comprovante de R$ 9,90 para eu liberar o link da sua Planilha, tá bom?`);
      } else {
        await sendWameText(phone, `{Perfeito|Tudo bem} 😊 Assim que você enviar o comprovante de R$ 9,90 eu te envio o link de acesso à Planilha!`);
      }
    }

    // =========================================================================
    // ETAPA 5: Resposta do Pack Lucratividade (R$ 11,90)
    // Suporta tanto o novo status quanto o legado AGUARDANDO_RESPOSTA_UPSELL
    // =========================================================================
    else if (status === 'AGUARDANDO_RESPOSTA_UPSELL_PACK' || status === 'AGUARDANDO_RESPOSTA_UPSELL') {
      await cancelExistingReminder();

      if (isJaPagou) {
        await sendWameText(phone, `{Que ótimo!|Maravilha!|Perfeito!} 🥰 Por favor me envie a foto ou PDF do comprovante aqui para eu liberar o Pack imediatamente!`);
        await supabase.from('leads').update({ status: 'AGUARDANDO_COMPROVANTE_UPSELL_PACK' }).eq('phone', dbPhone);
      }
      else if (isSim) {
        const msgPixUpsell = `{Maravilha!|Excelente escolha!} 🎉\nA Chave Pix para o Pack é:\n*CPF:* 83647139904\n*Nome:* Ney Carlos Manoel\n*Valor:* R$ 11,90\n\nAssim que fizer, é só me mandar o comprovante aqui para liberar seu acesso! 🥰`;
        await sendWameText(phone, msgPixUpsell);

        const reminderId = await scheduleReminder('REMINDER_RECEIPT_PACK', '1h');
        await supabase.from('leads').update({
          status: 'AGUARDANDO_COMPROVANTE_UPSELL_PACK',
          qstash_reminder_id: reminderId
        }).eq('phone', dbPhone);
      }
      else if (isNao) {
        // Dispara o Downsell do Pack por R$ 7,90
        const msgDownsell = `Entendo perfeitamente! 💛\n\nEu sei que as coisas não estão fáceis e não quero que você fique sem esse material tão importante para acelerar suas vendas.\n\nEntão vou fazer uma loucura: vou liberar o acesso ao Pack Lucratividade com as 41 Vídeo Aulas para você por apenas *R$ 7,90* no Pix!\n\nÉ menos que o valor de um lanche para você não ter mais dúvida na cozinha. Aceita?\nDigite 1 para SIM\nDigite 2 para NÃO`;
        await sendWameText(phone, msgDownsell);

        const reminderId = await scheduleReminder('REMINDER_DOWNSELL_PACK', '2h');
        await supabase.from('leads').update({
          status: 'AGUARDANDO_RESPOSTA_DOWNSELL_PACK',
          qstash_reminder_id: reminderId
        }).eq('phone', dbPhone);
      }
      else {
        await sendWameText(phone, `Desculpe 😊 Para continuar preciso apenas que responda:\n\nDigite 1 para SIM\nDigite 2 para NÃO`);
      }
    }

    // =========================================================================
    // ETAPA 6: Comprovante do Pack (R$ 11,90)
    // =========================================================================
    else if (status === 'AGUARDANDO_COMPROVANTE_UPSELL_PACK' || status === 'AGUARDANDO_COMPROVANTE_UPSELL') {
      if (isComprovanteMedia) {
        await cancelExistingReminder();

        const msgFimUpsell = `{Obrigada!|Perfeito!} Comprovante de R$ 11,90 recebido!\n\nAqui está o link de acesso seguro ao seu *Pack Lucratividade Garantida* no Google Drive:\n👉 https://drive.google.com/drive/folders/1-yGlJKQX7_fluzDFWaj9wriB-EfhWvJd\n\nDesejo a você muito sucesso nas suas receitas e vendas! 💛🚀`;
        await sendWameText(phone, msgFimUpsell);
        await supabase.from('leads').update({ status: 'CONCLUIDO_UPSELL' }).eq('phone', dbPhone);

      } else if (isAudio) {
        await sendWameText(phone, `{Olá|Oi}! Ouvi seu áudio 🥰 Mas preciso que você me envie a foto (print) ou PDF do comprovante de R$ 11,90 para eu liberar o link do Pack para você!`);
      } else {
        await sendWameText(phone, `{Perfeito|Tudo bem} 😊 Assim que você enviar o comprovante de R$ 11,90 eu te envio o link de acesso ao Pack!`);
      }
    }

    // =========================================================================
    // ETAPA 7: Resposta do Downsell do Pack (R$ 7,90)
    // =========================================================================
    else if (status === 'AGUARDANDO_RESPOSTA_DOWNSELL_PACK' || status === 'AGUARDANDO_RESPOSTA_DOWNSELL') {
      await cancelExistingReminder();

      if (isJaPagou) {
        await sendWameText(phone, `{Que ótimo!|Maravilha!|Perfeito!} 🥰 Por favor me envie a foto ou PDF do comprovante de R$ 7,90 aqui para eu liberar o Pack imediatamente!`);
        await supabase.from('leads').update({ status: 'AGUARDANDO_COMPROVANTE_DOWNSELL_PACK' }).eq('phone', dbPhone);
      }
      else if (isSim) {
        const msgPixDownsell = `{Que bom que decidiu aproveitar!|Excelente!} 🎉\nA Chave Pix para o Pack (com desconto especial) é:\n*CPF:* 83647139904\n*Nome:* Ney Carlos Manoel\n*Valor:* R$ 7,90\n\nAssim que fizer, é só me mandar o comprovante aqui para liberar o seu acesso! 🥰`;
        await sendWameText(phone, msgPixDownsell);

        const reminderId = await scheduleReminder('REMINDER_RECEIPT_PACK_DOWNSELL', '1h');
        await supabase.from('leads').update({
          status: 'AGUARDANDO_COMPROVANTE_DOWNSELL_PACK',
          qstash_reminder_id: reminderId
        }).eq('phone', dbPhone);
      }
      else if (isNao) {
        const msgFimDownsell = `Tudo bem, sem problemas! Aproveite muito as receitas e desejo todo sucesso do mundo nas suas vendas! Conte comigo se precisar de ajuda! 🥰💛`;
        await sendWameText(phone, msgFimDownsell);
        await supabase.from('leads').update({ status: 'CONCLUIDO_RECUSOU_TUDO' }).eq('phone', dbPhone);
      }
      else {
        await sendWameText(phone, `Desculpe 😊 Para continuar preciso apenas que responda:\n\nDigite 1 para SIM\nDigite 2 para NÃO`);
      }
    }

    // =========================================================================
    // ETAPA 8: Comprovante do Downsell do Pack (R$ 7,90)
    // =========================================================================
    else if (status === 'AGUARDANDO_COMPROVANTE_DOWNSELL_PACK' || status === 'AGUARDANDO_COMPROVANTE_DOWNSELL') {
      if (isComprovanteMedia) {
        await cancelExistingReminder();

        const msgFimDownsell = `{Obrigada!|Perfeito!} Comprovante de R$ 7,90 recebido!\n\nAqui está o link de acesso seguro ao seu *Pack Lucratividade Garantida* no Google Drive:\n👉 https://drive.google.com/drive/folders/1-yGlJKQX7_fluzDFWaj9wriB-EfhWvJd\n\nDesejo a você muito sucesso nas suas vendas! 💛🚀`;
        await sendWameText(phone, msgFimDownsell);
        await supabase.from('leads').update({ status: 'CONCLUIDO_DOWNSELL' }).eq('phone', dbPhone);

      } else if (isAudio) {
        await sendWameText(phone, `{Olá|Oi}! Ouvi seu áudio 🥰 Mas preciso que você me envie a foto (print) ou PDF do comprovante de R$ 7,90 para eu liberar o link do Pack para você!`);
      } else {
        await sendWameText(phone, `{Perfeito|Tudo bem} 😊 Assim que você enviar o comprovante de R$ 7,90 eu te envio o link de acesso ao Pack!`);
      }
    }

    // =========================================================================
    // ETAPA 9: Lead já concluiu e respondeu algo depois
    // =========================================================================
    else if (status.startsWith('CONCLUIDO')) {
      if (normalizedText === '1' || normalizedText === '2' || /\b(sim|n[ãa]o)\b/.test(normalizedText)) {
        await sendWameText(phone, `{Oie!|Olá!} 🥰 Você já garantiu e recebeu todo o seu material!\n\nDá uma olhadinha nas mensagens logo acima para acessar os links e materiais que te enviei. Se precisar de alguma ajuda com as receitas, estarei por aqui! 💛`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Wame Webhook] Erro Interno:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export const maxDuration = 60;
