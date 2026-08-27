import {
  createReactRouterV7Options,
  getWebInstrumentations,
  initializeFaro,
  ReactIntegration,
  setReactRouterV7SSRDependencies,
} from "@grafana/faro-react";
import { TracingInstrumentation } from "@grafana/faro-web-tracing";
import {
  createRoutesFromChildren,
  matchRoutes,
  Routes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

const faroUrl = import.meta.env.VITE_GRAFANA_FARO_URL;
const appVersion = import.meta.env.VITE_APP_VERSION ?? "1.0.0";

export function initGrafanaFaro(): void {
  if (typeof window === "undefined") {
    return;
  }

  // FaroRoutes delegates to react-router's Routes; wire it up even when Faro is off.
  setReactRouterV7SSRDependencies({ Routes });

  if (!faroUrl) {
    console.info("[faro] VITE_GRAFANA_FARO_URL not set; Grafana Faro disabled");
    return;
  }

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const propagateTraceHeaderCorsUrls: Array<string | RegExp> = backendUrl
    ? [backendUrl]
    : [];

  initializeFaro({
    url: faroUrl,
    app: {
      name: "mipcc",
      version: appVersion,
      environment: "dev",
    },
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation({
        instrumentationOptions: {
          propagateTraceHeaderCorsUrls,
        },
      }),
      new ReactIntegration({
        router: createReactRouterV7Options({
          createRoutesFromChildren,
          matchRoutes,
          Routes,
          useLocation,
          useNavigationType,
        }),
      }),
    ],
  });

  console.info("[faro] Grafana Faro initialized for mipcc");
}
