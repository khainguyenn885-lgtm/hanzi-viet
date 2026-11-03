import "dotenv/config";
import { app } from "./app.js";

const port = Number(process.env.API_PORT || 8787);
app.listen(port, "127.0.0.1", () => console.log(`Hanzi Viet API listening on http://127.0.0.1:${port}`));
