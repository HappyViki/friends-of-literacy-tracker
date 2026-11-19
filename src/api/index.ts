// Friends of Literacy staff API, deployed as the `api` Neon Function.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireAdmin, requireStaff, type AppEnv } from "./auth.ts";
import { HttpError } from "./errors.ts";
import { pool } from "./db.ts";
import * as admin from "../services/admin.ts";
import * as bookSvc from "../services/books.ts";
import * as families from "../services/households.ts";
import * as giveaways from "../services/giveaways.ts";
import * as reports from "../services/reports.ts";
import * as surveys from "../services/surveys.ts";

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
  }),
);

app.get("/", (c) => c.text("Friends of Literacy API"));

// Public: proves the Function can reach Postgres. No data.
app.get("/health", async (c) => {
  const { rows } = await pool.query<{ now: string }>("select now()::text as now");
  return c.json({ ok: true, db: rows[0].now, branch: process.env.NEON_BRANCH ?? null });
});

const api = new Hono<AppEnv>();
api.use("*", requireStaff);
const json = (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => ({}));
const id = (s: string) => {
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Bad id");
  return n;
};
const uuid = (s: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new HttpError(404, "Family not found");
  return s;
};

api.get("/me", (c) => c.json(c.get("staff")));

// Families
api.post("/households", async (c) => c.json(await families.intake(await json(c), c.get("staff")), 201));
api.get("/households/search", async (c) => c.json(await families.search(c.req.query("q") ?? "", c.req.query("zip"))));
api.get("/households/:id", async (c) => c.json(await families.detail(uuid(c.req.param("id")))));
api.post("/households/:id/children", async (c) => c.json(await families.addChild(uuid(c.req.param("id")), await json(c)), 201));
api.post("/households/:id/cards", async (c) => c.json(await families.replaceCard(uuid(c.req.param("id")), await json(c), c.get("staff")), 201));
api.get("/cards/:number", async (c) => c.json(await families.byCard(c.req.param("number"))));

// Books and inventory
api.get("/categories", (c) => c.json(bookSvc.classificationOptions()));
api.get("/books/:isbn", async (c) => c.json(await bookSvc.scan(c.req.param("isbn"), { refresh: c.req.query("refresh") === "1" })));
api.post("/books", async (c) => c.json(await bookSvc.addBookByHand(await json(c)), 201));
api.get("/inventory", async (c) => {
  const loc = c.req.query("locationId");
  return c.json(await bookSvc.inventory(loc ? id(loc) : undefined));
});
api.post("/inventory/receive", async (c) => c.json(await bookSvc.receive(await json(c), c.get("staff")), 201));
api.post("/inventory/transfer", async (c) => c.json(await bookSvc.transfer(await json(c), c.get("staff")), 201));
api.post("/inventory/adjust", async (c) => c.json(await bookSvc.adjust(await json(c), c.get("staff")), 201));

// Giveaways
api.post("/giveaways", async (c) => c.json(await giveaways.giveAway(await json(c), c.get("staff")), 201));

// Surveys
api.get("/surveys", async (c) => c.json(await surveys.list(c.req.query("all") === "1")));
api.post("/surveys", requireAdmin, async (c) => c.json(await surveys.create(await json(c)), 201));
api.post("/surveys/:key/responses", async (c) =>
  c.json(await surveys.respond(c.req.param("key"), await json(c), c.get("staff")), 201),
);

// Reports
api.get("/reports/summary", async (c) => c.json(await reports.summary(c.req.query())));

// Reference data and admin
api.get("/locations", async (c) => c.json(await admin.listLocations()));
api.post("/locations", requireAdmin, async (c) => c.json(await admin.createLocation(await json(c)), 201));
api.patch("/locations/:id", requireAdmin, async (c) => c.json(await admin.updateLocation(id(c.req.param("id")), await json(c))));
api.get("/languages", async (c) => c.json(await admin.listLanguages()));
api.get("/staff", requireAdmin, async (c) => c.json(await admin.listStaff()));
api.post("/staff", requireAdmin, async (c) => c.json(await admin.upsertStaff(await json(c), c.get("staff")), 201));

app.route("/api", api);

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message, ...(err.details ? { details: err.details } : {}) }, err.status);
  }
  console.error("[api]", err);
  return c.json({ error: "Something went wrong" }, 500);
});

export default app;
