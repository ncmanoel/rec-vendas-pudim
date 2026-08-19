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

    let phone = payload.data?.phoneNumber || payload.data?.key?.remoteJid || payload.data?.remoteJid || payload.phoneNumber || '';
    if (!phone) return NextResponse.json({ success: true });
    
    // Filtra apenas os números, pois pode vir com @s.whatsapp.net ou sinais
    phone = phone.replace(/\D/g, '');

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

    // Ignorar reações ou mensagens vazias sem mídia
    if (!normalizedText && !hasMedia) {
      console.log(`[Wame Webhook] Ignorando mensagem vazia/reação de ${phone}`);
      return NextResponse.json({ success: true, reason: 'empty_or_reaction' });
    }

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
        const msg8 = `{Parabéns pela sua postura! 🎉|Que atitude incrível! 🥰|Muito obrigada pela honestidade! 💛}\nA Chave Pix para pagamento é:\n*CPF:* 83647139904\n*Nome:* Ney Carlos Manoel (meu marido 🥰)\n*Valor:* R$ 10,00`;
        await sendWameText(phone, msg8);

        // Agenda Msg 9, 10, 11 (Pix e Arquivo 1)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sua-url.vercel.app';
        await qstashClient.publishJSON({
          url: `${baseUrl}/api/qstash/worker`,
          body: { action: 'SEND_PIX_SEQUENCE', phone: dbPhone, firstName },
          delay: '5s'
        });
        
        // Atualiza o status instantaneamente para evitar conflito se o usuário enviar o comprovante muito rápido
        await supabase.from('leads').update({ status: 'AGUARDANDO_COMPROVANTE' }).eq('phone', dbPhone);

      } 
      // Se ele mandou 2, não, sair
      else if (isNao) {
        
        if (qstash_reminder_id) {
          try { await qstashClient.messages.delete(qstash_reminder_id); } catch (e) {}
        }

        const msgDespedida = `{Tudo bem|Sem problemas|Compreendo}, sem problemas.\n\nDesejo a você muito sucesso em sua jornada e fico à disposição, tá bom!\n\n{Um abraço|Um beijo|Até mais},\n\nAna`;
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
        if (qstash_reminder_id) {
          try { await qstashClient.messages.delete(qstash_reminder_id); } catch (e) {}
        }
        
        // 1. Agradece e envia o material original que a pessoa comprou
        await sendWameDocument(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Caldas%20que%20Vendem.pdf", "Caldas que Vendem.pdf");
        
        // Pausa breve para o WhatsApp entregar o arquivo antes do texto
        await new Promise(r => setTimeout(r, 2000));

        const msg12 = `{Parabéns pela sua decisão!|Que maravilha!|Perfeito!} Comprovante recebido! Conforme prometido, acabei de enviar o Guia de Caldas logo acima. ☝️`;
        await sendWameText(phone, msg12);

        // Mais uma pausa breve antes de mandar a oferta
        await new Promise(r => setTimeout(r, 1500));

        // 2. Dispara o Upsell logo em seguida
        const msgUpsell = `Aproveitando, deixa eu te fazer uma pergunta rápida...\n\nMuitas meninas não sabem calcular o preço das receitas e acabam perdendo dinheiro no final do mês.\n\nEu tenho o *Pack Lucratividade Garantida* (com Guias e Checklists) que resolve isso na hora. Ele custa originalmente *R$ 47,00*, mas como você acabou de se tornar aluna, posso liberar o acesso para você agora por apenas *+ R$ 11,90*.\n\nQuer aproveitar esse mega desconto e fazer um Pix de R$ 11,90 para levar o Pack também?\nDigite 1 para SIM\nDigite 2 para NÃO`;
        await sendWameText(phone, msgUpsell);

        await supabase.from('leads').update({ status: 'AGUARDANDO_RESPOSTA_UPSELL' }).eq('phone', dbPhone);
      } else {
        const msgErroComp = `{Perfeito|Tudo bem} 😊\n\nAssim que você enviar uma imagem ou um PDF do comprovante eu libero imediatamente o restante do material.`;
        await sendWameText(phone, msgErroComp);
      }
    }

    // -------------------------------------------------------------
    // ETAPA 3: Aguardando Resposta do Upsell (1 ou 2)
    // -------------------------------------------------------------
    else if (status === 'AGUARDANDO_RESPOSTA_UPSELL') {
      const isNao = normalizedText === '2' || /\b(n[ãa]o|nunca|jamais|deixa pra l[aá]|cancelar)\b/.test(normalizedText);
      const isSim = !isNao && (normalizedText === '1' || /\b(sim|quero|claro|pode|manda|com certeza|bora)\b/.test(normalizedText));

      if (isSim) {
        const msgPixUpsell = `{Maravilha!|Excelente escolha!} 🎉\nA Chave Pix para o Pack é:\n*CPF:* 83647139904\n*Nome:* Ney Carlos Manoel\n*Valor:* R$ 11,90`;
        await sendWameText(phone, msgPixUpsell);
        await supabase.from('leads').update({ status: 'AGUARDANDO_COMPROVANTE_UPSELL' }).eq('phone', dbPhone);
      } else if (isNao) {
        // Dispara o Downsell
        const msgDownsell = `Entendo perfeitamente! 💛\n\nEu sei que as coisas não estão fáceis e não quero que você fique sem esse material tão importante para o seu negócio.\n\nEntão vou fazer uma loucura: vou liberar o acesso ao Pack Lucratividade pra você por apenas *R$ 7,90*!\n\nÉ menos que um lanche pra você não ter mais prejuízo. Aceita?\n1 para SIM\n2 para NÃO`;
        await sendWameText(phone, msgDownsell);
        await supabase.from('leads').update({ status: 'AGUARDANDO_RESPOSTA_DOWNSELL' }).eq('phone', dbPhone);
      } else {
        const msgErro = `Desculpe 😊\n\nPara continuar preciso apenas que responda:\n\nDigite 1 para SIM\nDigite 2 para NÃO`;
        await sendWameText(phone, msgErro);
      }
    }

    // -------------------------------------------------------------
    // ETAPA 4: Aguardando Comprovante Upsell (R$ 11,90)
    // -------------------------------------------------------------
    else if (status === 'AGUARDANDO_COMPROVANTE_UPSELL') {
      if (hasMedia) {
        const msgFimUpsell = `{Obrigada!|Perfeito!} Comprovante recebido!\n\nAqui está o link de acesso seguro ao seu Pack Lucratividade Garantida no Google Drive:\n👉 https://drive.google.com/drive/folders/1-yGlJKQX7_fluzDFWaj9wriB-EfhWvJd\n\nDesejo a você muito sucesso nas suas vendas! 💛`;
        await sendWameText(phone, msgFimUpsell);
        await supabase.from('leads').update({ status: 'CONCLUIDO_UPSELL' }).eq('phone', dbPhone);
      } else {
        const msgErroComp = `{Perfeito|Tudo bem} 😊\n\nAssim que você enviar o comprovante de R$ 11,90 eu te envio o link de acesso ao Pack!`;
        await sendWameText(phone, msgErroComp);
      }
    }

    // -------------------------------------------------------------
    // ETAPA 5: Aguardando Resposta do Downsell (1 ou 2)
    // -------------------------------------------------------------
    else if (status === 'AGUARDANDO_RESPOSTA_DOWNSELL') {
      const isNao = normalizedText === '2' || /\b(n[ãa]o|nunca|jamais|deixa pra l[aá]|cancelar)\b/.test(normalizedText);
      const isSim = !isNao && (normalizedText === '1' || /\b(sim|quero|claro|pode|manda|com certeza|bora)\b/.test(normalizedText));

      if (isSim) {
        const msgPixDownsell = `{Que bom que decidiu aproveitar!|Excelente!} 🎉\nA Chave Pix para o Pack (com desconto) é:\n*CPF:* 83647139904\n*Nome:* Ney Carlos Manoel\n*Valor:* R$ 7,90`;
        await sendWameText(phone, msgPixDownsell);
        await supabase.from('leads').update({ status: 'AGUARDANDO_COMPROVANTE_DOWNSELL' }).eq('phone', dbPhone);
      } else if (isNao) {
        const msgFimDownsell = `Tudo bem, sem problemas! Aproveite muito as receitas e desejo todo sucesso do mundo nas suas vendas! 🥰`;
        await sendWameText(phone, msgFimDownsell);
        await supabase.from('leads').update({ status: 'CONCLUIDO_RECUSOU_TUDO' }).eq('phone', dbPhone);
      } else {
        const msgErro = `Desculpe 😊\n\nPara continuar preciso apenas que responda:\n\nDigite 1 para SIM\nDigite 2 para NÃO`;
        await sendWameText(phone, msgErro);
      }
    }

    // -------------------------------------------------------------
    // ETAPA 6: Aguardando Comprovante Downsell (R$ 7,90)
    // -------------------------------------------------------------
    else if (status === 'AGUARDANDO_COMPROVANTE_DOWNSELL') {
      if (hasMedia) {
        const msgFimDownsell = `{Obrigada!|Perfeito!} Comprovante recebido!\n\nAqui está o link de acesso seguro ao seu Pack Lucratividade Garantida no Google Drive:\n👉 https://drive.google.com/drive/folders/1-yGlJKQX7_fluzDFWaj9wriB-EfhWvJd\n\nDesejo a você muito sucesso nas suas vendas! 💛`;
        await sendWameText(phone, msgFimDownsell);
        await supabase.from('leads').update({ status: 'CONCLUIDO_DOWNSELL' }).eq('phone', dbPhone);
      } else {
        const msgErroComp = `{Perfeito|Tudo bem} 😊\n\nAssim que você enviar o comprovante de R$ 7,90 eu te envio o link de acesso ao Pack!`;
        await sendWameText(phone, msgErroComp);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Wame Webhook] Erro Interno:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
