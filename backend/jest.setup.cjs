// Required before auth.controller / auth.middleware load (they throw if missing)
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-jwt-secret-for-jest-minimum-length";
