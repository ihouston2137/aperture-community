import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/aperture-community-portal";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Cached across hot reloads in dev and across lambda invocations in prod.
const globalWithMongoose = globalThis as typeof globalThis & {
  _apertureMongoose?: MongooseCache;
};

const cached: MongooseCache = globalWithMongoose._apertureMongoose ?? {
  conn: null,
  promise: null,
};

globalWithMongoose._apertureMongoose = cached;

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      // Fail fast instead of silently queueing operations forever.
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export default connectDB;
