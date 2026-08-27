/**
 * Central API configuration for mipcc.
 * Set values via `.env` (local) or CI build env (production):
 *   VITE_BACKEND_URL
 *   VITE_MS_API_SUBSCRIPTION_KEY
 */
export const apiConfig = {
    baseURL: import.meta.env.VITE_BACKEND_URL ?? "",
    subscriptionKey: import.meta.env.VITE_MS_API_SUBSCRIPTION_KEY ?? "",
    subscriptionHeader: "Ocp-Apim-Subscription-Key" as const,
} as const;

function isLocalApiBaseUrl(baseURL: string): boolean {
    try {
        const { hostname } = new URL(baseURL);
        return hostname === "localhost" || hostname === "127.0.0.1";
    } catch {
        return false;
    }
}

/** APIM key is required in production; local ms-api does not use it and rejects the header via CORS. */
export function shouldSendSubscriptionKey(): boolean {
    return Boolean(apiConfig.subscriptionKey) && !isLocalApiBaseUrl(apiConfig.baseURL);
}

export function getDefaultApiHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    if (shouldSendSubscriptionKey()) {
        headers[apiConfig.subscriptionHeader] = apiConfig.subscriptionKey;
    }

    return headers;
}
