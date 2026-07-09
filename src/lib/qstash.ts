import { Client } from "@upstash/qstash";

const qstashToken = process.env.QSTASH_TOKEN || '';

if (!qstashToken) {
  console.warn('⚠️ QStash token is missing. Make sure to set QSTASH_TOKEN in your .env.local');
}

export const qstashClient = new Client({
  token: qstashToken,
});
