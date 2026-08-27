import apiClient from "../client";

export const initiateLogin = async (email: string) => {
    const response = await apiClient.post("/api/auth/login", { email });
    return response.data;
};

export const loginWithPassword = async (
    email: string,
    passwordHash: string,
    sessionDays = 2,
) => {
    const response = await apiClient.post("/api/auth/login", {
        email,
        Password: passwordHash,
        sessionDays,
    });
    return response.data;
};

export const verifyOtp = async (email: string, otp: string) => {
    const response = await apiClient.post("/api/auth/verify", { email, otp });
    return response.data;
};

export const getMe = async () => {
    const response = await apiClient.get("/api/auth/me");
    return response.data;
};

export const setAuthToken = (token: string) => {
    localStorage.setItem("mips_token", token);
};

export const getAuthToken = () => {
    return localStorage.getItem("mips_token");
};

export const removeAuthToken = () => {
    localStorage.removeItem("mips_token");
};

export const clearAuthSession = () => {
    localStorage.removeItem("mips_token");
    localStorage.removeItem("mips_user");
};

let redirectingToSignIn = false;

/** Clear session and hard-redirect to sign-in (idempotent). */
export function redirectToSignIn(): void {
    if (redirectingToSignIn) return;
    clearAuthSession();
    if (window.location.pathname.startsWith("/signin")) return;
    redirectingToSignIn = true;
    window.location.replace("/signin");
}

/** JWT `exp` as epoch ms, or null if missing/invalid. */
export function getTokenExpiryMs(token: string | null | undefined): number | null {
    if (!token) return null;
    try {
        const part = token.split(".")[1];
        if (!part) return null;
        const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
        const payload = JSON.parse(atob(padded)) as { exp?: number };
        return typeof payload.exp === "number" ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

export function isTokenExpired(token: string | null | undefined, nowMs = Date.now()): boolean {
    if (!token) return true;
    const expMs = getTokenExpiryMs(token);
    if (expMs == null) return true;
    return nowMs >= expMs;
}

export const isAuthenticated = () => {
    const token = getAuthToken();
    if (!token) return false;
    if (isTokenExpired(token)) {
        clearAuthSession();
        return false;
    }
    return true;
};
