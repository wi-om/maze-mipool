// scripts/testEmail.ts

import { sendEmail } from "./email";

(async () => {
  try {
    await sendEmail(
      "test@example.com",
      "📧 Test Email - Azure Comm Service",
      "This is a test email from MIPS Azure function."
    );
    console.log("✅ Test email sent");
  } catch (err) {
    console.error("❌ Test email failed", err);
  }
})();
