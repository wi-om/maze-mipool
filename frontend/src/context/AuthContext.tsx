import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import {
    clearAuthSession,
    getAuthToken,
    getMe,
    getTokenExpiryMs,
    isTokenExpired,
    redirectToSignIn,
} from "../api/services/authService";

interface AuthContextType {
    user: any;
    login: (userData: any, token: string) => Promise<boolean>;
    logout: () => void;
    isInitialized: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_POLL_MS = 30_000;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<any>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearExpiryTimer = useCallback(() => {
        if (expiryTimerRef.current != null) {
            clearTimeout(expiryTimerRef.current);
            expiryTimerRef.current = null;
        }
    }, []);

    const logout = useCallback(() => {
        clearExpiryTimer();
        setUser(null);
        clearAuthSession();
    }, [clearExpiryTimer]);

    const forceSignIn = useCallback(() => {
        clearExpiryTimer();
        setUser(null);
        redirectToSignIn();
    }, [clearExpiryTimer]);

    const ensureSessionValid = useCallback(() => {
        const token = getAuthToken();
        if (!token) {
            if (user) setUser(null);
            return false;
        }
        if (isTokenExpired(token)) {
            forceSignIn();
            return false;
        }
        return true;
    }, [forceSignIn, user]);

    const scheduleExpiryLogout = useCallback(
        (token: string) => {
            clearExpiryTimer();
            const expMs = getTokenExpiryMs(token);
            if (expMs == null) {
                forceSignIn();
                return;
            }
            const delay = Math.max(0, expMs - Date.now());
            expiryTimerRef.current = setTimeout(() => {
                forceSignIn();
            }, delay);
        },
        [clearExpiryTimer, forceSignIn],
    );

    useEffect(() => {
        const initializeAuth = async () => {
            const token = getAuthToken();
            if (token) {
                if (isTokenExpired(token)) {
                    forceSignIn();
                } else {
                    try {
                        const data = await getMe();
                        setUser(data.user);
                        localStorage.setItem("mips_user", JSON.stringify(data.user));
                        scheduleExpiryLogout(token);
                    } catch {
                        forceSignIn();
                    }
                }
            }
            setIsInitialized(true);
        };

        void initializeAuth();
        return () => clearExpiryTimer();
    }, [clearExpiryTimer, forceSignIn, scheduleExpiryLogout]);

    // Catch expiry while SPA stays open (tab switch / idle / no API call).
    useEffect(() => {
        if (!isInitialized) return;

        const onFocusOrVisible = () => {
            ensureSessionValid();
        };

        const pollId = window.setInterval(() => {
            ensureSessionValid();
        }, SESSION_POLL_MS);

        window.addEventListener("focus", onFocusOrVisible);
        document.addEventListener("visibilitychange", onFocusOrVisible);

        return () => {
            window.clearInterval(pollId);
            window.removeEventListener("focus", onFocusOrVisible);
            document.removeEventListener("visibilitychange", onFocusOrVisible);
        };
    }, [ensureSessionValid, isInitialized]);

    const login = async (userData: any, token: string): Promise<boolean> => {
        setUser(userData);
        localStorage.setItem("mips_user", JSON.stringify(userData));
        localStorage.setItem("mips_token", token);
        scheduleExpiryLogout(token);
        return true;
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                login,
                logout,
                isInitialized,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within a AuthProvider");
    }
    return context;
};
