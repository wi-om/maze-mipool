import { AppDataSource } from "@common";
import { MipsOtp } from "@common";
import { sendEmail } from "@common";
import { DateTime } from "luxon";
import { MoreThan } from "typeorm";
import { logger } from "@common";

export class AuthService {
    private otpRepository = AppDataSource.getRepository(MipsOtp);

    async generateOtp(email: string): Promise<void> {
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = DateTime.now().plus({ minutes: 10 }).toJSDate();

        await AppDataSource.transaction(async (manager) => {
            const repo = manager.getRepository(MipsOtp);
            await repo.delete({ email });
            await repo.save(
                repo.create({
                    email,
                    otp: otpCode,
                    expiresAt,
                }),
            );
        });

        if (process.env.OTP_LOG_ONLY === "true") {
            logger.info({ email, otp: otpCode }, "OTP generated (email skipped — OTP_LOG_ONLY)");
            return;
        }

        const subject = "MIPS Authentication OTP";
        const body = `Your verification code is: ${otpCode}. It will expire in 10 minutes.`;

        // Never block login on Azure email — beginSend alone can take several seconds.
        void sendEmail(email, subject, body, { waitForDelivery: false }).catch((err) => {
            logger.error({ err, email }, "Failed to send OTP email in background");
        });
    }

    async verifyOtp(email: string, otp: string): Promise<boolean> {
        const now = new Date();
        const validOtp = await this.otpRepository.findOne({
            where: {
                email,
                otp,
                expiresAt: MoreThan(now),
            },
            order: { createdOn: "DESC" },
        });

        if (!validOtp) return false;

        await this.otpRepository.delete(validOtp.id);
        return true;
    }
}
