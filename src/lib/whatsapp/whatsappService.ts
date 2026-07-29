import { logger } from "../logger";

interface SendMessageArgs {
  accessToken: string;
  phoneId: string;
  recipientPhone: string;
  messageText: string;
}

/**
 * Sends a text message to a WhatsApp user via Meta Cloud API.
 */
export async function sendWhatsAppTextMessage({
  accessToken,
  phoneId,
  recipientPhone,
  messageText,
}: SendMessageArgs): Promise<boolean> {
  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipientPhone,
    type: "text",
    text: {
      preview_url: false,
      body: messageText,
    },
  };

  try {
    logger.info(`Sending WhatsApp message to ${recipientPhone}`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      logger.error(`Failed to send WhatsApp message. Meta API status ${res.status}: ${errorText}`);
      return false;
    }

    const data = await res.json();
    logger.info(`Meta WhatsApp API Message sent. ID: ${data.messages?.[0]?.id}`);
    return true;
  } catch (error: any) {
    logger.error(`Error sending message through Meta API: ${error.message}`);
    return false;
  }
}
