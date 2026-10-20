import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { qstashClient } from '@/lib/qstash';
import { sendWameText, sendWameDocument } from '@/lib/wame';

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // 1. Validação básica de payload
    if (!payload || !payload.customer || !payload.customer.phone) {
      return NextResponse.json({ error: 'Payload inválido ou sem telefone' }, { status: 400 });
    }

    const rawPhone = payload.customer.phone;
    const fullName = payload.customer.name || 'Cliente';
    const email = payload.customer.email || '';
    const eventName = payload.event_name;
    const isApproved = eventName === 'Make_Aprovada' || 
                       eventName === 'Compra aprovada' || 
                       eventName === 'Make_Aprovadas' || 
                       payload.status === 'approved' || 
                       payload.status === 'Pago' || 
                       payload.event_type === 'ApprovedPurchase';

    // 2. Normalização do telefone (DDI + DDD + Número)
    let phone = rawPhone.replace(/\D/g, '');
    if (phone.startsWith('0') && (phone.length === 11 || phone.length === 12)) {
      phone = phone.substring(1);
    }
    if (phone.length === 10 || phone.length === 11) {
      phone = `55${phone}`;
    }

    const firstName = fullName.split(' ')[0];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rec-vendas-pudim.vercel.app';

    // =========================================================================
    // FLUXO DE COMPRA APROVADA NA CELETUS (Pix Pago, Cartão Aprovado, etc.)
    // =========================================================================
    if (isApproved) {
      console.log(`[Celetus Webhook] Pagamento APROVADO recebido para: ${phone} (${firstName})`);

      // Trava de deduplicação (evita webhooks repetidos em menos de 1 minuto para o mesmo lead)
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: recentSale } = await supabase
        .from('vendas')
        .select('id, data_venda')
        .eq('telefone', phone)
        .gte('data_venda', oneMinuteAgo)
        .limit(1);

      if (recentSale && recentSale.length > 0) {
        console.warn(`[Celetus Webhook] Venda já registrada recentemente para ${phone}. Ignorando duplicidade.`);
        return NextResponse.json({ message: 'Webhook duplicado já processado' }, { status: 200 });
      }

      // Cancela mensagens antigas agendadas no QStash para o lead
      const { data: leadData } = await supabase
        .from('leads')
        .select('qstash_reminder_id, status')
        .eq('phone', phone)
        .single();

      if (leadData?.qstash_reminder_id) {
        try {
          await qstashClient.messages.delete(leadData.qstash_reminder_id);
          console.log(`[Celetus Webhook] Mensagem agendada cancelada no QStash para: ${phone}`);
        } catch (e) {
          console.error(`[Celetus Webhook] Erro ao cancelar lembrete no QStash:`, e);
        }
      }

      // -----------------------------------------------------------------------
      // 3. Processamento Dinâmico de Itens (Principal + Order Bumps)
      // -----------------------------------------------------------------------
      const rawItems: Array<{
        name: string;
        amount: number;
        item_type?: string;
      }> = payload.items && payload.items.length > 0 
        ? payload.items 
        : [{
            name: payload.lostSaleData?.Product?.Name || 'Receitas de Pudim sem Forno',
            amount: parseFloat(payload.charge?.amount || "10.00"),
            item_type: 'Principal'
          }];

      const totalPrice = payload.commission?.totalPrice || parseFloat(payload.charge?.amount || "10.00");
      const userCommission = payload.commission?.userCommission != null 
        ? parseFloat(String(payload.commission.userCommission)) 
        : null;

      // Rateio matemático proporcional do valor líquido entre os itens
      let totalNetAllocated = 0;
      const processedItems = rawItems.map((item, idx) => {
        const isLast = idx === rawItems.length - 1;
        let itemNet: number;

        if (userCommission !== null && totalPrice > 0) {
          if (isLast) {
            itemNet = Math.round((userCommission - totalNetAllocated) * 100) / 100;
          } else {
            itemNet = Math.round(((item.amount / totalPrice) * userCommission) * 100) / 100;
            totalNetAllocated += itemNet;
          }
        } else {
          const fee = (item.amount * 0.049) + 1.00;
          itemNet = Math.round(Math.max(0, item.amount - fee) * 100) / 100;
        }

        const nameLower = (item.name || '').toLowerCase();
        const isOB = item.item_type === 'Orderbump' || 
                     nameLower.includes('pack') || 
                     nameLower.includes('planilha') || 
                     nameLower.includes('lucratividade');

        return {
          name: item.name,
          amount: item.amount,
          netValue: Math.max(0, itemNet),
          isOB
        };
      });

      // Extrair UTMs de rastreamento
      const utmParams = {
        utm_campaign: payload.trackingParameters?.utm_campaign || payload.utm_campaign || payload.tracking?.utm_campaign || null,
        utm_source: payload.trackingParameters?.utm_source || payload.utm_source || payload.tracking?.utm_source || null,
        utm_medium: payload.trackingParameters?.utm_medium || payload.utm_medium || payload.tracking?.utm_medium || null,
        utm_content: payload.trackingParameters?.utm_content || payload.utm_content || payload.tracking?.utm_content || null,
        utm_term: payload.trackingParameters?.utm_term || payload.utm_term || payload.tracking?.utm_term || null,
      };

      // 4. Inserir CADA item individualmente na tabela vendas
      for (const item of processedItems) {
        await supabase.from('vendas').insert({
          telefone: phone,
          nome_cliente: firstName,
          nome_produto: item.name,
          valor: item.netValue,
          ...utmParams
        });
      }

      console.log(`[Celetus Webhook] ${processedItems.length} itens inseridos em vendas para ${phone}`);

      // Identifica quais produtos o cliente comprou
      const hasPlanilha = processedItems.some(i => i.isOB && i.name.toLowerCase().includes('planilha'));
      const hasPack = processedItems.some(i => i.isOB && (i.name.toLowerCase().includes('pack') || i.name.toLowerCase().includes('lucratividade')));

      // -----------------------------------------------------------------------
      // 5. Entregas Imediatas dos PDFs Base (Pudim e Caldas)
      // -----------------------------------------------------------------------
      await sendWameDocument(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Receitas%20de%20Pudim%20Sem%20Forno.pdf", "Receitas de Pudim Sem Forno.pdf");
      await new Promise(r => setTimeout(r, 2000));

      await sendWameDocument(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Caldas%20que%20Vendem.pdf", "Caldas que Vendem.pdf");
      await new Promise(r => setTimeout(r, 1500));

      // =======================================================================
      // CENÁRIO A: Comprou Pudim + Planilha + Pack (COMPLETO)
      // =======================================================================
      if (hasPlanilha && hasPack) {
        await supabase.from('leads').upsert({
          phone: phone,
          name: firstName,
          email: email,
          product_name: 'Combo Completo (Celetus)',
          status: 'CONCLUIDO_CELETUS'
        });

        const msgCompleta = `{Olá|Oi|Oie} ${firstName}! Parabéns pela sua compra completa! 🥰 Como um bônus de agilidade, acabei de te enviar os materiais em PDF por aqui também para facilitar o seu acesso!\n\nE como você aproveitou e garantiu os materiais complementares, aqui estão os seus links de acesso:\n\n📊 *Planilha Mágica de Precificação:*\n👉 https://drive.google.com/drive/folders/11XJvsadAyyFRFxqCaF9oKTk5XK0YpIM_?usp=sharing\n\n💵 *Pack Lucratividade Garantida:*\n👉 https://drive.google.com/drive/folders/1-yGlJKQX7_fluzDFWaj9wriB-EfhWvJd\n\nDesejo a você muito sucesso nas suas receitas e vendas! 🚀💛`;
        await sendWameText(phone, msgCompleta);
        return NextResponse.json({ success: true, message: 'Materiais completos enviados.' }, { status: 200 });
      }

      // =======================================================================
      // CENÁRIO B: Comprou Pudim + Planilha (Falta o Pack)
      // Entrega Planilha e persegue ofertando o Pack por R$ 11,90!
      // =======================================================================
      if (hasPlanilha && !hasPack) {
        const msgPlanilha = `{Olá|Oi|Oie} ${firstName}! Parabéns pela sua compra! 🥰 Como um bônus de agilidade, acabei de te enviar os PDFs por aqui também!\n\nE aqui está o link de acesso seguro à sua *Planilha Mágica de Precificação*:\n👉 https://drive.google.com/drive/folders/11XJvsadAyyFRFxqCaF9oKTk5XK0YpIM_?usp=sharing`;
        await sendWameText(phone, msgPlanilha);
        await new Promise(r => setTimeout(r, 2000));

        const msgUpsellPack = `Aproveitando, deixa eu te fazer uma pergunta rápida... 🥰\n\nSe você quer acelerar seus resultados e começar a vender pudins toda semana, eu tenho o *Pack Lucratividade Garantida* 💵\nSão *41 Vídeo Aulas Práticas (passo a passo)* + Modelos Prontos de Divulgação e Estratégias de Venda Rápida!\n\nEle custa originalmente *R$ 47,00*, mas como você acabou de se tornar aluna, posso liberar o acesso completo para você agora por apenas *+ R$ 11,90* no Pix.\n\nQuer aproveitar esse mega desconto e levar as *41 Vídeo Aulas* por R$ 11,90?\nDigite 1 para SIM\nDigite 2 para NÃO`;
        await sendWameText(phone, msgUpsellPack);

        // Agenda Follow-up de 2 horas no QStash se não responder
        let reminderId = null;
        try {
          const qres: any = await qstashClient.publishJSON({
            url: `${baseUrl}/api/qstash/worker`,
            body: { action: 'REMINDER_UPSELL_PACK', phone, firstName },
            delay: 2 * 60 * 60
          });
          reminderId = qres.messageId;
        } catch (e) {
          console.error('[Celetus Webhook] Erro ao agendar follow-up do Pack:', e);
        }

        await supabase.from('leads').upsert({
          phone: phone,
          name: firstName,
          email: email,
          product_name: 'Pudim + Planilha',
          status: 'AGUARDANDO_RESPOSTA_UPSELL_PACK',
          qstash_reminder_id: reminderId
        });

        return NextResponse.json({ success: true, message: 'Planilha entregue e Upsell do Pack disparado com follow-up.' }, { status: 200 });
      }

      // =======================================================================
      // CENÁRIO C: Comprou Pudim + Pack (Falta a Planilha)
      // Entrega o Pack e persegue ofertando a Planilha Mágica por R$ 9,90!
      // =======================================================================
      if (!hasPlanilha && hasPack) {
        const msgPack = `{Olá|Oi|Oie} ${firstName}! Parabéns pela compra completa do método e do Pack! 🥰 Como um bônus de agilidade, acabei de te enviar os materiais em PDF por aqui também para facilitar o seu acesso!\n\nE aqui está o link de acesso seguro ao seu *Pack Lucratividade Garantida* no Google Drive:\n👉 https://drive.google.com/drive/folders/1-yGlJKQX7_fluzDFWaj9wriB-EfhWvJd`;
        await sendWameText(phone, msgPack);
        await new Promise(r => setTimeout(r, 2000));

        const msgUpsellPlanilha = `Aproveitando, deixa eu te fazer uma pergunta rápida... 🥰\n\nMuitas alunas têm medo de errar no preço das receitas e acabar tendo prejuízo ou vendendo pudim barato demais.\n\nPara resolver isso, eu criei a *Planilha Mágica de Precificação Automática* 📊\nVocê só preenche quanto pagou nos ingredientes e ela calcula na hora o *custo exato por fatia/pudim* e o *preço de venda ideal com até 200% de lucro*!\n\nEla custa originalmente R$ 27,00, mas como você acabou de entrar, consigo liberar o acesso vitalício agora por apenas *+ R$ 9,90* no Pix!\n\nQuer aproveitar e garantir a sua Planilha por R$ 9,90?\nDigite 1 para SIM\nDigite 2 para NÃO`;
        await sendWameText(phone, msgUpsellPlanilha);

        // Agenda Follow-up de 2 horas no QStash se não responder
        let reminderId = null;
        try {
          const qres: any = await qstashClient.publishJSON({
            url: `${baseUrl}/api/qstash/worker`,
            body: { action: 'REMINDER_UPSELL_PLANILHA', phone, firstName },
            delay: 2 * 60 * 60
          });
          reminderId = qres.messageId;
        } catch (e) {
          console.error('[Celetus Webhook] Erro ao agendar follow-up da Planilha:', e);
        }

        await supabase.from('leads').upsert({
          phone: phone,
          name: firstName,
          email: email,
          product_name: 'Pudim + Pack',
          status: 'AGUARDANDO_RESPOSTA_UPSELL_PLANILHA',
          qstash_reminder_id: reminderId
        });

        return NextResponse.json({ success: true, message: 'Pack entregue e Upsell da Planilha disparado com follow-up.' }, { status: 200 });
      }

      // =======================================================================
      // CENÁRIO D: Comprou Somente o Pudim (Sem nenhum OB)
      // Entrega os PDFs e inicia a esteira ofertando a Planilha Mágica por R$ 9,90!
      // =======================================================================
      const msgPudim = `{Olá|Oi|Oie} ${firstName}! Parabéns pela compra do método. Como um bônus de agilidade, acabei de te enviar o seu material em PDF por aqui também para facilitar o seu acesso! 🥰`;
      await sendWameText(phone, msgPudim);
      await new Promise(r => setTimeout(r, 1500));

      const msgOfertaPlanilha = `Aproveitando, deixa eu te fazer uma pergunta rápida... 🥰\n\nMuitas alunas têm medo de errar no preço das receitas e acabar tendo prejuízo ou vendendo pudim barato demais.\n\nPara resolver isso, eu criei a *Planilha Mágica de Precificação Automática* 📊\nVocê só preenche quanto pagou nos ingredientes e ela calcula na hora o *custo exato por fatia/pudim* e o *preço de venda ideal com até 200% de lucro*!\n\nEla custa originalmente R$ 27,00, mas para você que é aluna nova consigo liberar agora por apenas *R$ 9,90* no Pix!\n\nQuer aproveitar e garantir a sua Planilha por R$ 9,90?\nDigite 1 para SIM\nDigite 2 para NÃO`;
      await sendWameText(phone, msgOfertaPlanilha);

      // Agenda Follow-up de 2 horas no QStash se não responder
      let reminderId = null;
      try {
        const qres: any = await qstashClient.publishJSON({
          url: `${baseUrl}/api/qstash/worker`,
          body: { action: 'REMINDER_UPSELL_PLANILHA', phone, firstName },
          delay: 2 * 60 * 60
        });
        reminderId = qres.messageId;
      } catch (e) {
        console.error('[Celetus Webhook] Erro ao agendar follow-up da Planilha:', e);
      }

      await supabase.from('leads').upsert({
        phone: phone,
        name: firstName,
        email: email,
        product_name: 'Pudim sem Forno',
        status: 'AGUARDANDO_RESPOSTA_UPSELL_PLANILHA',
        qstash_reminder_id: reminderId
      });

      return NextResponse.json({ success: true, message: 'Pudim entregue e esteira da Planilha iniciada.' }, { status: 200 });
    }

    // =========================================================================
    // FLUXO DE ABANDONO / GERAÇÃO DE PIX PENDENTE
    // =========================================================================
    const productName = payload.lostSaleData?.Product?.Name || payload.items?.[0]?.name || 'Receitas de Pudim sem Forno';

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
        console.log(`[Celetus Webhook] Lead já cadastrado, ignorando duplicidade: ${phone}`);
        return NextResponse.json({ message: 'Lead já cadastrado.' }, { status: 200 });
      }
      console.error('[Celetus Webhook] Erro ao cadastrar lead:', insertError);
      return NextResponse.json({ error: 'Erro de banco de dados' }, { status: 500 });
    }

    // Inicia funil de recuperação via QStash
    const pixCode = payload.charge?.pix_data?.pix_qr_code;

    await qstashClient.publishJSON({
      url: `${baseUrl}/api/qstash/worker`,
      body: {
        action: 'START_FUNNEL',
        phone: phone,
        firstName: firstName,
        productName: productName,
        pixCode: pixCode
      },
    });

    console.log(`[Celetus Webhook] Lead cadastrado e funil iniciado para: ${phone}`);
    return NextResponse.json({ success: true, message: 'Lead processado com sucesso' }, { status: 200 });

  } catch (error) {
    console.error('[Celetus Webhook] Erro interno:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}

export const maxDuration = 60;
