import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

import ogham from "./standard/coding/eslint/index.mjs";

// typescript-eslint's recommended rules, then ogham's own preset: this repo's
// source follows the coding standard it ships.
export default defineConfig(tseslint.configs.recommended, ogham);
