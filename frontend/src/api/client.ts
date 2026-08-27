import axios from "axios";
import { apiConfig, getDefaultApiHeaders, shouldSendSubscriptionKey } from "../config/api";
import {
    getAuthToken,
    isTokenExpired,
    redirectToSignIn,
} from "./services/authService";

const apiClient = axios.create({
    baseURL: apiConfig.baseURL,
    headers: getDefaultApiHeaders(),
});

function isAuthLoginRequest(url: string | undefined): boolean {
    if (!url) return false;
    return /\/api\/auth\/(login|verify)(\/|$|\?)/.test(url);
}

apiClient.interceptors.request.use(
    (config) => {
        const token = getAuthToken();
        if (token) {
            if (isTokenExpired(token) && !isAuthLoginRequest(config.url)) {
                redirectToSignIn();
                return Promise.reject(new Error("Session expired"));
            }
            config.headers.Authorization = `Bearer ${token}`;
        }

        if (shouldSendSubscriptionKey()) {
            config.headers[apiConfig.subscriptionHeader] = apiConfig.subscriptionKey;
        }

        return config;
    },
    (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 && !isAuthLoginRequest(error.config?.url)) {
            redirectToSignIn();
        }
        return Promise.reject(error);
    },
);

export default apiClient;
