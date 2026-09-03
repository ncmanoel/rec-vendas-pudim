const WAME_API_URL = process.env.WAME_API_URL || 'https://us.api-wa.me';
const WAME_API_TOKEN = process.env.WAME_API_TOKEN || '';
import { processSpintax } from './spintax';

export async function sendWameText(to: string, text: string) {
  const final_text = processSpintax(text);
  const url = `${WAME_API_URL}/${WAME_API_TOKEN}/message/text`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text: final_text }),
    });
    const textBody = await response.text();
    if (!response.ok) {
      console.error('[Wame API] Erro ao enviar texto', textBody);
      return null;
    }
    return JSON.parse(textBody);
  } catch (e) {
    console.error('[Wame API] Exception in sendWameText', e);
    return null;
  }
}

export async function sendWameAudio(to: string, audioUrl: string) {
  const url = `${WAME_API_URL}/${WAME_API_TOKEN}/message/audio`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, url: audioUrl }),
    });
    const textBody = await response.text();
    if (!response.ok) {
      console.error('[Wame API] Erro ao enviar audio', textBody);
      return null;
    }
    return JSON.parse(textBody);
  } catch (e) {
    console.error('[Wame API] Exception in sendWameAudio', e);
    return null;
  }
}

export async function sendWameImage(to: string, imageUrl: string, caption?: string) {
  const url = `${WAME_API_URL}/${WAME_API_TOKEN}/message/image`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, url: imageUrl, caption }),
    });
    const textBody = await response.text();
    if (!response.ok) {
      console.error('[Wame API] Erro ao enviar imagem', textBody);
      return null;
    }
    return JSON.parse(textBody);
  } catch (e) {
    console.error('[Wame API] Exception in sendWameImage', e);
    return null;
  }
}

export async function sendWameDocument(to: string, documentUrl: string, fileName: string) {
  const url = `${WAME_API_URL}/${WAME_API_TOKEN}/message/document`;
  try {
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
    const textBody = await response.text();
    if (!response.ok) {
      console.error('[Wame API] Erro ao enviar documento', textBody);
      return null;
    }
    return JSON.parse(textBody);
  } catch (e) {
    console.error('[Wame API] Exception in sendWameDocument', e);
    return null;
  }
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
