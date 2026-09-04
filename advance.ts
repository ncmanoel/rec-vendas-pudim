import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { sendWameText } from './src/lib/wame';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const QSTASH_URL = process.env.QSTASH_URL;
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;

async function run() {
  const phone = '5551989634685';
  const firstName = 'Cristina';
  
  // 1. Send Msg 8
  console.log('Sending Msg 8...');
  const msg8 = `Parabéns pela sua postura! 🎉\nA Chave Pix para pagamento é:\n*CPF:* 83647139904\n*Nome:* Ney Carlos Manoel (meu marido 🥰)\n*Valor:* R$ 10,00`;
  await sendWameText(phone, msg8);

  // 2. Publish to QStash to send PIX_SEQUENCE (delay 5s)
  console.log('Publishing to QStash...');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL; // assume it's valid or fallback
  
  const res = await fetch(`${QSTASH_URL}/v2/publish/${baseUrl}/api/qstash/worker`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${QSTASH_TOKEN}`,
      'Content-Type': 'application/json',
      'Upstash-Delay': '5s'
    },
    body: JSON.stringify({ action: 'SEND_PIX_SEQUENCE', phone, firstName })
  });
  console.log('QStash Response:', await res.text());

  // 3. Update Supabase
  console.log('Updating Supabase...');
  await supabase.from('leads').update({ status: 'AGUARDANDO_COMPROVANTE' }).eq('phone', phone);
  
  console.log('Done!');
}
run();
