import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWameText, sendWameAudio, sendWameImage, sendWameDocument } from '@/lib/wame';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get('phone');
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const type = searchParams.get('type');
    const customMsg = searchParams.get('msg');

    if (customMsg) {
      await sendWameText(phone, customMsg);
      return NextResponse.json({ success: true, message: 'Custom msg sent' });
    }

    if (type === 'send_pdf') {
      await sendWameDocument(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Receitas%20de%20Pudim%20Sem%20Forno.pdf", "Receitas de Pudim Sem Forno.pdf");
      const msg = `Oie! Me desculpe a demora. Tivemos uma instabilidade no envio automático, mas aqui está a sua cópia do material conforme prometido! 🥰\n\nAssim que você conseguir ler, me avisa se tiver alguma dúvida. E caso ainda não tenha feito o Pix, pode enviar quando puder.`;
      await new Promise(r => setTimeout(r, 2000));
      await sendWameText(phone, msg);
      return NextResponse.json({ success: true, message: 'PDF sent' });
    }

    if (type === 'upsell_reply') {
      const msg = `Oie! Tudo bem? 🥰\n\nEsse valor de R$ 11,90 é referente ao nosso *Pack Lucratividade Garantida* (que era aquela oferta especial no final da compra).\n\nEle é um material extra exclusivo com dicas de ouro, estratégias de vendas e os segredos para você transformar os pudins em uma verdadeira fonte de renda! 💰\n\nComo você já levou o material principal, esse Pack serve para te ajudar a lucrar muito mais rápido.\n\nSe quiser aproveitar, é só me mandar o comprovante aqui e eu já libero o link de acesso ao Pack, combinado?`;
      await sendWameText(phone, msg);
      return NextResponse.json({ success: true, message: 'Upsell reply sent' });
    }

    await supabase.from('leads').upsert({
      phone: phone,
      name: 'Lead Manual',
      status: 'AGUARDANDO_RESPOSTA_1_2'
    });

    const msg1 = 'Oie! Tudo bem? Aqui é a Ana. Vi que você me mandou mensagem no outro número falando que tem interesse no método Pudim sem forno. Eu estou usando este número aqui agora para atendimento, tá bom? 🥰';
    await sendWameText(phone, msg1);
    await new Promise(r => setTimeout(r, 3000));

    await sendWameAudio(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Audio%20Pudim.ogg");
    await new Promise(r => setTimeout(r, 5000));

    const msg3 = `No método *Pudim sem Forno*, você terá acesso a:\n🍮 São 30 receitas super testadas e adoradas pelos clientes!\n\n*Bônus Especial:*\n🎁 11 caldas irresistíveis para você fazer e vender muito 🤩\n\nE tudo isso só por:\n💸 *R$ 10,00* reais no *PIX* 💸`;
    await sendWameText(phone, msg3);
    await new Promise(r => setTimeout(r, 5000));

    const msg4 = `O melhor?\nEu *acredito e confio* em você!\n*Vou te enviar* o PDF aqui no WhatsApp agora e você *faz o Pix depois*, combinado?\nTenho certeza de que vai amar!`;
    await sendWameText(phone, msg4);
    await new Promise(r => setTimeout(r, 3000));

    await sendWameImage(phone, "https://xzysqeivbibosmryjsqm.supabase.co/storage/v1/object/public/arquivos-bot/Imagem%20Pudim.jpeg", "");
    await new Promise(r => setTimeout(r, 3000));

    const msg6 = `Posso te mandar o Material?\nPara *Sim* digite 1\nPara *Não* digite 2`;
    await sendWameText(phone, msg6);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
export const maxDuration = 60;
