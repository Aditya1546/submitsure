import { createApp } from "./app.js";
import { Store } from "./store.js";

const port = Number(process.env.PORT || 8787);
const ttlMs = Number(process.env.SESSION_TTL_MINUTES || 30) * 60 * 1000;
const { server, store } = createApp({ store: new Store({ ttlMs }), allowedOrigin: process.env.ALLOWED_ORIGIN || "*" });
server.listen(port, () => console.log(`SubmitSure server on :${port} epoch=${store.epoch}`));
