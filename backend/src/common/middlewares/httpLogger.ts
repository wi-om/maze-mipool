import pinoHttp from "pino-http";

export const httpLogger = pinoHttp({
  customLogLevel: (res, err) => {
    const status = res.statusCode ?? 0;
    if (status >= 500 || err) return "error";
    if (status >= 400) return "warn";
    return "info";
  },
  serializers: {
    req(req) {
      return { method: req.method, url: req.url };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
  autoLogging: false,
});
