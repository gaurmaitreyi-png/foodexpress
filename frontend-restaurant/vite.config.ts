import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Runs on 5174 so it can sit alongside the customer app (5173) in dev.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
