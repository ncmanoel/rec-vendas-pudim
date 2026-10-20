/**
 * Normaliza e higieniza números de telefone brasileiros recebidos de webhooks (Celetus, etc.)
 * Trata casos de duplicação acidental de DDI (5555...), ausência de DDI e números inválidos.
 */
export function normalizePhone(raw: string | number | null | undefined): string | null {
  if (!raw) return null;
  let phone = String(raw).replace(/\D/g, '');
  if (phone.startsWith('0')) phone = phone.substring(1);

  // Trata duplicações de DDI 55 (ex: 555531... ou 555555...)
  while (phone.startsWith('5555')) {
    const fifthChar = phone.charAt(4);
    // Se o 5º caractere é 9 e o tamanho total é compatível com celular com DDD 55 (RS), é válido
    if (fifthChar === '9' && (phone.length >= 11 && phone.length <= 13)) {
      break;
    }
    // Caso contrário, é duplicação de DDI antes de outro DDD (ex: 555531...) ou triplo 55 (555555...)
    phone = phone.substring(2);
  }

  // Se não começa com 55 e tem formato nacional (10 ou 11 dígitos: DDD + número)
  if (!phone.startsWith('55') && (phone.length === 10 || phone.length === 11)) {
    phone = `55${phone}`;
  }

  // Telefone brasileiro mínimo com DDI precisa ter pelo menos 11 dígitos
  if (phone.length < 11) {
    return null;
  }

  return phone;
}
