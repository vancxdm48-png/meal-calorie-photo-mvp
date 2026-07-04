import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const githubPagesBase = "/meal-calorie-photo-mvp/";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? githubPagesBase : "/",
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
