import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  base: '/fifteen-love-story/',
  tanstackStart: {
    server: { entry: "server" },
  },
});
