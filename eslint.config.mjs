import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-control-regex": "off",
      "no-empty": "off",
      "no-useless-escape": "off",
    },
  },
  {
    ignores: [".next/**", "build/**", "node_modules/**", "dist/**"],
  },
];
