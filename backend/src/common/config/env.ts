import 'dotenv/config';

export const env = {
    MIPS_BASE_URL: process.env.MIPS_BASE_URL ?? '',
    MIPS_API_KEY: process.env.MIPS_API_KEY ?? '',
    MIPS_PAYOUTS_KEY: process.env.MIPS_PAYOUTS_KEY ?? '',
    MIPS_REWARDS_KEY: process.env.MIPS_REWARDS_KEY ?? '',
    TIMEZONE: process.env.TIMEZONE ?? 'Asia/Dubai',
    REWARD_TYPE: process.env.REWARD_TYPE ?? 'FPPS',
    REWARD_SOURCE: process.env.REWARD_SOURCE ?? 'mipool',
};

(['MIPS_BASE_URL', 'MIPS_API_KEY'] as const).forEach((k) => {
    if (!env[k]) throw new Error(`Missing required env: ${k}`);
});
