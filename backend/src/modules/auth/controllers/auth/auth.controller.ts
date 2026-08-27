import { Request, Response } from "express";
import { AppDataSource } from "@common";
import { MipsUser } from "@common";
import { AuthService } from "../../service/auth.service";
import {
  normalizePasswordHash,
  passwordsMatch,
  sanitizeMipsUserForApi,
} from "../../service/passwordHash.util";
import jwt, { type SignOptions } from "jsonwebtoken";
import { AuthRequest } from "@common";

const authService = new AuthService();
const userRepository = AppDataSource.getRepository(MipsUser);
const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables!");
  }
  return secret;
})();

const ALLOWED_SESSION_DAYS = new Set([1, 2, 7, 15, 30]);

function resolveSessionExpiresIn(sessionDays?: unknown, rememberMe = false): SignOptions["expiresIn"] {
  const days = Number(sessionDays);
  if (Number.isInteger(days) && ALLOWED_SESSION_DAYS.has(days)) {
    return `${days}d`;
  }
  // Legacy: rememberMe checkbox mapped to 2 days (was 48h)
  if (rememberMe) return "2d";
  return "1d";
}

function issueAuthToken(user: MipsUser, sessionDays?: unknown, rememberMe = false) {
  const expiresIn = resolveSessionExpiresIn(sessionDays, rememberMe);
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn });
}

export const getMe = async (req: AuthRequest, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    try {
        const user = await userRepository.findOne({ where: { id: req.user.id } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({ user: sanitizeMipsUserForApi(user) });
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const signup = async (req: Request, res: Response) => {
    const { name, email, Password } = req.body;

    if (!name || !email) {
        return res.status(400).json({ message: "Name and email are required" });
    }

    const passwordHash = Password != null ? normalizePasswordHash(Password) : null;
    if (Password != null && !passwordHash) {
        return res.status(400).json({ message: "Password must be a 64-character SHA256 hex string" });
    }

    try {
        let user = await userRepository.findOne({ where: { email } });
        if (user) {
            return res.status(400).json({ message: "User already exists" });
        }

        user = userRepository.create({
            name,
            email,
            ...(passwordHash ? { Password: passwordHash } : {}),
        });
        await userRepository.save(user);

        return res.status(201).json({
            message: "User created successfully",
            user: sanitizeMipsUserForApi(user),
        });
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

async function loginWithPassword(
    email: string,
    passwordHash: string,
    sessionDays: unknown,
    rememberMe: boolean,
    res: Response,
) {
    const user = await userRepository.findOne({ where: { email } });
    if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.Password) {
        return res.status(401).json({ message: "Password login not configured for this account" });
    }

    if (!passwordsMatch(user.Password, passwordHash)) {
        return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = issueAuthToken(user, sessionDays, rememberMe);
    return res.status(200).json({
        message: "Login successful",
        user: sanitizeMipsUserForApi(user),
        token,
    });
}

/** POST /api/auth/login — password login if Password sent; otherwise OTP email flow. */
export const login = async (req: Request, res: Response) => {
    const { email, Password, rememberMe, sessionDays } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    try {
        if (Password != null && Password !== "") {
            const passwordHash = normalizePasswordHash(Password);
            if (!passwordHash) {
                return res.status(400).json({ message: "Password must be a 64-character SHA256 hex string" });
            }
            return await loginWithPassword(
                String(email).trim(),
                passwordHash,
                sessionDays,
                rememberMe === true,
                res,
            );
        }

        const user = await userRepository.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        await authService.generateOtp(email);

        return res.status(200).json({ message: "OTP sent to email" });
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required" });
    }

    try {
        const isValid = await authService.verifyOtp(email, otp);
        if (!isValid) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        const user = await userRepository.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const token = issueAuthToken(user);

        return res.status(200).json({
            message: "Login successful",
            user: sanitizeMipsUserForApi(user),
            token,
        });
    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};
