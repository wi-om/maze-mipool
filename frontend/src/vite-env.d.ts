/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
    readonly VITE_BACKEND_URL: string;
    readonly VITE_MS_API_SUBSCRIPTION_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
  readonly VITE_BACKEND_URL: string;
  readonly VITE_GRAFANA_FARO_URL?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
