const WAME_API_URL = process.env.WAME_API_URL || 'https://us.api-wa.me';
const WAME_API_TOKEN = process.env.WAME_API_TOKEN || '';
import { processSpintax } from './spintax';

export async function sendWameText(to: string, text: string) {
  const final_text = processSpintax(text);
  const url = `${WAME_API_URL}/${WAME_API_TOKEN}/message/text`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, text: final_text }),
  });
  
  if (!response.ok) {
    console.error('[Wame API] Erro ao enviar texto', await response.text());
  }
  return response.json();
}

export async function sendWameAudio(to: string, audioUrl: string) {
  const url = `${WAME_API_URL}/${WAME_API_TOKEN}/message/audio`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, url: audioUrl }),
  });
  
  if (!response.ok) {
    console.error('[Wame API] Erro ao enviar audio', await response.text());
  }
  return response.json();
}

export async function sendWameImage(to: string, imageUrl: string, caption?: string) {
  const url = `${WAME_API_URL}/${WAME_API_TOKEN}/message/image`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, url: imageUrl, caption }),
  });
  
  if (!response.ok) {
    console.error('[Wame API] Erro ao enviar imagem', await response.text());
  }
  return response.json();
}

export async function sendWameDocument(to: string, documentUrl: string, fileName: string) {
  const url = `${WAME_API_URL}/${WAME_API_TOKEN}/message/document`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      to, 
      url: documentUrl, 
      mimetype: 'application/pdf',
      fileName
    }),
  });
  
  if (!response.ok) {
    console.error('[Wame API] Erro ao enviar documento', await response.text());
  }
  return response.json();
}

export async function sendWamePresence(to: string, status: string) {
  const url = `${WAME_API_URL}/${WAME_API_TOKEN}/message/presence`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, status }),
    });
    
    if (!response.ok) {
      console.error('[Wame API] Erro ao enviar presence', await response.text());
    }
    // We don't return JSON to avoid crashing if response is empty
  } catch (error) {
    console.error('[Wame API] Exceção ao enviar presence', error);
  }
}
