import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Plain linting until ogham's own preset replaces this.
export default defineConfig(tseslint.configs.recommended);
