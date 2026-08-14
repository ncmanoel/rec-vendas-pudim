/**
 * Processa uma string com formato de Spintax.
 * Exemplo: "Olá {João|Maria}, como você {está|vai}?"
 * O regex encontra o bloco mais interno { ... } que não contém outras chaves.
 */
export function processSpintax(text: string): string {
  if (!text) return text;
  
  const spintaxRegex = /\{([^{}]*)\}/g;
  let match;
  
  // Loop enquanto houver blocos de spintax na string
  while ((match = spintaxRegex.exec(text)) !== null) {
    const options = match[1].split('|');
    const randomOption = options[Math.floor(Math.random() * options.length)];
    
    // Substitui exatamente a chave pelo resultado sorteado
    text = text.substring(0, match.index) + randomOption + text.substring(match.index + match[0].length);
    
    // Reseta o index do regex para varrer a string alterada novamente desde o início
    spintaxRegex.lastIndex = 0;
  }
  
  return text;
}
