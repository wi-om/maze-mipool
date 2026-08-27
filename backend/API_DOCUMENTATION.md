# MIPS API Documentation

This document contains all the API endpoints available in the `ms-api` service, organized by module.

## Base URL
`http://<host>:<port>/api`

---

## 1. Authentication Module (`/api/auth`)
| Method | Endpoint | Description | Tags |
| :--- | :--- | :--- | :--- |
| POST | `/signup` | Register a new user with basic details | Auth |
| POST | `/login` | Authenticate user and receive access token | Auth |
| POST | `/verify` | Verify OTP for account activation or login | Auth |
| GET | `/me` | Get current authenticated user details | Auth |

---

## 2. CLIENT CRM Module (`/api/clients`)
| Method | Endpoint | Description | Tags |
| :--- | :--- | :--- | :--- |
| GET | `/` | List all registered clients | CRM, Clients |
| POST | `/register` | Register a new client in the system | CRM, Clients |

---

## 3. Account Module (`/api/accounts`)
| Method | Endpoint | Description | Tags |
| :--- | :--- | :--- | :--- |
| POST | `/register` | Create a new financial/platform account | CRM, Accounts |
| GET | `/` | Get all accounts across all clients | CRM, Accounts |
| GET | `/by-clientid/:clientid` | Retrieve account details for a specific client | CRM, Accounts |

---

## 4. Contracts Module (`/api/contracts`)
| Method | Endpoint | Description | Tags |
| :--- | :--- | :--- | :--- |
| GET | `/cl` | List all CL (Company Ledger) contracts | CRM, Contracts |
| GET | `/cl/summary` | Get financial summary of CL contracts | CRM, Contracts |
| POST | `/cl` | Create a new CL contract | CRM, Contracts |
| PATCH | `/cl/:id` | Update an existing CL contract | CRM, Contracts |
| DELETE | `/cl/:id`| Remove a CL contract | CRM, Contracts |
| POST | `/create` | Initialize a new standard contract | CRM, Contracts |
| POST | `/register` | Formally register a contract | CRM, Contracts |
| GET | `/:id/status`| Check current status of a contract | CRM, Contracts |
| PATCH | `/:id/status`| Update the status of a contract | CRM, Contracts |
| GET | `/:id` | Get full details of a specific contract | CRM, Contracts |
| GET | `/` | List all contracts | CRM, Contracts |

---

## 5. Settings Module (`/api/settings`)
| Method | Endpoint | Description | Tags |
| :--- | :--- | :--- | :--- |
| GET | `/` | Retrieve all system settings/configurations | CRM, Settings |
| GET | `/:key` | Get a specific setting by its key | CRM, Settings |
| POST | `/update` | Update system configuration values | CRM, Settings |

---

## 6. Rewards Engine (Yields) (`/api/yields`)
| Method | Endpoint | Description | Tags |
| :--- | :--- | :--- | :--- |
| POST | `/btc` | Manually trigger BTC reward calculation | Engine, Yields |
| POST | `/btc/bulk` | Bulk calculate BTC rewards for multiple dates | Engine, Yields |
| POST | `/cl/calculate` | Calculate rewards for CL contracts | Engine, Yields |
| GET | `/cl` | Retrieve calculated CL rewards | Engine, Yields |
| GET | `/wallet` | Get CM Wallet balances and status | Engine, Yields |
| POST | `/unit/sync` | Synchronize unit rewards data | Engine, Yields |
| GET | `/stats` | Get overall reward distribution stats | Engine, Yields |
| GET | `/` | List reward history/ledger items | Engine, Yields |
| POST | `/retry` | Retry failed reward calculations | Engine, Yields |
| GET | `/client/:clientid`| Get reward history for a specific client | Engine, Yields |

---

## 7. Daily Rewards Ledger (`/api/rewards/daily`)
| Method | Endpoint | Description | Tags |
| :--- | :--- | :--- | :--- |
| POST | `/calculate`| Master Calc: Calculate & Distribute rewards for single day | Engine, Daily |
| POST | `/bulk` | Bulk Master Calc: Process range of dates | Engine, Daily |
| GET | `/check-existence`| Check if rewards exist for given date range | Engine, Daily |
| GET | `/unit-history`| View unit reward history logs | Engine, Daily |
| GET | `/check-mips`| Check if MIPS worker data is available for dates | Engine, Daily |
| GET | `/latest-unit-reward`| Get the most recent unit reward metadata | Engine, Daily |
| GET | `/` | Get all daily reward distribution history | Engine, Daily |

---

## 8. MIPS Worker Integration (`/api/mips`)
| Method | Endpoint | Description | Tags |
| :--- | :--- | :--- | :--- |
| GET | `/btc/workers` | Fetch worker list from MIPS source | Engine, MIPS |
| GET | `/btc/payouts` | Fetch payout history from MIPS source | Engine, MIPS |
| GET | `/btc/rewards` | Fetch raw reward data from MIPS source | Engine, MIPS |

---

## 9. System & Health (`/`)
| Method | Endpoint | Description | Tags |
| :--- | :--- | :--- | :--- |
| GET | `/` | Base health check (UP status) | System |
| GET | `/api/health` | Detailed health check (DB connectivity) | System |
