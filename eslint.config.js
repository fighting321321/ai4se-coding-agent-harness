import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".ai4se/**",
      ".superpowers/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**"
    ]
  },
  js.configs.recommended,
  tseslint.configs.recommended
);
