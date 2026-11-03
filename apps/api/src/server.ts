import { app } from './app.js';

const PORT = Number(process.env.PORT) || 8787;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Hanzi Viet API listening on http://${HOST}:${PORT}`);
});