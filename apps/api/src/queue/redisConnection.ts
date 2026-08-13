import { Redis } from "ioredis";
import { env } from "../config/env.js";

// BullMQ requires maxRetriesPerRequest: null on any connection used for its
// blocking commands (Worker's internal polling). Shared across every
// Queue/Worker in this process — BullMQ supports sharing one connection.
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
