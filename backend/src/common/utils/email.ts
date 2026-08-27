// src/utils/email.ts
import dotenv from "dotenv";
dotenv.config();
import { EmailClient } from "@azure/communication-email";
import { logger } from "./logger";

const connectionString = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING!;
const emailClient = new EmailClient(connectionString);

const senderAddress = process.env.AZURE_SENDER_EMAIL!;
export const adminEmail = process.env.ADMIN_EMAIL!;

export type SendEmailOptions = {
  /** When false, return after ACS accepts the message (do not wait for delivery). */
  waitForDelivery?: boolean;
};

async function pollDelivery(poller: Awaited<ReturnType<EmailClient["beginSend"]>>, to: string) {
  const result = await poller.pollUntilDone();
  if (result.status === "Succeeded") {
    logger.info({ to, status: result.status }, "Email sent successfully");
  } else {
    logger.warn({ to, status: result.status }, "Email send finished with non-success status");
  }
  return result;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  options: SendEmailOptions = {},
) {
  const { waitForDelivery = true } = options;

  try {
    const message = {
      senderAddress,
      content: {
        subject,
        plainText: body,
        html: `<p>${body}</p>`,
      },
      recipients: {
        to: [
          {
            address: to,
            displayName: "MIPS User",
          },
        ],
      },
    };

    const poller = await emailClient.beginSend(message);

    if (!waitForDelivery) {
      void pollDelivery(poller, to).catch((err) => {
        logger.error({ err, to }, "Background email delivery failed");
      });
      return { status: "Queued" as const };
    }

    return await pollDelivery(poller, to);
  } catch (err) {
    logger.error({ err, to }, "Failed to send Azure Email");
    throw err;
  }
}
